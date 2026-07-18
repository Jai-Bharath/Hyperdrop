import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTransfer } from '../../hooks/useTransfer';
import { getSharedSocket, getDeviceFriendlyName } from '../../hooks/useSocket';
import { sendChatMessage as httpSendChat } from '../../hooks/useLocalTransport';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import ChatHeader from '../../components/v2/ChatHeader';
import ChatBubble from '../../components/v2/ChatBubble';
import ComposerBar from '../../components/v2/ComposerBar';
import EmptyState from '../../components/v2/EmptyState';
import { LOCAL_HTTP_PORT } from '../../shared/protocol';
import { UploadCloud } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

export default function ChatScreen() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const devices = useStore((s) => s.devices);
  const conversations = useStore((s) => s.conversations);
  const activeTransferId = useStore((s) => s.activeTransferId);
  const transfers = useStore((s) => s.transfers);
  
  const { sendFiles, cancelTransfer, retryTransfer } = useTransfer();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);

  // Find target device
  const device = devices.find((d) => d.id === deviceId);

  // Fallback if device isn't fully discovered yet
  const dummyDevice = {
    id: deviceId || '',
    name: deviceId ? `Device (${deviceId.slice(-4)})` : 'Unknown Device',
    ip: '',
    port: LOCAL_HTTP_PORT,
    platform: 'mobile',
    supports5GHz: true,
    lastSeen: Date.now(),
    source: 'http' as const,
  };

  const activeDevice = device || dummyDevice;
  const isOnline = device ? (Date.now() - device.lastSeen < 30000) : false;

  // Active transfer speed & protocol tracking for header
  const activeTransfer = transfers.find(
    (t) => t.id === activeTransferId && t.targetDeviceId === deviceId && t.status === 'transferring'
  );
  const activeSpeed = activeTransfer?.speed || 0;
  const activeProtocol = activeTransfer?.protocol;

  const messages = conversations[activeDevice.id] || [];

  // Mark all messages as read when active chat is open
  useEffect(() => {
    useStore.getState().setChatOpen(true);
    
    // Mark unread messages as read
    messages.forEach((msg) => {
      if (!msg.read && msg.senderId !== 'self') {
        useStore.getState().markMessageRead(msg.id, activeDevice.id);
      }
    });

    return () => {
      useStore.getState().setChatOpen(false);
    };
  }, [messages.length, activeDevice.id]);

  // Auto-scroll to bottom
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('smooth');
  }, [messages.length, isTyping]);

  // Initial instant scroll on load
  useEffect(() => {
    scrollToBottom('auto');
  }, []);

  // Text message handler
  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;

    const myFingerprint = localStorage.getItem('hyperdrop-fingerprint') || 'self';
    const myFriendlyName = useStore.getState().customDeviceName || getDeviceFriendlyName();

    const msg: ChatMessageData = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      text,
      senderId: 'self',
      senderName: 'Me',
      timestamp: Date.now(),
      isCode: false,
      read: true,
      type: 'text',
    };

    // Add locally to store
    useStore.getState().addChatMessage(msg, activeDevice.id);

    // 1. Send via Socket.IO if peer is socket-discovered
    const socket = getSharedSocket();
    if (socket && activeDevice.source === 'socket') {
      socket.emit('chat:message', {
        id: msg.id,
        text,
        senderId: myFingerprint,
        senderName: myFriendlyName,
        timestamp: msg.timestamp,
        isCode: msg.isCode,
        targetId: activeDevice.id, // specify recipient
      });
    }

    // 2. Send via HTTP if peer is LAN-discovered
    if (activeDevice.ip) {
      httpSendChat(activeDevice.ip, activeDevice.port || LOCAL_HTTP_PORT, text, msg.isCode).catch((err) => {
        console.warn('[Chat] Failed to send chat message via HTTP:', err);
      });
    }
  }, [activeDevice]);

  // File sending handler
  const handleSendFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    sendFiles(files, activeDevice);
  }, [activeDevice, sendFiles]);

  // Typing event handler
  const handleTyping = useCallback((typing: boolean) => {
    const socket = getSharedSocket();
    if (socket && activeDevice.source === 'socket') {
      socket.emit('chat:typing', {
        senderId: localStorage.getItem('hyperdrop-device-id'),
        typing,
      });
    }
  }, [activeDevice]);

  // Drag and drop setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      handleSendFiles(acceptedFiles);
    }
  }, [handleSendFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
  });

  // Clear chat handler
  const handleClearChat = useCallback(() => {
    if (confirm(`Clear all chat history with ${activeDevice.name}?`)) {
      useStore.getState().clearChat(activeDevice.id);
    }
  }, [activeDevice]);

  return (
    <div
      {...getRootProps()}
      className={`flex flex-col h-full relative select-none ${
        isDesktop ? '' : 'max-w-xl mx-auto h-[calc(100dvh-1rem)] px-2 pt-2'
      }`}
    >
      <input {...getInputProps()} />

      {/* ─── Drag & Drop Overlay ───────────────────────────── */}
      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-brand-500/8 border-2 border-dashed border-brand-500/40 rounded-[28px] z-50 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex flex-col items-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/15 border border-brand-500/30 text-brand-500 mb-4">
                <UploadCloud className="h-8 w-8" />
              </div>
              <h3 className="text-sm font-bold text-text-primary">Drop files here to send</h3>
              <p className="text-[11px] text-text-muted mt-1">Directly to {activeDevice.name}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Chat Header ───────────────────────────────────── */}
      <ChatHeader
        device={activeDevice}
        isOnline={isOnline}
        activeTransferSpeed={activeSpeed}
        activeTransferProtocol={activeProtocol}
        onBack={() => navigate('/')}
        showBackButton={!isDesktop}
        onClearChat={handleClearChat}
      />

      {/* ─── Chat Messages ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 min-h-0 flex flex-col">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center">
            <EmptyState type="chat" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-end">
            <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.senderId === 'self'}
                  onCancelTransfer={cancelTransfer}
                  onRetryTransfer={retryTransfer}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
        
        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start mb-2 pl-2">
            <div className="bg-surface-light border border-border rounded-2xl px-3 py-2 flex items-center gap-1.5 shadow-sm text-text-secondary text-xs">
              <span>typing</span>
              <span className="flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-text-muted animate-bounce typing-dot-1" />
                <span className="h-1 w-1 rounded-full bg-text-muted animate-bounce typing-dot-2" />
                <span className="h-1 w-1 rounded-full bg-text-muted animate-bounce typing-dot-3" />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Composer ──────────────────────────────────────── */}
      <ComposerBar
        onSendMessage={handleSendMessage}
        onSendFiles={handleSendFiles}
        onTyping={handleTyping}
      />
    </div>
  );
}
