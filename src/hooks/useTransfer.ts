import { useCallback } from 'react';
import { useStore, type Device, type Protocol } from '../store/useStore';
import { getSharedSocket } from './useSocket';
import { uploadFileParallel } from '../engine/parallelChunkUploader';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Global map to hold AbortControllers for active transfers
const abortControllers = new Map<string, AbortController>();

// Global map to hold Files for transfers prior to receiver acceptance
const pendingUploadFiles = new Map<string, File>();

// Helper to generate UUIDs in both secure and insecure contexts (HTTP LAN)
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

export function cancelPendingUpload(id: string) {
  pendingUploadFiles.delete(id);
  const controller = abortControllers.get(id);
  if (controller) {
    controller.abort();
    abortControllers.delete(id);
  }
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

/**
 * Run by the sender once the receiver accepts the transfer.
 * Triggers the actual high-speed upload.
 * 
 * IMPORTANT: The server emits transfer:done when all chunks are received.
 * The sender should NOT emit transfer:done — that causes double-done on receiver.
 */
export async function handleAcceptedTransfer(id: string, _socket: any) {
  const file = pendingUploadFiles.get(id);
  if (!file) {
    console.warn(`[useTransfer] No pending file found for accepted transfer: ${id}`);
    return;
  }

  // ── Resolve the file-transfer URL (MUST be local/LAN — never cloud) ──
  const storeApiBase = useStore.getState().apiBaseUrl || '';
  const serverIp = useStore.getState().serverIp;

  let fileTransferUrl: string;

  if (serverIp && isLanAddress(serverIp)) {
    // Best case: we know the LAN IP from server info
    fileTransferUrl = `http://${serverIp}:${useStore.getState().serverPort || 3001}`;
  } else if (storeApiBase && isLanAddress(storeApiBase)) {
    // apiBaseUrl already points to LAN
    fileTransferUrl = storeApiBase;
  } else if (storeApiBase.includes('localhost') || storeApiBase.includes('127.0.0.1')) {
    // Local dev
    fileTransferUrl = storeApiBase;
  } else {
    // No local server — use WebRTC for browser-to-browser P2P transfer
    console.log('[useTransfer] No local server found — using WebRTC P2P transfer');
    useStore.getState().updateTransfer(id, { status: 'transferring', protocol: 'webrtc' });

    const socket = getSharedSocket();
    if (!socket) {
      useStore.getState().updateTransfer(id, {
        status: 'error',
        error: 'Not connected to signaling server',
      });
      return;
    }

    try {
      const { WebRTCTransfer } = await import('../engine/webrtcEngine');
      const transfer = useStore.getState().transfers.find(t => t.id === id);
      const targetDeviceId = transfer ? (transfer as any).targetDeviceId : '';

      const rtc = new WebRTCTransfer(socket, targetDeviceId || '');
      
      // Store in global map so useSocket can relay answer/ice to it
      const webrtcMap = (window as any).__hyperdrop_webrtc_transfers as Map<string, any> | undefined;
      if (webrtcMap) webrtcMap.set(id, rtc);

      // Set up send callbacks
      rtc.sendFile(
        file,
        (bytesSent, speed) => {
          useStore.getState().updateTransfer(id, {
            transferred: bytesSent,
            speed,
            status: 'transferring',
          });
          // Relay progress to receiver
          socket.emit('transfer:progress', { id, transferred: bytesSent, speed });
        },
        () => {
          useStore.getState().updateTransfer(id, { status: 'done', transferred: file.size });
          pendingUploadFiles.delete(id);
          socket.emit('transfer:done', { id });
          webrtcMap?.delete(id);
          console.log(`[useTransfer] WebRTC P2P upload complete for ${id}`);
        },
        (error) => {
          useStore.getState().updateTransfer(id, { status: 'error', error: error.message });
          socket.emit('transfer:error', { id, error: error.message });
          webrtcMap?.delete(id);
        },
      );

      // Create and send offer
      await rtc.createOffer(targetDeviceId || '');
    } catch (err) {
      console.error('[useTransfer] WebRTC transfer failed:', err);
      useStore.getState().updateTransfer(id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'WebRTC transfer failed',
      });
    }
    return;
  }

  const controller = new AbortController();
  abortControllers.set(id, controller);

  useStore.getState().updateTransfer(id, { status: 'transferring' });

  try {
    await uploadFileParallel({
      file,
      baseUrl: fileTransferUrl,
      transferId: id,
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
        // Relay progress to the peer via Socket.IO so the receiver sees progress
        const socket = getSharedSocket();
        if (socket) {
          socket.emit('transfer:progress', {
            id,
            transferred: progress.transferred,
            speed: progress.speed,
          });
        }
      },
      onComplete: () => {
        // Mark sender's own UI as done
        useStore.getState().updateTransfer(id, { status: 'done', transferred: file.size });
        abortControllers.delete(id);
        pendingUploadFiles.delete(id);
        console.log(`[useTransfer] Upload complete for ${id}, server will emit transfer:done`);
      },
      onError: (error) => {
        useStore.getState().updateTransfer(id, { status: 'error', error: error.message });
        const socket = getSharedSocket();
        if (socket) {
          socket.emit('transfer:error', { id, error: error.message });
        }
        abortControllers.delete(id);
      },
      signal: controller.signal,
    });
  } catch (err) {
    console.error('[useTransfer] Transfer run error:', err);
    abortControllers.delete(id);
  }
}

/**
 * Retry a failed, errored, or cancelled transfer.
 * Sender-side: re-runs the upload engine which auto-resumes via /api/resume/:id.
 * Receiver-side: re-emits transfer:accept so the sender restarts, OR tries direct download.
 */
