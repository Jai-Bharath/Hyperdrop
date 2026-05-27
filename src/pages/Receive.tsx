import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  CheckCircle2,
  XCircle,
  FileDown,
  Inbox,
} from 'lucide-react';
import { useTransfer } from '../hooks/useTransfer';
import { useStore } from '../store/useStore';
import { formatBytes } from '../utils/formatBytes';
import TransferCard from '../components/TransferCard';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function ReceivePage() {
  const { transfers, acceptTransfer, rejectTransfer, cancelTransfer, removeTransfer } = useTransfer();

  const incoming = transfers.filter(
    (t) => t.direction === 'receive' && t.status === 'pending',
  );
  const active = transfers.filter(
    (t) =>
      t.direction === 'receive' &&
      (t.status === 'transferring' || t.status === 'verifying'),
  );
  const completed = transfers.filter(
    (t) => t.direction === 'receive' && t.status === 'done',
  );
  const dismissed = transfers.filter(
    (t) => t.direction === 'receive' && (t.status === 'cancelled' || t.status === 'error'),
  );

  const hasAnything = incoming.length > 0 || active.length > 0 || completed.length > 0 || dismissed.length > 0;

  return (
    <motion.div
      className="mx-auto max-w-lg space-y-6"
      initial="initial"
      animate="animate"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-slate-100">Receive Files</h1>
        <p className="mt-1 text-sm text-slate-500">
          Incoming transfers will appear here
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
      <AnimatePresence>
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

      {/* ─── Active Transfers ──────────────────────────────── */}
      <AnimatePresence>
        {active.map((transfer) => (
          <TransferCard key={transfer.id} transfer={transfer} onCancel={cancelTransfer} onDismiss={(id) => removeTransfer(id)} />
        ))}
      </AnimatePresence>

      {/* ─── Cancelled / Errored Transfers ──────────────── */}
      <AnimatePresence>
        {dismissed.map((transfer) => (
          <TransferCard key={transfer.id} transfer={transfer} onDismiss={(id) => removeTransfer(id)} />
        ))}
      </AnimatePresence>

      {/* ─── Received Files ────────────────────────────────── */}
      {completed.length > 0 && (
        <motion.section variants={fadeUp} className="space-y-3">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            Received Files
          </h2>
          <ul className="space-y-2.5">
            {completed.map((transfer) => (
              <motion.li
                key={transfer.id}
                id={`received-${transfer.id}`}
                className="flex items-center gap-3.5 rounded-2xl bg-white/[0.02] border border-white/5 px-4.5 py-3.5 backdrop-blur-md shadow-lg transition-all duration-300 hover:border-emerald-500/20 hover:bg-emerald-500/[0.01]"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                layout
              >
                <Inbox className="h-5 w-5 shrink-0 text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {transfer.fileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(transfer.fileSize)}
                  </p>
                </div>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              </motion.li>
            ))}
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}
