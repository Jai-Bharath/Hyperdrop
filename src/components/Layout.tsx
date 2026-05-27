import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Send, Download, Clock, Zap, QrCode } from 'lucide-react';
import { useStore } from '../store/useStore';
import WebPairModal from './WebPairModal';
import LocalErrorBoundary from './LocalErrorBoundary';

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/send', icon: Send, label: 'Send' },
  { to: '/receive', icon: Download, label: 'Receive' },
  { to: '/history', icon: Clock, label: 'History' },
] as const;

const pageVariants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.98 },
};

export default function Layout() {
  const connected = useStore((s) => s.connected);
  const location = useLocation();
  const [pairModalOpen, setPairModalOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col safe-top relative z-10 overflow-x-hidden">
      {/* ─── Ambient Glow Mesh Backdrop & Digital Grid ─────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="blur-blob blur-blob-indigo top-[-10%] right-[-10%] w-[320px] h-[320px] sm:w-[500px] sm:h-[500px]" />
      <div className="blur-blob blur-blob-cyan bottom-[-10%] left-[-10%] w-[320px] h-[320px] sm:w-[500px] sm:h-[500px]" />
      <div className="blur-blob blur-blob-purple top-[40%] left-[20%] w-[250px] h-[250px]" />

      {/* ─── Top Bar Floating Capsule ─────────────────────────── */}
      <header
        id="top-bar"
        className="glass sticky top-4 z-40 mx-auto w-[calc(100%-2rem)] max-w-5xl my-3 flex items-center justify-between px-5 py-3 rounded-2xl border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-xl"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 group cursor-pointer">
          <motion.div 
            className="flex h-8.5 w-8.5 items-center justify-center rounded-xl bg-brand-500/15 border border-brand-500/20 group-hover:bg-brand-500/25 transition-all duration-300"
            whileHover={{ rotate: 15, scale: 1.05 }}
          >
            <Zap className="h-4.5 w-4.5 text-brand-400 fill-brand-400/20" />
          </motion.div>
          <span className="text-base font-bold tracking-tight text-slate-100 font-sans">
            Hyper<span className="text-gradient">Drop</span>
          </span>
        </div>

        {/* Actions Container */}
        <div className="flex items-center gap-2.5">
          {/* Pair Device Button */}
          <button
            id="btn-pair-device-header"
            type="button"
            onClick={() => setPairModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition-all hover:bg-white/10 hover:text-slate-100 hover:border-brand-500/30 active:scale-95 duration-200"
            title="Pair Phone"
          >
            <QrCode className="h-3.5 w-3.5 text-brand-400" />
            <span className="hidden sm:inline">Pair Phone</span>
          </button>

          {/* Connection status */}
          <div id="connection-status" className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/35 px-3 py-2">
            <span className="relative flex h-2 w-2">
              {connected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-55" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full transition-colors duration-300 ${
                  connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-red-400 shadow-[0_0_8px_#f87171]'
                }`}
              />
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              {connected ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Pairing Modal */}
      <WebPairModal isOpen={pairModalOpen} onClose={() => setPairModalOpen(false)} />

      {/* ─── Main Content ────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-5xl mx-auto overflow-y-auto px-4 py-4 pb-28 sm:px-6 lg:px-8 z-10 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <LocalErrorBoundary>
              <Outlet />
            </LocalErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ─── Bottom Navigation Floating Capsule ───────────────── */}
      <nav
        id="bottom-nav"
        className="fixed bottom-5 left-4 right-4 z-40 mx-auto max-w-md safe-bottom rounded-2xl overflow-hidden border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl bg-gradient-to-b from-[#131320d9] to-[#090910f0]"
      >
        <div className="flex items-center justify-around px-2 py-2">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              id={`nav-${label.toLowerCase()}`}
              className={({ isActive }) =>
                isActive ? 'nav-item-active !bg-transparent' : 'nav-item'
              }
            >
              {({ isActive }) => (
                <div className="flex flex-col items-center gap-1.5 relative px-2 sm:px-3 py-1">
                  <Icon className={`h-5 w-5 transition-all duration-300 ${isActive ? 'text-brand-400 scale-105 filter drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'text-slate-500'}`} />
                  <span className={`text-[9px] font-bold tracking-widest uppercase transition-colors duration-300 ${isActive ? 'text-brand-300' : 'text-slate-500'}`}>
                    {label}
                  </span>
                  
                  {/* Sliding active indicator capsule */}
                  {isActive && (
                    <motion.span
                      layoutId="nav-indicator-glow"
                      className="absolute inset-0 z-[-1] rounded-xl bg-brand-500/10 border border-brand-500/10"
                      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    />
                  )}
                </div>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
