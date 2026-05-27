import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wifi, Copy, Check, Globe, ArrowRight, Smartphone, Monitor, Signal, Share2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import QRCodeDisplay from './QRCodeDisplay';

interface WifiDirectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WifiDirectModal({ isOpen, onClose }: WifiDirectModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const serverIp = useStore((s) => s.serverIp);
  const serverPort = useStore((s) => s.serverPort);
  const connected = useStore((s) => s.connected);
  const devices = useStore((s) => s.devices);

  // Build the direct connection URL
  let directUrl = '';
  if (serverIp) {
    const port = window.location.port || '5173';
    directUrl = `http://${serverIp}:${port}`;
  }

  // Auto-advance to step 2 when server IP is detected
  useEffect(() => {
    if (isOpen && serverIp && activeStep === 0) {
      setActiveStep(1);
    }
  }, [isOpen, serverIp, activeStep]);

  // Auto-advance to step 3 when a device connects
  useEffect(() => {
    if (isOpen && devices.length > 0 && activeStep < 2) {
      setActiveStep(2);
    }
  }, [isOpen, devices.length, activeStep]);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveStep(serverIp ? 1 : 0);
      setCopied(false);
    }
  }, [isOpen, serverIp]);

  const copyUrl = async () => {
    if (!directUrl) return;
    try {
      await navigator.clipboard.writeText(directUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = directUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareUrl = async () => {
    if (!directUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'HyperDrop – WiFi Direct Transfer',
          text: 'Open this link on the other device to start transferring files:',
          url: directUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      copyUrl();
    }
  };

  const steps = [
    {
      icon: Wifi,
      title: 'Connect to Same WiFi',
      desc: 'Both devices must be on the same WiFi router network',
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
    },
    {
      icon: Globe,
      title: 'Share the Link',
      desc: 'Open HyperDrop on the other device using the link below',
      color: 'text-brand-400',
      bg: 'bg-brand-500/10',
      border: 'border-brand-500/20',
    },
    {
      icon: Signal,
      title: 'Transfer Files',
      desc: 'Devices auto-discover each other. Start sending!',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="wifi-direct-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Modal */}
          <motion.div
            id="wifi-direct-modal"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl bg-[#0f0f13] border border-white/10 p-6 shadow-2xl space-y-5"
            initial={{ scale: 0.92, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                  <Wifi className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-100">WiFi Direct Transfer</h2>
                  <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Same Network • No Hotspot</p>
                </div>
              </div>
              <button
                id="close-wifi-direct-modal"
                type="button"
                onClick={onClose}
                className="rounded-xl p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-all duration-150"
                aria-label="Close WiFi Direct Modal"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Info Banner */}
            <div className="flex gap-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 p-3.5 text-xs text-cyan-300">
              <Wifi className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Works on both 2.4 GHz and 5 GHz!</strong> Connect both devices to your existing WiFi network (no hotspot needed) and transfer files directly at high speeds.
              </p>
            </div>

            {/* Steps */}
            <div className="space-y-2.5">
              {steps.map((step, i) => {
                const Icon = step.icon;
                const isActive = i === activeStep;
                const isDone = i < activeStep;

                return (
                  <motion.div
                    key={i}
                    className={`relative flex items-center gap-3.5 rounded-xl border p-3.5 transition-all duration-300 ${
                      isActive
                        ? `${step.border} ${step.bg} shadow-lg`
                        : isDone
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : 'border-white/5 bg-white/[0.02]'
                    }`}
                    initial={false}
                    animate={{ scale: isActive ? 1.02 : 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                      isDone ? 'bg-emerald-500/20' : step.bg
                    }`}>
                      {isDone ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Icon className={`h-4 w-4 ${isActive ? step.color : 'text-slate-500'}`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${isDone ? 'text-emerald-300' : isActive ? 'text-slate-100' : 'text-slate-500'}`}>
                        {step.title}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${isDone ? 'text-emerald-400/60' : isActive ? 'text-slate-400' : 'text-slate-600'}`}>
                        {step.desc}
                      </p>
                    </div>
                    {isActive && (
                      <motion.div
                        className={`h-2 w-2 rounded-full ${step.color.replace('text-', 'bg-')}`}
                        animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Connection Details */}
            {serverIp ? (
              <div className="space-y-3">
                {/* QR Code + URL */}
                <div className="flex items-center gap-4 rounded-xl bg-surface border border-border p-4">
                  <div className="shrink-0 rounded-lg bg-[#0f0f13] p-2 border border-white/10">
                    <QRCodeDisplay url={directUrl} size={80} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Direct Link</p>
                      <p className="text-xs font-mono text-cyan-400 truncate mt-0.5">
                        {directUrl}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        id="btn-copy-wifi-url"
                        type="button"
                        onClick={copyUrl}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition-all hover:bg-white/10 active:scale-95"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy
                          </>
                        )}
                      </button>
                      <button
                        id="btn-share-wifi-url"
                        type="button"
                        onClick={shareUrl}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition-all hover:bg-white/10 active:scale-95"
                      >
                        <Share2 className="h-3 w-3" />
                        Share
                      </button>
                    </div>
                  </div>
                </div>

                {/* Visual connection diagram */}
                <div className="flex items-center justify-center gap-3 py-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10">
                      <Monitor className="h-4.5 w-4.5 text-brand-400" />
                    </div>
                    <span className="text-[9px] text-slate-500 font-semibold">This Device</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="h-px w-6 bg-gradient-to-r from-brand-500/50 to-transparent" />
                    <motion.div
                      animate={{ x: [0, 4, 0] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      <Wifi className="h-4 w-4 text-cyan-400" />
                    </motion.div>
                    <div className="h-px w-6 bg-gradient-to-l from-emerald-500/50 to-transparent" />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                      <Smartphone className="h-4.5 w-4.5 text-emerald-400" />
                    </div>
                    <span className="text-[9px] text-slate-500 font-semibold">Other Device</span>
                  </div>
                </div>

                {/* Connected devices count */}
                {devices.length > 0 && (
                  <motion.div
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-300">
                      {devices.length} device{devices.length !== 1 ? 's' : ''} connected on WiFi
                    </span>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3.5 rounded-2xl bg-white/[0.01] border border-white/5 py-5 px-4">
                <Wifi className="h-8 w-8 text-cyan-400 animate-pulse shrink-0" />
                <div className="text-center space-y-2">
                  <p className="text-sm font-bold text-slate-200">Local Server Not Detected</p>
                  <p className="text-[11px] text-slate-400 leading-normal">
                    WiFi Direct utilizes your local router to transfer files directly at high speeds, which requires running the local server on your computer.
                  </p>
                  <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3.5 text-left space-y-2 mt-2">
                    <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">How to start Local Mode:</p>
                    <ol className="text-[10px] text-slate-400 list-decimal pl-4.5 space-y-1.5">
                      <li>Start the app on your laptop terminal with <code className="text-slate-200 font-mono bg-white/5 px-1 py-0.5 rounded">npm run dev</code>.</li>
                      <li>Note your local network address (e.g. <code className="text-slate-200 font-mono bg-white/5 px-1 py-0.5 rounded">http://10.196.102.8:5173</code>).</li>
                      <li>Open that address in the browser on both your laptop and phone to transfer files locally.</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}

            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary w-full py-3 text-xs font-semibold active:scale-98"
            >
              {devices.length > 0 ? 'Start Transferring' : 'Close'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
