import { useCallback } from 'react';
import { useStore, type Device, type Protocol } from '../store/useStore';
import { getSharedSocket } from './useSocket';
import { uploadFileStream } from '../engine/streamUploadEngine';

// Global map to hold AbortControllers for active transfers (avoids React re-renders)
const abortControllers = new Map<string, AbortController>();

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

      const controller = new AbortController();
      abortControllers.set(id, controller);

      updateTransfer(id, { status: 'transferring' });

      try {
        // Trigger our ultra high-speed raw streaming upload to the Express server
        // This handles both local loopbacks (sender=receiver=laptop)
        // and remote uploads (sender=phone, receiver=laptop)
        await uploadFileStream(
          file,
          apiBaseUrl,
          id,
          (transferred, speed) => {
            updateTransfer(id, { transferred, speed, status: 'transferring' });
            if (socket) {
              socket.emit('transfer:progress', { id, transferred, speed });
            }
          },
          () => {
            // Success — clean up abort controller
            updateTransfer(id, { status: 'done', transferred: file.size });
            if (socket) {
              socket.emit('transfer:done', { id });
            }
            abortControllers.delete(id);
          },
          (error) => {
            updateTransfer(id, { status: 'error', error: error.message });
            if (socket) {
              socket.emit('transfer:error', { id, error: error.message });
            }
            abortControllers.delete(id);
          },
          controller.signal
        );
      } catch (err) {
        console.error('[useTransfer] Transfer run error:', err);
        abortControllers.delete(id);
      }
    },
    [addTransfer, updateTransfer, apiBaseUrl],
  );

  const acceptTransfer = useCallback(
    async (id: string) => {
      const transfer = transfers.find((t) => t.id === id);
      if (!transfer) return;

      updateTransfer(id, { status: 'transferring', startedAt: Date.now() });

      // Resolve destination download URL with transferId for progress tracking
      const downloadUrl = `${apiBaseUrl}/download/${encodeURIComponent(transfer.fileName)}?transferId=${id}`;

      console.log('[useTransfer] Launching direct stream download for', transfer.fileName);
      
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = transfer.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [transfers, updateTransfer, apiBaseUrl]
  );

  const rejectTransfer = useCallback(
    (id: string) => {
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
      const controller = abortControllers.get(id);
      if (controller) {
        controller.abort();
        abortControllers.delete(id);
      }

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
