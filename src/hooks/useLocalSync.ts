import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { pollChatMessages, pollClipboard } from './useLocalTransport';
import { playMessageChime } from '../utils/audio';
import { showDesktopNotification } from '../utils/notification';
import { LOCAL_HTTP_PORT } from '../shared/protocol';

export function useLocalSync() {
  const devices = useStore((s) => s.devices);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const addClipboardEntry = useStore((s) => s.addClipboardEntry);

  // Keep track of the last processed timestamps for each peer IP
  const lastChatTimes = useRef<Map<string, number>>(new Map());
  const lastClipboardTimes = useRef<Map<string, number>>(new Map());

  // Local device signature to distinguish self from peer
  const myFingerprint = localStorage.getItem('hyperdrop-fingerprint') || 'unknown';

  useEffect(() => {
    // If no devices discovered on LAN, do nothing
    if (devices.length === 0) return;

    const intervalId = setInterval(async () => {
      for (const device of devices) {
        if (!device.ip) continue;

        const peerIp = device.ip;
        const peerPort = device.port || LOCAL_HTTP_PORT;
        const cacheKey = `${peerIp}:${peerPort}`;

        // Initialize timestamps if not tracked
        if (!lastChatTimes.current.has(cacheKey)) {
          lastChatTimes.current.set(cacheKey, Date.now() - 5000); // Poll last 5s on discovery
        }
        if (!lastClipboardTimes.current.has(cacheKey)) {
          lastClipboardTimes.current.set(cacheKey, Date.now() - 5000);
        }

        const sinceChat = lastChatTimes.current.get(cacheKey) || 0;
        const sinceClip = lastClipboardTimes.current.get(cacheKey) || 0;

        // 1. Poll Chat Messages
        try {
          const chatResponse = await pollChatMessages(peerIp, peerPort, sinceChat);
          if (chatResponse && chatResponse.messages && chatResponse.messages.length > 0) {
            let maxTime = sinceChat;
            for (const msg of chatResponse.messages) {
              maxTime = Math.max(maxTime, msg.timestamp);

              // Skip messages originating from ourselves
              if (msg.senderFingerprint === myFingerprint) continue;

              const storeMsg = {
                id: msg.id || `msg-${msg.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
                text: msg.text,
                senderId: msg.senderFingerprint,
                senderName: msg.senderAlias,
                timestamp: msg.timestamp,
                isCode: msg.isCode || false,
                read: useStore.getState().chatOpen,
              };

              addChatMessage(storeMsg);

              // Notify user if chat window is closed
              if (!useStore.getState().chatOpen) {
                playMessageChime();
                showDesktopNotification(`New message from ${msg.senderAlias}`, msg.text);
              }
            }
            lastChatTimes.current.set(cacheKey, maxTime);
          } else if (chatResponse && chatResponse.serverTime) {
            lastChatTimes.current.set(cacheKey, chatResponse.serverTime);
          }
        } catch (err) {
          // Peer offline/unreachable — ignore, will retry next tick
        }

        // 2. Poll Clipboard Syncs
        try {
          const clipResponse = await pollClipboard(peerIp, peerPort, sinceClip);
          if (clipResponse && clipResponse.entries && clipResponse.entries.length > 0) {
            let maxTime = sinceClip;
            for (const item of clipResponse.entries) {
              maxTime = Math.max(maxTime, item.timestamp);

              // Skip clipboard copies originating from ourselves
              if (item.senderFingerprint === myFingerprint) continue;

              // Register in store
              addClipboardEntry({
                id: item.id,
                content: item.content,
                senderId: item.senderFingerprint,
                senderName: item.senderAlias,
                source: 'remote',
                timestamp: item.timestamp,
                isCode: false,
              });

              // Copy to browser OS clipboard directly
              try {
                await navigator.clipboard.writeText(item.content);
              } catch {
                // Clipboard write requires user activation context in some browsers, ignore
              }

              playMessageChime(); // Play pop sound
              showDesktopNotification('Clipboard Synced', `Received clipboard from ${item.senderAlias}`);
            }
            lastClipboardTimes.current.set(cacheKey, maxTime);
          } else if (clipResponse && clipResponse.serverTime) {
            lastClipboardTimes.current.set(cacheKey, clipResponse.serverTime);
          }
        } catch (err) {
          // Ignore polling errors
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(intervalId);
  }, [devices, addChatMessage, addClipboardEntry, myFingerprint]);
}
