import { motion } from 'framer-motion';
import { Wifi, MessageSquare, QrCode, Radio } from 'lucide-react';

interface EmptyStateProps {
  type: 'profiles' | 'chat';
  onPairClick?: () => void;
}

export default function EmptyState({ type, onPairClick }: EmptyStateProps) {
  if (type === 'profiles') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        {/* Animated Radar Effect */}
        <div className="relative flex items-center justify-center h-28 w-28 mb-6">
          {/* Radar rings */}
          <motion.div
            className="absolute inset-0 rounded-full border border-brand-500/10"
            animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute inset-3 rounded-full border border-brand-500/15"
            animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
          />
          <motion.div
            className="absolute inset-6 rounded-full border border-brand-500/20"
            animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut', delay: 1 }}
          />

          {/* Center icon */}
          <div className="z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500">
            <Radio className="h-6 w-6" />
          </div>
        </div>

        <h3 className="text-sm font-semibold text-text-primary mb-1.5">
          Looking for nearby devices…
        </h3>
        <p className="text-xs text-text-secondary max-w-[260px] leading-relaxed mb-6">
          Make sure Hyperdrop is open on other devices connected to the same Wi-Fi network.
        </p>

        {onPairClick && (
          <motion.button
            type="button"
            onClick={onPairClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-brand-500/30 bg-brand-500/10 text-xs font-bold text-brand-500 hover:bg-brand-500/15 transition-all shadow-sm"
          >
            <QrCode className="h-4 w-4" />
            Pair New Device
          </motion.button>
        )}
      </div>
    );
  }

  // Chat empty state
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col items-center"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-light border border-border text-brand-500 mb-4 shadow-sm"
        >
          <MessageSquare className="h-7 w-7 opacity-80" />
        </motion.div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">
          Your secure local chat
        </h3>
        <p className="text-xs text-text-secondary max-w-[240px] leading-relaxed">
          Send files, messages, and media — everything stays peer-to-peer on your local network. No cloud, no tracking.
        </p>
      </motion.div>
    </div>
  );
}
