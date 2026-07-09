import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore, type Device } from '../store/useStore';
import { handleAcceptedSocketTransfer, triggerFileDownload, cancelPendingUpload, triggerWebRTCDownload } from './useTransfer';
import { WebRTCTransfer } from '../engine/webrtcEngine';
import { Capacitor } from '@capacitor/core';
import { playSuccessChime, playMessageChime } from '../utils/audio';
import { showDesktopNotification } from '../utils/notification';

/** Shared socket instance for other hooks/components */
let sharedSocket: Socket | null = null;

export function getSharedSocket(): Socket | null {
  return sharedSocket;
}

/** LocalStorage key for persistent device identity */
const DEVICE_ID_KEY = 'hyperdrop-device-id';

/**
 * Check if a URL or IP string contains a private/LAN IP address.
 */
function isPrivateIp(urlOrIp: string): boolean {
  const stripped = urlOrIp.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
  return (
    stripped.startsWith('192.168.') ||
    stripped.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(stripped) ||
    stripped === '127.0.0.1' ||
    stripped === 'localhost'
  );
}

/** Default local companion server port */
const LOCAL_SIGNAL_PORT = 53317;

/**
 * Generate a random device ID or retrieve the persisted one.
 */
function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;

    const id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Get a friendly name for the local device based on browser and OS.
 */
export function getDeviceFriendlyName(): string {
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isMac = /Macintosh/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isLinux = /Linux/i.test(ua);

  let osName = 'Web';
  if (isAndroid) osName = 'Android';
  else if (isIOS) osName = 'iOS';
  else if (isMac) osName = 'macOS';
  else if (isWindows) osName = 'Windows';
  else if (isLinux) osName = 'Linux';

  let browser = 'Browser';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  return `${browser} on ${osName}`;
}

/**
 * Get the platform category string for the local device.
 */
function getDevicePlatform(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua)) return 'macos';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'web';
}

/**
 * Programmatically join a manual WebRTC pairing room (e.g. from QR scan).
 */
export function joinPairingRoom(roomId: string): void {
  try {
    localStorage.setItem('hyperdrop-paired-room-id', roomId);
  } catch (e) {
    console.error('[useSocket] Failed to save pairing room to localStorage:', e);
  }
  if (sharedSocket) {
    console.log(`[useSocket] Requesting to join room: ${roomId}`);
    sharedSocket.emit('room:join', { roomId });
  } else {
    console.warn('[useSocket] Cannot join room: socket not connected');
  }
}

/**
 * Socket.IO client connection hook.
 * Connects reactively based on the `socketUrl` store state.
 */
