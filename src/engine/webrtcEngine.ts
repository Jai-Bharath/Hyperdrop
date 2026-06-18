import type { Socket } from 'socket.io-client';

/** WebRTC DataChannel chunk size: 64 KB (industry standard for compatibility and reliability) */
const WEBRTC_CHUNK_SIZE = 64 * 1024;

/** DataChannel label */
const CHANNEL_LABEL = 'hyperdrop-file';

/** STUN servers for LAN ICE candidate gathering */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
];

/** Metadata sent as the first DataChannel message (JSON) */
interface FileMetadata {
  fileName: string;
  fileSize: number;
  totalChunks: number;
}

type ProgressCallback = (sent: number, speed: number) => void;
type CompleteCallback = (downloadUrl?: string) => void;
type ErrorCallback = (err: Error) => void;

/**
 * WebRTC DataChannel-based file transfer for mobile-to-mobile P2P.
 *
 * Signaling is done via Socket.IO (webrtc:offer, webrtc:answer, webrtc:ice).
 * Data flows directly between peers over RTCDataChannel.
 */
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

  constructor(socket: Socket, deviceId: string) {
    this.socket = socket;
    this.deviceId = deviceId;

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Forward ICE candidates through signaling
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice', {
          candidate: event.candidate.toJSON(),
          targetId: this.deviceId,
        });
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  SENDING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Send a file over the DataChannel.
   * First message is JSON metadata, then binary ArrayBuffer chunks.
   */
  async sendFile(
    file: File,
    onProgress: ProgressCallback,
    onComplete: CompleteCallback,
    onError: ErrorCallback,
  ): Promise<void> {
    try {
      // Create DataChannel (sender creates it)
      this.dc = this.pc.createDataChannel(CHANNEL_LABEL, {
        ordered: false,
      });

      this.dc.binaryType = 'arraybuffer';
      this.dc.bufferedAmountLowThreshold = 2 * 1024 * 1024; // 2 MB

      const totalChunks = Math.ceil(file.size / WEBRTC_CHUNK_SIZE);

      this.dc.onopen = async () => {
        try {
          if (!this.dc || this.dc.readyState !== 'open') {
            throw new Error('DataChannel closed or not open');
          }

          // Send metadata first
          const metadata: FileMetadata = {
            fileName: file.name,
            fileSize: file.size,
            totalChunks,
          };
          this.dc.send(JSON.stringify(metadata));

          let bytesSent = 0;
          let currentSpeed = 0;
          this.lastMeasuredTime = Date.now();
          this.lastMeasuredBytes = 0;

          // Speed timer (throttled to 500ms)
          this.speedTimerId = setInterval(() => {
            const now = Date.now();
            const elapsed = (now - this.lastMeasuredTime) / 1000;
            if (elapsed > 0) {
              currentSpeed = (bytesSent - this.lastMeasuredBytes) / elapsed;
              this.lastMeasuredBytes = bytesSent;
              this.lastMeasuredTime = now;
            }
            onProgress(bytesSent, currentSpeed);
          }, 500);

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
              this.dc.bufferedAmount > this.dc.bufferedAmountLowThreshold &&
              !this.closed
            ) {
              await new Promise<void>((resolve) => {
                const handler = () => {
                  this.dc?.removeEventListener('bufferedamountlow', handler);
                  resolve();
                };
                this.dc!.addEventListener('bufferedamountlow', handler);
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
        } catch (err) {
          this.clearSpeedTimer();
          const error = err instanceof Error ? err : new Error('Send failed');
          onError(error);
        }
      };

      this.dc.onerror = (event) => {
        this.clearSpeedTimer();
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
  ): Promise<void> {
    try {
      this.pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.binaryType = 'arraybuffer';

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
        }, 500);

        channel.onmessage = (msgEvent) => {
          try {
            if (!metadata) {
              // First message is JSON metadata
              const text = typeof msgEvent.data === 'string'
                ? msgEvent.data
                : new TextDecoder().decode(msgEvent.data);
              metadata = JSON.parse(text) as FileMetadata;
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
              onComplete(downloadUrl);
            }
          } catch (err) {
            this.clearSpeedTimer();
            const error = err instanceof Error ? err : new Error('Receive parse error');
            onError(error);
          }
        };

        channel.onerror = (evt) => {
          this.clearSpeedTimer();
          const rtcError = (evt as RTCErrorEvent).error;
          onError(new Error(rtcError?.message ?? 'DataChannel receive error'));
        };

        channel.onclose = () => {
          this.clearSpeedTimer();
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to handle answer';
      throw new Error(`WebRTC handle answer failed: ${message}`);
    }
  }

  /**
   * Handle an incoming ICE candidate.
   */
  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add ICE candidate';
      throw new Error(`WebRTC ICE candidate failed: ${message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLEANUP
  // ═══════════════════════════════════════════════════════════════

  /** Close the peer connection and data channel. */
  close(): void {
    this.closed = true;
    this.clearSpeedTimer();

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

  private clearSpeedTimer(): void {
    if (this.speedTimerId !== null) {
      clearInterval(this.speedTimerId);
      this.speedTimerId = null;
    }
  }
}
