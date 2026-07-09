import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertCircle, Loader2, Ban, Star, Send, Download, RefreshCw } from 'lucide-react';
import type { Transfer, TransferStatus } from '../store/useStore';
import { formatBytes } from '../utils/formatBytes';
import ProgressRing from './ProgressRing';
import SpeedBadge from './SpeedBadge';
import { submitFeedbackToDiscord } from '../utils/feedback';
import { triggerFileDownload } from '../hooks/useTransfer';

interface TransferCardProps {
  transfer: Transfer;
  onCancel?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onRetry?: (id: string) => void;
}

const STATUS_CONFIG: Record<TransferStatus, { color: string; label: string }> = {
  pending: { color: '#fbbf24', label: 'Pending' },
  transferring: { color: '#6366f1', label: 'Transferring' },
  verifying: { color: '#818cf8', label: 'Verifying' },
  done: { color: '#34d399', label: 'Complete' },
  error: { color: '#f87171', label: 'Failed' },
  cancelled: { color: '#94a3b8', label: 'Cancelled' },
};

function StatusIcon({ status }: { status: TransferStatus }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-red-400" />;
    case 'cancelled':
      return <Ban className="h-4 w-4 text-slate-400" />;
    default:
      return <Loader2 className="h-4 w-4 text-brand-400 animate-spin" />;
  }
}

function formatTimeRemaining(transfer: Transfer): string {
  if (transfer.speed <= 0 || transfer.status !== 'transferring') return '—';
  const remaining = transfer.fileSize - transfer.transferred;
  const seconds = Math.ceil(remaining / transfer.speed);
  if (seconds < 60) return `${seconds}s left`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s left`;
}

export default function TransferCard({ transfer, onCancel, onDismiss, onRetry }: TransferCardProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const progress =
    transfer.fileSize > 0
      ? (transfer.transferred / transfer.fileSize) * 100
      : 0;

  const cfg = STATUS_CONFIG[transfer.status];

  const handleSubmitFeedback = async () => {
    if (rating === 0) return;
    setLoading(true);
    try {
      await submitFeedbackToDiscord({
        rating,
        comment: comment.trim(),
        fileName: transfer.fileName,
        fileSize: transfer.fileSize,
        speed: transfer.speed || 0,
        protocol: transfer.protocol,
        direction: transfer.direction,
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Feedback submit error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.article
      id={`transfer-card-${transfer.id}`}
      className="card flex flex-col p-5"
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      layout
    >
      {/* Top Details Row */}
      <div className="flex items-center gap-3 sm:gap-5 w-full">
        {/* Progress ring */}
        <ProgressRing progress={progress} size={64} strokeWidth={5} />

        {/* Details */}
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* File name + size */}
          <div className="flex flex-col space-y-0.5">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-slate-100">
                {transfer.fileName}
              </p>
              <span className="shrink-0 text-xs text-slate-500">
                {formatBytes(transfer.fileSize)}
              </span>
            </div>
            {transfer.deviceName && (
              <p className="text-[10px] text-slate-500 font-medium">
                {transfer.direction === 'send' ? 'To' : 'From'}: {transfer.deviceName}
              </p>
            )}
          </div>

          {/* Status row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status dot + label */}
            <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: cfg.color }}>
              <StatusIcon status={transfer.status} />
              {cfg.label}
            </span>

            {/* Speed badge */}
            {(transfer.status === 'transferring' || (transfer.status === 'done' && transfer.speed > 0)) && (
              <SpeedBadge speed={transfer.speed} protocol={transfer.protocol} />
            )}
          </div>

          {/* Time remaining */}
          {transfer.status === 'transferring' && (
            <p className="text-[11px] text-slate-500">
              {formatTimeRemaining(transfer)} · {formatBytes(transfer.transferred)} / {formatBytes(transfer.fileSize)}
            </p>
          )}

          {/* Error message */}
          {transfer.status === 'error' && transfer.error && (
            <p className="text-[11px] text-red-400/80">{transfer.error}</p>
          )}
        </div>

        {/* Cancel button */}
        {transfer.status === 'transferring' && onCancel && (
          <button
            id={`cancel-transfer-${transfer.id}`}
            type="button"
            onClick={() => onCancel(transfer.id)}
            className="shrink-0 rounded-xl p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150"
            aria-label="Cancel transfer"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Dismiss button */}
        {['done', 'error', 'cancelled'].includes(transfer.status) && onDismiss && (
          <button
            id={`dismiss-transfer-${transfer.id}`}
            type="button"
            onClick={() => onDismiss(transfer.id)}
            className="shrink-0 rounded-xl p-2 text-slate-500 hover:bg-slate-700/30 hover:text-slate-300 transition-all duration-150"
            aria-label="Dismiss transfer"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Retry/Resume actions for failed or cancelled transfers */}
      {(transfer.status === 'error' || transfer.status === 'cancelled') && onRetry && (
        <div className="mt-3 flex gap-2 border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={() => onRetry(transfer.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs font-bold text-brand-400 hover:bg-brand-500/20 hover:border-brand-500/30 transition-all active:scale-[0.97]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {transfer.status === 'cancelled' ? 'Resume Transfer' : 'Retry Transfer'}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(transfer.id)}
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 border border-white/5 text-xs font-semibold text-slate-400 hover:bg-white/10 transition-all active:scale-[0.97]"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Completion actions */}
      {transfer.status === 'done' && (
        <div className="mt-4 flex gap-2 border-t border-white/5 pt-4">
          {transfer.direction === 'receive' ? (
            <button
              type="button"
              onClick={() => triggerFileDownload(transfer.fileName, transfer.id)}
              className="flex-1 btn-primary py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-semibold glow-brand"
            >
              <Download className="h-4 w-4 animate-pulse" />
              <span>Download / Save File</span>
            </button>
          ) : (
            <div className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/15 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Sent successfully
                {transfer.speed > 0 && ` • ${formatBytes(transfer.speed)}/s`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Glassmorphic Star-Rating & Suggestion Feedback Drawer */}
      <AnimatePresence>
        {transfer.status === 'done' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="overflow-hidden"
          >
            <div className="mt-4 border-t border-white/5 pt-4 space-y-3.5">
              {!submitted ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                    <p className="text-xs font-semibold text-slate-300">
                      How was your transfer speed & experience?
                    </p>
                    {/* Stars Container */}
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((starIndex) => (
                        <motion.button
                          key={starIndex}
                          type="button"
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          onMouseEnter={() => setHoverRating(starIndex)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(starIndex)}
                          className="focus:outline-none p-0.5"
                        >
                          <Star
                            className={`h-5 w-5 transition-all duration-150 ${
                              (hoverRating || rating) >= starIndex
                                ? 'fill-amber-400 text-amber-400 scale-110 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.45)]'
                                : 'text-slate-600 hover:text-slate-400'
                            }`}
                          />
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Expand feedback input when rated */}
                  {rating > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        placeholder="Any comments or suggestions to improve speed?"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 transition-all duration-200"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSubmitFeedback();
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSubmitFeedback}
                        disabled={loading}
                        className="btn-primary shrink-0 py-2 px-3 flex items-center justify-center gap-1.5 text-xs font-semibold glow-brand disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <span>Send</span>
                            <Send className="h-3 w-3" />
                          </>
                        )}
                      </button>
                    </motion.div>
                  )}
                </>
              ) : (
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center justify-center gap-2 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/10 text-xs font-medium text-emerald-400"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Thanks for your rating! We've pushed feedback to Discord.</span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
