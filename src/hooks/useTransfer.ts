import { useCallback } from 'react';
import { useStore, type Device, type Protocol } from '../store/useStore';
import { getSharedSocket } from './useSocket';
import { uploadFileStream } from '../engine/streamUploadEngine';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Global map to hold AbortControllers for active transfers (avoids React re-renders)
const abortControllers = new Map<string, AbortController>();

// Global map to hold Files for transfers prior to receiver acceptance
const pendingUploadFiles = new Map<string, File>();

// Helper to generate UUIDs in both secure and insecure contexts (HTTP LAN fallback)
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

/**
 * Run by the sender once the receiver accepts the transfer.
 * Triggers the actual high-speed upload stream.
 */
export async function handleAcceptedTransfer(id: string, socket: any) {
  const file = pendingUploadFiles.get(id);
  if (!file) {
    console.warn(`[useTransfer] No pending file found for accepted transfer: ${id}`);
    return;
  }

  const apiBaseUrl = useStore.getState().apiBaseUrl || 'http://127.0.0.1:3001';
  const controller = new AbortController();
  abortControllers.set(id, controller);

  useStore.getState().updateTransfer(id, { status: 'transferring' });

  try {
    await uploadFileStream(
      file,
      apiBaseUrl,
      id,
      (transferred, speed) => {
        useStore.getState().updateTransfer(id, { transferred, speed, status: 'transferring' });
        if (socket) {
          socket.emit('transfer:progress', { id, transferred, speed });
        }
      },
      () => {
        // Success — clean up abort controller & file
        useStore.getState().updateTransfer(id, { status: 'done', transferred: file.size });
        if (socket) {
          socket.emit('transfer:done', { id });
        }
        abortControllers.delete(id);
        pendingUploadFiles.delete(id);
      },
      (error) => {
        useStore.getState().updateTransfer(id, { status: 'error', error: error.message });
        if (socket) {
          socket.emit('transfer:error', { id, error: error.message });
        }
        abortControllers.delete(id);
        pendingUploadFiles.delete(id);
      },
      controller.signal
    );
  } catch (err) {
    console.error('[useTransfer] Transfer run error:', err);
    abortControllers.delete(id);
    pendingUploadFiles.delete(id);
  }
}

/**
 * Hook for managing and orchestrating file transfers.
 *
 * - Co-ordinates raw high-speed uploads to the server
 * - Handles Socket.IO state signaling between devices
 * - Integrates native high-speed browser downloads on acceptance
 */
export function useTransfer() {
  const transfers = useStore((s) => s.transfers);
  const activeTransferId = useStore((s) => s.activeTransferId);
  const addTransfer = useStore((s) => s.addTransfer);
  const updateTransfer = useStore((s) => s.updateTransfer);
  const removeTransfer = useStore((s) => s.removeTransfer);
  const addHistoryEntry = useStore((s) => s.addHistoryEntry);
  
  // API base URL — resolves to cloud URL or local LAN address
  const apiBaseUrl = useStore((s) => s.apiBaseUrl) || 'http://127.0.0.1:3001';

  const activeTransfer = transfers.find((t) => t.id === activeTransferId) ?? null;

  const sendFiles = useCallback(
    async (files: File[], device: Device) => {
      if (files.length === 0) return;
      const file = files[0];
      const id = generateUUID();
      const protocol: Protocol = 'parallel-http';

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
      });

      // Save file for later when receiver accepts
      pendingUploadFiles.set(id, file);

      const socket = getSharedSocket();
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
    },
    [addTransfer, updateTransfer],
  );

  const acceptTransfer = useCallback(
    async (id: string) => {
      const transfer = transfers.find((t) => t.id === id);
      if (!transfer) return;

      updateTransfer(id, { status: 'transferring', startedAt: Date.now() });

      const socket = getSharedSocket();
      if (socket) {
        console.log('[useTransfer] Accepting transfer, informing sender:', id);
        socket.emit('transfer:accept', { id });
      } else {
        console.error('[useTransfer] Socket not connected, cannot accept transfer');
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
      if (socket) {
        socket.emit('transfer:cancel', { id });
      }
    },
    [updateTransfer]
  );

  const cancelTransfer = useCallback(
    (id: string) => {
      cancelPendingUpload(id);
      updateTransfer(id, { status: 'cancelled' });

      const socket = getSharedSocket();
      if (socket) {
        socket.emit('transfer:cancel', { id });
      }
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
  };
}

/**
 * Download a file from the server.
 * On native platforms (Capacitor), saves directly to local Documents.
 * On web platforms, triggers standard browser anchor download.
 */
export async function triggerFileDownload(fileName: string, transferId: string): Promise<void> {
  const apiBaseUrl = useStore.getState().apiBaseUrl || 'http://127.0.0.1:3001';
  const downloadUrl = `${apiBaseUrl}/download/${encodeURIComponent(fileName)}?transferId=${transferId}`;
  console.log('[useTransfer] triggerFileDownload called for:', fileName, 'URL:', downloadUrl);

  if (Capacitor.isNativePlatform()) {
    try {
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from server: ${response.statusText}`);
      }
      const blob = await response.blob();
      
      const blobToBase64 = (b: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = reject;
          reader.onload = () => {
            const base64String = reader.result as string;
            const base64 = base64String.split(',')[1];
            resolve(base64);
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
      
      console.log('[useTransfer] File successfully saved natively:', result.uri);

      // Open native share sheet so user can choose to Save to Files, save to Downloads, or share to other apps
      try {
        const uriResult = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Documents
        });
        await Share.share({
          title: fileName,
          files: [uriResult.uri]
        });
      } catch (shareErr: any) {
        console.error('[useTransfer] Failed to open native share sheet:', shareErr);
        alert(`File saved to app documents, but share sheet failed: ${shareErr.message || shareErr}`);
      }
    } catch (err: any) {
      console.error('[useTransfer] Native download failed:', err);
      alert(`Error saving file natively: ${err.message || err}`);
    }
  } else {
    // Fallback to standard browser anchor click
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
