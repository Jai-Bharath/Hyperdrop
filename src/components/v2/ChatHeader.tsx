import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Zap, MoreVertical, Trash2, X } from 'lucide-react';
import Avatar from './Avatar';
import { type Device } from '../../store/useStore';
import { formatSpeed } from '../../utils/formatSpeed';

interface ChatHeaderProps {
  device: Device;
  onBack: () => void;
  isOnline?: boolean;
  activeTransferSpeed?: number;
  activeTransferProtocol?: string;
  showBackButton?: boolean;
  onClearChat?: () => void;
}

export default function ChatHeader({
  device,
  onBack,
  isOnline = true,
  activeTransferSpeed = 0,
  activeTransferProtocol,
  showBackButton = true,
  onClearChat,
}: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <header className="glass sticky top-0 z-40 flex items-center justify-between px-3 py-2.5 border-b border-border shadow-sm backdrop-blur-xl transition-all duration-300 shrink-0">
      
      {/* Left section */}
      <div className="flex items-center gap-2.5 min-w-0">
        {showBackButton && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-light active:scale-95 transition-all"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

        {/* Avatar with shared-element transition */}
        <Avatar
          name={device.name}
          platform={device.platform}
          isOnline={isOnline}
          size="md"
          layoutId={`avatar-${device.id}`}
        />

        {/* Name & status */}
        <div className="min-w-0 flex flex-col justify-center">
          <h1 className="text-sm font-semibold text-text-primary truncate">
            {device.name}
          </h1>
          <p className="text-[10px] text-text-muted flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-text-muted'
            }`} />
            {activeTransferSpeed > 0 ? (
              <span className="text-brand-500 font-medium">
                {formatSpeed(activeTransferSpeed)}
              </span>
            ) : (
              isOnline ? 'Direct Connection' : 'Offline'
            )}
          </p>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Live transfer badge */}
        {activeTransferSpeed > 0 && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="hidden desktop:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-500"
          >
            <Zap className="h-3.5 w-3.5 animate-pulse" />
            <span className="font-mono text-[10px] font-bold">
              {formatSpeed(activeTransferSpeed)}
            </span>
          </motion.div>
        )}

        {/* Overflow menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-light active:scale-95 transition-all"
            aria-label="More options"
          >
            <MoreVertical className="h-4.5 w-4.5" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -4 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute right-0 top-12 w-44 glass-strong border border-border shadow-2xl rounded-xl p-1.5 z-50 origin-top-right"
              >
                {onClearChat && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onClearChat();
                    }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg hover:bg-red-500/10 text-xs text-red-500 text-left font-semibold transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Chat
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
