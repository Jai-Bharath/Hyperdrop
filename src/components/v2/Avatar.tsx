import { motion } from 'framer-motion';
import { Smartphone, Monitor, Tablet, Globe } from 'lucide-react';

interface AvatarProps {
  name: string;
  platform?: string;
  isOnline?: boolean;
  size?: 'sm' | 'md' | 'lg';
  layoutId?: string;
}

// Generate a deterministic color based on the device name
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'from-sky-500 to-blue-600',
    'from-emerald-500 to-teal-600',
    'from-violet-500 to-purple-600',
    'from-pink-500 to-rose-600',
    'from-amber-500 to-orange-600',
    'from-indigo-500 to-blue-700',
  ];
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// Get initials (up to 2 characters)
function getInitials(name: string): string {
  const parts = name.split(/[\s-_]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function getPlatformIcon(platform?: string, className?: string) {
  const lower = (platform || '').toLowerCase();
  if (lower.includes('android') || lower.includes('ios') || lower.includes('mobile')) {
    return <Smartphone className={className} />;
  }
  if (lower.includes('tablet') || lower.includes('ipad')) {
    return <Tablet className={className} />;
  }
  if (lower.includes('desktop') || lower.includes('windows') || lower.includes('macos') || lower.includes('linux')) {
    return <Monitor className={className} />;
  }
  return <Globe className={className} />;
}

export default function Avatar({ name, platform, isOnline = true, size = 'md', layoutId }: AvatarProps) {
  const initials = getInitials(name || 'Unknown');
  const colorClass = getAvatarColor(name || 'Unknown');

  const sizeClasses = {
    sm: 'h-9 w-9 text-xs',
    md: 'h-11 w-11 text-sm',
    lg: 'h-14 w-14 text-lg',
  };

  const badgeSizeClasses = {
    sm: 'h-2.5 w-2.5 -bottom-0.5 -right-0.5',
    md: 'h-3.5 w-3.5 -bottom-0.5 -right-0.5',
    lg: 'h-4 w-4 bottom-0 right-0',
  };

  const iconSizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <div className="relative inline-block shrink-0 select-none">
      <motion.div
        layoutId={layoutId}
        className={`flex items-center justify-center rounded-2xl bg-gradient-to-br ${colorClass} font-bold text-white shadow-md relative ${sizeClasses[size]}`}
      >
        {initials}
      </motion.div>

      {/* Connection state dot */}
      <span
        className={`absolute flex rounded-full border-2 border-surface-default bg-emerald-400 justify-center items-center ${badgeSizeClasses[size]} transition-all duration-300 ${
          isOnline
            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
            : 'bg-text-muted'
        }`}
      >
        {isOnline && size !== 'sm' && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        {size !== 'sm' && (
          <div className="text-white scale-[0.7]">
            {getPlatformIcon(platform, iconSizeClasses[size])}
          </div>
        )}
      </span>
    </div>
  );
}
