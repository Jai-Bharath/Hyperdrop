import { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, X, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore';

/**
 * Play a notification beep using Web Audio API.
 * Two-tone descending alert (disconnect sound).
 */
function playDisconnectSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // First tone (higher)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 880;
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);

    // Second tone (lower, urgent)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 440;
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.5);

    // Third tone (even lower)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.value = 330;
    gain3.gain.setValueAtTime(0.25, ctx.currentTime + 0.35);
    gain3.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(ctx.currentTime + 0.35);
    osc3.stop(ctx.currentTime + 0.7);

    // Clean up context after sounds finish
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Web Audio not available — silent fallback
  }
}

/**
 * Vibrate the device (mobile only).
 */
function vibrateDevice(): void {
  try {
    if (navigator.vibrate) {
      // Three short bursts: disconnect pattern
      navigator.vibrate([200, 100, 200, 100, 300]);
    }
  } catch {
    // Vibration API not available
  }
}

/**
 * DisconnectAlert — Fullscreen overlay alert that appears when a peer
 * device disconnects during an active transfer. Includes sound + vibration.
 */
export default function DisconnectAlert() {
  const alert = useStore((s) => s.disconnectAlert);
  const dismiss = useStore((s) => s.dismissDisconnectAlert);
  const hasTriggeredRef = useRef<string | null>(null);

  // Play sound + vibrate when alert appears
  useEffect(() => {
    if (alert?.visible && alert.transferId !== hasTriggeredRef.current) {
      hasTriggeredRef.current = alert.transferId;
      playDisconnectSound();
      vibrateDevice();
    }
    if (!alert) {
      hasTriggeredRef.current = null;
    }
  }, [alert]);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!alert?.visible) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [alert?.visible, dismiss]);

  const handleDismiss = useCallback(() => {
    dismiss();
  }, [dismiss]);

  return (
    <AnimatePresence>
      {alert?.visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center pt-6 px-4 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Subtle backdrop pulse */}
          <motion.div
            className="absolute inset-0 bg-red-950/20 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.3] }}
            transition={{ duration: 1, times: [0, 0.3, 1] }}
          />

          {/* Alert Card */}
          <motion.div
            className="relative pointer-events-auto w-full max-w-md rounded-2xl border border-red-500/30 bg-[#1a0a0e]/95 backdrop-blur-xl shadow-[0_0_60px_rgba(239,68,68,0.15),0_8px_32px_rgba(0,0,0,0.4)] overflow-hidden"
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            {/* Red glow bar at top */}
            <motion.div
              className="h-1 bg-gradient-to-r from-red-600 via-red-400 to-red-600"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />

            <div className="p-5">
              <div className="flex items-start gap-4">
                {/* Pulsing icon */}
                <div className="relative shrink-0">
                  <motion.div
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/15"
                    animate={{
                      boxShadow: [
                        '0 0 0 0 rgba(239,68,68,0.3)',
                        '0 0 0 8px rgba(239,68,68,0)',
                      ],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: 2,
                      repeatType: 'loop',
                    }}
                  >
                    <WifiOff className="h-6 w-6 text-red-400" />
                  </motion.div>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <h3 className="text-sm font-bold text-red-300 uppercase tracking-wider">
                      Device Disconnected
                    </h3>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-200 font-medium">
                    <span className="text-red-300">{alert.deviceName}</span>{' '}
                    has gone offline
                  </p>
                  <p className="mt-1 text-xs text-slate-400 truncate">
                    Transfer cancelled: {alert.fileName}
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                  title="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Auto-dismiss progress bar */}
              <motion.div
                className="mt-4 h-0.5 rounded-full bg-red-500/20 overflow-hidden"
              >
                <motion.div
                  className="h-full bg-red-500/50 rounded-full"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: 8, ease: 'linear' }}
                />
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
