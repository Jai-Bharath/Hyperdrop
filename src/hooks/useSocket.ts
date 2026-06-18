import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore, type Device } from '../store/useStore';
import { handleAcceptedTransfer, triggerFileDownload, cancelPendingUpload, triggerWebRTCDownload } from './useTransfer';
import { WebRTCTransfer } from '../engine/webrtcEngine';

/** Shared socket instance for other hooks/components */
let sharedSocket: Socket | null = null;

export function getSharedSocket(): Socket | null {
  return sharedSocket;
}

/** LocalStorage key for persistent device identity */
const DEVICE_ID_KEY = 'hyperdrop-device-id';

/**
 * Check if a URL or IP string contains a private/LAN IP address.
 * Used to detect if a device is on the same local network.
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

/** Default public cloud signaling server fallback */
const CLOUD_SIGNAL_URL = 'https://hyperdrop-tzjv.onrender.com';

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
function getDeviceFriendlyName(): string {
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
    // ── Resolve dynamic connection URL ──
    let targetUrl = socketUrl || ((import.meta as any).env.VITE_SOCKET_URL as string) || '';
    if (!targetUrl) {
      const origin = window.location.origin;
      const isCapacitor = origin.startsWith('capacitor://') || 
                          (origin.startsWith('http://localhost') && !window.location.port);
      const isLocalDev = origin.includes('localhost') || 
                         origin.includes('127.0.0.1') || 
                         /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(origin);

      if (isCapacitor || !isLocalDev) {
        // Native mobile app OR cloud-hosted frontend (Vercel/Netlify/etc.)
        // → connect to the dedicated Cloud backend on Render
        targetUrl = CLOUD_SIGNAL_URL;
      } else {
        // Local dev / LAN — connects to its own origin (proxied or direct)
        targetUrl = origin;
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
      
      // Load server configuration if connected to a local HyperDrop backend
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
        // Cloud signaling server — file data should still go over LAN if possible!
        // Set cloud URL as fallback, but we'll attempt LAN discovery below.
        useStore.getState().setServerInfo('', 3001, 2121);
        useStore.getState().setApiBaseUrl(targetUrl);
        console.log(`[useSocket] Cloud signaling connected. Will probe LAN for direct file transfer.`);
      }

      // Register device identification
      socket.emit('device:register', {
        deviceId: deviceIdRef.current,
        name: getDeviceFriendlyName(),
        platform: getDevicePlatform(),
        supports5GHz: true,
        port: window.location.port ? parseInt(window.location.port, 10) : 80
      });

      // If we have an active pairing Room ID parameter in URL or localStorage, auto-rejoin
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
          addDevice(device);

          // ── LAN Auto-Discovery for Cloud Connections ──
          // When using the hosted website but on the same WiFi, probe the device's
          // LAN IP for a local HyperDrop server. If reachable, route file data
          // directly over WiFi instead of through the cloud. (QuickShare/AirDrop pattern)
          const currentApiBase = useStore.getState().apiBaseUrl;
          const isCurrentlyUsingCloud = currentApiBase && !isPrivateIp(currentApiBase);
          const deviceHasPrivateIp = device.ip && isPrivateIp(device.ip);

          if (isCurrentlyUsingCloud && deviceHasPrivateIp) {
            const lanUrl = `http://${device.ip}:3001`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout

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
                // LAN not reachable — keep using cloud (this is fine)
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

    // ── Transfer Events ──
    socket.on('transfer:incoming', (transfer: {
      id: string;
      fileName: string;
      fileSize: number;
      protocol: string;
      senderId?: string;
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
          targetDeviceId: transfer.senderId, // Store sender's ID for WebRTC
        });
      } catch {
        // Malformed payload
      }
    });

    socket.on('transfer:accept', (payload: { id: string }) => {
      try {
        handleAcceptedTransfer(payload.id, socket);
      } catch (err) {
        console.error('[useSocket] Failed to handle accepted transfer:', err);
      }
    });

    // Track pending auto-completion timers (safety net for 100% stuck)
    const pendingCompletionTimers = new Map<string, ReturnType<typeof setTimeout>>();

    socket.on('transfer:progress', (payload: {
      id: string;
      transferred: number;
      speed: number;
    }) => {
      try {
        const transfers = useStore.getState().transfers;
        const transfer = transfers.find((t) => t.id === payload.id);
        // Only update if still transferring — don't overwrite 'done' status
        if (transfer && transfer.status === 'transferring') {
          updateTransfer(payload.id, {
            transferred: payload.transferred,
            speed: payload.speed,
          });

          // Safety net: if receiver sees ~100% progress but transfer:done hasn't fired,
          // auto-complete after 5 seconds to prevent getting stuck
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
                console.log(`[useSocket] Safety net: auto-completing transfer ${payload.id} (stuck at 100%)`);
                downloadedTransfers.add(payload.id);
                updateTransfer(payload.id, { status: 'done', transferred: currentTransfer.fileSize });
                triggerFileDownload(currentTransfer.fileName, payload.id);
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

    // Track which transfers have already triggered downloads (prevents double-download)
    const downloadedTransfers = new Set<string>();

    socket.on('transfer:done', (payload: { id: string; fileName?: string; fileSize?: number; downloadUrl?: string }) => {
      try {
        // Clear any safety-net auto-completion timer
        const pendingTimer = pendingCompletionTimers.get(payload.id);
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingCompletionTimers.delete(payload.id);
        }

        // Deduplicate — server broadcasts io.emit + socket relay can both arrive
        if (downloadedTransfers.has(payload.id)) return;

        const transfers = useStore.getState().transfers;
        const transfer = transfers.find((t) => t.id === payload.id);
        
        if (transfer) {
          // Update transfer status to done BEFORE triggering download to avoid race conditions with beforeunload listener
          updateTransfer(payload.id, { status: 'done', transferred: payload.fileSize || transfer.fileSize || 0 });

          // Only trigger download if we are the RECEIVER
          if (transfer.direction === 'receive' && transfer.status !== 'done') {
            downloadedTransfers.add(payload.id);
            const fileName = payload.fileName || transfer.fileName;
            triggerFileDownload(fileName, payload.id);
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
            deviceName: transfer.direction === 'send' ? 'Receiver' : 'Sender',
          });
        } else {
          updateTransfer(payload.id, { status: 'done', transferred: payload.fileSize || 0 });
        }

        // Clean up after 60s to prevent memory leak
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
    const webrtcTransfers = new Map<string, WebRTCTransfer>();
    (window as any).__hyperdrop_webrtc_transfers = webrtcTransfers;

    socket.on('webrtc:offer', (payload: { fromId: string; offer: RTCSessionDescriptionInit }) => {
      try {
        console.log('[useSocket] WebRTC offer received from:', payload.fromId);
        const transfers = useStore.getState().transfers;
        const transfer = transfers.find(
          (t) => t.direction === 'receive' && t.status === 'transferring'
        );
        if (!transfer) return;

        const rtc = new WebRTCTransfer(socket, payload.fromId);
        webrtcTransfers.set(transfer.id, rtc);

        rtc.receiveFile(
          (bytesReceived, speed) => {
            updateTransfer(transfer.id, {
              transferred: bytesReceived,
              speed,
              status: 'transferring',
              protocol: 'webrtc',
            });
          },
          (downloadUrl) => {
            updateTransfer(transfer.id, { status: 'done', transferred: transfer.fileSize });
            triggerWebRTCDownload(transfer.fileName, downloadUrl!);
            const duration = Math.max(1, (Date.now() - transfer.startedAt) / 1000);
            useStore.getState().addHistoryEntry({
              id: transfer.id, fileName: transfer.fileName, fileSize: transfer.fileSize,
              protocol: 'webrtc', direction: 'receive',
              speed: transfer.fileSize / duration, duration,
              completedAt: Date.now(), deviceName: 'Sender',
            });
            webrtcTransfers.delete(transfer.id);
          },
          (error) => {
            updateTransfer(transfer.id, { status: 'error', error: error.message });
            webrtcTransfers.delete(transfer.id);
          },
        );

        rtc.handleOffer(payload.offer, payload.fromId).catch((err) => {
          console.error('[useSocket] WebRTC offer handling failed:', err);
          updateTransfer(transfer.id, { status: 'error', error: 'WebRTC connection failed' });
        });
      } catch (err) {
        console.error('[useSocket] Error handling webrtc:offer:', err);
      }
    });

    socket.on('webrtc:answer', (payload: { fromId: string; answer: RTCSessionDescriptionInit }) => {
      try {
        for (const [, rtc] of webrtcTransfers.entries()) {
          rtc.handleAnswer(payload.answer).catch((err) => {
            console.error('[useSocket] WebRTC answer failed:', err);
          });
          break;
        }
      } catch (err) {
        console.error('[useSocket] Error handling webrtc:answer:', err);
      }
    });

    socket.on('webrtc:ice', (payload: { fromId: string; candidate: RTCIceCandidateInit }) => {
      try {
        for (const rtc of webrtcTransfers.values()) {
          rtc.handleIceCandidate(payload.candidate).catch(() => {});
        }
      } catch { /* ignore */ }
    });

    // ── Peer Disconnect Alert (Immediate notification) ──
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
          // Abort the upload if we are the sender
          if (transfer.direction === 'send') {
            cancelPendingUpload(payload.transferId);
          }
          
          // Mark transfer as errored
          updateTransfer(payload.transferId, {
            status: 'error',
            error: `${payload.deviceName} disconnected`,
          });
          
          // Show prominent disconnect alert
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

    // Client-side dedup for chat/clipboard (safety net)
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
        // Deduplicate
        if (!isNewEvent(data.id)) return;

        const message: ChatMessageData = {
          ...data,
          read: false,
        };
        useStore.getState().addChatMessage(message);
        
        // Send read receipt if chat is currently open
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
        // Deduplicate
        if (!isNewEvent(data.id)) return;

        const entry: ClipboardEntryData = {
          ...data,
          source: 'remote',
        };
        useStore.getState().addClipboardEntry(entry);
        
        // Auto-copy to clipboard if sync is enabled
        if (useStore.getState().clipboardSyncEnabled) {
          navigator.clipboard.writeText(data.content).catch(() => {});
        }
      } catch { /* ignore */ }
    });

    // ── Cleanup on Url Change or Unmount ──
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      sharedSocket = null;
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
