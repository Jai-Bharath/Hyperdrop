import { useCallback } from 'react';
import { useStore, type Device, type Protocol } from '../store/useStore';
import { uploadFileParallel } from '../engine/parallelChunkUploader';
import { WebRTCTransfer } from '../engine/webrtcEngine';
import { getSharedSocket, getDeviceFriendlyName } from './useSocket';
import type { Socket } from 'socket.io-client';
import { playSuccessChime } from '../utils/audio';
import { showDesktopNotification } from '../utils/notification';
import { generateSessionToken } from '../utils/crypto';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  sendPrepareRequest,
  buildPeerBaseUrl,
  buildDownloadUrl,
  type FileMeta,
} from '../hooks/useLocalTransport';
import { LOCAL_HTTP_PORT } from '../shared/protocol';

// ═════════════════════════════════════════════════════════════════
//  GLOBAL MAPS
// ═════════════════════════════════════════════════════════════════

/** Abort controllers for active HTTP-based transfers */
const abortControllers = new Map<string, AbortController>();

/** Active WebRTC transfers map */
const activeWebRTCTransfers = new Map<string, WebRTCTransfer>();

/** Files waiting for receiver acceptance */
const pendingUploadFiles = new Map<string, File>();

// ═════════════════════════════════════════════════════════════════
//  HELPERS
// ═════════════════════════════════════════════════════════════════

/** Generate UUIDs in both secure and insecure contexts (HTTP LAN) */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Check if a URL or IP is a private/local address (LAN — not cloud) */
function isLanAddress(urlOrIp: string): boolean {
  const stripped = urlOrIp.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
  return (
    stripped.startsWith('192.168.') ||
    stripped.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(stripped) ||
    stripped === '127.0.0.1' ||
    stripped === 'localhost'
  );
}

// ═════════════════════════════════════════════════════════════════
//  CANCEL
// ═════════════════════════════════════════════════════════════════

export function cancelPendingUpload(id: string) {
  pendingUploadFiles.delete(id);

  // Cancel HTTP upload
  const controller = abortControllers.get(id);
  if (controller) {
    controller.abort();
    abortControllers.delete(id);
  }

  // Cancel WebRTC transfer
  const rtc = activeWebRTCTransfers.get(id);
  if (rtc) {
    rtc.close();
    activeWebRTCTransfers.delete(id);
  }
}

// ═════════════════════════════════════════════════════════════════
//  ACCEPTED TRANSFER HANDLER — Zero-Cloud
// ═════════════════════════════════════════════════════════════════

/**
 * Run by the sender once the receiver has accepted via the PrepareResponse.
 * In the zero-cloud architecture, every device runs its own HTTP server,
 * so we ALWAYS have a LAN target to upload to (the peer's ip:port).
 */
export async function handleAcceptedTransfer(
  id: string,
  peerIp: string,
  peerPort: number,
  sessionToken?: string
) {
  const file = pendingUploadFiles.get(id);
  if (!file) {
    console.warn(`[useTransfer] No pending file found for accepted transfer: ${id}`);
    return;
  }

  const peerBaseUrl = buildPeerBaseUrl(peerIp, peerPort);
  console.log(`[useTransfer] Uploading to peer at ${peerBaseUrl}`);

  useStore.getState().updateTransfer(id, {
    status: 'transferring',
    protocol: 'parallel-http',
  });

  const controller = new AbortController();
  abortControllers.set(id, controller);

  try {
    await uploadFileParallel({
      file,
      baseUrl: peerBaseUrl,
      transferId: id,
      sessionToken,
      onProgress: (progress) => {
        useStore.getState().updateTransfer(id, {
          transferred: progress.transferred,
          speed: progress.speed,
          status: 'transferring',
          chunks: {
            total: progress.chunksTotal,
            done: progress.chunksCompleted,
            failed: [],
          },
        });
      },
      onComplete: () => {
        useStore.getState().updateTransfer(id, {
          status: 'done',
          transferred: file.size,
        });
        abortControllers.delete(id);
        pendingUploadFiles.delete(id);

        // Add to history
        const transfer = useStore.getState().transfers.find(t => t.id === id);
        if (transfer) {
          useStore.getState().addHistoryEntry({
            id,
            fileName: file.name,
            fileSize: file.size,
            protocol: 'parallel-http',
            direction: 'send',
            speed: transfer.speed,
            duration: (Date.now() - transfer.startedAt) / 1000,
            completedAt: Date.now(),
            deviceName: transfer.deviceName || peerIp,
          });
        }

        playSuccessChime();
        showDesktopNotification('File Sent', `${file.name} sent successfully.`);
        console.log(`[useTransfer] HTTP upload complete for ${id}`);
      },
      onError: (error) => {
        useStore.getState().updateTransfer(id, {
          status: 'error',
          error: error.message,
        });
        abortControllers.delete(id);
      },
      signal: controller.signal,
    });
  } catch (err) {
    console.error('[useTransfer] HTTP transfer error:', err);
    abortControllers.delete(id);
  }
}