export function useSocket(): Socket | null {
  const socketRef = useRef<Socket | null>(null);
  const deviceIdRef = useRef<string>(getOrCreateDeviceId());

  const socketUrl = useStore((s) => s.socketUrl);
  const setConnected = useStore((s) => s.setConnected);
  const addDevice = useStore((s) => s.addDevice);
  const removeDevice = useStore((s) => s.removeDevice);
  const updateTransfer = useStore((s) => s.updateTransfer);
  const addTransfer = useStore((s) => s.addTransfer);

  useEffect(() => {
    // ── Resolve dynamic connection URL ── (100% offline — local network only)
    let targetUrl = socketUrl || ((import.meta as any).env.VITE_SOCKET_URL as string) || '';

    // Helper: probe an IP for a companion server
    const probeCompanion = async (ip: string): Promise<string | null> => {
      try {
        const res = await fetch(`http://${ip}:${LOCAL_SIGNAL_PORT}/api/info`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) return `http://${ip}:${LOCAL_SIGNAL_PORT}`;
      } catch { /* not reachable */ }
      return null;
    };

    // Helper: discover local IP via WebRTC ICE (no cloud STUN needed)
    const discoverLocalIp = (): Promise<string> =>
      new Promise((resolve) => {
        try {
          const pc = new RTCPeerConnection({ iceServers: [] });
          pc.createDataChannel('');
          pc.createOffer().then((offer) => pc.setLocalDescription(offer));
          const timeout = setTimeout(() => { pc.close(); resolve(''); }, 3000);
          pc.onicecandidate = (e) => {
            if (!e.candidate) return;
            const match = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (match && match[1] !== '0.0.0.0' && !match[1].startsWith('0.')) {
              const ip = match[1];
              if (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) {
                clearTimeout(timeout); pc.close(); resolve(ip);
              }
            }
          };
        } catch { resolve(''); }
      });

    // Helper: scan subnet for a companion server
    const findCompanionOnLan = async (myIp: string): Promise<string | null> => {
      const base = myIp.split('.').slice(0, 3).join('.');
      const BATCH = 20;
      for (let start = 1; start <= 254; start += BATCH) {
        const promises: Promise<string | null>[] = [];
        for (let i = start; i < Math.min(start + BATCH, 255); i++) {
          const ip = `${base}.${i}`;
          if (ip === myIp) continue;
          promises.push(probeCompanion(ip));
        }
        const results = await Promise.all(promises);
        const found = results.find((r) => r !== null);
        if (found) return found;
      }
      return null;
    };

    const resolveAndConnect = async () => {
      if (!targetUrl) {
        const origin = window.location.origin;
        const isLocalDev = origin.includes('localhost') ||
                           origin.includes('127.0.0.1') ||
                           /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(origin);

        if (isLocalDev) {
          // Dev server or direct LAN access — connect to same origin (Vite proxy)
          targetUrl = origin;
        } else {
          // Hosted static site — try localhost first, then scan LAN
          const localResult = await probeCompanion('localhost');
          if (localResult) {
            targetUrl = localResult;
          } else {
            // Scan the LAN for a companion server
            const myIp = await discoverLocalIp();
            if (myIp) {
              const lanResult = await findCompanionOnLan(myIp);
              if (lanResult) {
                targetUrl = lanResult;
                console.log(`[useSocket] Found companion server on LAN: ${lanResult}`);
              }
            }
            if (!targetUrl) {
              // Last resort: try common gateway IPs
              targetUrl = (await probeCompanion('192.168.1.1')) ||
                          (await probeCompanion('192.168.0.1')) ||
                          `http://localhost:${LOCAL_SIGNAL_PORT}`;
            }
          }
        }
      }

      console.log(`[useSocket] Connecting to socket server: ${targetUrl}`);

      const socket = io(targetUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

      socketRef.current = socket;
      sharedSocket = socket;

    // ── Connection lifecycle ──
    socket.on('connect', () => {
      setConnected(true);
      console.log(`[useSocket] Connected! Socket ID: ${socket.id}`);
      
      const isLocalhostOrLAN = targetUrl.includes('localhost') || 
                               targetUrl.includes('127.0.0.1') || 
                               /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(targetUrl.replace(/^https?:\/\//, ''));

      if (isLocalhostOrLAN) {
        fetch(`${targetUrl}/api/info`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
          })
          .then((data: { ip: string; port: number; ftpPort: number }) => {
            useStore.getState().setServerInfo(data.ip, data.port, data.ftpPort);
            useStore.getState().setApiBaseUrl(`http://${data.ip}:${data.port}`);
            console.log(`[useSocket] Local server LAN IP resolved: ${data.ip}:${data.port}`);
          })
          .catch((err) => {
            console.error('[useSocket] Failed to fetch local configuration (non-fatal):', err);
            useStore.getState().setApiBaseUrl(targetUrl);
          });
      } else {
        useStore.getState().setServerInfo('', LOCAL_SIGNAL_PORT, 2121);
        useStore.getState().setApiBaseUrl(targetUrl);
        console.log(`[useSocket] Local signaling connected.`);
      }

      // Register device identification
      socket.emit('device:register', {
        deviceId: deviceIdRef.current,
        name: getDeviceFriendlyName(),
        platform: getDevicePlatform(),
        supports5GHz: true,
        port: window.location.port ? parseInt(window.location.port, 10) : 80
      });

      // Auto-rejoin pairing room
      const urlParams = new URLSearchParams(window.location.search);
      let room = urlParams.get('room');
      if (!room) {
        try {
          room = localStorage.getItem('hyperdrop-paired-room-id');
        } catch {
          // Ignore
        }
      } else {
        try {
          localStorage.setItem('hyperdrop-paired-room-id', room);
        } catch {
          // Ignore
        }
      }
      if (room) {
        console.log(`[useSocket] Auto-rejoining pairing room: ${room}`);
        socket.emit('room:join', { roomId: room });
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[useSocket] Connection error:', err);
      setConnected(false);
    });

    // ── Room-Aware Device Discovery Events ──
    socket.on('device:found', (device: Device) => {
      try {
        if (device.id !== deviceIdRef.current) {
          // Mark as socket-discovered so it won't be pruned by stale timer
          addDevice({ ...device, source: 'socket' });

          const currentApiBase = useStore.getState().apiBaseUrl;
          const isCurrentlyUsingCloud = currentApiBase && !isPrivateIp(currentApiBase);
          const deviceHasPrivateIp = device.ip && isPrivateIp(device.ip);

          if (isCurrentlyUsingCloud && deviceHasPrivateIp) {
            const lanUrl = `http://${device.ip}:53317`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            fetch(`${lanUrl}/api/info`, { signal: controller.signal })
              .then((res) => {
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error('Not reachable');
                return res.json();
              })
              .then((data: { ip: string; port: number; ftpPort: number }) => {
                const lanApiUrl = `http://${data.ip}:${data.port}`;
                useStore.getState().setServerInfo(data.ip, data.port, data.ftpPort);
                useStore.getState().setApiBaseUrl(lanApiUrl);
                console.log(`[useSocket] 🚀 LAN server found! File data will go directly over WiFi: ${lanApiUrl}`);
              })
              .catch(() => {
                clearTimeout(timeoutId);
                // LAN not reachable — WebRTC P2P will be used instead
              });
          }
        }
      } catch (err) {
        console.error('[useSocket] Failed parsing device:found:', err);
      }
    });

    socket.on('device:lost', (payload: { id: string }) => {
      try {
        removeDevice(payload.id);
      } catch {
        // Ignore
      }
    });

    // ── Device Heartbeat — keeps lastSeen fresh to prevent stale pruning ──
    socket.on('device:heartbeat', (payload: { deviceIds: string[]; timestamp: number }) => {
      try {
        const store = useStore.getState();
        for (const id of payload.deviceIds) {
          if (id !== deviceIdRef.current) {
            store.updateDeviceLastSeen(id);
          }
        }
      } catch { /* ignore */ }
    });

    // ── Transfer Events ──
    socket.on('transfer:incoming', (transfer: {
      id: string;
      fileName: string;
      fileSize: number;
      protocol: string;
      senderId?: string;
      relativePath?: string;
    }) => {
      try {
        addTransfer({
          id: transfer.id,
          fileName: transfer.fileName,
          fileSize: transfer.fileSize,
          transferred: 0,
          speed: 0,
          protocol: transfer.protocol as import('../store/useStore').Protocol,
          direction: 'receive',
          status: 'pending',
          startedAt: Date.now(),
          chunks: { total: 0, done: 0, failed: [] },
          targetDeviceId: transfer.senderId,
          relativePath: transfer.relativePath,
        });
      } catch {
        // Malformed payload
      }
    });

    socket.on('transfer:accept', (payload: { id: string }) => {
      try {
        handleAcceptedSocketTransfer(payload.id, socket);
      } catch (err) {
        console.error('[useSocket] Failed to handle accepted transfer:', err);
      }
    });

    // Track pending auto-completion timers
    const pendingCompletionTimers = new Map<string, ReturnType<typeof setTimeout>>();

    socket.on('transfer:progress', (payload: {
      id: string;
      transferred: number;
      speed: number;
    }) => {
      try {
        const transfers = useStore.getState().transfers;
        const transfer = transfers.find((t) => t.id === payload.id);
        if (transfer && transfer.status === 'transferring') {
          updateTransfer(payload.id, {
            transferred: payload.transferred,
            speed: payload.speed,
          });

          // Safety net: auto-complete if stuck at ~100%
          if (
            transfer.direction === 'receive' &&
            transfer.fileSize > 0 &&
            payload.transferred >= transfer.fileSize * 0.99 &&
            !downloadedTransfers.has(payload.id) &&
            !pendingCompletionTimers.has(payload.id)
          ) {
            const timer = setTimeout(() => {
              pendingCompletionTimers.delete(payload.id);
              const currentTransfer = useStore.getState().transfers.find((t) => t.id === payload.id);
              if (currentTransfer && currentTransfer.status === 'transferring' && !downloadedTransfers.has(payload.id)) {
                console.log(`[useSocket] Safety net: auto-completing transfer ${payload.id}`);
                downloadedTransfers.add(payload.id);
                updateTransfer(payload.id, { status: 'done', transferred: currentTransfer.fileSize });
                // Only trigger HTTP download if this isn't a WebRTC transfer
                if (currentTransfer.protocol !== 'webrtc') {
                  triggerFileDownload(currentTransfer.fileName, payload.id);
                }
                const duration = Math.max(1, (Date.now() - currentTransfer.startedAt) / 1000);
                useStore.getState().addHistoryEntry({
                  id: currentTransfer.id, fileName: currentTransfer.fileName, fileSize: currentTransfer.fileSize,
                  protocol: currentTransfer.protocol, direction: 'receive',
                  speed: currentTransfer.fileSize / duration, duration,
                  completedAt: Date.now(), deviceName: 'Sender',
                });
              }
            }, 5000);
            pendingCompletionTimers.set(payload.id, timer);
          }
        }
      } catch {
        // Ignore
      }
    });

    // Track which transfers have already triggered downloads
    const downloadedTransfers = new Set<string>();

    socket.on('transfer:done', (payload: { id: string; fileName?: string; fileSize?: number; downloadUrl?: string }) => {
      try {
        const pendingTimer = pendingCompletionTimers.get(payload.id);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingCompletionTimers.delete(payload.id);
        }

        if (downloadedTransfers.has(payload.id)) return;

        const transfers = useStore.getState().transfers;
        const transfer = transfers.find((t) => t.id === payload.id);
        
        if (transfer) {
          updateTransfer(payload.id, { status: 'done', transferred: transfer.fileSize });
          if (!downloadedTransfers.has(payload.id)) {
            downloadedTransfers.add(payload.id);
            if (transfer.protocol !== 'webrtc') {
              triggerFileDownload(transfer.fileName, payload.id);
            }
            playSuccessChime();
            showDesktopNotification(
              transfer.direction === 'send' ? 'File Sent' : 'File Received',
              `${transfer.fileName} finished successfully`
            );
          }
          const duration = Math.max(1, (Date.now() - transfer.startedAt) / 1000);
          useStore.getState().addHistoryEntry({
            id: transfer.id,
            fileName: transfer.fileName,
            fileSize: transfer.fileSize,
            protocol: transfer.protocol,
            direction: transfer.direction,
            speed: transfer.fileSize / duration,
            duration,
            completedAt: Date.now(),
            deviceName: transfer.deviceName || (transfer.direction === 'send' ? 'Receiver' : 'Sender'),
          });
        } else {
          updateTransfer(payload.id, { status: 'done', transferred: payload.fileSize || 0 });
        }

        setTimeout(() => downloadedTransfers.delete(payload.id), 60000);
      } catch (err) {
        console.error('[useSocket] Error handling transfer:done:', err);
      }
    });

    socket.on('transfer:error', (payload: { id: string; error: string }) => {
      try {
        cancelPendingUpload(payload.id);
        updateTransfer(payload.id, {
          status: 'error',
          error: payload.error,
        });
      } catch {
        // Ignore
      }
    });

    socket.on('transfer:cancelled', (payload: { id: string }) => {
      try {
        cancelPendingUpload(payload.id);
        updateTransfer(payload.id, {
          status: 'cancelled',
        });
      } catch {
        // Ignore
      }
    });

    // ── WebRTC Signaling Events ──────────────────────────────
    // Use the global map from useTransfer so both sender and receiver can be tracked
    const webrtcTransfers = (window as any).__hyperdrop_webrtc_transfers as Map<string, WebRTCTransfer>;

    socket.on('webrtc:offer', (payload: { fromId: string; offer: RTCSessionDescriptionInit }) => {
      try {
        console.log('[useSocket] WebRTC offer received from:', payload.fromId);
        const transfers = useStore.getState().transfers;
        
        // Find the correct transfer for this WebRTC offer:
        // 1. Match by targetDeviceId (sender's device ID) — most specific
        // 2. Fall back to any receiving + transferring/pending transfer
        let transfer = transfers.find(
          (t) => t.direction === 'receive' &&
                 (t.status === 'transferring' || t.status === 'pending') &&
                 t.targetDeviceId === payload.fromId
        );
        
        if (!transfer) {
          // Broader match: any receive transfer that's in progress
          transfer = transfers.find(
            (t) => t.direction === 'receive' &&
                   (t.status === 'transferring' || t.status === 'pending')
          );
        }
        
        if (!transfer) {
          console.warn('[useSocket] No matching receive transfer for WebRTC offer from:', payload.fromId);
          return;
        }

        console.log(`[useSocket] Matched WebRTC offer to transfer: ${transfer.id} (${transfer.fileName})`);

        // Update transfer status to transferring with webrtc protocol
        updateTransfer(transfer.id, { status: 'transferring', protocol: 'webrtc' });

        const rtc = new WebRTCTransfer(socket, payload.fromId);
        webrtcTransfers.set(transfer.id, rtc);

        const transferId = transfer.id;
        const transferFileName = transfer.fileName;
        const transferFileSize = transfer.fileSize;
        const transferStartedAt = transfer.startedAt;

        rtc.receiveFile(
          (bytesReceived, speed) => {
            updateTransfer(transferId, {
              transferred: bytesReceived,
              speed,
              status: 'transferring',
              protocol: 'webrtc',
            });
          },
          (downloadUrl) => {
            // Store blob URL in transfer state for later download
            updateTransfer(transferId, {
              status: 'done',
              transferred: transferFileSize,
              blobUrl: downloadUrl || undefined,
            });
            
            // Auto-trigger download
            if (downloadUrl) {
              triggerWebRTCDownload(transferFileName, downloadUrl);
            }
            
            const duration = Math.max(1, (Date.now() - transferStartedAt) / 1000);
            useStore.getState().addHistoryEntry({
              id: transferId, fileName: transferFileName, fileSize: transferFileSize,
              protocol: 'webrtc', direction: 'receive',
              speed: transferFileSize / duration, duration,
              completedAt: Date.now(), deviceName: 'Sender',
            });
            webrtcTransfers.delete(transferId);
            console.log(`[useSocket] WebRTC receive complete: ${transferFileName}`);
            playSuccessChime();
            showDesktopNotification('File Received', `${transferFileName} received successfully over WebRTC`);
          },
          (error) => {
            if (rtc.isClosed) return; // Intentional cancel
            updateTransfer(transferId, { status: 'error', error: error.message });
            webrtcTransfers.delete(transferId);
          },
          (metadata) => {
            // Update transfer with actual file metadata from sender
            console.log(`[useSocket] WebRTC metadata received:`, metadata);
            updateTransfer(transferId, {
              relativePath: metadata.relativePath,
            });
          },
        );

        rtc.handleOffer(payload.offer, payload.fromId).catch((err) => {
          console.error('[useSocket] WebRTC offer handling failed:', err);
          updateTransfer(transferId, { status: 'error', error: 'WebRTC connection failed' });
          webrtcTransfers.delete(transferId);
        });
      } catch (err) {
        console.error('[useSocket] Error handling webrtc:offer:', err);
      }
    });

    socket.on('webrtc:answer', (payload: { fromId: string; answer: RTCSessionDescriptionInit }) => {
      try {
        for (const rtc of webrtcTransfers.values()) {
          if (rtc.deviceId === payload.fromId) {
            rtc.handleAnswer(payload.answer).catch((err) => {
              console.error('[useSocket] WebRTC answer failed:', err);
            });
            break;
          }
        }
      } catch (err) {
        console.error('[useSocket] Error handling webrtc:answer:', err);
      }
    });

    socket.on('webrtc:ice', (payload: { fromId: string; candidate: RTCIceCandidateInit }) => {
      try {
        for (const rtc of webrtcTransfers.values()) {
          if (rtc.deviceId === payload.fromId) {
            rtc.handleIceCandidate(payload.candidate).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    });

    // ── Peer Disconnect Alert ──
    socket.on('peer:disconnected', (payload: {
      deviceId: string;
      deviceName: string;
      transferId: string;
      reason: string;
    }) => {
      try {
        console.log(`[useSocket] Peer disconnected: ${payload.deviceName} (${payload.reason})`);
        
        const transfers = useStore.getState().transfers;
        const transfer = transfers.find((t) => t.id === payload.transferId);
        
        if (transfer && (transfer.status === 'transferring' || transfer.status === 'pending')) {
          if (transfer.direction === 'send') {
            cancelPendingUpload(payload.transferId);
          }
          
          updateTransfer(payload.transferId, {
            status: 'error',
            error: `${payload.deviceName} disconnected`,
          });
          
          useStore.getState().showDisconnectAlert({
            deviceName: payload.deviceName,
            transferId: payload.transferId,
            fileName: transfer.fileName,
          });
        }
      } catch (err) {
        console.error('[useSocket] Error handling peer:disconnected:', err);
      }
    });

    // ── Chat & Clipboard Events ──────────────────────────────
    let peerTypingTimer: ReturnType<typeof setTimeout> | null = null;

    const recentEventIds = new Set<string>();
    function isNewEvent(id: string): boolean {
      if (recentEventIds.has(id)) return false;
      recentEventIds.add(id);
      setTimeout(() => recentEventIds.delete(id), 15000);
      return true;
    }

    socket.on('chat:message', (data: {
      id: string;
      text: string;
      senderId: string;
      senderName: string;
      timestamp: number;
      isCode: boolean;
    }) => {
      try {
        if (!isNewEvent(data.id)) return;

        const message: ChatMessageData = {
          ...data,
          read: false,
        };
        useStore.getState().addChatMessage(message);
        
        if (!useStore.getState().chatOpen) {
          playMessageChime();
          showDesktopNotification(`New message from ${data.senderName}`, data.text);
        }
        
        if (useStore.getState().chatOpen) {
          socket.emit('chat:read', { messageId: data.id, readerId: deviceIdRef.current });
        }
      } catch { /* ignore */ }
    });

    socket.on('chat:typing', (data: { senderId: string; typing: boolean }) => {
      try {
        if (data.typing) {
          useStore.getState().setPeerTyping(true);
          if (peerTypingTimer) clearTimeout(peerTypingTimer);
          peerTypingTimer = setTimeout(() => {
            useStore.getState().setPeerTyping(false);
          }, 3000);
        } else {
          useStore.getState().setPeerTyping(false);
          if (peerTypingTimer) clearTimeout(peerTypingTimer);
        }
      } catch { /* ignore */ }
    });

    socket.on('chat:read', (data: { messageId: string }) => {
      try {
        useStore.getState().markMessageRead(data.messageId);
      } catch { /* ignore */ }
    });

    socket.on('clipboard:sync', (data: {
      id: string;
      content: string;
      senderId: string;
      senderName: string;
      timestamp: number;
      isCode: boolean;
    }) => {
      try {
        if (!isNewEvent(data.id)) return;

        const entry: ClipboardEntryData = {
          ...data,
          source: 'remote',
        };
        useStore.getState().addClipboardEntry(entry);
        
        if (useStore.getState().clipboardSyncEnabled) {
          navigator.clipboard.writeText(data.content).catch(() => {});
        }
      } catch { /* ignore */ }
    });

    }; // end resolveAndConnect

    // Launch async connection
    resolveAndConnect();

    // ── Cleanup on Url Change or Unmount ──
    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        sharedSocket = null;
      }
    };
  }, [socketUrl, setConnected, addDevice, removeDevice, updateTransfer, addTransfer]);

  return socketRef.current;
}

/**
 * Retrieve the persisted device ID.
 */
export function getDeviceId(): string {
  return getOrCreateDeviceId();
}
