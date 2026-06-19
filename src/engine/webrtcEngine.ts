import type { Socket } from 'socket.io-client';

/**
 * HyperDrop WebRTC DataChannel Transfer Engine v2
 *
 * Optimised for maximum throughput on both 2.4 GHz and 5 GHz WiFi.
 *
 * Key design decisions:
 *  - 256 KB chunks (max safe SCTP size in all modern browsers)
 *  - Ordered + reliable DataChannel (browser handles retransmit internally,
 *    giving us TCP-like reliability at near-UDP speed on LAN)
 *  - 16 MB high-water mark for pipelining (keeps the network saturated)
 *  - Host/srflx ICE candidates only — no TURN relay (forces direct P2P)
 *  - Speed sampling every 250 ms for responsive UI
 */

// ═════════════════════════════════════════════════════════════════
//  CONFIGURATION
// ═════════════════════════════════════════════════════════════════

/** 256 KB — maximum safe SCTP chunk for Chrome / Firefox / Safari */
const WEBRTC_CHUNK_SIZE = 256 * 1024;

/** Back-pressure threshold: 16 MB pipeline keeps WiFi saturated */
const BUFFER_HIGH_WATERMARK = 16 * 1024 * 1024;

/** DataChannel label */
const CHANNEL_LABEL = 'hyperdrop-file';

/** Speed reporting interval (ms) */
const SPEED_INTERVAL_MS = 250;

/** ICE configuration — STUN only (no TURN → forces direct P2P) */
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 4,
  iceTransportPolicy: 'all',
};

// ═════════════════════════════════════════════════════════════════
//  TYPES
// ═════════════════════════════════════════════════════════════════

/** Metadata sent as the first DataChannel message (JSON) */
export interface FileMetadata {
  fileName: string;
  fileSize: number;
  totalChunks: number;
  relativePath?: string;
  isFolder: boolean;
  fileIndex: number;
  totalFiles: number;
}

export type ProgressCallback = (sent: number, speed: number) => void;
export type CompleteCallback = (downloadUrl?: string) => void;
export type ErrorCallback = (err: Error) => void;

// ═════════════════════════════════════════════════════════════════
//  WebRTCTransfer CLASS
// ═════════════════════════════════════════════════════════════════

export class WebRTCTransfer {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private socket: Socket;
  public deviceId: string;
  private closed = false;

  // Speed tracking
  private lastMeasuredTime = 0;
  private lastMeasuredBytes = 0;
  private speedTimerId: ReturnType<typeof setInterval> | null = null;

