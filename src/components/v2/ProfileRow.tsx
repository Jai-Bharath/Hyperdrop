import { motion } from 'framer-motion';
import { Wifi, ChevronRight } from 'lucide-react';
import Avatar from './Avatar';
import { useStore, type Device } from '../../store/useStore';

interface ProfileRowProps {
  device: Device;
  lastActivity?: string;
  unreadCount?: number;
  isOnline?: boolean;
  onClick: () => void;
}

export default function ProfileRow({
  device,
  lastActivity,
  unreadCount = 0,
  isOnline = true,
  onClick,
}: ProfileRowProps) {
  // Let's get typing state from store
  const isTyping = useStore((s) => s.selectedDevice?.id === device.id && s.peerTyping);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98, opacity: 0.9 }}
      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-border bg-surface-default hover:bg-surface-light hover:border-brand-500/20 active:border-brand-500/40 shadow-sm transition-all duration-200 text-left relative group overflow-hidden"
    >
      {/* Dynamic glow effect on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-500/0 via-brand-500/5 to-brand-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out" />

      {/* Device Avatar */}
      <Avatar
        name={device.name}
        platform={device.platform}
        isOnline={isOnline}
        layoutId={`avatar-${device.id}`}
      />

      {/* Info Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-sm font-semibold text-text-primary truncate">
            {device.name}
          </p>
          <span className="text-[10px] text-text-muted font-mono shrink-0">
            {device.ip}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-text-secondary truncate pr-4">
            {isTyping ? (
              <span className="text-brand-500 font-medium flex items-center gap-1">
                typing
                <span className="flex gap-0.5 items-center">
                  <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce typing-dot-1" />
                  <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce typing-dot-2" />
                  <span className="h-1 w-1 rounded-full bg-brand-500 animate-bounce typing-dot-3" />
                </span>
              </span>
            ) : (
              lastActivity || 'No recent activity'
            )}
          </p>
          
          <div className="flex items-center gap-2 shrink-0">
            {/* Unread message count badge */}
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white shadow-md shadow-brand-500/20 animate-pulse">
                {unreadCount}
              </span>
            )}
            
            {device.supports5GHz && isOnline && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[8px] font-bold text-brand-500 uppercase tracking-wider">
                5GHz
              </span>
            )}
            <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-text-secondary transition-colors" />
          </div>
        </div>
      </div>
    </motion.button>
  );
}
