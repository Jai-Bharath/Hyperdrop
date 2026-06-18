import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageCircle, Clipboard, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import { getSharedSocket, getDeviceId } from '../hooks/useSocket';
import ChatBubble, { type ChatMessageData } from './ChatBubble';
import ClipboardSync from './ClipboardSync';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'clipboard'>('chat');
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chatMessages = useStore((s) => s.chatMessages);
  const peerTyping = useStore((s) => s.peerTyping);
  const devices = useStore((s) => s.devices);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const setUnreadCount = useStore((s) => s.setUnreadCount);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, peerTyping]);

  // Clear unread when opened
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      inputRef.current?.focus();
    }
  }, [isOpen, setUnreadCount]);

  // Detect code in text
  const detectCode = (text: string): boolean => {
    if (text.includes('```')) return true;
    const codePatterns = [
      /^(import |from |export |const |let |var |function |class |def |return )/m,
      /[{}();]\s*$/m,
      /=>|->|::/,
    ];
    return codePatterns.some(p => p.test(text));
  };

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const socket = getSharedSocket();
    const deviceId = getDeviceId();
    if (!socket) return;

    const msg: ChatMessageData = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      senderId: deviceId,
      senderName: 'You',
      timestamp: Date.now(),
      isCode: detectCode(text),
      read: false,
    };

    addChatMessage(msg);
    socket.emit('chat:message', { ...msg, senderName: 'Peer' });
    socket.emit('chat:typing', { senderId: deviceId, typing: false });
    setInput('');

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [input, addChatMessage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Auto-resize textarea
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';

    // Send typing indicator
    const socket = getSharedSocket();
    if (socket) {
      socket.emit('chat:typing', { senderId: getDeviceId(), typing: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('chat:typing', { senderId: getDeviceId(), typing: false });
      }, 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput((prev) => prev + text);
    } catch { /* ignore */ }
  };

  const peerDevice = devices[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[420px] flex flex-col glass-strong border-l border-white/10"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/15 border border-brand-500/20">
                  {activeTab === 'chat' ? (
                    <MessageCircle className="h-5 w-5 text-brand-400" />
                  ) : (
                    <Clipboard className="h-5 w-5 text-purple-400" />
                  )}
                  {devices.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#0a0a10]" />
                  )}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Sync Hub</h2>
                  <p className="text-[10px] text-slate-500">
                    {peerDevice ? `with ${peerDevice.name}` : 'No device connected'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-white/5 transition-colors"
              >
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/[0.06] bg-white/[0.01]">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-2 border-b-2 ${
                  activeTab === 'chat'
                    ? 'text-brand-400 border-brand-500 bg-brand-500/[0.02]'
                    : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/[0.01]'
                }`}
              >
                <MessageCircle className="h-4 w-4" />
                Chat
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('clipboard')}
                className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-2 border-b-2 ${
                  activeTab === 'clipboard'
                    ? 'text-purple-400 border-purple-500 bg-purple-500/[0.02]'
                    : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/[0.01]'
                }`}
              >
                <Clipboard className="h-4 w-4" />
                Clipboard
              </button>
            </div>

            {/* Tab Body */}
            {activeTab === 'chat' ? (
              <>
                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scroll-smooth">
                  {chatMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-8">
                      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-500/10 border border-brand-500/15 mb-4">
                        <Sparkles className="h-8 w-8 text-brand-400/60" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-300 mb-1">Start Chatting</h3>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Send messages, share code snippets, and clipboard content with your paired device instantly.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg) => (
                      <ChatBubble
                        key={msg.id}
                        message={msg}
                        isOwn={msg.senderId === getDeviceId()}
                      />
                    ))
                  )}

                  {/* Typing Indicator */}
                  <AnimatePresence>
                    {peerTyping && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="flex items-center gap-2 px-3.5 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-bl-md w-fit"
                      >
                        <div className="flex gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 typing-dot-1" />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 typing-dot-2" />
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400 typing-dot-3" />
                        </div>
                        <span className="text-[10px] text-slate-500">typing...</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t border-white/[0.06] px-4 py-3">
                  <div className="flex items-end gap-2">
                    <button
                      onClick={handlePasteClipboard}
                      className="flex-shrink-0 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-all"
                      title="Paste from clipboard"
                    >
                      <Clipboard className="h-4 w-4 text-slate-400" />
                    </button>
                    <div className="flex-1 relative">
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        rows={1}
                        className="w-full resize-none bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[13px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500/30 focus:ring-1 focus:ring-brand-500/10 transition-all font-sans"
                        style={{ maxHeight: '120px' }}
                      />
                    </div>
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim()}
                      className={`flex-shrink-0 p-2.5 rounded-xl transition-all ${
                        input.trim()
                          ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 active:scale-95'
                          : 'bg-white/[0.04] text-slate-600 cursor-not-allowed'
                      }`}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-600 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
                </div>
              </>
            ) : (
              <ClipboardSync isSidebar />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