export function retryTransfer(id: string) {
  const transfer = useStore.getState().transfers.find(t => t.id === id);
  if (!transfer) return;

  if (transfer.direction === 'send') {
    // The file may still be in pendingUploadFiles if the error was a network issue
    const file = pendingUploadFiles.get(id);
    if (file) {
      // Reset state and re-run the upload — it will auto-resume from last checkpoint
      useStore.getState().updateTransfer(id, {
        status: 'transferring',
        error: undefined,
        startedAt: Date.now(),
      });
      handleAcceptedTransfer(id, null);
    } else {
      // File reference lost — remove the failed transfer and reset UI so user can re-pick
      useStore.getState().removeTransfer(id);
      useStore.getState().clearSelectedFiles();
      useStore.getState().setActiveTransfer(null);
    }
  } else if (transfer.direction === 'receive') {
    // Reset state
    useStore.getState().updateTransfer(id, {
      status: 'transferring',
      error: undefined,
      startedAt: Date.now(),
    });

    // Try direct download first — the file may already be on the server
    triggerFileDownload(transfer.fileName, id)
      .then(() => {
        useStore.getState().updateTransfer(id, { status: 'done', transferred: transfer.fileSize });
      })
      .catch(() => {
        // If download fails, re-emit accept so the sender resends
        const socket = getSharedSocket();
        if (socket) {
          socket.emit('transfer:accept', { id });
        } else {
          useStore.getState().updateTransfer(id, {
            status: 'error',
            error: 'Not connected. Please refresh the page.',
          });
        }
      });
  }
}

/**
 * Hook for managing file transfers.
 */
export function useTransfer() {
  const transfers = useStore((s) => s.transfers);
  const activeTransferId = useStore((s) => s.activeTransferId);
  const addTransfer = useStore((s) => s.addTransfer);
  const updateTransfer = useStore((s) => s.updateTransfer);
  const removeTransfer = useStore((s) => s.removeTransfer);

  const apiBaseUrl = useStore((s) => s.apiBaseUrl) || 'http://127.0.0.1:3001';

  const activeTransfer = transfers.find((t) => t.id === activeTransferId) ?? null;

  const sendFiles = useCallback(
    async (files: File[], device: Device) => {
      if (files.length === 0) return;
      const protocol: Protocol = 'parallel-http';
      const socket = getSharedSocket();

      for (const file of files) {
        const id = generateUUID();

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
        });

        // Save file for later when receiver accepts
        pendingUploadFiles.set(id, file);

        if (socket) {
          socket.emit('transfer:start', {
            id,
            fileName: file.name,
            fileSize: file.size,
            senderId: localStorage.getItem('hyperdrop-device-id'),
            targetId: device.id,
            protocol,
          });
        }
      }
    },
    [addTransfer],
  );

  const acceptTransfer = useCallback(
    async (id: string) => {
      const transfer = transfers.find((t) => t.id === id);
      if (!transfer) return;

      updateTransfer(id, { status: 'transferring', startedAt: Date.now() });

      const socket = getSharedSocket();
      if (socket) {
        console.log('[useTransfer] Accepting transfer:', id);
        socket.emit('transfer:accept', { id });
      } else {
        console.error('[useTransfer] Socket not connected');
        updateTransfer(id, { status: 'error', error: 'Socket disconnected' });
      }
    },
    [transfers, updateTransfer]
  );

  const rejectTransfer = useCallback(
    (id: string) => {
      cancelPendingUpload(id);
      updateTransfer(id, { status: 'cancelled' });
      const socket = getSharedSocket();
      if (socket) socket.emit('transfer:cancel', { id });
    },
    [updateTransfer]
  );

  const cancelTransfer = useCallback(
    (id: string) => {
      cancelPendingUpload(id);
      updateTransfer(id, { status: 'cancelled' });
      const socket = getSharedSocket();
      if (socket) socket.emit('transfer:cancel', { id });
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
    
    // Temporarily set flag to bypass beforeunload check
    (window as any).__hyperdrop_is_downloading = true;
    a.click();
    document.body.removeChild(a);
    
    setTimeout(() => {
      (window as any).__hyperdrop_is_downloading = false;
    }, 1000);

    // Revoke after a short delay to ensure download starts
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (err) {
    console.error('[useTransfer] WebRTC download trigger failed:', err);
  }
}

/**
 * Download a file from the server.
 * On native (Capacitor), saves to Documents.
 * On web, triggers browser download.
 */
export async function triggerFileDownload(fileName: string, transferId: string): Promise<void> {
  // Resolve download URL — prefer LAN server
  const storeApiBase = useStore.getState().apiBaseUrl || '';
  const serverIp = useStore.getState().serverIp;
  let baseUrl: string;

  if (serverIp && isLanAddress(serverIp)) {
    baseUrl = `http://${serverIp}:${useStore.getState().serverPort || 3001}`;
  } else if (storeApiBase && (isLanAddress(storeApiBase) || storeApiBase.includes('localhost') || storeApiBase.includes('127.0.0.1'))) {
    baseUrl = storeApiBase;
  } else {
    baseUrl = 'http://127.0.0.1:3001'; // Last resort fallback
  }

  const downloadUrl = `${baseUrl}/download/${encodeURIComponent(fileName)}?transferId=${transferId}`;
  console.log('[useTransfer] triggerFileDownload:', fileName, 'from:', baseUrl);

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
    
    // Temporarily set flag to bypass beforeunload check
    (window as any).__hyperdrop_is_downloading = true;
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      (window as any).__hyperdrop_is_downloading = false;
    }, 1000);
  }
}
