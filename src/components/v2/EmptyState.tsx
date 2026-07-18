import { motion } from 'framer-motion';
import { Wifi, MessageSquare, QrCode } from 'lucide-react';

interface EmptyStateProps {
  type: 'profiles' | 'chat';
  onPairClick?: () => void;
}

export default function EmptyState({ type, onPairClick }: EmptyStateProps) {
  if (type === 'profiles') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        {/* Animated Radar Effect */}
        <div className="relative flex items-center justify-center h-32 w-32 mb-6">
          {/* Radar Circles */}
          <div className="absolute inset-0 rounded-full border border-brand-500/10 animate-[ping_3s_infinite]" />
          <div className="absolute inset-4 rounded-full border border-brand-500/15 animate-[ping_2s_infinite]" />
          <div className="absolute inset-8 rounded-full border border-brand-500/20 animate-pulse" />
          
          {/* Scanning Sweep */}
          <div className="absolute inset-0 rounded-full border border-brand-500/30 overflow-hidden">
            <div className="h-full w-1/2 bg-gradient-to-r from-brand-500/10 to-transparent origin-right rotate-0 animate-[spin_4s_linear_infinite]" />
          </div>

          <div className="z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/25 text-brand-500 shadow-md">
            <Wifi className="h-7 w-7 animate-pulse" />
          </div>
        </div>

        <h3 className="text-sm font-semibold text-text-primary mb-1">
          Looking for nearby devices...
        </h3>
        <p className="text-xs text-text-secondary max-w-[280px] leading-relaxed mb-6">
          Make sure Hyperdrop is open on other devices connected to the same Wi-Fi network.
        </p>

        {onPairClick && (
          <button
            type="button"
            onClick={onPairClick}
            className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl border border-brand-500/35 bg-brand-500/10 text-xs font-bold text-brand-500 hover:bg-brand-500/20 active:scale-95 transition-all shadow-sm"
          >
            <QrCode className="h-4 w-4" />
            Pair New Device
          </button>
        )}
      </div>
    );
  }

  // Chat empty state
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-light border border-border text-text-secondary mb-4 shadow-sm">
        <MessageSquare className="h-8 w-8 text-brand-500 opacity-80" />
      </div>
      <h3 className="text-sm font-semibold text-text-primary mb-1">
        Your secure local chat
      </h3>
      <p className="text-xs text-text-secondary max-w-[260px] leading-relaxed">
        Everything sent here runs peer-to-peer over your local network. No cloud tracking.
      </p>
    </div>
  );
}
