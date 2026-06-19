import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  CheckCircle2,
  XCircle,
  FileDown,
  Inbox,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useTransfer, triggerFileDownload } from '../hooks/useTransfer';
import { useStore } from '../store/useStore';
import { formatBytes } from '../utils/formatBytes';
import TransferCard from '../components/TransferCard';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function ReceivePage() {
  const { transfers, acceptTransfer, rejectTransfer, cancelTransfer, removeTransfer, retryTransfer } = useTransfer();
  const connected = useStore((s) => s.connected);
  const devices = useStore((s) => s.devices);

  const incoming = transfers.filter(
    (t) => t.direction === 'receive' && t.status === 'pending',
  );
  const currentTransfers = transfers.filter(
    (t) =>
      t.direction === 'receive' &&
      (t.status === 'transferring' ||
        t.status === 'verifying'),
  );
  const erroredTransfers = transfers.filter(
    (t) =>
      t.direction === 'receive' &&
      (t.status === 'cancelled' || t.status === 'error'),
  );
  const completed = transfers.filter(
    (t) => t.direction === 'receive' && t.status === 'done',
  );

  const hasAnything = incoming.length > 0 || currentTransfers.length > 0 || erroredTransfers.length > 0 || completed.length > 0;

  // Auto-cleanup: remove completed transfers older than 1 hour
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;
      transfers
        .filter((t) => t.direction === 'receive' && (t.status === 'done' || t.status === 'error' || t.status === 'cancelled'))
        .filter((t) => now - t.startedAt > ONE_HOUR)
        .forEach((t) => removeTransfer(t.id));
    }, 60000);

    return () => clearInterval(cleanup);
  }, [transfers, removeTransfer]);

  const clearAllCompleted = () => {
    completed.forEach((t) => removeTransfer(t.id));
  };

  const clearAllErrored = () => {
    erroredTransfers.forEach((t) => removeTransfer(t.id));
  };

  return (
    <motion.div
      className="mx-auto max-w-2xl space-y-6"
      initial="initial"
      animate="animate"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-slate-100">Receive Files</h1>
        <p className="mt-1 text-sm text-slate-500">
          Incoming transfers will appear here
        </p>
      </motion.div>

      {/* ─── Connection Status ───────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 border transition-all ${
          connected && devices.length > 0
            ? 'bg-emerald-500/[0.04] border-emerald-500/10'
            : connected
            ? 'bg-amber-500/[0.04] border-amber-500/10'
            : 'bg-red-500/[0.04] border-red-500/10'
        }`}
      >
        <Wifi className={`h-4 w-4 ${
          connected && devices.length > 0 ? 'text-emerald-400' : connected ? 'text-amber-400' : 'text-red-400'
        }`} />
        <p className="text-[11px] text-slate-400">
          {connected && devices.length > 0
            ? `Connected · ${devices.length} device${devices.length !== 1 ? 's' : ''} nearby`
            : connected
            ? 'Connected · Waiting for devices to appear'
            : 'Disconnected · Check your connection'}
        </p>
      </motion.div>

      {/* ─── Waiting State ─────────────────────────────────── */}
      {!hasAnything && (
        <motion.div
          id="receive-waiting"
          className="card flex flex-col items-center gap-4 py-16"
          variants={fadeUp}
        >
          <div className="relative">
            <Download className="h-16 w-16 text-slate-600 animate-float" />
            <span className="absolute -right-1 -top-1 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-40" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-brand-500" />
            </span>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">
              Waiting for incoming files…
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Other devices can send files to you
            </p>
          </div>
        </motion.div>
      )}

      {/* ─── Incoming Requests ─────────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {incoming.map((transfer) => (
          <motion.article
            key={transfer.id}
            id={`incoming-${transfer.id}`}
            className="card space-y-4"
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                <FileDown className="h-5 w-5 text-brand-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-200">
                  {transfer.fileName}
                </p>
                <p className="text-xs text-slate-500">
                  {formatBytes(transfer.fileSize)}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
              <button
                id={`accept-${transfer.id}`}
                type="button"
                onClick={() => acceptTransfer(transfer.id)}
                className="btn-primary flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                Accept
              </button>
              <button
                id={`reject-${transfer.id}`}
                type="button"
                onClick={() => rejectTransfer(transfer.id)}
                className="btn-ghost flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 border border-border hover:border-red-500/40 hover:text-red-400"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </button>
            </div>
          </motion.article>
        ))}
      </AnimatePresence>

      {/* ─── Current Transfers (Active) ────────────────────── */}
      <AnimatePresence>
        {currentTransfers.map((transfer) => (
          <TransferCard key={transfer.id} transfer={transfer} onCancel={cancelTransfer} onDismiss={(id) => removeTransfer(id)} onRetry={retryTransfer} />
        ))}
      </AnimatePresence>

      {/* ─── Errored / Cancelled Transfers ─────────────────── */}
      {erroredTransfers.length > 0 && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Failed Transfers
            </h2>
            <button
              onClick={clearAllErrored}
              className="flex items-center gap-1 text-[9px] font-bold text-slate-600 hover:text-red-400 transition-colors uppercase tracking-wider"
            >
              <Trash2 className="h-3 w-3" />
              Clear All
            </button>
          </div>
          <AnimatePresence>
            {erroredTransfers.map((transfer) => (
              <TransferCard key={transfer.id} transfer={transfer} onCancel={cancelTransfer} onDismiss={(id) => removeTransfer(id)} onRetry={retryTransfer} />
            ))}
          </AnimatePresence>
        </motion.section>
      )}

      {/* ─── Received Files ────────────────────────────────── */}
      {completed.length > 0 && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Received Files
            </h2>
            <button
              onClick={clearAllCompleted}
              className="flex items-center gap-1 text-[9px] font-bold text-slate-600 hover:text-red-400 transition-colors uppercase tracking-wider"
            >
              <Trash2 className="h-3 w-3" />
              Clear All
            </button>
          </div>
          <ul className="space-y-2.5">
            <AnimatePresence mode="popLayout">
              {completed.map((transfer) => (
                <motion.li
                  key={transfer.id}
                  id={`received-${transfer.id}`}
                  className="flex items-center gap-3.5 rounded-2xl bg-white/[0.02] border border-white/5 px-4.5 py-3.5 backdrop-blur-md shadow-lg transition-all duration-300 hover:border-brand-500/20 hover:bg-brand-500/[0.02] cursor-pointer"
                  onClick={() => triggerFileDownload(transfer.fileName, transfer.id)}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                >
                  <Inbox className="h-5 w-5 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {transfer.fileName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(transfer.fileSize)} • Tap to download
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <button
                      type="button"
                      className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                      title="Dismiss"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removeTransfer(transfer.id);
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}
