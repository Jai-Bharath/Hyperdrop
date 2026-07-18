import { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Wifi, Radio } from 'lucide-react';
import { useStore, type Device } from '../../store/useStore';
import Avatar from './Avatar';

// ─── Stable position generator (seeded by device ID) ────────
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getNodePosition(deviceId: string, index: number, total: number) {
  const seed = hashCode(deviceId);
  // Place on ring 1 (35%), ring 2 (55%), or ring 3 (70%)
  const rings = [30, 42, 56];
  const ringIndex = seed % rings.length;
  const radius = rings[ringIndex];

  // Distribute angle based on both seed and index for variety
  const baseAngle = (seed % 360) * (Math.PI / 180);
  const indexOffset = (2 * Math.PI * index) / Math.max(total, 1);
  const angle = baseAngle + indexOffset;

  // Small jitter for natural feel
  const jitterX = ((seed % 7) - 3) * 0.8;
  const jitterY = ((seed % 11) - 5) * 0.6;

  const x = 50 + radius * Math.cos(angle) + jitterX;
  const y = 50 + radius * Math.sin(angle) + jitterY;

  return { x: Math.max(8, Math.min(92, x)), y: Math.max(8, Math.min(92, y)) };
}

export default function RadarView() {
  const navigate = useNavigate();
  const devices = useStore((s) => s.devices);
  const selectDevice = useStore((s) => s.selectDevice);

  const deviceCount = devices.length;

  const handleDeviceClick = useCallback((device: Device) => {
    selectDevice(device);
    navigate(`/chat/${device.id}`);
  }, [selectDevice, navigate]);

  // Stable positions memoized on device list
  const positions = useMemo(() => {
    return devices.map((d, i) => ({
      device: d,
      pos: getNodePosition(d.id, i, devices.length),
    }));
  }, [devices]);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8 select-none">
      {/* Radar */}
      <div className="radar-container w-full max-w-[380px] desktop:max-w-[420px]">
        {/* Concentric rings */}
        {[30, 50, 70].map((pct) => (
          <div
            key={pct}
            className="radar-ring"
            style={{ width: `${pct}%`, height: `${pct}%` }}
          />
        ))}

        {/* Sweeping gradient beam */}
        <div className="radar-sweep" />

        {/* Center node (your device) */}
        <div className="radar-center-node">
          <div className="radar-center-glow" />
          <div className="radar-center-ping" />
          <div className="radar-center-ping" style={{ animationDelay: '1s' }} />
        </div>

        {/* Discovered device nodes */}
        <AnimatePresence>
          {positions.map(({ device, pos }, index) => {
            const isOnline = Date.now() - device.lastSeen < 30000;
            return (
              <motion.button
                key={device.id}
                type="button"
                onClick={() => handleDeviceClick(device)}
                className="absolute z-20 flex flex-col items-center gap-1 group cursor-pointer"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 22,
                  delay: index * 0.08,
                }}
              >
                {/* Node avatar */}
                <div className="relative">
                  <Avatar
                    name={device.name}
                    platform={device.platform}
                    isOnline={isOnline}
                    size="sm"
                    layoutId={`radar-avatar-${device.id}`}
                  />
                  {/* Ping ring */}
                  {isOnline && (
                    <span className="absolute -inset-1 rounded-2xl border border-brand-400/30 animate-node-ping" />
                  )}
                </div>

                {/* Label */}
                <span className="max-w-[80px] truncate px-2 py-0.5 rounded-lg text-[9px] font-bold tracking-wide bg-surface-default/80 dark:bg-surface-default/60 backdrop-blur-sm border border-border text-text-secondary group-hover:text-text-primary group-hover:border-brand-500/30 transition-all duration-200">
                  {device.name}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Status text with crossfade */}
      <AnimatePresence mode="wait">
        {deviceCount === 0 ? (
          <motion.div
            key="searching"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="mt-8 flex flex-col items-center text-center"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/20 text-brand-500 mb-3">
              <Radio className="h-6 w-6 animate-pulse" />
            </div>
            <p className="text-sm font-semibold text-text-primary">
              Searching for nearby devices…
            </p>
            <p className="text-xs text-text-muted mt-1 max-w-[260px]">
              Make sure Hyperdrop is open on other devices connected to the same network.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="found"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="mt-8 flex flex-col items-center text-center"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 mb-2">
              <Wifi className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-text-primary">
              {deviceCount} device{deviceCount !== 1 ? 's' : ''} found nearby
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              Tap a device on the radar or in the sidebar to start sharing
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