  // ICE state tracking
  private iceConnected = false;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  constructor(socket: Socket, deviceId: string) {
    this.socket = socket;
    this.deviceId = deviceId;

    this.pc = new RTCPeerConnection(RTC_CONFIG);

    // Forward ICE candidates through signaling (filter relay candidates)
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Skip relay/TURN candidates — we want direct P2P only
        const candidateStr = event.candidate.candidate;
        if (candidateStr && candidateStr.includes('relay')) {
          console.log('[WebRTC] Skipping relay candidate (forcing direct P2P)');
          return;
        }
        this.socket.emit('webrtc:ice', {
          candidate: event.candidate.toJSON(),
          targetId: this.deviceId,
        });
      }
    };

    // Monitor ICE connection state for better error reporting
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      console.log(`[WebRTC] ICE connection state: ${state}`);
      if (state === 'connected' || state === 'completed') {
        this.iceConnected = true;
      } else if (state === 'failed') {
        this.iceConnected = false;
        console.error('[WebRTC] ICE connection failed — peers cannot reach each other');
      } else if (state === 'disconnected') {
        console.warn('[WebRTC] ICE disconnected — may recover automatically');
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state: ${this.pc.connectionState}`);
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  SENDING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Send a file over the DataChannel.
   * First message is JSON metadata, then raw binary ArrayBuffer chunks.
   */
  async sendFile(
    file: File,
    onProgress: ProgressCallback,
    onComplete: CompleteCallback,
    onError: ErrorCallback,
    options?: { relativePath?: string; fileIndex?: number; totalFiles?: number },
  ): Promise<void> {
    try {
      // Create DataChannel (sender creates it)
      this.dc = this.pc.createDataChannel(CHANNEL_LABEL, {
        ordered: true,  // Reliable ordered delivery
      });

      this.dc.binaryType = 'arraybuffer';
      this.dc.bufferedAmountLowThreshold = BUFFER_HIGH_WATERMARK;

      const totalChunks = Math.ceil(file.size / WEBRTC_CHUNK_SIZE);

      this.dc.onopen = async () => {
        try {
          if (!this.dc || this.dc.readyState !== 'open') {
            throw new Error('DataChannel closed or not open');
          }

          console.log(`[WebRTC] DataChannel open — sending ${file.name} (${totalChunks} chunks × 256KB)`);

          // Send metadata first
          const metadata: FileMetadata = {
            fileName: file.name,
            fileSize: file.size,
            totalChunks,
            relativePath: options?.relativePath || (file as any).webkitRelativePath || undefined,
            isFolder: !!(options?.relativePath || (file as any).webkitRelativePath),
            fileIndex: options?.fileIndex ?? 0,
            totalFiles: options?.totalFiles ?? 1,
          };
          this.dc.send(JSON.stringify(metadata));

          let bytesSent = 0;
          let currentSpeed = 0;
          this.lastMeasuredTime = Date.now();
          this.lastMeasuredBytes = 0;

          // Speed timer (250ms for responsive UI)
          this.speedTimerId = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - this.lastMeasuredTime) / 1000;
            if (elapsed > 0) {
              currentSpeed = (bytesSent - this.lastMeasuredBytes) / elapsed;
              this.lastMeasuredBytes = bytesSent;
              this.lastMeasuredTime = now;
            }
            onProgress(bytesSent, currentSpeed);
          }, SPEED_INTERVAL_MS);

          for (let i = 0; i < totalChunks; i++) {
            if (this.closed || !this.dc || this.dc.readyState !== 'open') {
              throw new Error('WebRTC connection lost');
            }

            const offset = i * WEBRTC_CHUNK_SIZE;
            const end = Math.min(offset + WEBRTC_CHUNK_SIZE, file.size);
            const chunkBlob = file.slice(offset, end);
            const chunkBuffer = await chunkBlob.arrayBuffer();

            // Back-pressure: wait if buffer is full
            while (
              this.dc &&
              this.dc.readyState === 'open' &&
              this.dc.bufferedAmount > BUFFER_HIGH_WATERMARK &&
              !this.closed
            ) {
              await new Promise<void>((resolve) => {
                const handler = () => {
                  this.dc?.removeEventListener('bufferedamountlow', handler);
                  resolve();
                };
                this.dc!.addEventListener('bufferedamountlow', handler);
                // Safety timeout — don't wait forever
                setTimeout(() => {
                  this.dc?.removeEventListener('bufferedamountlow', handler);
                  resolve();
                }, 5000);
              });
            }

            if (this.closed || !this.dc || this.dc.readyState !== 'open') {
              throw new Error('WebRTC connection lost');
            }

            this.dc.send(chunkBuffer);
            bytesSent += chunkBuffer.byteLength;
          }

          // Final progress
          this.clearSpeedTimer();
          onProgress(bytesSent, currentSpeed);
          onComplete();
          console.log(`[WebRTC] Send complete: ${file.name} (${bytesSent} bytes)`);
        } catch (err) {
          this.clearSpeedTimer();
          if (this.closed) return; // Don't error on intentional close
          const error = err instanceof Error ? err : new Error('Send failed');
          onError(error);
        }
      };

      this.dc.onerror = (event) => {
        this.clearSpeedTimer();
        if (this.closed) return;
        const rtcError = (event as RTCErrorEvent).error;
        onError(new Error(rtcError?.message ?? 'DataChannel error'));
      };

      this.dc.onclose = () => {
        this.clearSpeedTimer();
      };
    } catch (err) {
      this.clearSpeedTimer();
      const error = err instanceof Error ? err : new Error('Failed to create DataChannel');
      onError(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  RECEIVING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Receive a file over the DataChannel.
   * Reassembles chunks into a Blob and creates a download URL.
   */
  async receiveFile(
    onProgress: ProgressCallback,
    onComplete: CompleteCallback,
    onError: ErrorCallback,
    onMetadata?: (metadata: FileMetadata) => void,
  ): Promise<void> {
    try {
      this.pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.binaryType = 'arraybuffer';

        console.log(`[WebRTC] DataChannel received: ${channel.label}`);

        let metadata: FileMetadata | null = null;
        const receivedChunks: ArrayBuffer[] = [];
        let bytesReceived = 0;
        let currentSpeed = 0;
        this.lastMeasuredTime = Date.now();
        this.lastMeasuredBytes = 0;

        // Speed timer
        this.speedTimerId = setInterval(() => {
          const now = Date.now();
          const elapsed = (now - this.lastMeasuredTime) / 1000;
          if (elapsed > 0) {
            currentSpeed = (bytesReceived - this.lastMeasuredBytes) / elapsed;
            this.lastMeasuredBytes = bytesReceived;
            this.lastMeasuredTime = now;
          }
          onProgress(bytesReceived, currentSpeed);
        }, SPEED_INTERVAL_MS);

        channel.onmessage = (msgEvent) => {
          try {
            if (this.closed) return;

            if (!metadata) {
              // First message is JSON metadata
              const text = typeof msgEvent.data === 'string'
                ? msgEvent.data
                : new TextDecoder().decode(msgEvent.data);
              metadata = JSON.parse(text) as FileMetadata;
              console.log(`[WebRTC] Receiving: ${metadata.fileName} (${metadata.totalChunks} chunks, ${metadata.fileSize} bytes)`);
              if (onMetadata) onMetadata(metadata);
              return;
            }

            // Subsequent messages are binary chunks
            const chunk = msgEvent.data as ArrayBuffer;
            receivedChunks.push(chunk);
            bytesReceived += chunk.byteLength;

            // Check if transfer is complete
            if (receivedChunks.length === metadata.totalChunks) {
              this.clearSpeedTimer();
              onProgress(bytesReceived, currentSpeed);

              const blob = new Blob(receivedChunks);
              const downloadUrl = URL.createObjectURL(blob);
              console.log(`[WebRTC] Receive complete: ${metadata.fileName} (${bytesReceived} bytes)`);
              onComplete(downloadUrl);
            }
          } catch (err) {
            this.clearSpeedTimer();
            if (this.closed) return;
            const error = err instanceof Error ? err : new Error('Receive parse error');
            onError(error);
          }
        };

        channel.onerror = (evt) => {
          this.clearSpeedTimer();
          if (this.closed) return;
          const rtcError = (evt as RTCErrorEvent).error;
          onError(new Error(rtcError?.message ?? 'DataChannel receive error'));
        };

        channel.onclose = () => {
          this.clearSpeedTimer();
          if (this.closed) return;
          // If we haven't received all chunks yet, that's an error
          if (metadata && receivedChunks.length < metadata.totalChunks) {
            onError(new Error('DataChannel closed before transfer completed'));
          }
        };
      };
    } catch (err) {
      this.clearSpeedTimer();
      const error = err instanceof Error ? err : new Error('Failed to set up receiver');
      onError(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  SIGNALING (Socket.IO)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create an SDP offer and send it to the target device via signaling.
   */
  async createOffer(targetDeviceId: string): Promise<void> {
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      this.socket.emit('webrtc:offer', {
        offer: this.pc.localDescription!.toJSON(),
        targetId: targetDeviceId,
      });
      console.log(`[WebRTC] Offer sent to ${targetDeviceId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create offer';
      throw new Error(`WebRTC offer failed: ${message}`);
    }
  }

  /**
   * Handle an incoming SDP offer: set remote description, create answer, send it back.
   */
  async handleOffer(offer: RTCSessionDescriptionInit, fromId: string): Promise<void> {
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      this.socket.emit('webrtc:answer', {
        answer: this.pc.localDescription!.toJSON(),
        targetId: fromId,
      });
      console.log(`[WebRTC] Answer sent to ${fromId}`);

      // Flush any ICE candidates that arrived before remote description was set
      for (const candidate of this.pendingIceCandidates) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore — candidate may have been invalidated
        }
      }
      this.pendingIceCandidates = [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to handle offer';
      throw new Error(`WebRTC handle offer failed: ${message}`);
    }
  }

  /**
   * Handle an incoming SDP answer.
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[WebRTC] Answer received and set');

      // Flush any ICE candidates that arrived before remote description was set
      for (const candidate of this.pendingIceCandidates) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore
        }
      }
      this.pendingIceCandidates = [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to handle answer';
      throw new Error(`WebRTC handle answer failed: ${message}`);
    }
  }

  /**
   * Handle an incoming ICE candidate.
   * If remote description isn't set yet, queue it for later.
   */
  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      if (!this.pc.remoteDescription) {
        // Queue until remote description is set
        this.pendingIceCandidates.push(candidate);
        return;
      }
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // Non-fatal — ICE candidates can fail without breaking the connection
      console.warn('[WebRTC] ICE candidate add failed (non-fatal):', err);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════

  /** Close the peer connection and data channel. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearSpeedTimer();

    console.log('[WebRTC] Closing connection');

    try {
      if (this.dc) {
        this.dc.close();
        this.dc = null;
      }
    } catch {
      // Ignore close errors
    }

    try {
      this.pc.close();
    } catch {
      // Ignore close errors
    }
  }

  /** Check if the connection has been closed. */
  get isClosed(): boolean {
    return this.closed;
  }

  private clearSpeedTimer(): void {
    if (this.speedTimerId !== null) {
      clearInterval(this.speedTimerId);
      this.speedTimerId = null;
    }
  }
}
