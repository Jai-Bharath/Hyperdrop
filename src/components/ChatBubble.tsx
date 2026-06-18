import { memo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, CheckCheck, Copy, ExternalLink } from 'lucide-react';

export interface ChatMessageData {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  isCode: boolean;
  read: boolean;
}

interface ChatBubbleProps {
  message: ChatMessageData;
  isOwn: boolean;
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

function linkify(text: string): (string | JSX.Element)[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      // Reset lastIndex for the regex
      urlRegex.lastIndex = 0;
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          className="text-brand-400 hover:text-brand-300 underline underline-offset-2 inline-flex items-center gap-0.5">
          {part.length > 40 ? part.slice(0, 37) + '...' : part}
          <ExternalLink className="h-3 w-3 inline" />
        </a>
      );
    }
    return part;
  });
}

export default memo(function ChatBubble({ message, isOwn }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isCode = message.isCode || detectCode(message.text);

  const handleCopy = async () => {
    try {
      let textToCopy = message.text;
      // Strip markdown code fences
      textToCopy = textToCopy.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const renderContent = () => {
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
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}
    >
      <div className={`max-w-[85%] sm:max-w-[75%] ${
        isOwn
          ? 'bg-gradient-to-br from-brand-600/80 to-brand-500/60 border border-brand-400/20 rounded-2xl rounded-br-md'
          : 'bg-white/[0.06] border border-white/[0.08] rounded-2xl rounded-bl-md'
      } px-3.5 py-2.5 shadow-lg`}>
        {!isOwn && (
          <p className="text-[10px] font-bold text-brand-400/70 mb-1">{message.senderName}</p>
        )}
        {renderContent()}
        <div className={`flex items-center gap-1.5 mt-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-[9px] text-white/30">{formatTime(message.timestamp)}</span>
          {isOwn && (
            message.read
              ? <CheckCheck className="h-3 w-3 text-brand-300" />
              : <Check className="h-3 w-3 text-white/30" />
          )}
        </div>
      </div>
    </motion.div>
  );
});