/**
 * Handle a WebRTC transfer acceptance.
 */
export async function handleAcceptedSocketTransfer(id: string, socket: Socket) {
  const file = pendingUploadFiles.get(id);
  const transfer = useStore.getState().transfers.find(t => t.id === id);
  if (!file) {
    console.warn(`[useTransfer] No pending file found for accepted transfer: ${id}`);
    return;
  }

  const targetDeviceId = transfer?.targetDeviceId;
  if (!targetDeviceId) {
    useStore.getState().updateTransfer(id, {
      status: 'error',
      error: 'No target device ID found',
    });
    return;
  }

  useStore.getState().updateTransfer(id, { status: 'transferring', protocol: 'webrtc' });

  try {
    const { BackgroundGuard } = await import('../engine/backgroundGuard');
    const guard = BackgroundGuard.acquire(id);

    const rtc = new WebRTCTransfer(socket, targetDeviceId);
    activeWebRTCTransfers.set(id, rtc);

    const relativePath = (file as any).webkitRelativePath || transfer?.relativePath || undefined;

    rtc.sendFile(
      file,
      (bytesSent, speed) => {
        useStore.getState().updateTransfer(id, {
          transferred: bytesSent,
          speed,
          status: 'transferring',
        });
        socket.emit('transfer:progress', { id, transferred: bytesSent, speed });
      },
      () => {
        useStore.getState().updateTransfer(id, { status: 'done', transferred: file.size });
        pendingUploadFiles.delete(id);
        activeWebRTCTransfers.delete(id);
        socket.emit('transfer:done', { id });
        guard.release();
        
        playSuccessChime();
        showDesktopNotification('File Sent', `${file.name} sent successfully.`);
        console.log(`[useTransfer] WebRTC P2P upload complete for ${id}`);
      },
      (error) => {
        if (rtc.isClosed) { guard.release(); return; }
        useStore.getState().updateTransfer(id, { status: 'error', error: error.message });
        socket.emit('transfer:error', { id, error: error.message });
        activeWebRTCTransfers.delete(id);
        guard.release();
      },
      { relativePath }
    );

    await rtc.createOffer(targetDeviceId);
  } catch (err) {
    console.error('[useTransfer] WebRTC transfer initiation failed:', err);
    useStore.getState().updateTransfer(id, {
      status: 'error',
      error: err instanceof Error ? err.message : 'WebRTC transfer initiation failed',
    });
    activeWebRTCTransfers.delete(id);
  }
}

// ═════════════════════════════════════════════════════════════════
//  RETRY
// ═════════════════════════════════════════════════════════════════

export function retryTransfer(id: string) {
  const transfer = useStore.getState().transfers.find(t => t.id === id);
  if (!transfer) return;

  if (transfer.direction === 'send') {
    const file = pendingUploadFiles.get(id);
    if (file) {
      // Find the target device to get its IP
      const targetDevice = useStore.getState().devices.find(d => d.id === transfer.targetDeviceId);
      if (targetDevice) {
        useStore.getState().updateTransfer(id, {
          status: 'transferring',
          error: undefined,
          startedAt: Date.now(),
        });
        handleAcceptedTransfer(id, targetDevice.ip, targetDevice.port);
      } else {
        useStore.getState().updateTransfer(id, {
          status: 'error',
          error: 'Target device not found — it may have disconnected',
        });
      }
    } else {
      // File reference lost — remove and reset UI
      useStore.getState().removeTransfer(id);
      useStore.getState().clearSelectedFiles();
      useStore.getState().setActiveTransfer(null);
    }
  }
  // Receive retry: the sender needs to re-initiate
}

// ═════════════════════════════════════════════════════════════════
//  HOOK
// ═════════════════════════════════════════════════════════════════

