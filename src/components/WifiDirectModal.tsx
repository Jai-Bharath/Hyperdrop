import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Wifi, Copy, Check, Globe, Smartphone, Monitor,
  Signal, Share2, Zap, ArrowRight, Upload, ChevronDown,
  WifiOff, Loader2, QrCode, Router
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import QRCodeDisplay from './QRCodeDisplay';
import { joinPairingRoom } from '../hooks/useSocket';

interface WifiDirectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Connection State Machine ────────────────────────────────
type ConnectionPhase = 'detecting' | 'ready' | 'paired' | 'no-server';

export default function WifiDirectModal({ isOpen, onClose }: WifiDirectModalProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<ConnectionPhase>('detecting');
  const [showQR, setShowQR] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [enteredCode, setEnteredCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const pairCodeRef = useRef('');

  const serverIp = useStore((s) => s.serverIp);
  const serverPort = useStore((s) => s.serverPort);
  const connected = useStore((s) => s.connected);
  const devices = useStore((s) => s.devices);
  const selectDevice = useStore((s) => s.selectDevice);

  // Build direct URL
  let directUrl = '';
  if (serverIp) {
    const port = window.location.port || '5173';
    directUrl = `http://${serverIp}:${port}`;
  }

  // Generate room code on open
  if (isOpen && !pairCodeRef.current) {
    pairCodeRef.current = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // ── Phase Detection ──
  useEffect(() => {
    if (!isOpen) return;

    if (devices.length > 0) {
      setPhase('paired');
    } else if (serverIp && connected) {
      setPhase('ready');
    } else if (connected && !serverIp) {
      // Connected to cloud but no local server
      const timer = setTimeout(() => setPhase('no-server'), 3000);
      return () => clearTimeout(timer);
    } else {
      setPhase('detecting');
    }
  }, [isOpen, serverIp, connected, devices.length]);

  // ── Join pairing room on open ──
  useEffect(() => {
    if (isOpen && pairCodeRef.current) {
      joinPairingRoom(pairCodeRef.current);
    }
  }, [isOpen]);

  // ── Ping measurement ──
  useEffect(() => {
    if (!isOpen || !serverIp) return;
    const measurePing = async () => {
      try {
        const start = performance.now();
        const res = await fetch(`http://${serverIp}:${serverPort || 3001}/healthz`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          setPingMs(Math.round(performance.now() - start));
        }
      } catch {
        setPingMs(null);
      }
    };
    measurePing();
    const interval = setInterval(measurePing, 5000);
    return () => clearInterval(interval);
  }, [isOpen, serverIp, serverPort]);

  // ── Reset on open ──
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setShowQR(false);
      setShowManual(false);
      setEnteredCode('');
      setIsJoining(false);
    } else {
      pairCodeRef.current = '';
    }
  }, [isOpen]);

  const copyUrl = useCallback(async () => {
    if (!directUrl) return;
    try {
      await navigator.clipboard.writeText(directUrl);
    } catch {
      const el = document.createElement('textarea');
      el.value = directUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [directUrl]);

  const shareUrl = useCallback(async () => {
    if (!directUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'HyperDrop — WiFi Transfer',
          text: 'Open this on your other device to transfer files instantly:',
          url: directUrl,
        });
      } catch { /* cancelled */ }
    } else {
      copyUrl();
    }
  }, [directUrl, copyUrl]);

  const handleJoinRoom = useCallback(() => {
    const code = enteredCode.trim().toUpperCase();
    if (code.length !== 6) return;
    setIsJoining(true);
    joinPairingRoom(code);
    setTimeout(() => setIsJoining(false), 5000);
  }, [enteredCode]);

  const handleStartTransfer = useCallback(() => {
    if (devices.length > 0) {
      selectDevice(devices[0]);
      onClose();
      navigate('/send');
    }
  }, [devices, selectDevice, onClose, navigate]);

  const getQualityLabel = () => {
    if (!pingMs) return null;
    if (pingMs < 5) return { label: 'Excellent', color: '#34d399', desc: '100+ MB/s possible' };
    if (pingMs < 15) return { label: 'Great', color: '#a78bfa', desc: '50-100 MB/s' };
    if (pingMs < 50) return { label: 'Good', color: '#fbbf24', desc: '20-50 MB/s' };
    return { label: 'Fair', color: '#f87171', desc: '5-20 MB/s' };
  };

  const quality = getQualityLabel();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="wifi-direct-modal-backdrop"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

          {/* Modal — Sheet on mobile, centered on desktop */}
          <motion.div
            id="wifi-direct-modal"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-[28px] sm:rounded-[28px] bg-[#0c0c12] border border-white/[0.06] shadow-[0_-8px_60px_rgba(0,0,0,0.6)] sm:shadow-2xl max-h-[92vh] overflow-y-auto"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            {/* ── Grab Handle (mobile) ── */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-white/10" />
            </div>

            {/* ── Ambient Glow ── */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-40 w-72 bg-cyan-500/8 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative p-5 sm:p-6 space-y-5">
              {/* ── Header ── */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/15 to-blue-500/15 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                    <Wifi className="h-5.5 w-5.5 text-cyan-400" />
                    {phase === 'paired' && (
                      <motion.div
                        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-[#0c0c12] flex items-center justify-center"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                      >
                        <Check className="h-2.5 w-2.5 text-white" />
                      </motion.div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">WiFi Direct</h2>
                    <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">
                      {phase === 'paired'
                        ? `${devices.length} device${devices.length !== 1 ? 's' : ''} connected`
                        : phase === 'ready'
                        ? 'Ready to pair'
                        : phase === 'no-server'
                        ? 'Local server needed'
                        : 'Scanning network…'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl p-2 text-slate-600 hover:bg-white/5 hover:text-slate-400 transition-all"
                  aria-label="Close"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* ── Live Connection Visual ── */}
              <div className="relative flex items-center justify-center py-6">
                {/* Radar pulses */}
                {phase !== 'no-server' && (
                  <>
                    <motion.div
                      className="absolute h-32 w-32 rounded-full border border-cyan-500/10"
                      animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                    />
                    <motion.div
                      className="absolute h-32 w-32 rounded-full border border-cyan-500/10"
                      animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.7 }}
                    />
                  </>
                )}

                {/* Device icons with connection line */}
                <div className="relative flex items-center gap-6 z-10">
                  {/* This device */}
                  <motion.div
                    className="flex flex-col items-center gap-1.5"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-indigo-500/15 border border-brand-500/20 shadow-lg shadow-brand-500/10">
                      <Monitor className="h-7 w-7 text-brand-400" />
                    </div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">You</span>
                  </motion.div>

                  {/* Connection line */}
                  <div className="flex items-center gap-1.5 relative">
                    <div className="h-px w-8 bg-gradient-to-r from-brand-500/40 to-transparent" />
                    <motion.div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                        phase === 'paired'
                          ? 'bg-emerald-500/15 border-emerald-500/25'
                          : phase === 'ready'
                          ? 'bg-cyan-500/10 border-cyan-500/20'
                          : 'bg-white/5 border-white/10'
                      }`}
                      animate={phase === 'detecting' ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      {phase === 'paired' ? (
                        <Zap className="h-5 w-5 text-emerald-400" />
                      ) : phase === 'no-server' ? (
                        <WifiOff className="h-5 w-5 text-red-400" />
                      ) : (
                        <Router className="h-5 w-5 text-cyan-400" />
                      )}
                    </motion.div>
                    <div className="h-px w-8 bg-gradient-to-l from-emerald-500/40 to-transparent" />

                    {/* Speed shimmer on connection line */}
                    {phase === 'paired' && (
                      <motion.div
                        className="absolute inset-0 h-px top-1/2 -translate-y-1/2 bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
                        animate={{ x: [-80, 80] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                        style={{ width: '40px' }}
                      />
                    )}
                  </div>

                  {/* Other device */}
                  <motion.div
                    className="flex flex-col items-center gap-1.5"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border shadow-lg transition-all duration-500 ${
                      phase === 'paired'
                        ? 'bg-gradient-to-br from-emerald-500/15 to-green-500/15 border-emerald-500/20 shadow-emerald-500/10'
                        : 'bg-white/[0.03] border-white/10 shadow-black/20'
                    }`}>
                      <Smartphone className={`h-7 w-7 transition-colors duration-500 ${
                        phase === 'paired' ? 'text-emerald-400' : 'text-slate-600'
                      }`} />
                    </div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                      {phase === 'paired' && devices[0] ? devices[0].name.split(' ')[0] : 'Phone'}
                    </span>
                  </motion.div>
                </div>
              </div>

              {/* ── Network Quality Badge ── */}
              {quality && phase !== 'no-server' && (
                <motion.div
                  className="flex items-center justify-center gap-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <div className="flex items-center gap-2 rounded-full px-4 py-1.5 bg-white/[0.03] border border-white/[0.06]">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4].map((bar) => (
                        <div
                          key={bar}
                          className="w-1 rounded-full transition-all duration-300"
                          style={{
                            height: `${8 + bar * 3}px`,
                            backgroundColor: (pingMs && pingMs < bar * 15) ? quality.color : 'rgba(255,255,255,0.08)',
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-bold" style={{ color: quality.color }}>
                      {quality.label}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      {pingMs}ms · {quality.desc}
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ── Phase-Specific Content ── */}
              <AnimatePresence mode="wait">
                {/* ── PAIRED: Show transfer button ── */}
                {phase === 'paired' && (
                  <motion.div
                    key="paired"
                    className="space-y-3"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                  >
                    {/* Success banner */}
                    <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/8 border border-emerald-500/15 p-4">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15">
                        <Check className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-emerald-300">Connected!</p>
                        <p className="text-[11px] text-emerald-400/60 truncate">
                          {devices.map(d => d.name).join(', ')}
                        </p>
                      </div>
                    </div>

                    {/* Transfer button */}
                    <motion.button
                      type="button"
                      onClick={handleStartTransfer}
                      className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.98]"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Upload className="h-5 w-5" />
                      Send Files Now
                      <ArrowRight className="h-4 w-4" />
                    </motion.button>
                  </motion.div>
                )}

                {/* ── READY: Show QR + share options ── */}
                {phase === 'ready' && (
                  <motion.div
                    key="ready"
                    className="space-y-3"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                  >
                    {/* Quick share buttons */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <motion.button
                        type="button"
                        onClick={shareUrl}
                        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all active:scale-[0.97]"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <Share2 className="h-4 w-4" />
                        Share Link
                      </motion.button>
                      <button
                        type="button"
                        onClick={copyUrl}
                        className="flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] text-slate-300 font-bold text-xs transition-all active:scale-[0.97]"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy URL
                          </>
                        )}
                      </button>
                    </div>

                    {/* URL display + QR toggle */}
                    <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                      {/* URL bar */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <Globe className="h-4 w-4 text-cyan-400 shrink-0" />
                        <p className="text-xs font-mono text-cyan-400/80 truncate flex-1">{directUrl}</p>
                        <button
                          type="button"
                          onClick={() => setShowQR(!showQR)}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                            showQR
                              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20'
                              : 'bg-white/5 text-slate-400 border border-white/5 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <QrCode className="h-3 w-3" />
                          QR
                          <ChevronDown className={`h-3 w-3 transition-transform ${showQR ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {/* QR Code (expandable) */}
                      <AnimatePresence>
                        {showQR && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="overflow-hidden"
                          >
                            <div className="flex flex-col items-center gap-3 px-4 pb-4 pt-1 border-t border-white/[0.04]">
                              <div className="rounded-xl bg-[#09090d] p-3 border border-white/[0.06]">
                                <QRCodeDisplay url={directUrl} size={140} />
                              </div>
                              <p className="text-[10px] text-slate-600">
                                Scan with phone camera to connect instantly
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Room code section (collapsible) */}
                    <button
                      type="button"
                      onClick={() => setShowManual(!showManual)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <Signal className="h-4 w-4 text-slate-500" />
                        <span className="text-xs font-semibold text-slate-400">
                          Enter Room Code Instead
                        </span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-slate-600 transition-transform ${showManual ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showManual && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex gap-2 pt-1">
                            <input
                              type="text"
                              maxLength={6}
                              placeholder="ABCDEF"
                              value={enteredCode}
                              onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
                              className="flex-1 text-center font-mono text-lg font-extrabold tracking-[0.3em] bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-brand-400 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/15 transition-all uppercase placeholder-slate-700"
                            />
                            <button
                              type="button"
                              disabled={isJoining || enteredCode.length !== 6}
                              onClick={handleJoinRoom}
                              className="px-5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs transition-all active:scale-95 disabled:cursor-not-allowed"
                            >
                              {isJoining ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
                            </button>
                          </div>
                          {/* Show this device's code */}
                          <p className="text-[10px] text-slate-600 text-center mt-2">
                            Your room code: <span className="font-mono font-bold text-slate-500">{pairCodeRef.current}</span>
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}

                {/* ── NO SERVER: Setup instructions ── */}
                {phase === 'no-server' && (
                  <motion.div
                    key="no-server"
                    className="space-y-4"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                  >
                    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] p-6 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/15">
                        <WifiOff className="h-7 w-7 text-amber-400" />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-bold text-slate-200">Local Server Required</p>
                        <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
                          WiFi Direct transfers files through your local WiFi router at 100+ MB/s. Run the server on your laptop to enable this.
                        </p>
                      </div>

                      <div className="w-full rounded-xl bg-black/40 border border-white/[0.06] p-4 text-left space-y-3">
                        <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-[0.15em]">Quick Setup</p>
                        {[
                          { step: '1', text: 'Open terminal on your laptop' },
                          { step: '2', text: <>Run <code className="text-cyan-400 font-mono bg-white/5 px-1.5 py-0.5 rounded">npm run dev</code></> },
                          { step: '3', text: <>Open <code className="text-cyan-400 font-mono bg-white/5 px-1.5 py-0.5 rounded">http://your-ip:5173</code> on both devices</> },
                        ].map(({ step, text }) => (
                          <div key={step} className="flex items-start gap-2.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/5 text-[10px] text-slate-400 font-bold">
                              {step}
                            </span>
                            <p className="text-[11px] text-slate-400 leading-normal">{text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* ── DETECTING: Loading state ── */}
                {phase === 'detecting' && (
                  <motion.div
                    key="detecting"
                    className="flex flex-col items-center gap-3 py-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Loader2 className="h-6 w-6 text-cyan-400 animate-spin" />
                    <p className="text-xs text-slate-500 font-medium">Scanning network for devices…</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Bottom Action ── */}
              <button
                type="button"
                onClick={phase === 'paired' ? handleStartTransfer : onClose}
                className={`w-full py-3.5 rounded-2xl font-bold text-xs transition-all active:scale-[0.98] ${
                  phase === 'paired'
                    ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {phase === 'paired' ? 'Start Transferring →' : 'Close'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
