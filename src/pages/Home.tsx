import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Send, Download, Wifi, Monitor, Zap, Smartphone,
  ChevronRight, Check, ArrowUpRight
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useDiscovery } from '../hooks/useDiscovery';
import DeviceRadar from '../components/DeviceRadar';
import DropZone from '../components/DropZone';
import WifiDirectModal from '../components/WifiDirectModal';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const navigate = useNavigate();
  const { devices } = useDiscovery();
  const selectDevice = useStore((s) => s.selectDevice);
  const connected = useStore((s) => s.connected);
  const serverIp = useStore((s) => s.serverIp);
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);

  // PWA
  const deferredPrompt = useStore((s) => s.deferredPrompt);
  const setDeferredPrompt = useStore((s) => s.setDeferredPrompt);

  const [showWifiDirect, setShowWifiDirect] = useState(false);
  const [pwaInstalled, setPwaInstalled] = useState(false);

  const getDisplayIp = () => {
    if (serverIp) return serverIp;
    if (apiBaseUrl) {
      try { return new URL(apiBaseUrl).hostname; } catch { return 'Cloud'; }
    }
    return 'Cloud';
  };

  const handleInstallPwa = useCallback(async () => {
    if (deferredPrompt) {
      try {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setPwaInstalled(true);
        setDeferredPrompt(null);
      } catch { /* ignore */ }
    }
  }, [deferredPrompt, setDeferredPrompt]);

  return (
    <motion.div
      className="mx-auto max-w-lg lg:max-w-5xl space-y-5"
      initial="initial"
      animate="animate"
    >
      {/* ─── Hero ──────────────────────────────────────────── */}
      <motion.section id="hero" className="text-center space-y-2 pt-4" variants={fadeUp}>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="text-gradient">HyperDrop</span>
        </h1>
        <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-[0.2em]">
          Instant file transfer · No internet required
        </p>
      </motion.section>

      {/* ─── Drop Zone (Hero Position) ──────────────────────── */}
      <DropZone />

      {/* ─── Main Grid ─────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6 items-start">

        {/* ── Right: Device Radar (shows first on mobile) ── */}
        <div className="space-y-5 lg:col-span-5 order-1 lg:order-2 w-full">

          {/* Stats — compact single row */}
          <motion.div
            id="stats-row"
            className="flex items-center gap-2.5"
            variants={fadeUp}
          >
            {/* Devices count */}
            <div className="flex-1 flex items-center gap-2.5 rounded-2xl bg-white/[0.02] border border-white/[0.04] px-3.5 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10">
                <Monitor className="h-4 w-4 text-brand-400" />
              </div>
              <div>
                <span className="text-lg font-extrabold text-white leading-none">{devices.length}</span>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Devices</p>
              </div>
            </div>

            {/* Server IP */}
            <div className="flex-1 flex items-center gap-2.5 rounded-2xl bg-white/[0.02] border border-white/[0.04] px-3.5 py-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                connected ? 'bg-emerald-500/10' : 'bg-red-500/10'
              }`}>
                <Wifi className={`h-4 w-4 ${connected ? 'text-emerald-400' : 'text-red-400'}`} />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-mono font-bold text-slate-300 truncate block leading-tight" title={getDisplayIp()}>
                  {getDisplayIp()}
                </span>
                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">
                  {connected ? 'Connected' : 'Offline'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Device Radar */}
          <motion.div variants={fadeUp}>
            <DeviceRadar
              devices={devices}
              onSelectDevice={(device) => {
                selectDevice(device);
                navigate('/send');
              }}
            />
          </motion.div>
        </div>

        {/* ── Left: Actions column ── */}
        <div className="space-y-4 lg:col-span-7 order-2 lg:order-1 w-full">

          {/* ─── WiFi Direct Card (HERO feature) ─────────── */}
          <motion.div
            className="relative overflow-hidden rounded-3xl cursor-pointer group"
            variants={fadeUp}
            whileHover={{ scale: 1.01, y: -2 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowWifiDirect(true)}
          >
            {/* Background layers */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/12 via-blue-600/8 to-indigo-600/12" />
            <div className="absolute inset-0 border border-cyan-500/15 rounded-3xl group-hover:border-cyan-400/30 transition-all duration-500" />
            <div className="absolute top-0 right-0 h-28 w-28 bg-cyan-500/10 rounded-full blur-3xl -mr-6 -mt-6 group-hover:bg-cyan-400/15 transition-all duration-700" />

            <div className="relative p-5 sm:p-6 space-y-3.5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/15 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                    <Wifi className="h-6 w-6 text-cyan-400" />
                    <motion.div
                      className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-cyan-400"
                      animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-extrabold text-white tracking-tight">WiFi Direct Transfer</h3>
                    <p className="text-[10px] text-cyan-400/50 font-semibold mt-0.5">
                      Same WiFi · No Hotspot · No Internet
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-cyan-500/30 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all mt-1" />
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/12 px-2.5 py-0.5 text-[9px] font-bold text-cyan-400">
                  <Zap className="h-2.5 w-2.5" /> 100+ MB/s
                </span>
                <span className="inline-flex items-center rounded-full bg-white/[0.03] border border-white/[0.05] px-2.5 py-0.5 text-[9px] font-bold text-slate-500">
                  2.4 & 5 GHz
                </span>
                {devices.length > 0 && (
                  <motion.span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/12 px-2.5 py-0.5 text-[9px] font-bold text-emerald-400"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <Check className="h-2.5 w-2.5" /> {devices.length} device{devices.length !== 1 ? 's' : ''}
                  </motion.span>
                )}
              </div>
            </div>
          </motion.div>

          {/* ─── Quick Actions Row ────────────────────────── */}
          <motion.div
            id="quick-actions"
            className="grid grid-cols-2 gap-3"
            variants={fadeUp}
          >
            <button
              id="btn-quick-send"
              type="button"
              onClick={() => navigate('/send')}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 p-[1px] shadow-lg shadow-brand-500/15 hover:shadow-brand-500/30 transition-all active:scale-[0.97]"
            >
              <div className="flex items-center justify-center gap-2.5 rounded-[15px] bg-gradient-to-br from-brand-600 to-brand-500 px-5 py-4">
                <Send className="h-4.5 w-4.5 text-white" />
                <span className="text-sm font-bold text-white">Send Files</span>
              </div>
            </button>

            <button
              id="btn-quick-receive"
              type="button"
              onClick={() => navigate('/receive')}
              className="group relative overflow-hidden rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-brand-500/20 transition-all active:scale-[0.97] shadow-lg shadow-black/10"
            >
              <div className="flex items-center justify-center gap-2.5 px-5 py-4">
                <Download className="h-4.5 w-4.5 text-slate-300" />
                <span className="text-sm font-bold text-slate-300">Receive</span>
              </div>
            </button>
          </motion.div>

          {/* ─── Utility Row: Install App + Browse ── */}
          <motion.div 
            className={`grid gap-3 ${!pwaInstalled ? 'grid-cols-2' : 'grid-cols-1'}`}
            variants={fadeUp}
          >

            {/* Install App */}
            {!pwaInstalled && (
              <button
                type="button"
                onClick={handleInstallPwa}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-amber-500/20 px-4 py-3.5 transition-all active:scale-[0.97]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/12">
                  <Smartphone className="h-4.5 w-4.5 text-amber-400" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[11px] font-bold text-slate-300 leading-tight">Install App</p>
                  <p className="text-[9px] text-slate-600 leading-tight">1 MB · Offline ready</p>
                </div>
              </button>
            )}

            {/* Browse Files */}
            <a
              href={serverIp ? `http://${serverIp}:3001/browse` : 'http://localhost:3001/browse'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-emerald-500/20 px-4 py-3.5 transition-all active:scale-[0.97]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/12">
                <ArrowUpRight className="h-4.5 w-4.5 text-emerald-400" />
              </div>
              <div className="text-left min-w-0">
                <p className="text-[11px] font-bold text-slate-300 leading-tight">Browse Files</p>
                <p className="text-[9px] text-slate-600 leading-tight">Saved downloads</p>
              </div>
            </a>
          </motion.div>

        </div>
      </div>

      {/* ─── Modals ────────────────────────────────────────── */}
      <WifiDirectModal isOpen={showWifiDirect} onClose={() => setShowWifiDirect(false)} />
    </motion.div>
  );
}
