import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon,
  Wifi,
  HardDrive,
  Zap,
  Shield,
  Info,
  Monitor,
  Smartphone,
  ChevronDown,
} from 'lucide-react';
import { useStore } from '../store/useStore';

// ─── Animation Variants ──────────────────────────────────────────────

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

// ─── Types ────────────────────────────────────────────────────────────

interface SettingOption {
  label: string;
  value: string;
  description?: string;
}

// ─── Component ────────────────────────────────────────────────────────

export default function Settings() {
  const serverIp = useStore((s) => s.serverIp);
  const serverPort = useStore((s) => s.serverPort);
  const ftpPort = useStore((s) => s.ftpPort);
  const connected = useStore((s) => s.connected);

  // Local settings state (persisted to localStorage)
  const [deviceName, setDeviceName] = useState('');
  const [chunkSize, setChunkSize] = useState('8');
  const [parallelStreams, setParallelStreams] = useState('6');
  const [autoAccept, setAutoAccept] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      setDeviceName(localStorage.getItem('hyperdrop-device-name') || '');
      setChunkSize(localStorage.getItem('hyperdrop-chunk-size') || '8');
      setParallelStreams(localStorage.getItem('hyperdrop-parallel-streams') || '6');
      setAutoAccept(localStorage.getItem('hyperdrop-auto-accept') === 'true');
    } catch {
      // Ignore
    }
  }, []);

  // Persist settings to localStorage
  const saveSetting = (key: string, value: string) => {
    try {
      localStorage.setItem(`hyperdrop-${key}`, value);
    } catch {
      // Ignore
    }
  };

  const chunkSizeOptions: SettingOption[] = [
    { label: '512 KB', value: '0.5', description: 'Slow networks / hotspot' },
    { label: '2 MB', value: '2', description: '2.4 GHz WiFi' },
    { label: '4 MB', value: '4', description: 'Standard' },
    { label: '8 MB', value: '8', description: '5 GHz WiFi (default)' },
    { label: '16 MB', value: '16', description: 'Gigabit LAN' },
  ];

  const streamOptions: SettingOption[] = [
    { label: '1 stream', value: '1', description: 'Most reliable' },
    { label: '2 streams', value: '2', description: 'Slow networks' },
    { label: '4 streams', value: '4', description: 'Balanced' },
    { label: '6 streams', value: '6', description: 'Fast (default)' },
    { label: '8 streams', value: '8', description: 'Maximum speed' },
  ];

  return (
    <motion.div
      className="mx-auto max-w-lg space-y-6"
      variants={stagger}
      initial="initial"
      animate="animate"
    >
      {/* ─── Header ──────────────────────────────────────────── */}
      <motion.section className="space-y-1 pt-4" variants={fadeUp}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
            <SettingsIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-100">Settings</h1>
            <p className="text-[11px] text-slate-500 font-medium">Configure transfer behavior</p>
          </div>
        </div>
      </motion.section>

      {/* ─── Network Info Card ────────────────────────────────── */}
      <motion.div
        className="card p-5 space-y-4 border border-white/5 bg-white/[0.02]"
        variants={fadeUp}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
            connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}>
            <Wifi className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">Network Status</h3>
            <p className={`text-[11px] font-semibold ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {connected ? 'Connected to local server' : 'Disconnected'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-black/30 p-3 text-center border border-white/5">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">Server IP</p>
            <p className="font-mono text-xs text-brand-400 truncate">{serverIp || '—'}</p>
          </div>
          <div className="rounded-xl bg-black/30 p-3 text-center border border-white/5">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">HTTP Port</p>
            <p className="font-mono text-xs text-slate-300">{serverPort}</p>
          </div>
          <div className="rounded-xl bg-black/30 p-3 text-center border border-white/5">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">FTP Port</p>
            <p className="font-mono text-xs text-slate-300">{ftpPort}</p>
          </div>
        </div>
      </motion.div>

      {/* ─── Device Identity ─────────────────────────────────── */}
      <motion.div
        className="card p-5 space-y-4 border border-white/5 bg-white/[0.02]"
        variants={fadeUp}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
            <Monitor className="h-4.5 w-4.5" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">Device Identity</h3>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] text-slate-400 font-semibold">Custom Device Name</label>
          <input
            type="text"
            value={deviceName}
            onChange={(e) => {
              setDeviceName(e.target.value);
              saveSetting('device-name', e.target.value);
            }}
            placeholder="e.g. Loki's Laptop"
            className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500/30 transition-all"
          />
        </div>
      </motion.div>

      {/* ─── Transfer Configuration ──────────────────────────── */}
      <motion.div
        className="card p-5 space-y-5 border border-white/5 bg-white/[0.02]"
        variants={fadeUp}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <Zap className="h-4.5 w-4.5" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">Transfer Engine</h3>
        </div>

        {/* Chunk Size */}
        <div className="space-y-2">
          <label className="text-[11px] text-slate-400 font-semibold">Chunk Size</label>
          <div className="relative">
            <select
              value={chunkSize}
              onChange={(e) => {
                setChunkSize(e.target.value);
                saveSetting('chunk-size', e.target.value);
              }}
              className="w-full appearance-none rounded-xl bg-black/30 border border-white/10 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500/30 transition-all pr-10"
            >
              {chunkSizeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Parallel Streams */}
        <div className="space-y-2">
          <label className="text-[11px] text-slate-400 font-semibold">Parallel Streams</label>
          <div className="relative">
            <select
              value={parallelStreams}
              onChange={(e) => {
                setParallelStreams(e.target.value);
                saveSetting('parallel-streams', e.target.value);
              }}
              className="w-full appearance-none rounded-xl bg-black/30 border border-white/10 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500/30 transition-all pr-10"
            >
              {streamOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Auto Accept */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-200">Auto-accept transfers</p>
            <p className="text-[11px] text-slate-500">Skip approval popup for incoming files</p>
          </div>
          <button
            onClick={() => {
              const next = !autoAccept;
              setAutoAccept(next);
              saveSetting('auto-accept', String(next));
            }}
            className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
              autoAccept ? 'bg-brand-500' : 'bg-white/10'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                autoAccept ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </motion.div>

      {/* ─── Security ────────────────────────────────────────── */}
      <motion.div
        className="card p-5 space-y-3 border border-white/5 bg-white/[0.02]"
        variants={fadeUp}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <Shield className="h-4.5 w-4.5" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">Privacy & Security</h3>
        </div>

        <div className="space-y-2 text-[11px] text-slate-400 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>All transfers happen <strong className="text-slate-200">locally</strong> — zero cloud, zero internet</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>No analytics, no telemetry, no data collection</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>SHA-256 checksum validation on every chunk</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-400 mt-0.5">✓</span>
            <span>Works in <strong className="text-slate-200">airplane mode</strong> with WiFi ON</span>
          </div>
        </div>
      </motion.div>

      {/* ─── About ───────────────────────────────────────────── */}
      <motion.div
        className="card p-5 space-y-3 border border-white/5 bg-white/[0.02]"
        variants={fadeUp}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-500/10 text-slate-400">
            <Info className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-200">HyperDrop</h3>
            <p className="text-[11px] text-slate-500 font-mono">v2.0.0 — Offline Build</p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          The fastest offline file transfer. Built for speed, privacy, and zero-friction local file sharing across all devices.
        </p>
      </motion.div>

      {/* Bottom spacing for mobile nav */}
      <div className="h-6" />
    </motion.div>
  );
}
