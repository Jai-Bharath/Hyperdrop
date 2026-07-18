import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, CheckCheck, Copy, ExternalLink, File, FileText, Image as ImageIcon,
  Video as VideoIcon, Music, Folder, ArrowDown, Play, Pause, X, AlertCircle,
  CheckCircle2, ChevronDown, ChevronRight, Download
} from 'lucide-react';
import { formatBytes } from '../../utils/formatBytes';
import ProgressRing from './ProgressRing';
import { triggerFileDownload } from '../../hooks/useTransfer';

export interface ChatMessageData {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  isCode: boolean;
  read: boolean;
  type?: 'text' | 'file' | 'transfer' | 'folder';
  fileMeta?: {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    relativePath?: string;
    blobUrl?: string;
  };
  transferState?: {
    status: 'pending' | 'transferring' | 'verifying' | 'done' | 'error' | 'cancelled';
    progress: number;
    transferred: number;
    speed: number;
    error?: string;
  };
}

interface ChatBubbleProps {
  message: ChatMessageData;
  isOwn: boolean;
  onCancelTransfer?: (id: string) => void;
  onRetryTransfer?: (id: string) => void;
}

function detectCode(text: string): boolean {
  if (text.includes('```')) return true;
  const codePatterns = [
    /^(import |from |export |const |let |var |function |class |def |return |if \(|for \()/m,
    /[{}();]\s*$/m,
    /=>|->|::|\$\{/,
    /^\s{2,}(\.|#|@)/m,
  ];
  return codePatterns.some(p => p.test(text));
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getFileIcon(mimeType: string, isFolder = false) {
  if (isFolder) return <Folder className="h-6 w-6 text-amber-400" />;
  const lower = (mimeType || '').toLowerCase();
  if (lower.startsWith('image/')) return <ImageIcon className="h-6 w-6 text-sky-400" />;
  if (lower.startsWith('video/')) return <VideoIcon className="h-6 w-6 text-purple-400" />;
  if (lower.startsWith('audio/')) return <Music className="h-6 w-6 text-emerald-400" />;
  if (lower.includes('pdf') || lower.includes('text') || lower.includes('document'))
    return <FileText className="h-6 w-6 text-orange-400" />;
  return <File className="h-6 w-6 text-slate-400" />;
}

function linkify(text: string): (string | JSX.Element)[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0;
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="text-brand-300 hover:text-brand-200 underline underline-offset-2 inline-flex items-center gap-0.5 font-semibold">
          {part.length > 40 ? part.slice(0, 37) + '...' : part}
          <ExternalLink className="h-3 w-3 inline" />
        </a>
      );
    }
    return part;
  });
}

export default memo(function ChatBubble({
  message,
  isOwn,
  onCancelTransfer,
  onRetryTransfer,
}: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [folderExpanded, setFolderExpanded] = useState(false);

  const isCode = message.isCode || (message.type === 'text' && detectCode(message.text));
  const msgType = message.type || 'text';

  const handleCopy = async () => {
    try {
      let textToCopy = message.text;
      textToCopy = textToCopy.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const isImageOrVideo = (mime?: string) => {
    if (!mime) return false;
    return mime.startsWith('image/') || mime.startsWith('video/');
  };

  const renderContent = () => {
    // 1. Text Message
    if (msgType === 'text') {
      if (isCode) {
        const cleanCode = message.text.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
        return (
          <div className="relative group/code">
            <pre className="text-[12px] leading-relaxed font-mono overflow-x-auto p-3 rounded-xl bg-black/40 border border-white/5 text-emerald-300 whitespace-pre-wrap break-all">
              <code>{cleanCode}</code>
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 border border-white/10 opacity-0 group-hover/code:opacity-100 transition-all hover:bg-white/10"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
            </button>
          </div>
        );
      }
      return <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{linkify(message.text)}</p>;
    }

    // 2. File Attachment (Preview or Details)
    if (msgType === 'file' || msgType === 'folder') {
      const file = message.fileMeta;
      if (!file) return null;

      const isImgVideo = isImageOrVideo(file.mimeType);
      const isVideoFile = file.mimeType.startsWith('video/');

      return (
        <div className="space-y-2">
          {/* File item preview card */}
          <div className="flex items-center gap-3.5 bg-black/10 border border-white/5 p-3 rounded-xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 border border-white/10">
              {getFileIcon(file.mimeType, msgType === 'folder')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{file.name}</p>
              <p className="text-[10px] text-text-secondary">{formatBytes(file.size)}</p>
            </div>
            
            {/* Inline Download or Action */}
            {file.blobUrl ? (
              <button
                type="button"
                onClick={() => triggerFileDownload(file.name, message.id)}
                className="p-2 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-500 hover:bg-brand-500/20 transition-all"
                title="Download / Save"
              >
                <Download className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Expandable folder listing */}
          {msgType === 'folder' && file.relativePath && (
            <div className="mt-1">
              <button
                onClick={() => setFolderExpanded(!folderExpanded)}
                className="flex items-center gap-1 text-[11px] font-bold text-brand-500 hover:underline uppercase tracking-wide"
              >
                {folderExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {folderExpanded ? 'Hide folder structure' : 'Show folder structure'}
              </button>
              <AnimatePresence>
                {folderExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-black/15 p-2 rounded-xl mt-1.5 space-y-1 font-mono text-[10px]"
                  >
                    <p className="text-text-secondary truncate">📂 {file.name}/</p>
                    <p className="text-text-muted pl-4 truncate">└─ {file.relativePath}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Media Inline Preview */}
          {isImgVideo && file.blobUrl && (
            <div className="relative overflow-hidden rounded-xl border border-white/5 max-h-56 bg-black/20 flex items-center justify-center group">
              {isVideoFile ? (
                <>
                  <video src={file.blobUrl} className="w-full h-full object-cover" controls />
                  <div className="absolute inset-0 bg-black/30 pointer-events-none group-hover:opacity-0 transition-opacity flex items-center justify-center">
                    <Play className="h-10 w-10 text-white opacity-80" />
                  </div>
                </>
              ) : (
                <img src={file.blobUrl} alt={file.name} className="w-full h-full object-cover" />
              )}
            </div>
          )}
        </div>
      );
    }

    // 3. Live Active Transfer Bubble
    if (msgType === 'transfer') {
      const state = message.transferState;
      const file = message.fileMeta;
      if (!state || !file) return null;

      const progress = state.progress;
      const status = state.status;

      return (
        <div className="flex items-center gap-4 py-1.5">
          <ProgressRing
            progress={progress}
            size={76}
            strokeWidth={6}
            speed={state.speed}
            totalSize={file.size}
            transferredBytes={state.transferred}
          />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">{file.name}</p>
              <span className="shrink-0 text-[10px] text-text-secondary font-mono">{formatBytes(file.size)}</span>
            </div>
            
            <p className="text-xs text-text-secondary flex items-center gap-1.5 capitalize">
              {status === 'transferring' ? (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
                  Transferring...
                </span>
              ) : status === 'verifying' ? (
                <span className="text-amber-500 flex items-center gap-1">
                  Verifying integrity...
                </span>
              ) : status === 'error' ? (
                <span className="text-red-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Failed: {state.error || 'Connection lost'}
                </span>
              ) : status === 'cancelled' ? (
                <span className="text-text-muted flex items-center gap-1">
                  Cancelled
                </span>
              ) : (
                <span className="text-emerald-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Done
                </span>
              )}
            </p>

            {/* Cancel/Retry buttons inside bubble */}
            <div className="flex gap-2 mt-1.5">
              {status === 'transferring' && onCancelTransfer && (
                <button
                  type="button"
                  onClick={() => onCancelTransfer(message.id)}
                  className="flex items-center gap-1 py-1 px-2.5 rounded-lg bg-red-500/10 border border-red-500/10 text-[10px] font-bold text-red-500 hover:bg-red-500/20 active:scale-95 transition-all"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              )}
              {(status === 'error' || status === 'cancelled') && onRetryTransfer && (
                <button
                  type="button"
                  onClick={() => onRetryTransfer(message.id)}
                  className="flex items-center gap-1 py-1 px-2.5 rounded-lg bg-brand-500/15 border border-brand-500/20 text-[10px] font-bold text-brand-500 hover:bg-brand-500/25 active:scale-95 transition-all"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 26 }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2.5`}
    >
      <div className={`max-w-[85%] sm:max-w-[70%] ${
        isOwn
          ? 'bg-gradient-to-br from-brand-600/90 to-brand-500/75 text-white border border-brand-400/25 rounded-[22px] rounded-br-md shadow-[0_4px_16px_rgba(14,165,233,0.15)]'
          : 'bg-surface-light border border-border rounded-[22px] rounded-bl-md text-text-primary shadow-sm'
      } px-4 py-3`}>
        {!isOwn && (
          <p className="text-[10px] font-bold text-brand-500 mb-1">{message.senderName}</p>
        )}
        
        {renderContent()}
        
        <div className={`flex items-center gap-1.5 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[9px] ${isOwn ? 'text-white/60' : 'text-text-muted'}`}>
            {formatTime(message.timestamp)}
          </span>
          {isOwn && (
            message.read ? (
              <CheckCheck className="h-3.5 w-3.5 text-brand-300" />
            ) : (
              <Check className="h-3.5 w-3.5 text-white/50" />
            )
          )}
        </div>
      </div>
    </motion.div>
  );
});