export function useTransfer() {
  const transfers = useStore((s) => s.transfers);
  const activeTransferId = useStore((s) => s.activeTransferId);
  const addTransfer = useStore((s) => s.addTransfer);
  const updateTransfer = useStore((s) => s.updateTransfer);
  const removeTransfer = useStore((s) => s.removeTransfer);

  const activeTransfer = transfers.find((t) => t.id === activeTransferId) ?? null;

  /**
   * Send files to a peer device.
   * Dynamically handles Socket-discovered devices (WebRTC) and LAN-discovered devices (HTTP direct).
   */
  const sendFiles = useCallback(
    async (files: File[], device: Device) => {
      if (files.length === 0) return;

      const socket = getSharedSocket();

      // Check if this device is WebRTC-only (discovered via socket cloud)
      if (device.source === 'socket') {
        const protocol: Protocol = 'webrtc';
        for (const file of files) {
          const id = generateUUID();
          const relativePath = (file as any).webkitRelativePath || undefined;

          addTransfer({
            id,
            fileName: file.name,
            fileSize: file.size,
            transferred: 0,
            speed: 0,
            protocol,
            direction: 'send',
            status: 'pending',
            startedAt: Date.now(),
            chunks: { total: 0, done: 0, failed: [] },
            targetDeviceId: device.id,
            relativePath,
            deviceName: device.name,
          });

          // Save file reference
          pendingUploadFiles.set(id, file);

          if (socket) {
            socket.emit('transfer:start', {
              id,
              fileName: file.name,
              fileSize: file.size,
              senderId: localStorage.getItem('hyperdrop-device-id'),
              targetId: device.id,
              protocol,
              relativePath,
              senderName: getDeviceFriendlyName(),
            });
          }
        }
        return;
      }

      // ── LAN Direct HTTP Pathway ──
      const protocol: Protocol = 'parallel-http';

      // Build file metadata for the PrepareRequest
      const fileMetas: FileMeta[] = files.map((file) => ({
        id: generateUUID(),
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        relativePath: (file as any).webkitRelativePath || undefined,
      }));

      // Create transfer entries for each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const meta = fileMetas[i];

        addTransfer({
          id: meta.id,
          fileName: file.name,
          fileSize: file.size,
          transferred: 0,
          speed: 0,
          protocol,
          direction: 'send',
          status: 'pending',
          startedAt: Date.now(),
          chunks: { total: 0, done: 0, failed: [] },
          targetDeviceId: device.id,
          relativePath: (file as any).webkitRelativePath || undefined,
          deviceName: device.name,
        });

        // Save file for after receiver accepts
        pendingUploadFiles.set(meta.id, file);
      }

      // Send PrepareRequest to peer's HTTP server
      try {
        console.log(`[useTransfer] Sending prepare request to ${device.ip}:${device.port}`);
        const response = await sendPrepareRequest(device.ip, device.port, fileMetas);

        if (response.accepted) {
          console.log(`[useTransfer] Peer accepted ${response.acceptedFileIds.length} file(s)`);

          // Start uploading each accepted file
          for (const fileId of response.acceptedFileIds) {
            handleAcceptedTransfer(fileId, device.ip, device.port, response.sessionToken);
          }
        } else {
          console.log(`[useTransfer] Peer declined: ${response.reason || 'Unknown reason'}`);
          // Mark all transfers as cancelled
          for (const meta of fileMetas) {
            updateTransfer(meta.id, {
              status: 'cancelled',
              error: response.reason || 'Peer declined the transfer',
            });
            pendingUploadFiles.delete(meta.id);
          }
        }
      } catch (err) {
        console.error('[useTransfer] Prepare request failed:', err);
        const errorMsg = err instanceof Error ? err.message : 'Failed to connect to peer';
        for (const meta of fileMetas) {
          updateTransfer(meta.id, {
            status: 'error',
            error: errorMsg,
          });
          pendingUploadFiles.delete(meta.id);
        }
      }
    },
    [addTransfer, updateTransfer],
  );

  const rejectTransfer = useCallback(
    (id: string) => {
      cancelPendingUpload(id);
      updateTransfer(id, { status: 'cancelled' });

      // On native, tell the NanoHTTPD server to decline
      if (Capacitor.isNativePlatform()) {
        import('../native/LocalServer').then(({ LocalServer }) => {
          LocalServer.respondToTransfer({
            sessionId: id,
            accepted: false,
            reason: 'User declined',
          }).catch(() => {});
        });
      }
    },
    [updateTransfer]
  );

  /**
   * Accept an incoming transfer on the receiver side.
   * Handles WebRTC transfers via Socket signaling, and LAN HTTP transfers natively.
   */
  const acceptTransfer = useCallback(
    async (id: string) => {
      const transfer = transfers.find((t) => t.id === id);
      if (!transfer) return;

      updateTransfer(id, { status: 'transferring', startedAt: Date.now() });

      const socket = getSharedSocket();
      if (socket && transfer.protocol === 'webrtc') {
        console.log('[useTransfer] Accepting WebRTC transfer over socket:', id);
        socket.emit('transfer:accept', { id });
        return;
      }

      if (Capacitor.isNativePlatform()) {
        try {
          const { LocalServer } = await import('../native/LocalServer');
          const token = generateSessionToken();
          await LocalServer.respondToTransfer({
            sessionId: id,
            accepted: true,
            sessionToken: token,
          });
          console.log('[useTransfer] Native consent granted for:', id);
        } catch (err) {
          console.error('[useTransfer] Failed to respond to transfer:', err);
          updateTransfer(id, { status: 'error', error: 'Failed to accept transfer' });
        }
      }
      // On web/companion: server handles acceptance automatically
    },
    [transfers, updateTransfer]
  );

  const cancelTransfer = useCallback(
    (id: string) => {
      cancelPendingUpload(id);
      updateTransfer(id, { status: 'cancelled' });
    },
    [updateTransfer]
  );

  return {
    transfers,
    activeTransfer,
    activeTransferId,
    sendFiles,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer,
    removeTransfer,
    retryTransfer,
  };
}

