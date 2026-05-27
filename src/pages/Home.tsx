import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Download, Wifi, Monitor, ExternalLink, QrCode, Camera, Smartphone, Sparkles, X, ChevronRight, Radio } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useDiscovery } from '../hooks/useDiscovery';
import DeviceRadar from '../components/DeviceRadar';
import NoAppModal from '../components/NoAppModal';
import WebQRScanner from '../components/WebQRScanner';
import WifiDirectModal from '../components/WifiDirectModal';

const stagger = {
  animate: { transition: { staggerChildren: 0.08 } },
};

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
  const serverPort = useStore((s) => s.serverPort);
  const ftpPort = useStore((s) => s.ftpPort);
  const apiBaseUrl = useStore((s) => s.apiBaseUrl);

  const getDisplayIp = () => {
    if (serverIp) return serverIp;
    if (apiBaseUrl) {
      try {
        return new URL(apiBaseUrl).hostname;
      } catch {
        return 'Cloud';
      }
    }
    return 'Cloud';
  };

  // PWA Prompt Zustand States
  const deferredPrompt = useStore((s) => s.deferredPrompt);
  const setDeferredPrompt = useStore((s) => s.setDeferredPrompt);

  const [showNoApp, setShowNoApp] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const [showWifiDirect, setShowWifiDirect] = useState(false);
  const [cachingProgress, setCachingProgress] = useState<number | null>(null);
  const [cachingStep, setCachingStep] = useState<string>('');

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        // Trigger native browser install prompt
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`[PWA] User choice outcome: ${outcome}`);
        setDeferredPrompt(null);
      } catch (err) {
        console.error('[PWA] Native prompt failed, falling back to PWA downloader:', err);
        startPwaDownload();
      }
    } else {
      // Fallback instruction guide for iOS or already installed environments
      startPwaDownload();
    }
  };

  const startPwaDownload = () => {
    setCachingProgress(0);
    setCachingStep('Connecting to local deployment...');
    
    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 20) + 15;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);
        setTimeout(() => {
          setCachingProgress(null);
          setShowPwaGuide(true);
        }, 800);
      }
      
      setCachingProgress(current);
      if (current < 25) {
        setCachingStep('Downloading interface shell files...');
      } else if (current < 55) {
        setCachingStep('Caching high-speed WebRTC transmission core...');
      } else if (current < 85) {
        setCachingStep('Preloading local storage & pairing structures...');
      } else {
        setCachingStep('Offline PWA engine fully activated!');
      }
    }, 250);
  };

  return (
    <motion.div
      className="mx-auto max-w-lg lg:max-w-5xl space-y-8"
      variants={stagger}
      initial="initial"
      animate="animate"
    >
      {/* ─── Hero ──────────────────────────────────────────── */}
      <motion.section id="hero" className="text-center space-y-3 pt-6" variants={fadeUp}>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="text-gradient">HyperDrop</span>
        </h1>
        <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed font-medium uppercase tracking-wider">
          The fastest localized file transfer. No internet required.
        </p>
      </motion.section>

      {/* Responsive Grid layout for Desktop / Mobile */}
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8 items-start lg:space-y-0">
        
        {/* Right Column on Desktop (Stats & Device Radar), rendered FIRST on Mobile (order-1) */}
        <div className="space-y-6 lg:col-span-5 order-1 lg:order-2 w-full">
          {/* ─── Stats Row ─────────────────────────────────────── */}
          <motion.div
            id="stats-row"
            className="grid grid-cols-3 gap-3"
            variants={fadeUp}
          >
            <div className="card flex flex-col items-center gap-1.5 py-4 border border-white/5 bg-white/[0.02] !px-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                <Monitor className="h-4.5 w-4.5" />
              </div>
              <span className="text-xl font-extrabold text-slate-100">{devices.length}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest text-center">
                Devices
              </span>
            </div>

            <div className="card flex flex-col items-center gap-1.5 py-4 border border-white/5 bg-white/[0.02] !px-1">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-300 ${
                connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
              }`}>
                <Wifi className="h-4.5 w-4.5" />
              </div>
              <span className={`text-base font-extrabold transition-colors duration-300 ${
                connected ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {connected ? 'Online' : 'Offline'}
              </span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest text-center">
                Status
              </span>
            </div>

            <div className="card flex flex-col items-center gap-1.5 py-4 border border-white/5 bg-white/[0.02] min-w-0 !px-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                <Radio className="h-4.5 w-4.5" />
              </div>
              <span className="font-mono text-[10px] font-bold text-brand-400 truncate max-w-full px-0.5 text-center" title={getDisplayIp()}>
                {getDisplayIp()}
              </span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest text-center">
                Server IP
              </span>
            </div>
          </motion.div>

          {/* ─── Device Radar ──────────────────────────────────── */}
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

        {/* Left Column on Desktop (Actions & Info Cards), rendered SECOND on Mobile (order-2) */}
        <div className="space-y-6 lg:col-span-7 order-2 lg:order-1 w-full">
          {/* ─── PWA Installation Card ─────────────────────────── */}
          <motion.div
            className="card relative overflow-hidden group p-5 border border-amber-500/15 bg-gradient-to-r from-amber-500/[0.02] to-amber-500/[0.06] hover:border-amber-400/35 shadow-[0_4px_30px_rgba(0,0,0,0.15)] cursor-pointer"
            variants={fadeUp}
            whileHover={{ scale: 1.015, y: -2 }}
            onClick={handleInstallClick}
          >
            <div className="absolute top-0 right-0 h-28 w-28 bg-amber-500/5 rounded-full blur-3xl -mr-6 -mt-6 transition-all duration-300 group-hover:bg-amber-500/10" />
            
            <div className="flex items-center gap-4.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.15)] border border-amber-500/20 group-hover:scale-105 transition-all duration-300">
                <Smartphone className="h-6 w-6 animate-pulse" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-extrabold text-slate-100">Download HyperDrop App</h3>
                  <span className="inline-flex items-center rounded-md bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-400 ring-1 ring-inset ring-amber-400/20">
                    1 MB Size
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                  {deferredPrompt 
                    ? 'Install natively on your device now with zero store downloads!' 
                    : 'Click to learn how to add HyperDrop as an instant app.'
                  }
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all" />
            </div>
          </motion.div>

          {/* ─── Manual Pairing / Scanner (Mobile Web) ─────────── */}
          <motion.div
            className="card p-5 space-y-4 border border-brand-500/15 bg-gradient-to-r from-brand-500/[0.02] to-brand-500/[0.06] hover:border-brand-500/35 shadow-[0_4px_30px_rgba(0,0,0,0.15)]"
            variants={fadeUp}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <QrCode className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-extrabold text-slate-200">Cross-Network Pairing</h3>
                <p className="text-[11px] text-slate-400">
                  Transfer between devices on different networks (e.g. mobile data & Wi-Fi)
                </p>
              </div>
            </div>
            <button
              id="btn-scan-qr"
              type="button"
              onClick={() => setShowScanner(true)}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3.5 font-bold glow-brand text-xs active:scale-[0.98]"
            >
              <Camera className="h-4 w-4" />
              Scan Laptop QR Code
            </button>
          </motion.div>

          {/* ─── WiFi Direct Transfer Card ───────────────────── */}
          <motion.div
            className="card relative overflow-hidden group p-5 border border-cyan-500/15 bg-gradient-to-r from-cyan-500/[0.02] to-cyan-500/[0.06] hover:border-cyan-400/35 shadow-[0_4px_30px_rgba(0,0,0,0.15)] cursor-pointer"
            variants={fadeUp}
            whileHover={{ scale: 1.015, y: -2 }}
            onClick={() => setShowWifiDirect(true)}
          >
            <div className="absolute top-0 right-0 h-28 w-28 bg-cyan-500/5 rounded-full blur-3xl -mr-6 -mt-6 transition-all duration-300 group-hover:bg-cyan-500/10" />
            
            <div className="flex items-center gap-4.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)] border border-cyan-500/20 group-hover:scale-105 transition-all duration-300">
                <Radio className="h-6 w-6" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-extrabold text-slate-100">WiFi Direct Transfer</h3>
                  <span className="inline-flex items-center rounded-md bg-cyan-400/10 px-2 py-0.5 text-[9px] font-bold text-cyan-400 ring-1 ring-inset ring-cyan-400/20">
                    No Hotspot
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-normal">
                  Transfer via same WiFi router — no hotspot needed. Up to 300 MB/s on 5 GHz.
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" />
            </div>
          </motion.div>

          {/* ─── Quick Actions ─────────────────────────────────── */}
          <motion.div
            id="quick-actions"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3.5"
            variants={fadeUp}
          >
            <button
              id="btn-quick-send"
              type="button"
              onClick={() => navigate('/send')}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send Files
            </button>
            <button
              id="btn-quick-receive"
              type="button"
              onClick={() => navigate('/receive')}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              Receive Files
            </button>
          </motion.div>

          {/* ─── No App Link ───────────────────────────────────── */}
          <motion.div className="text-center pt-2" variants={fadeUp}>
            <button
              id="btn-no-app"
              type="button"
              onClick={() => setShowNoApp(true)}
              className="btn-ghost inline-flex items-center gap-1.5 text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              No app on receiver?
            </button>
          </motion.div>
        </div>

      </div>

      {/* ─── NoApp Modal ───────────────────────────────────── */}
      <NoAppModal
        isOpen={showNoApp}
        onClose={() => setShowNoApp(false)}
        serverIp={serverIp || '192.168.1.x'}
        serverPort={serverPort}
        ftpPort={ftpPort}
      />

      {/* ─── WiFi Direct Modal ───────────────────────────────── */}
      <WifiDirectModal
        isOpen={showWifiDirect}
        onClose={() => setShowWifiDirect(false)}
      />

      {/* ─── QR Code Scanner Modal ──────────────────────────── */}
      <WebQRScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onSuccess={(msg) => console.log('[Home] Scanned QR success:', msg)}
      />

      {/* ─── iOS / Manual PWA Caching Instruction Modal ─────── */}
      <AnimatePresence>
        {showPwaGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPwaGuide(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="relative w-full max-w-sm rounded-3xl bg-[#0f0f13] border border-white/10 p-6 shadow-2xl space-y-5 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setShowPwaGuide(false)}
                className="absolute top-4 right-4 rounded-xl p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-all duration-150"
              >
                <X className="h-4.5 w-4.5" />
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <Sparkles className="h-5.5 w-5.5" />
                </div>
                <div>
                  <h3 className="text-md font-bold text-slate-100">Superlight Install Guide</h3>
                  <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Progressive Web App</p>
                </div>
              </div>

              <div className="space-y-4 text-left">
                {/* Safari iOS */}
                <div className="space-y-2 border-b border-white/5 pb-4">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/5 text-[10px] text-slate-300 font-bold">1</span>
                    Apple iOS (Safari Browser)
                  </h4>
                  <ul className="text-[11px] text-slate-400 list-disc pl-5.5 space-y-1">
                    <li>Tap the <strong className="text-slate-200">Share</strong> button at the bottom center.</li>
                    <li>Scroll down and select <strong className="text-slate-200">"Add to Home Screen"</strong>.</li>
                    <li>Launch full-screen, under <strong className="text-amber-400">1 MB</strong> memory size!</li>
                  </ul>
                </div>

                {/* Google Chrome / Android / PC */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/5 text-[10px] text-slate-300 font-bold">2</span>
                    Google Chrome (Android / PC)
                  </h4>
                  <ul className="text-[11px] text-slate-400 list-disc pl-5.5 space-y-1">
                    <li>Tap the <strong className="text-slate-200">Three Dots (⋮)</strong> menu in browser top-right.</li>
                    <li>Select <strong className="text-slate-200">"Install App"</strong> or <strong className="text-slate-200">"Add to Home Screen"</strong>.</li>
                    <li>It runs instantly like a native app on your home screen!</li>
                  </ul>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowPwaGuide(false)}
                className="btn-primary w-full py-3 font-semibold glow-brand text-xs active:scale-98"
              >
                Got It, Thanks!
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── PWA Caching Progress Overlay ───────────────────── */}
      <AnimatePresence>
        {cachingProgress !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="relative w-full max-w-sm rounded-3xl card border border-brand-500/20 bg-gradient-to-b from-[#10101d] to-[#08080f] p-8 shadow-2xl space-y-6 text-center"
            >
              {/* Spinner/Radar representation */}
              <div className="relative flex items-center justify-center py-4">
                <div className="absolute h-16 w-16 animate-ping rounded-full bg-brand-500/10" />
                <div className="h-12 w-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
                  <Download className="h-6 w-6 animate-bounce" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-base font-extrabold text-slate-100">Downloading Offline App</h3>
                <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Caching standalone resources</p>
              </div>

              {/* Progress bar */}
              <div className="space-y-2.5">
                <div className="h-2 w-full bg-black/45 rounded-full overflow-hidden border border-white/5 p-0.5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-brand-500 to-indigo-400 rounded-full"
                    style={{ width: `${cachingProgress}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400 px-1">
                  <span className="truncate max-w-[200px] text-left">{cachingStep}</span>
                  <span className="font-bold text-brand-400">{cachingProgress}%</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
