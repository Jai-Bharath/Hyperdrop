/**
 * useIncomingTransfers — Phase 6
 *
 * Listens for incoming PrepareRequest events from the native LocalServer
 * plugin and queues them for the ConsentModal. On the web companion path,
 * the desktop server handles consent directly via the HTTP response hold.
 *
 * Returns the current pending request and accept/decline handlers.
 */
import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalServer } from '../native/LocalServer';
import { useStore } from '../store/useStore';
import { generateSessionToken } from '../utils/crypto';
import { playSuccessChime, playMessageChime } from '../utils/audio';
import { showDesktopNotification } from '../utils/notification';
import type { TransferRequestData } from '../components/ConsentModal';

export function useIncomingTransfers() {
  const [pendingRequest, setPendingRequest] = useState<TransferRequestData | null>(null);
  const addTransfer = useStore((s) => s.addTransfer);
  const updateTransfer = useStore((s) => s.updateTransfer);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const addClipboardEntry = useStore((s) => s.addClipboardEntry);

  // Local device signature
  const myFingerprint = localStorage.getItem('hyperdrop-fingerprint') || 'unknown';

  // ── Listen for native transfer requests & syncs ────────────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let requestListener: { remove: () => void } | null = null;
    let completeListener: { remove: () => void } | null = null;
    let chatListener: { remove: () => void } | null = null;
    let clipboardListener: { remove: () => void } | null = null;

    (async () => {
      // 1. Transfer Request (Consent Modal)
      requestListener = await LocalServer.addListener('transferRequest', (data) => {
        console.log('[useIncomingTransfers] Received transfer request:', data.sessionId);

        let files: TransferRequestData['files'] = [];
        try {
          files = JSON.parse(data.files);
        } catch {
          files = [];
        }

        const request: TransferRequestData = {
          sessionId: data.sessionId,
          senderAlias: data.senderAlias,
          senderFingerprint: data.senderFingerprint,
          senderPublicKey: data.senderPublicKey,
          files,
          totalSize: data.totalSize,
          fileCount: data.fileCount,
        };

        // Check trusted devices list for auto-accept
        let isTrusted = false;
        try {
          const trusted = localStorage.getItem('hyperdrop-trusted-devices') || '[]';
          const trustedList = JSON.parse(trusted);
          isTrusted = trustedList.includes(data.senderFingerprint);
        } catch {}

        if (isTrusted) {
          console.log('[useIncomingTransfers] Auto-accepting trusted device transfer:', data.sessionId);
          try {
            const token = generateSessionToken();
            LocalServer.respondToTransfer({
              sessionId: data.sessionId,
              accepted: true,
              sessionToken: token,
            }).catch(() => {});

            for (const file of files) {
              addTransfer({
                id: file.id,
                fileName: file.name,
                fileSize: file.size,
                transferred: 0,
                speed: 0,
                protocol: 'parallel-http',
                direction: 'receive',
                status: 'transferring',
                startedAt: Date.now(),
                chunks: { total: 0, done: 0, failed: [] },
                targetDeviceId: data.senderFingerprint,
                deviceName: data.senderAlias,
              });
            }
          } catch (err) {
            console.error('[useIncomingTransfers] Auto-accept response failed:', err);
          }
          return;
        }

        // Add incoming transfers to the store (as pending)
        for (const file of files) {
          addTransfer({
            id: file.id,
            fileName: file.name,
            fileSize: file.size,
            transferred: 0,
            speed: 0,
            protocol: 'parallel-http',
            direction: 'receive',
            status: 'pending',
            startedAt: Date.now(),
            chunks: { total: 0, done: 0, failed: [] },
            targetDeviceId: data.senderFingerprint,
            deviceName: data.senderAlias,
          });
        }

        setPendingRequest(request);
      });

      // 2. Transfer Complete (Reassembly done natively)
      completeListener = await LocalServer.addListener('transferComplete', (data) => {
        console.log('[useIncomingTransfers] Native transfer complete:', data.transferId);
        
        const transfers = useStore.getState().transfers;
        const transfer = transfers.find((t) => t.id === data.transferId);
        if (transfer) {
          updateTransfer(data.transferId, {
            status: 'done',
            transferred: data.fileSize,
          });

          const duration = Math.max(1, (Date.now() - transfer.startedAt) / 1000);
          useStore.getState().addHistoryEntry({
            id: data.transferId,
            fileName: data.fileName,
            fileSize: data.fileSize,
            protocol: 'parallel-http',
            direction: 'receive',
            speed: data.fileSize / duration,
            duration,
            completedAt: Date.now(),
            deviceName: transfer.deviceName || 'Sender',
          });

          playSuccessChime();
          showDesktopNotification('File Received', `${data.fileName} received successfully.`);
        }
      });

      // 3. Chat Messages (Offline Sync)
      chatListener = await LocalServer.addListener('chatMessage', (data) => {
        console.log('[useIncomingTransfers] Native chat message received:', data.id);
        const isOwn = data.senderFingerprint === myFingerprint;
        if (isOwn) return;

        addChatMessage({
          id: data.id,
          text: data.text,
          senderId: data.senderFingerprint,
          senderName: data.senderAlias,
          timestamp: data.timestamp,
          isCode: data.isCode,
          read: useStore.getState().chatOpen,
        });

        if (!useStore.getState().chatOpen) {
          playMessageChime();
          showDesktopNotification(`New message from ${data.senderAlias}`, data.text);
        }
      });

      // 4. Clipboard Sync
      clipboardListener = await LocalServer.addListener('clipboardSync', (data) => {
        console.log('[useIncomingTransfers] Native clipboard sync received:', data.id);
        const isOwn = data.senderFingerprint === myFingerprint;
        if (isOwn) return;

        addClipboardEntry({
          id: data.id,
          content: data.content,
          senderId: data.senderFingerprint,
          senderName: data.senderAlias,
          source: 'remote',
          timestamp: data.timestamp,
          isCode: false,
        });

        try {
          navigator.clipboard.writeText(data.content);
        } catch {}

        playMessageChime();
        showDesktopNotification('Clipboard Synced', `Received clipboard from ${data.senderAlias}`);
      });
    })();

    return () => {
      requestListener?.remove();
      completeListener?.remove();
      chatListener?.remove();
      clipboardListener?.remove();
    };
  }, [addTransfer, addChatMessage, addClipboardEntry, myFingerprint]);

  // ── Accept handler ─────────────────────────────────────────
  const accept = useCallback(
    async (sessionId: string) => {
      if (!Capacitor.isNativePlatform()) {
        setPendingRequest(null);
        return;
      }

      try {
        const token = generateSessionToken();
        await LocalServer.respondToTransfer({
          sessionId,
          accepted: true,
          sessionToken: token,
        });

        // Update all transfers for this session to 'transferring'
        if (pendingRequest) {
          for (const file of pendingRequest.files) {
            updateTransfer(file.id, {
              status: 'transferring',
              startedAt: Date.now(),
            });
          }
        }

        console.log('[useIncomingTransfers] Accepted:', sessionId);
      } catch (err) {
        console.error('[useIncomingTransfers] Failed to accept:', err);
      }

      setPendingRequest(null);
    },
    [pendingRequest, updateTransfer]
  );

  // ── Decline handler ────────────────────────────────────────
  const decline = useCallback(
    async (sessionId: string) => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalServer.respondToTransfer({
            sessionId,
            accepted: false,
            reason: 'User declined',
          });
        } catch (err) {
          console.error('[useIncomingTransfers] Failed to decline:', err);
        }
      }

      // Mark all transfers for this session as cancelled
      if (pendingRequest) {
        for (const file of pendingRequest.files) {
          updateTransfer(file.id, { status: 'cancelled' });
        }
      }

      setPendingRequest(null);
    },
    [pendingRequest, updateTransfer]
  );

  return {
    pendingRequest,
    accept,
    decline,
  };
}