// ═════════════════════════════════════════════════════════════════
//  DOWNLOAD TRIGGERS
// ═════════════════════════════════════════════════════════════════

/**
 * Download a file received via WebRTC (from a Blob URL).
 * No server fetch needed — the file is already in memory.
 */
export function triggerWebRTCDownload(fileName: string, blobUrl: string): void {
  console.log('[useTransfer] triggerWebRTCDownload:', fileName);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    
    (window as any).__hyperdrop_is_downloading = true;
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => {
      (window as any).__hyperdrop_is_downloading = false;
    }, 1000);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  } catch (err) {
    console.error('[useTransfer] WebRTC download trigger failed:', err);
  }
}

/**
 * Download a file from a peer's local server.
 * On native (Capacitor), saves to Documents.
 * On web, triggers browser download.
 */
export async function triggerFileDownload(fileName: string, transferId: string): Promise<void> {
  // Check if this transfer has a blob URL (WebRTC transfer)
  const transfer = useStore.getState().transfers.find(t => t.id === transferId);
  if (transfer?.blobUrl) {
    triggerWebRTCDownload(fileName, transfer.blobUrl);
    return;
  }

  // Find the peer device to get its IP
  const targetDevice = transfer?.targetDeviceId
    ? useStore.getState().devices.find(d => d.id === transfer.targetDeviceId)
    : null;

  let downloadUrl: string;
  if (targetDevice && targetDevice.ip) {
    downloadUrl = buildDownloadUrl(targetDevice.ip, targetDevice.port, fileName);
  } else {
    // Fallback: try localhost companion
    downloadUrl = `http://127.0.0.1:${LOCAL_HTTP_PORT}/download/${encodeURIComponent(fileName)}`;
  }

  console.log('[useTransfer] triggerFileDownload:', fileName, 'from:', downloadUrl);

  if (Capacitor.isNativePlatform()) {
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
      const blob = await response.blob();

      const blobToBase64 = (b: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onload = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]);
          };
          reader.readAsDataURL(b);
        });
      };

      const base64 = await blobToBase64(blob);
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Documents,
        recursive: true
      });

      console.log('[useTransfer] File saved natively:', result.uri);

      try {
        const uriResult = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Documents
        });
        await Share.share({ title: fileName, files: [uriResult.uri] });
      } catch (shareErr: any) {
        console.error('[useTransfer] Share sheet failed:', shareErr);
      }
    } catch (err: any) {
      console.error('[useTransfer] Native download failed:', err);
      alert(`Error saving file: ${err.message || err}`);
    }
  } else {
    // Standard browser download via hidden anchor
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    
    (window as any).__hyperdrop_is_downloading = true;
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      (window as any).__hyperdrop_is_downloading = false;
    }, 1000);
  }
}
