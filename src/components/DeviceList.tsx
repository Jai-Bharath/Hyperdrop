import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Monitor, Wifi, Loader2, Search, CheckCircle2 } from 'lucide-react';

export interface Peer {
  fingerprint: string;
  alias: string;
  ip: string;
  port: number;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'web';
  source: 'scan' | 'multicast' | 'manual' | 'qr';
  verified: boolean;
  failCount: number;
  lastSeen: number;
}

interface DeviceListProps {
  peers: Peer[];
  selectedId?: string;
  onSelect: (peer: Peer) => void;
  isScanning?: boolean;
}

function deviceIcon(type: string) {
  const lower = (type || '').toLowerCase();
  if (lower.includes('mobile') || lower.includes('android') || lower.includes('ios'))
    return <Smartphone className="h-5 w-5" />;
  return <Monitor className="h-5 w-5" />;
}

export default function DeviceList({ peers, selectedId, onSelect, isScanning }: DeviceListProps) {
  if (peers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        {isScanning ? (
          <>
            <Loader2 className="h-8 w-8 text-brand-400 animate-spin" />
            <p className="text-xs font-semibold text-slate-400">Scanning your network…</p>
            <p className="text-[10px] text-slate-600">Looking for HyperDrop devices nearby</p>
          </>
        ) : (
          <>
            <Search className="h-8 w-8 text-slate-600" />
            <p className="text-xs font-semibold text-slate-400">No devices found</p>
            <p className="text-[10px] text-slate-600">
              Use <strong>Scan QR</strong> or <strong>Enter IP</strong> to connect
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      <AnimatePresence mode="popLayout">
        {peers.map((peer) => {
          const isSelected = selectedId === peer.fingerprint;
          return (
            <motion.li
              key={peer.fingerprint}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <button
                type="button"
                onClick={() => onSelect(peer)}
                className={`w-full flex items-center gap-3.5 rounded-2xl px-4 py-3.5 border transition-all duration-200 text-left
                  ${isSelected
                    ? 'bg-brand-500/10 border-brand-500/30 shadow-[0_0_20px_rgba(99,102,241,0.15)]'
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/10 active:scale-[0.98]'
                  }`}
              >
                {/* Icon */}
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-brand-500/15 border-brand-500/25 text-brand-400'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                }`}>
                  {deviceIcon(peer.deviceType)}
                </div>

                {/* Name + IP */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${isSelected ? 'text-brand-300' : 'text-slate-200'}`}>
                    {peer.alias}
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {peer.ip}:{peer.port}
                  </p>
                </div>

                {/* Status */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {peer.verified && (
                    <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {isSelected && (
                    <CheckCircle2 className="h-4 w-4 text-brand-400" />
                  )}
                </div>
              </button>
            </motion.li>
          );
        })}
      </AnimatePresence>

      {isScanning && peers.length > 0 && (
        <motion.li
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center gap-2 py-2 text-[10px] text-slate-500"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Still scanning…
        </motion.li>
      )}
    </ul>
  );
}
