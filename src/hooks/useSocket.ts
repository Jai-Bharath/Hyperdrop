import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore, type Device } from '../store/useStore';
import { handleAcceptedTransfer, triggerFileDownload, cancelPendingUpload } from './useTransfer';

/** Shared socket instance for other hooks/components */
let sharedSocket: Socket | null = null;

export function getSharedSocket(): Socket | null {
  return sharedSocket;
}

/** LocalStorage key for persistent device identity */
const DEVICE_ID_KEY = 'hyperdrop-device-id';

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
 * Resolve the local server URL — fully offline, zero cloud.
 *
 * Priority:
 *   1. Explicit socketUrl from Zustand store (set by manual IP entry / QR scan)
 *   2. Same origin (dev proxy or production build served from server)
 *   3. Capacitor native → stored LAN IP or localhost fallback
 */
function resolveLocalServerUrl(socketUrl: string): string {
  // 1. Explicit URL already set (from QR scan, manual entry, or settings)
  if (socketUrl) return socketUrl;

  const origin = window.location.origin;

  // 2. Capacitor native app — connect to stored server IP or localhost
  const isCapacitor = origin.startsWith('capacitor://') ||
                      (origin.startsWith('http://localhost') && !window.location.port);
  if (isCapacitor) {
    // Try to recover saved server IP from last successful connection
    try {
      const savedIp = localStorage.getItem('hyperdrop-last-server-ip');
      if (savedIp) return `http://${savedIp}:3001`;
    } catch { /* ignore */ }
    return 'http://localhost:3001';
  }

  // 3. Electron app — always localhost since server is embedded
  if (typeof window !== 'undefined' && (window as any).__ELECTRON__) {
    return 'http://localhost:3001';
  }

  // 4. Standard web — use same origin (Vite proxy in dev, or direct in prod)
  return origin;
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
 * Socket.IO client connection hook — FULLY OFFLINE, LOCAL ONLY.
 * Connects to the local embedded HyperDrop server. Zero cloud dependencies.
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
    // ── Resolve LOCAL connection URL — no cloud, no external servers ──
    const targetUrl = resolveLocalServerUrl(socketUrl);

    console.log(`[useSocket] Connecting to LOCAL server: ${targetUrl}`);

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

      // Fetch server info from local backend
      fetch(`${targetUrl}/api/info`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then((data: { ip: string; port: number; ftpPort: number }) => {
          useStore.getState().setServerInfo(data.ip, data.port, data.ftpPort);
          useStore.getState().setApiBaseUrl(`http://${data.ip}:${data.port}`);
          // Save the LAN IP for future Capacitor reconnections
          try {
            localStorage.setItem('hyperdrop-last-server-ip', data.ip);
          } catch { /* ignore */ }
          console.log(`[useSocket] Local server LAN IP resolved: ${data.ip}:${data.port}`);
        })
        .catch((err) => {
          console.error('[useSocket] Failed to fetch local configuration (non-fatal):', err);
          // Fallback: use targetUrl as the API base
          useStore.getState().setApiBaseUrl(targetUrl);
        });

      // Register device identification
      socket.emit('device:register', {
        deviceId: deviceIdRef.current,
        name: getDeviceFriendlyName(),
        platform: getDevicePlatform(),
        supports5GHz: true,
        port: window.location.port ? parseInt(window.location.port, 10) : 3001,
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

    socket.on('transfer:progress', (payload: {
      id: string;
      transferred: number;
      speed: number;
    }) => {
      try {
        const transfers = useStore.getState().transfers;
        const transfer = transfers.find((t) => t.id === payload.id);
        const isDone = transfer && payload.transferred >= transfer.fileSize;

        updateTransfer(payload.id, {
          transferred: payload.transferred,
          speed: payload.speed,
          status: isDone ? 'done' : 'transferring',
        });

        if (isDone && transfer && transfer.direction === 'receive' && transfer.status === 'transferring') {
          triggerFileDownload(transfer.fileName, payload.id);
        }
      } catch {
        // Ignore
      }
    });

    socket.on('transfer:done', (payload: { id: string }) => {
      try {
        const transfers = useStore.getState().transfers;
        const transfer = transfers.find((t) => t.id === payload.id);
        
        if (transfer) {
          // If we are the receiver and we accepted the transfer (status is transferring),
          // trigger the download now that the file is fully ready on the server.
          if (transfer.direction === 'receive' && transfer.status === 'transferring') {
            triggerFileDownload(transfer.fileName, payload.id);
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
        }

        updateTransfer(payload.id, { status: 'done' });
      } catch (err) {
        console.error('[useSocket] Error auto-recording history on transfer completion:', err);
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
