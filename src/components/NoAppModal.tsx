import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, HardDrive, Globe, QrCode, Copy, Check } from 'lucide-react';
import QRCodeDisplay from './QRCodeDisplay';

interface NoAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverIp: string;
  serverPort: number;
  ftpPort: number;
}

function CopyButton({ text, id }: { text: string; id: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      id={id}
      type="button"
      onClick={copy}
      className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-brand-500/10 hover:text-brand-400 transition-all duration-150"
      aria-label={`Copy ${text}`}
    >
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Check className="h-4 w-4 text-emerald-400" />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Copy className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

const backdrop = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modal = {
  hidden: { opacity: 0, scale: 0.92, y: 24 },
  visible: { opacity: 1, scale: 1, y: 0 },
};

export default function NoAppModal({
  isOpen,
  onClose,
  serverIp,
  serverPort,
  ftpPort,
}: NoAppModalProps) {
  const ftpUrl = `ftp://${serverIp}:${ftpPort}`;
  const httpUrl = `http://${serverIp}:${serverPort}/browse`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="no-app-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            id="no-app-modal"
            className="glass-strong relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl"
            variants={modal}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-100">
                Connect Without the App
              </h2>
              <button
                id="no-app-modal-close"
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors duration-150"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Connection options */}
            <div className="space-y-3">
              {/* FTP */}
              <div
                id="option-ftp"
                className="flex items-center gap-4 rounded-xl bg-surface border border-border p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <HardDrive className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-200">FTP Server</p>
                  <p className="truncate font-mono text-xs text-brand-400">{ftpUrl}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Open in any file manager
                  </p>
                </div>
                <CopyButton text={ftpUrl} id="copy-ftp-url" />
              </div>

              {/* HTTP */}
              <div
                id="option-http"
                className="flex items-center gap-4 rounded-xl bg-surface border border-border p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-200">Web Browser</p>
                  <p className="truncate font-mono text-xs text-brand-400">{httpUrl}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Open in any browser
                  </p>
                </div>
                <CopyButton text={httpUrl} id="copy-http-url" />
              </div>

              {/* QR Code */}
              <div
                id="option-qr"
                className="flex flex-col items-center gap-3 rounded-xl bg-surface border border-border p-5"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <QrCode className="h-4 w-4 text-brand-400" />
                  Scan with Phone
                </div>
                <QRCodeDisplay url={httpUrl} size={180} />
                <p className="text-[11px] text-slate-500 text-center">
                  Scan this QR code to open in browser
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
