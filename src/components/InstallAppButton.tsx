import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone, Download, ChevronDown, Check, Globe,
  MonitorSmartphone, X
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { Capacitor } from '@capacitor/core';

// ─── APK Download URL ─────────────────────────────────────────────
// Update this URL to point to your hosted APK file (GitHub Releases, etc.)
const APK_DOWNLOAD_URL = '/hyperdrop.apk';

// ─── Helpers ──────────────────────────────────────────────────────
function isAndroid() {
  return /android/i.test(navigator.userAgent);
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    Capacitor.isNativePlatform()
  );
}

// ─── Component ────────────────────────────────────────────────────
export default function InstallAppButton() {
  const deferredPrompt = useStore((s) => s.deferredPrompt);
  const setDeferredPrompt = useStore((s) => s.setDeferredPrompt);

  const [open, setOpen] = useState(false);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [apkDownloading, setApkDownloading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // If running as native app, don't show the install button at all
  if (isStandalone()) return null;

  // ─── PWA Install ────────────────────────────────────────────────
  const handlePwaInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setPwaInstalled(true);
      setDeferredPrompt(null);
    } catch { /* ignore */ }
    setOpen(false);
  }, [deferredPrompt, setDeferredPrompt]);

  // ─── APK Download ──────────────────────────────────────────────
  const handleApkDownload = useCallback(() => {
    setApkDownloading(true);
    window.open(APK_DOWNLOAD_URL, '_blank');
    setTimeout(() => {
      setApkDownloading(false);
      setOpen(false);
    }, 2000);
  }, []);

  const showPwaOption = !!deferredPrompt && !pwaInstalled;
  const showApkOption = isAndroid() || !isIos(); // Show APK for Android + desktop

  // If already installed PWA and nothing else to show
  if (pwaInstalled && !showApkOption) return null;

  return (
    <div ref={dropdownRef} className="relative">
      {/* ─── Trigger Button ────────────────────────────────────── */}
      <motion.button
        id="btn-install-app"
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-amber-500/20 px-4 py-3.5 transition-all active:scale-[0.97] group"
        whileTap={{ scale: 0.97 }}
      >
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/15 to-orange-500/10 border border-amber-500/15 shadow-[0_0_12px_rgba(245,158,11,0.1)]">
          <Smartphone className="h-4.5 w-4.5 text-amber-400" />
          {/* Pulse dot */}
          <motion.div
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400"
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <div className="text-left min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-300 leading-tight">Install App</p>
          <p className="text-[9px] text-slate-600 leading-tight">Offline · Native speed</p>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
        </motion.div>
      </motion.button>

      {/* ─── Dropdown Panel ────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-0 right-0 bottom-full mb-2 z-50 rounded-2xl overflow-hidden"
          >
            {/* Glassmorphism card */}
            <div className="glass-strong rounded-2xl border border-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.5)] p-1.5 space-y-1">
              {/* Header */}
              <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Install Options
                </span>
                <button
                  onClick={() => setOpen(false)}
                  className="p-0.5 rounded-lg hover:bg-white/[0.05] transition-colors"
                >
                  <X className="h-3 w-3 text-slate-600" />
                </button>
              </div>

              {/* ── PWA Option ─────────────────────────────────── */}
              {showPwaOption && (
                <motion.button
                  type="button"
                  onClick={handlePwaInstall}
                  className="flex items-center gap-3 w-full rounded-xl px-3 py-3 hover:bg-white/[0.04] transition-all group/item"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 border border-brand-500/15">
                    <Globe className="h-4 w-4 text-brand-400" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-slate-200 leading-tight">Install as PWA</p>
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                      Add to home screen · Works offline · 1 MB
                    </p>
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-500/10 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    <Download className="h-3 w-3 text-brand-400" />
                  </div>
                </motion.button>
              )}

              {/* ── Android APK Option ─────────────────────────── */}
              {showApkOption && (
                <motion.button
                  type="button"
                  onClick={handleApkDownload}
                  disabled={apkDownloading}
                  className="flex items-center gap-3 w-full rounded-xl px-3 py-3 hover:bg-white/[0.04] transition-all group/item disabled:opacity-50"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/15">
                    <MonitorSmartphone className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-slate-200 leading-tight">
                      {apkDownloading ? 'Downloading…' : 'Download Android APK'}
                    </p>
                    <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
                      Native app · Full features · 1.8 MB
                    </p>
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    {apkDownloading ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Download className="h-3 w-3 text-emerald-400" />
                    )}
                  </div>
                </motion.button>
              )}

              {/* Footer hint */}
              {isAndroid() && (
                <p className="text-[8px] text-slate-600 text-center pb-1.5 px-3">
                  APK requires "Install from unknown sources" permission
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
