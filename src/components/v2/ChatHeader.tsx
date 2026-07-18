import { motion } from 'framer-motion';
import { ArrowLeft, Settings, Zap } from 'lucide-react';
import Avatar from './Avatar';
import { type Device } from '../../store/useStore';
import { formatSpeed } from '../../utils/formatSpeed';

interface ChatHeaderProps {
  device: Device;
  onBack: () => void;
  onSettingsClick?: () => void;
  isOnline?: boolean;
  activeTransferSpeed?: number;
  activeTransferProtocol?: string;
}

export default function ChatHeader({
  device,
  onBack,
  onSettingsClick,
  isOnline = true,
  activeTransferSpeed = 0,
  activeTransferProtocol,
}: ChatHeaderProps) {
  return (
    <header className="glass sticky top-4 z-40 mx-auto w-[calc(100%-2rem)] max-w-5xl my-3 flex items-center justify-between px-4 py-2.5 rounded-2xl border border-border shadow-lg backdrop-blur-xl transition-all duration-300">
      
      {/* Left section: back + avatar + user info */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-white/5 active:scale-95 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Dynamic Avatar with transition layoutId */}
        <Avatar
          name={device.name}
          platform={device.platform}
          isOnline={isOnline}
          size="md"
          layoutId={`avatar-${device.id}`}
        />

        {/* User name & Online state */}
        <div className="min-w-0 flex flex-col justify-center">
          <h1 className="text-sm font-semibold text-text-primary truncate">
            {device.name}
          </h1>
          <p className="text-[10px] text-text-muted flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-text-muted'}`} />
            {isOnline ? 'Direct Connection' : 'Offline'}
          </p>
        </div>
      </div>

      {/* Right section: transfer speed badge + settings icon */}
      <div className="flex items-center gap-3">
        {/* active transfer speed badge */}
        {activeTransferSpeed > 0 && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-500/10 border border-brand-500/25 text-brand-500 shadow-sm"
          >
            <Zap className="h-3.5 w-3.5 animate-pulse" />
            <span className="font-mono text-[10px] font-bold">
              {formatSpeed(activeTransferSpeed)}
            </span>
          </motion.div>
        )}

        {onSettingsClick && (
          <button
            type="button"
            onClick={onSettingsClick}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-white/5 active:scale-95 transition-all"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        )}
      </div>
    </header>
  );
}
