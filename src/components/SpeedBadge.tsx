import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import type { Protocol } from '../store/useStore';
import { formatSpeed } from '../utils/formatSpeed';
import { PROTOCOL_COLORS, PROTOCOL_LABELS } from '../engine/protocolPicker';

interface SpeedBadgeProps {
  speed: number;
  protocol: Protocol;
}

export default function SpeedBadge({ speed, protocol }: SpeedBadgeProps) {
  const color = PROTOCOL_COLORS[protocol];
  const label = PROTOCOL_LABELS[protocol];

  return (
    <motion.div
      id={`speed-badge-${protocol}`}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30, duration: 0.25 }}
      className="badge gap-2"
      style={{
        backgroundColor: `${color}15`,
        color,
        boxShadow: `0 0 12px ${color}20, 0 0 4px ${color}10`,
      }}
    >
      <Zap className="h-3 w-3" />
      <span className="font-mono text-xs font-bold tracking-tight">
        {formatSpeed(speed)}
      </span>
      <span className="h-3 w-px opacity-30" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-medium uppercase tracking-widest opacity-75">
        {label}
      </span>
    </motion.div>
  );
}
