import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clipboard, Check, Copy, Trash2, Monitor, Smartphone, ArrowRight, ToggleLeft, ToggleRight, AlertTriangle, Type } from 'lucide-react';
import { useStore } from '../store/useStore';
import { syncClipboard as httpSyncClipboard } from '../hooks/useLocalTransport';
import { LOCAL_HTTP_PORT } from '../shared/protocol';

export interface ClipboardEntryData {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  source: 'local' | 'remote';
  timestamp: number;
  isCode: boolean;
}

function detectCode(text: string): boolean {
  if (text.includes('```')) return true;
  const codePatterns = [
    /^(import |from |export |const |let |var |function |class |def |return )/m,
    /[{}();]\s*$/m, /=>|->|::/,
  ];
  return codePatterns.some(p => p.test(text));
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Check if the Clipboard API is likely available */
function isClipboardAvailable(): boolean {
  return !!(navigator.clipboard && typeof navigator.clipboard.readText === 'function');
}

export default function ClipboardSync({ isSidebar = false }: { isSidebar?: boolean }) {
  const clipboardHistory = useStore((s) => s.clipboardHistory);
  const clipboardSyncEnabled = useStore((s) => s.clipboardSyncEnabled);
  const setClipboardSyncEnabled = useStore((s) => s.setClipboardSyncEnabled);
  const addClipboardEntry = useStore((s) => s.addClipboardEntry);
  const clearClipboard = useStore((s) => s.clearClipboard);
  const devices = useStore((s) => s.devices);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualText, setManualText] = useState('');
  const manualInputRef = useRef<HTMLTextAreaElement>(null);

  const sendClipboardContent = useCallback((text: string) => {
    if (!text.trim()) return;

    const myFingerprint = localStorage.getItem('hyperdrop-fingerprint') || 'unknown';

    const entry: ClipboardEntryData = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: text,
      senderId: myFingerprint,
      senderName: 'You',
      source: 'local',
      timestamp: Date.now(),
      isCode: detectCode(text),
    };

    addClipboardEntry(entry);

    // Send to all connected peer devices via HTTP
    for (const device of devices) {
      httpSyncClipboard(device.ip, device.port || LOCAL_HTTP_PORT, text, 'text').catch((err) => {
        console.warn('[ClipboardSync] Failed to sync to', device.name, err);
      });
    }

    setClipboardError(null);
  }, [addClipboardEntry, devices]);

  const handleSendClipboard = useCallback(async () => {
    try {
      if (!isClipboardAvailable()) {
        // Clipboard API not available — show manual input
        setClipboardError('Clipboard access requires HTTPS. Use the text box below to send manually.');
        setShowManualInput(true);
        setTimeout(() => manualInputRef.current?.focus(), 100);
        return;
      }

      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setClipboardError('Clipboard is empty');
        setTimeout(() => setClipboardError(null), 3000);
        return;
      }

      sendClipboardContent(text);
    } catch (err: any) {
      console.warn('[ClipboardSync] Clipboard read failed:', err);
      setClipboardError('Clipboard access denied. Use the text box below to type/paste and send.');
      setShowManualInput(true);
      setTimeout(() => manualInputRef.current?.focus(), 100);
    }
  }, [sendClipboardContent]);

  const handleManualSend = useCallback(() => {
    if (!manualText.trim()) return;
    sendClipboardContent(manualText.trim());
    setManualText('');
    setShowManualInput(false);
    setClipboardError(null);
  }, [manualText, sendClipboardContent]);

  const handleCopyItem = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  return (
    <motion.div
      variants={{ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }}
      className={isSidebar ? "flex flex-col flex-1 h-full overflow-hidden" : "rounded-2xl bg-white/[0.02] border border-white/[0.05] overflow-hidden"}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/15">
            <Clipboard className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-[12px] font-bold text-white">Clipboard Sync</h3>
            <p className="text-[9px] text-slate-600">Share text between devices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {clipboardHistory.length > 0 && (
            <button onClick={clearClipboard} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors" title="Clear history">
              <Trash2 className="h-3.5 w-3.5 text-slate-500" />
            </button>
          )}
          <button
            onClick={() => setClipboardSyncEnabled(!clipboardSyncEnabled)}
            className="transition-colors"
            title={clipboardSyncEnabled ? 'Disable auto-sync' : 'Enable auto-sync'}
          >
            {clipboardSyncEnabled
              ? <ToggleRight className="h-6 w-6 text-brand-400" />
              : <ToggleLeft className="h-6 w-6 text-slate-500" />
            }
          </button>
        </div>
      </div>

      {/* Manual Send Button */}
      <div className="px-4 py-2.5 border-b border-white/[0.04]">
        <button
          onClick={handleSendClipboard}
          disabled={devices.length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-purple-600/20 to-brand-600/20 border border-purple-500/15 hover:border-purple-400/30 text-[11px] font-bold text-purple-300 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Clipboard className="h-3.5 w-3.5" />
          Send Current Clipboard
          <ArrowRight className="h-3.5 w-3.5" />
        </button>

        {/* Error Message */}
        <AnimatePresence>
          {clipboardError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/15 px-3 py-2"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-300/80 leading-relaxed">{clipboardError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual Text Input Fallback */}
        <AnimatePresence>
          {showManualInput && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Type className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-[10px] text-slate-400 font-semibold">Type or paste text to send:</span>
              </div>
              <textarea
                ref={manualInputRef}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleManualSend();
                  }
                }}
                placeholder="Paste or type text here..."
                rows={2}
                className="w-full resize-none bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500/30 focus:ring-1 focus:ring-purple-500/10 transition-all font-sans"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleManualSend}
                  disabled={!manualText.trim()}
                  className="flex-1 py-2 rounded-xl bg-purple-600/30 border border-purple-500/20 text-[10px] font-bold text-purple-300 hover:bg-purple-600/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Send Text
                </button>
                <button
                  onClick={() => { setShowManualInput(false); setClipboardError(null); }}
                  className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[10px] font-bold text-slate-400 hover:bg-white/[0.08] transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* History */}
      <div className={isSidebar ? "flex-1 overflow-y-auto" : "max-h-[240px] overflow-y-auto"}>
        {clipboardHistory.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[10px] text-slate-600">No clipboard items yet</p>
            <p className="text-[9px] text-slate-700 mt-1">Copy text on one device, it appears here instantly</p>
          </div>
        ) : (
          <AnimatePresence>
            {clipboardHistory.slice(0, 20).map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-start gap-3 px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {entry.source === 'local'
                    ? <Monitor className="h-3.5 w-3.5 text-brand-400" />
                    : <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <pre className={`text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap max-h-[60px] overflow-hidden ${
                    entry.isCode ? 'font-mono text-emerald-300/80' : ''
                  }`}>
                    {entry.content.slice(0, 200)}
                  </pre>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[8px] font-bold uppercase tracking-wider ${
                      entry.source === 'local' ? 'text-brand-400/60' : 'text-emerald-400/60'
                    }`}>
                      {entry.source === 'local' ? 'Sent' : `From ${entry.senderName}`}
                    </span>
                    <span className="text-[8px] text-slate-700">·</span>
                    <span className="text-[8px] text-slate-600">{formatTime(entry.timestamp)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleCopyItem(entry.content, entry.id)}
                  className="flex-shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/5 transition-all"
                >
                  {copiedId === entry.id
                    ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                    : <Copy className="h-3.5 w-3.5 text-slate-400" />
                  }
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
