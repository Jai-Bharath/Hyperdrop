import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import Avatar from './Avatar';
import { useStore, type Device } from '../../store/useStore';

interface ProfileRowProps {
  device: Device;
  lastActivity?: string;
  lastActivityTime?: string;
  unreadCount?: number;
  isOnline?: boolean;
  isSelected?: boolean;
  onClick: () => void;
}

export default function ProfileRow({
  device,
  lastActivity,
  lastActivityTime,
  unreadCount = 0,
  isOnline = true,
  isSelected = false,
  onClick,
}: ProfileRowProps) {
  const isTyping = useStore((s) => s.selectedDevice?.id === device.id && s.peerTyping);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-2xl border transition-all duration-200 text-left relative group overflow-hidden active:scale-[0.98] ${
        isSelected
          ? 'bg-brand-500/8 border-brand-500/20 shadow-sm'
          : 'border-transparent hover:bg-surface-light hover:border-border'
      }`}
    >
      {/* Hover sweep glow */}
      {!isSelected && (
        <div className="absolute inset-0 bg-gradient-to-r from-brand-500/0 via-brand-500/[0.03] to-brand-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-out" />
      )}

      {/* Avatar */}
      <Avatar
        name={device.name}
        platform={device.platform}
        isOnline={isOnline}
        size="md"
        layoutId={`avatar-${device.id}`}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className={`text-[13px] font-semibold truncate ${
            isSelected ? 'text-brand-500' : 'text-text-primary'
          }`}>
            {device.name}
          </p>
          {lastActivityTime && (
            <span className="text-[10px] text-text-muted font-medium shrink-0 ml-2">
              {lastActivityTime}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-text-secondary truncate pr-3">
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

          <div className="flex items-center gap-1.5 shrink-0">
            {unreadCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] px-1 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white shadow-sm shadow-brand-500/20">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
            <ChevronRight className={`h-3.5 w-3.5 transition-colors ${
              isSelected ? 'text-brand-500/50' : 'text-text-muted/50 group-hover:text-text-muted'
            }`} />
          </div>
        </div>
      </div>
    </button>
  );
}
