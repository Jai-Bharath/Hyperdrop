import { motion } from 'framer-motion';
import {
  Clock,
  ArrowUp,
  ArrowDown,
  FileText,
  Trash2,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { formatBytes } from '../utils/formatBytes';
import { formatSpeed } from '../utils/formatSpeed';
import { PROTOCOL_LABELS, PROTOCOL_COLORS } from '../engine/protocolPicker';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const time = d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isToday) return `Today, ${time}`;

  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  }) + `, ${time}`;
}

export default function HistoryPage() {
  const history = useStore((s) => s.history);
  const clearHistory = useStore((s) => s.clearHistory);

  return (
    <motion.div
      className="mx-auto max-w-lg space-y-6"
      initial="initial"
      animate="animate"
    >
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        variants={fadeUp}
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-100">History</h1>
          <p className="mt-1 text-sm text-slate-500">
            {history.length} transfer{history.length !== 1 ? 's' : ''}
          </p>
        </div>
        {history.length > 0 && (
          <button
            id="btn-clear-history"
            type="button"
            onClick={clearHistory}
            className="btn-ghost flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </motion.div>

      {/* ─── Empty State ───────────────────────────────────── */}
      {history.length === 0 && (
        <motion.div
          id="history-empty"
          className="card flex flex-col items-center gap-4 py-16"
          variants={fadeUp}
        >
          <Clock className="h-16 w-16 text-slate-600" />
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">
              No transfers yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Completed transfers will appear here
            </p>
          </div>
        </motion.div>
      )}

      {/* ─── History List ──────────────────────────────────── */}
      {history.length > 0 && (
        <motion.ul className="space-y-2" variants={fadeUp}>
          {history.map((entry, index) => {
            const protocolColor = PROTOCOL_COLORS[entry.protocol];
            const isSend = entry.direction === 'send';

            return (
              <motion.li
                key={entry.id}
                id={`history-${entry.id}`}
                className="card-hover flex items-start sm:items-center gap-3 sm:gap-4 !p-3 sm:!p-4"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04, duration: 0.2 }}
                layout
              >
                {/* File icon + direction arrow */}
                <div className="relative shrink-0 mt-1 sm:mt-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-light">
                    <FileText className="h-5 w-5 text-slate-400" />
                  </div>
                  <span
                    className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ${
                      isSend
                        ? 'bg-brand-500/20 text-brand-400'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {isSend ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )}
                  </span>
                </div>

                {/* Content Wrapper */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between min-w-0 flex-1 gap-2 sm:gap-4">
                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-200">
                      {entry.fileName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1">
                      <span className="text-[11px] sm:text-xs text-slate-500">
                        {formatBytes(entry.fileSize)}
                      </span>
                      <span className="text-[11px] sm:text-xs font-mono text-slate-400">
                        {formatSpeed(entry.speed)}
                      </span>
                      <span
                        className="badge text-[9px] sm:text-[10px]"
                        style={{
                          backgroundColor: `${protocolColor}15`,
                          color: protocolColor,
                        }}
                      >
                        {PROTOCOL_LABELS[entry.protocol]}
                      </span>
                    </div>
                  </div>

                  {/* Timestamp + device */}
                  <div className="shrink-0 flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t border-white/5 sm:border-0 pt-2 sm:pt-0">
                    <p className="text-[10px] sm:text-[11px] text-slate-500">
                      {formatTimestamp(entry.completedAt)}
                    </p>
                    <p className="text-[10px] text-slate-600 sm:mt-0.5 max-w-[120px] sm:max-w-none truncate">
                      {entry.deviceName}
                    </p>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </motion.div>
  );
}
