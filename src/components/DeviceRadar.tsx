import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Monitor, Tablet, Wifi, Radio } from 'lucide-react';
import type { Device } from '../store/useStore';

interface DeviceRadarProps {
  devices: Device[];
  onSelectDevice: (device: Device) => void;
  selectedDeviceId?: string;
}

function platformIcon(platform: string | undefined | null) {
  if (!platform) return <Monitor className="h-3.5 w-3.5" />;
  const lower = platform.toLowerCase();
  if (lower.includes('android') || lower.includes('ios') || lower.includes('phone'))
    return <Smartphone className="h-3.5 w-3.5" />;
  if (lower.includes('tablet') || lower.includes('ipad'))
    return <Tablet className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

function getPlatformColorClasses(platform: string | undefined | null, isSelected: boolean) {
  if (!platform) {
    return isSelected 
      ? 'border-brand-500 text-brand-300 bg-brand-500/20 shadow-[0_0_15px_rgba(99,102,241,0.4)] ring-2 ring-brand-400/20' 
      : 'border-white/10 text-slate-400 bg-[#141420b3] hover:border-brand-500/40 hover:text-slate-200';
  }
  const lower = platform.toLowerCase();
  if (lower.includes('android')) {
    return isSelected 
      ? 'border-emerald-500 text-emerald-300 bg-emerald-500/20 shadow-[0_0_15px_rgba(52,211,153,0.4)] ring-2 ring-emerald-400/20' 
      : 'border-white/10 text-slate-400 bg-[#141420b3] hover:border-emerald-500/40 hover:text-emerald-300';
  }
  if (lower.includes('ios') || lower.includes('iphone') || lower.includes('ipad')) {
    return isSelected 
      ? 'border-indigo-500 text-indigo-300 bg-indigo-500/20 shadow-[0_0_15px_rgba(129,140,248,0.4)] ring-2 ring-indigo-400/20' 
      : 'border-white/10 text-slate-400 bg-[#141420b3] hover:border-indigo-500/40 hover:text-indigo-300';
  }
  return isSelected 
    ? 'border-cyan-500 text-cyan-300 bg-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.4)] ring-2 ring-cyan-400/20' 
    : 'border-white/10 text-slate-400 bg-[#141420b3] hover:border-cyan-500/40 hover:text-cyan-300';
}

/** Position devices in a circle around the radar centre. */
function getDevicePosition(index: number, total: number, ringRadius: number) {
  const angle = (2 * Math.PI * index) / Math.max(total, 1) - Math.PI / 2;
  const x = 50 + ringRadius * Math.cos(angle);
  const y = 50 + ringRadius * Math.sin(angle);
  return { x, y };
}

export default function DeviceRadar({
  devices,
  onSelectDevice,
  selectedDeviceId,
}: DeviceRadarProps) {
  const hasDevices = devices.length > 0;

  return (
    <section id="device-radar" className="relative mx-auto w-full max-w-[280px] sm:max-w-[320px] select-none">
      {/* Radar visualization container — aspect-ratio 1:1 */}
      <div className="relative w-full" style={{ paddingBottom: '115%' }}>
        <div className="absolute inset-[7%]">
          {/* Concentric rings */}
          {[35, 55, 75].map((r) => (
            <div
              key={r}
              className="absolute rounded-full border border-white/[0.03] shadow-[0_0_20px_rgba(255,255,255,0.01)]"
              style={{
                width: `${r * 2}%`,
                height: `${r * 2}%`,
                top: `${50 - r}%`,
                left: `${50 - r}%`,
              }}
            />
          ))}

          {/* Radar sweep line */}
          <div
            className="absolute top-1/2 left-1/2 origin-bottom animate-radar-sweep"
            style={{
              width: '2px',
              height: '38%',
              transform: 'translate3d(-50%, -100%, 0)',
              background:
                'linear-gradient(to top, rgba(99,102,241,0.65), rgba(6,182,212,0.15), transparent)',
            }}
          />

          {/* Centre pulsing dot (our device) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="relative flex h-4.5 w-4.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
              <span className="relative inline-flex h-4.5 w-4.5 rounded-full bg-brand-500 shadow-[0_0_15px_rgba(99,102,241,0.8)] border border-white/20" />
            </span>
          </div>

          {/* Pulsing ring emanation */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="block h-10 w-10 animate-radar-ping rounded-full border-2 border-brand-500/25" />
          </div>

          {/* Device dots */}
          <AnimatePresence>
            {devices.map((device, i) => {
              const ring = i % 2 === 0 ? 32 : 44;
              const { x, y } = getDevicePosition(i, devices.length, ring);
              const isSelected = selectedDeviceId === device.id;

              return (
                <motion.button
                  key={device.id}
                  id={`radar-device-${device.id}`}
                  type="button"
                  onClick={() => onSelectDevice(device)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5 group z-10"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 25, delay: i * 0.08 }}
                >
                  {/* Glow ring on selected with custom platform accent colors */}
                  <span
                    className={`
                      flex items-center justify-center rounded-full p-2.5 transition-all duration-300 border backdrop-blur-md
                      group-hover:scale-110 active:scale-90
                      ${getPlatformColorClasses(device.platform, isSelected)}
                    `}
                  >
                    {platformIcon(device.platform)}
                  </span>

                  {/* Name label */}
                  <span
                    className={`
                      flex items-center gap-1 rounded-lg px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase whitespace-nowrap border border-white/5 backdrop-blur-md transition-all duration-300
                      ${isSelected ? 'bg-brand-500/15 text-brand-300 border-brand-500/30' : 'bg-black/45 text-slate-400 group-hover:text-slate-200 group-hover:bg-black/60'}
                    `}
                  >
                    {device.name}
                    {device.supports5GHz && (
                      <Wifi className="h-2.5 w-2.5 text-emerald-400 filter drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
                    )}
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>

          {/* Empty state */}
          {!hasDevices && (
            <motion.div
              id="radar-empty"
              className="absolute inset-0 flex flex-col items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Radio className="h-8 w-8 text-slate-600 animate-pulse-slow" />
              <p className="mt-3 text-xs font-bold text-slate-400 uppercase tracking-widest">
                Scanning for devices…
              </p>
              <p className="mt-1.5 text-[10px] text-slate-600 font-medium">
                Make sure receiver is open
              </p>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
