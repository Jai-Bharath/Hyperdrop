import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import {
  Download, CheckCircle2, XCircle, FileDown,
  Inbox, Trash2, Wifi, Copy, Check,
} from 'lucide-react';
import { useTransfer, triggerFileDownload } from '../hooks/useTransfer';
import { useStore } from '../store/useStore';
import { formatBytes } from '../utils/formatBytes';
import TransferCard from '../components/TransferCard';
import QRCodeDisplay from '../components/QRCodeDisplay';
import { LOCAL_HTTP_PORT } from '../shared/protocol';
import { getMyIp } from '../hooks/useDiscovery';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function ReceivePage() {
  const { transfers, acceptTransfer, rejectTransfer, cancelTransfer, removeTransfer, retryTransfer } = useTransfer();
  const connected = useStore((s) => s.connected);
  const serverIp = useStore((s) => s.serverIp);
  const [copied, setCopied] = useState(false);

  const isWeb = !Capacitor.isNativePlatform();

  const getWebRoomId = () => {
    let room = localStorage.getItem('hyperdrop-paired-room-id');
    if (!room) {
      room = `room-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('hyperdrop-paired-room-id', room);
    }
    return room;
  };

  const webRoomId = isWeb ? getWebRoomId() : '';
  const myIp = serverIp || getMyIp();
  const qrUrl = isWeb
    ? `${window.location.origin}?room=${webRoomId}`
    : myIp
    ? `hyperdrop://${myIp}:${LOCAL_HTTP_PORT}`
    : '';

  const handleCopyIp = () => {
    const copyText = isWeb ? qrUrl : `${myIp}:${LOCAL_HTTP_PORT}`;
    if (!copyText) return;
    navigator.clipboard.writeText(copyText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const incoming = transfers.filter(t => t.direction === 'receive' && t.status === 'pending');
  const currentTransfers = transfers.filter(
    t => t.direction === 'receive' && (t.status === 'transferring' || t.status === 'verifying')
  );
  const erroredTransfers = transfers.filter(
    t => t.direction === 'receive' && (t.status === 'cancelled' || t.status === 'error')
  );
  const completed = transfers.filter(t => t.direction === 'receive' && t.status === 'done');
  const hasTransfers = incoming.length > 0 || currentTransfers.length > 0 || erroredTransfers.length > 0 || completed.length > 0;

  // Auto-cleanup old transfers
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;
      transfers
        .filter(t => t.direction === 'receive' && (t.status === 'done' || t.status === 'error' || t.status === 'cancelled'))
        .filter(t => now - t.startedAt > ONE_HOUR)
        .forEach(t => removeTransfer(t.id));
    }, 60000);
    return () => clearInterval(cleanup);
  }, [transfers, removeTransfer]);

  return (
    <motion.div className="mx-auto max-w-lg space-y-4 pb-16" initial="initial" animate="animate">
      {/* ─── Header ──────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/15">
          <FileDown className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Receive Files</h1>
          <p className="text-[11px] text-slate-500">Show this to the sender to connect</p>
        </div>
      </motion.div>

      {/* ─── YOUR DEVICE QR + IP (the hero section) ──────── */}
      <motion.div variants={fadeUp} transition={{ delay: 0.05 }}>
        <div className="card">
          <div className="flex flex-col items-center gap-4 py-2">
            {/* Connection status */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              connected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                : 'bg-red-500/10 text-red-400 border border-red-500/15'
            }`}>
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              {connected ? 'Ready to Receive' : 'Disconnected'}
            </div>

            {/* QR Code */}
            {isWeb || myIp ? (
              <>
                <QRCodeDisplay url={qrUrl} size={180} />

                {/* Display IP or Web Link */}
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono font-bold text-slate-200 tracking-wide max-w-[260px] truncate">
                    {isWeb ? `Room: ${webRoomId}` : myIp}
                  </p>
                  <button
                    type="button"
                    onClick={handleCopyIp}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    title={isWeb ? "Copy Pairing Link" : "Copy IP"}
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>

                <p className="text-[10px] text-slate-500 text-center max-w-[260px]">
                  {isWeb
                    ? "On the sender device: Scan this QR code or open the copied link to connect via WebRTC."
                    : "On the sender device: open HyperDrop → Send → Scan QR or Enter IP"}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6">
                <Wifi className="h-10 w-10 text-slate-600" />
                <p className="text-xs text-slate-400">Waiting for network…</p>
                <p className="text-[10px] text-slate-600">Make sure WiFi or hotspot is active</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* ─── Waiting state ───────────────────────────────── */}
      {!hasTransfers && (
        <motion.div variants={fadeUp} transition={{ delay: 0.15 }}>
          <div className="card flex flex-col items-center gap-3 py-10">
            <div className="relative">
              <Download className="h-12 w-12 text-slate-600 animate-float" />
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-40" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-brand-500" />
              </span>
            </div>
            <p className="text-sm font-medium text-slate-300">Waiting for incoming files…</p>
            <p className="text-[11px] text-slate-500">Sender will see your device after scanning</p>
          </div>
        </motion.div>
      )}

      {/* ─── Incoming Requests ───────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {incoming.map((transfer) => (
          <motion.article
            key={transfer.id}
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
                <p className="truncate text-sm font-semibold text-slate-200">{transfer.fileName}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(transfer.fileSize)}
                  {transfer.deviceName && ` · from ${transfer.deviceName}`}
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => acceptTransfer(transfer.id)}
                className="btn-primary flex-1 flex items-center justify-center gap-2 py-3"
              >
                <CheckCircle2 className="h-4 w-4" /> Accept
              </button>
              <button
                type="button"
                onClick={() => rejectTransfer(transfer.id)}
                className="btn-ghost flex-1 flex items-center justify-center gap-2 py-3 border border-border hover:border-red-500/40 hover:text-red-400"
              >
                <XCircle className="h-4 w-4" /> Reject
              </button>
            </div>
          </motion.article>
        ))}
      </AnimatePresence>

      {/* ─── Active Transfers ────────────────────────────── */}
      <AnimatePresence>
        {currentTransfers.map((transfer) => (
          <TransferCard key={transfer.id} transfer={transfer} onCancel={cancelTransfer} onDismiss={(id) => removeTransfer(id)} onRetry={retryTransfer} />
        ))}
      </AnimatePresence>

      {/* ─── Errors ──────────────────────────────────────── */}
      {erroredTransfers.length > 0 && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Failed</h2>
            <button onClick={() => erroredTransfers.forEach(t => removeTransfer(t.id))} className="flex items-center gap-1 text-[9px] font-bold text-slate-600 hover:text-red-400 transition-colors uppercase tracking-wider">
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          </div>
          <AnimatePresence>
            {erroredTransfers.map(t => (
              <TransferCard key={t.id} transfer={t} onCancel={cancelTransfer} onDismiss={(id) => removeTransfer(id)} onRetry={retryTransfer} />
            ))}
          </AnimatePresence>
        </motion.section>
      )}

      {/* ─── Completed ───────────────────────────────────── */}
      {completed.length > 0 && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Received</h2>
            <button onClick={() => completed.forEach(t => removeTransfer(t.id))} className="flex items-center gap-1 text-[9px] font-bold text-slate-600 hover:text-red-400 transition-colors uppercase tracking-wider">
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          </div>
          <ul className="space-y-2.5">
            <AnimatePresence mode="popLayout">
              {completed.map((transfer) => (
                <motion.li
                  key={transfer.id}
                  className="flex items-center gap-3.5 rounded-2xl bg-white/[0.02] border border-white/5 px-4.5 py-3.5 backdrop-blur-md hover:border-brand-500/20 cursor-pointer transition-all"
                  onClick={() => triggerFileDownload(transfer.fileName, transfer.id)}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <Inbox className="h-5 w-5 shrink-0 text-emerald-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">{transfer.fileName}</p>
                    <p className="text-xs text-slate-500">{formatBytes(transfer.fileSize)} • Tap to download</p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </motion.section>
      )}
    </motion.div>
  );
}
