/**
 * HyperDrop Consent Modal — Phase 6
 *
 * Displayed when a peer sends a PrepareRequest. Shows the sender's alias,
 * fingerprint, and file list. User can accept (which releases the HTTP
 * response) or decline.
 *
 * On native: triggered by the 'transferRequest' event from LocalServerPlugin.
 * On desktop companion: triggered by the httpServer's /api/prepare handler.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  ShieldCheck,
  ShieldX,
  FileDown,
  User,
  Fingerprint,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useStore } from '../store/useStore';
import { formatBytes } from '../utils/formatBytes';

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

export interface TransferRequestData {
  sessionId: string;
  senderAlias: string;
  senderFingerprint: string;
  senderPublicKey: string;
  files: Array<{
    id: string;
    name: string;
    size: number;
    mimeType: string;
  }>;
  totalSize: number;
  fileCount: number;
}

interface ConsentModalProps {
  request: TransferRequestData | null;
  onAccept: (sessionId: string) => void;
  onDecline: (sessionId: string) => void;
}

// ═══════════════════════════════════════════════════════════════
//  FINGERPRINT DISPLAY
// ═══════════════════════════════════════════════════════════════

/** Format a hex fingerprint as 4-char groups for readability */
function formatFingerprint(fp: string): string {
  return fp.slice(0, 32).replace(/(.{4})/g, '$1 ').trim().toUpperCase();
}

/** Shorten a fingerprint for display */
function shortFingerprint(fp: string): string {
  return `${fp.slice(0, 8)}…${fp.slice(-8)}`.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function ConsentModal({ request, onAccept, onDecline }: ConsentModalProps) {
  const [showFullFingerprint, setShowFullFingerprint] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [alwaysTrust, setAlwaysTrust] = useState(false);

  // Reset state when a new request arrives
  useEffect(() => {
    if (request) {
      setShowFullFingerprint(false);
      setIsProcessing(false);
      setAlwaysTrust(false);
    }
  }, [request?.sessionId]);

  const handleAccept = useCallback(() => {
    if (!request || isProcessing) return;
    setIsProcessing(true);
    
    if (alwaysTrust) {
      try {
        const trusted = localStorage.getItem('hyperdrop-trusted-devices') || '[]';
        const trustedList = JSON.parse(trusted);
        if (!trustedList.includes(request.senderFingerprint)) {
          trustedList.push(request.senderFingerprint);
          localStorage.setItem('hyperdrop-trusted-devices', JSON.stringify(trustedList));
        }
      } catch (e) {
        console.error('[ConsentModal] Failed to save trusted device:', e);
      }
    }
    
    onAccept(request.sessionId);
  }, [request, isProcessing, alwaysTrust, onAccept]);

  const handleDecline = useCallback(() => {
    if (!request || isProcessing) return;
    setIsProcessing(true);
    onDecline(request.sessionId);
  }, [request, isProcessing, onDecline]);

  if (!request) return null;

  const totalSize = request.totalSize || request.files.reduce((s, f) => s + f.size, 0);
  const fileCount = request.fileCount || request.files.length;

  return (
    <AnimatePresence>
      {request && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md"
            onClick={handleDecline}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[101] mx-auto max-w-md"
          >
            <div className="rounded-3xl border border-white/10 bg-[#12121a] shadow-2xl shadow-black/60 overflow-hidden">
              {/* Header */}
              <div className="relative px-6 pt-6 pb-4">
                {/* Glow accent */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 opacity-80" />

                <div className="flex items-center gap-3.5 mt-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20">
                    <Shield className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-extrabold text-white tracking-tight">
                      Incoming Transfer
                    </h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      A device wants to send you files
                    </p>
                  </div>
                </div>
              </div>

              {/* Sender Info */}
              <div className="px-6 py-3 border-t border-b border-white/[0.04] bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 border border-brand-500/15">
                    <User className="h-4 w-4 text-brand-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-slate-200 truncate">
                      {request.senderAlias}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowFullFingerprint(!showFullFingerprint)}
                      className="flex items-center gap-1 text-[9px] font-mono text-slate-500 hover:text-slate-300 transition-colors"
                      title="Click to verify fingerprint"
                    >
                      <Fingerprint className="h-3 w-3" />
                      {showFullFingerprint
                        ? formatFingerprint(request.senderFingerprint)
                        : shortFingerprint(request.senderFingerprint)}
                    </button>
                  </div>
                </div>
              </div>

              {/* File List */}
              <div className="px-6 py-4 space-y-2.5 max-h-[200px] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    {fileCount} file{fileCount !== 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">
                    {formatBytes(totalSize)}
                  </span>
                </div>

                {request.files.slice(0, 10).map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] px-3 py-2"
                  >
                    <FileDown className="h-3.5 w-3.5 text-brand-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-slate-300 truncate">{file.name}</p>
                      <p className="text-[9px] text-slate-600">{formatBytes(file.size)}</p>
                    </div>
                  </div>
                ))}

                {fileCount > 10 && (
                  <p className="text-[10px] text-slate-600 text-center">
                    …and {fileCount - 10} more file{fileCount - 10 !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Security Notice */}
              <div className="px-6 py-2.5 border-t border-white/[0.04]">
                <div className="flex items-start gap-2 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/10 px-3 py-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="text-[9px] text-emerald-400/70 leading-relaxed">
                    Direct LAN transfer — no internet, no cloud, end-to-end encrypted
                  </p>
                </div>
              </div>

              {/* Trust Checkbox */}
              <div className="px-6 py-2 flex items-center gap-2 border-t border-white/[0.04] pt-3">
                <input
                  id="checkbox-trust-device"
                  type="checkbox"
                  checked={alwaysTrust}
                  onChange={(e) => setAlwaysTrust(e.target.checked)}
                  className="rounded border-white/10 bg-white/5 text-brand-500 focus:ring-brand-500/30 h-4 w-4"
                />
                <label htmlFor="checkbox-trust-device" className="text-[11px] text-slate-400 cursor-pointer select-none">
                  Always trust this device (auto-accept future transfers)
                </label>
              </div>

              {/* Action Buttons */}
              <div className="px-6 py-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-red-500/10 hover:border-red-500/20 text-slate-400 hover:text-red-400 text-[12px] font-bold transition-all active:scale-[0.97] disabled:opacity-40"
                >
                  <XCircle className="h-4 w-4" />
                  Decline
                </button>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-500 text-white text-[12px] font-bold shadow-lg shadow-brand-500/20 hover:shadow-brand-500/40 transition-all active:scale-[0.97] disabled:opacity-60"
                >
                  {isProcessing ? (
                    <span className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Accept
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
