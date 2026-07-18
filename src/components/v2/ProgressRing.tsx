import { formatSpeed } from '../../utils/formatSpeed';
import { formatBytes } from '../../utils/formatBytes';

interface ProgressRingProps {
  progress: number;
  size?: number;
  strokeWidth?: number;
  speed?: number; // bytes/sec
  totalSize?: number; // bytes
  transferredBytes?: number;
}

export default function ProgressRing({
  progress,
  size = 110,
  strokeWidth = 8,
  speed = 0,
  totalSize = 0,
  transferredBytes = 0,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const offset = circumference - (clampedProgress / 100) * circumference;
  const center = size / 2;
  const gradientId = `progress-gradient-${size}`;

  // Calculate ETA
  let etaStr = '';
  if (speed > 0 && totalSize > 0 && transferredBytes < totalSize) {
    const remainingBytes = totalSize - transferredBytes;
    const etaSec = Math.ceil(remainingBytes / speed);
    if (etaSec < 60) {
      etaStr = `${etaSec}s`;
    } else {
      const etaMin = Math.floor(etaSec / 60);
      const remSec = etaSec % 60;
      etaStr = `${etaMin}m ${remSec}s`;
    }
  }

  return (
    <div
      id="progress-ring-container"
      className="relative inline-flex flex-col items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] drop-shadow-[0_4px_12px_rgba(14,165,233,0.15)]"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand-300)" />
            <stop offset="50%" stopColor="var(--brand-500)" />
            <stop offset="100%" stopColor="var(--brand-600)" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={strokeWidth}
          className="opacity-20"
        />

        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-300 ease-out"
        />
      </svg>

      {/* Center metadata */}
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span
          className="font-mono font-extrabold text-text-primary tracking-tight"
          style={{ fontSize: size * 0.18 }}
        >
          {Math.round(clampedProgress)}%
        </span>
        
        {size >= 100 && speed > 0 && (
          <span
            className="text-[9px] text-brand-500 font-bold uppercase tracking-wider mt-0.5"
            style={{ fontSize: size * 0.08 }}
          >
            {formatSpeed(speed)}
          </span>
        )}
        
        {size >= 100 && etaStr && (
          <span
            className="text-[8px] text-text-muted mt-0.5 font-medium"
            style={{ fontSize: size * 0.075 }}
          >
            ETA: {etaStr}
          </span>
        )}
      </div>
    </div>
  );
}
