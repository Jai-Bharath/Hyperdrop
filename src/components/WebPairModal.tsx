import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, QrCode, Copy, Check, Info, Radio, Smartphone } from 'lucide-react';
import { useStore } from '../store/useStore';
import { joinPairingRoom } from '../hooks/useSocket';
import QRCodeDisplay from './QRCodeDisplay';

interface WebPairModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WebPairModal({ isOpen, onClose }: WebPairModalProps) {
  const [copied, setCopied] = useState(false);
  const [pairedDeviceName, setPairedDeviceName] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'show' | 'enter'>('show');
  const [enteredCode, setEnteredCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  
  const devices = useStore((s) => s.devices);
  const prevDevicesLengthRef = useRef(devices.length);
  const pairCodeRef = useRef('');

  // Generate a persistent 6-character room code when the modal opens
  if (isOpen && !pairCodeRef.current) {
    pairCodeRef.current = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Join the pairing room on open
  useEffect(() => {
    if (isOpen && pairCodeRef.current) {
      joinPairingRoom(pairCodeRef.current);
      prevDevicesLengthRef.current = devices.length;
      setPairedDeviceName(null);
      setEnteredCode('');
      setJoinError(null);
      setIsJoining(false);
    }
  }, [isOpen]);

  // Monitor devices array to detect when a peer has successfully joined and paired
  useEffect(() => {
    if (isOpen && devices.length > prevDevicesLengthRef.current) {
      // Find the newly added device
      const newDevice = devices[devices.length - 1];
      setPairedDeviceName(newDevice.name);
      setIsJoining(false);
      
      // Vibrate if supported
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }

      // Automatically close modal after success animation
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
    prevDevicesLengthRef.current = devices.length;
  }, [devices, isOpen, onClose]);

  const serverIp = useStore((s) => s.serverIp);

  // When developing locally on localhost, use the laptop's actual LAN IP address in the QR code
  // so that the phone is routed to the correct device on the network instead of its own loopback.
  let origin = window.location.origin;
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (serverIp) {
      origin = `http://${serverIp}:${window.location.port || 5173}`;
    }
  }

  const pairingUrl = `${origin}?room=${pairCodeRef.current}`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(pairingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = pairingUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = enteredCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setJoinError('Room code must be exactly 6 characters.');
      return;
    }
    setJoinError(null);
    setIsJoining(true);
    joinPairingRoom(cleanCode);

    // Timeout fallback to clear loading state in case it fails
    setTimeout(() => {
      setIsJoining(false);
    }, 5000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="pair-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop with strong blur */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Modal */}
          <motion.div
            id="pair-modal"
            className="glass-strong relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 p-6 shadow-2xl"
            initial={{ scale: 0.92, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 24 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <QrCode className="h-5 w-5 text-brand-400" />
                <h2 className="text-lg font-bold text-slate-100">Pair Your Phone</h2>
              </div>
              <button
                id="close-pair-modal"
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
                aria-label="Close Pairing Modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Selector */}
            <div className="flex gap-2 p-1 rounded-xl bg-black/40 border border-white/5 mb-4">
              <button
                type="button"
                onClick={() => { setActiveTab('show'); setJoinError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                  activeTab === 'show'
                    ? 'bg-brand-500 text-slate-100 shadow-lg shadow-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <QrCode className="h-4 w-4" />
                <span>Show QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('enter'); setJoinError(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
                  activeTab === 'enter'
                    ? 'bg-brand-500 text-slate-100 shadow-lg shadow-brand-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <Smartphone className="h-4 w-4" />
                <span>Enter Room Code</span>
              </button>
            </div>

            {/* Content area */}
            <div className="space-y-4">
              
              {/* Auto-matching guide banner */}
              <div className="flex gap-3 rounded-xl bg-brand-500/5 border border-brand-500/10 p-3.5 text-xs text-brand-300">
                <Info className="h-4.5 w-4.5 shrink-0 text-brand-400 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Automatic matching active:</strong> If your phone is on the same Wi-Fi or hotspot network, it will pair **automatically** when you open the site. Use the options below for different networks.
                </p>
              </div>

              {/* QR / Pairing display box */}
              <div className="relative flex flex-col items-center justify-center rounded-xl bg-surface border border-border py-6 px-4">
                
                <AnimatePresence mode="wait">
                  {pairedDeviceName ? (
                    <motion.div
                      key="paired"
                      className="flex flex-col items-center justify-center py-10 text-center space-y-4 w-full"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                        <Check className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-base font-bold text-slate-100">Phone Paired!</p>
                        <p className="text-xs text-slate-400 inline-flex items-center gap-1">
                          <Smartphone className="h-3.5 w-3.5 text-brand-400" />
                          Joined with <strong>{pairedDeviceName}</strong>
                        </p>
                      </div>
                    </motion.div>
                  ) : activeTab === 'show' ? (
                    <motion.div
                      key="scanning"
                      className="flex flex-col items-center gap-4 w-full text-center"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      {/* Dynamic Beacon */}
                      <div className="relative flex items-center justify-center mb-1">
                        <div className="absolute h-10 w-10 animate-ping rounded-full bg-brand-400/20" />
                        <Radio className="h-6 w-6 text-brand-400 relative z-10" />
                      </div>

                      {/* Display QR Code */}
                      <div className="rounded-xl bg-[#0f0f13] p-4 border border-white/10 shadow-lg">
                        <QRCodeDisplay url={pairingUrl} size={160} />
                      </div>

                      {/* Room Code Display */}
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">
                          Backup Room Code
                        </p>
                        <div className="flex items-center gap-2 justify-center">
                          <span className="font-mono text-2xl font-extrabold tracking-wider text-brand-400">
                            {pairCodeRef.current}
                          </span>
                          <button
                            id="btn-copy-pairing"
                            type="button"
                            onClick={copyUrl}
                            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-brand-400 transition-colors"
                            title="Copy Pairing URL"
                          >
                            {copied ? (
                              <Check className="h-4 w-4 text-emerald-400 animate-pulse" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.form
                      key="enter"
                      onSubmit={handleJoin}
                      className="flex flex-col items-center gap-4 w-full text-center"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      <div className="relative flex items-center justify-center mb-1">
                        <Smartphone className="h-6 w-6 text-brand-400 relative z-10" />
                      </div>

                      <div className="space-y-1 w-full px-4">
                        <h3 className="text-sm font-bold text-slate-200">Connect via Room Code</h3>
                        <p className="text-xs text-slate-400">
                          Enter the 6-character room code from the other device.
                        </p>
                      </div>

                      <div className="w-full max-w-[240px] space-y-2">
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="ABCDEF"
                          value={enteredCode}
                          onChange={(e) => {
                            setEnteredCode(e.target.value.toUpperCase());
                            if (joinError) setJoinError(null);
                          }}
                          className="w-full text-center font-mono text-2xl font-extrabold tracking-widest bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-brand-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all uppercase placeholder-slate-600"
                        />
                        {joinError && (
                          <p className="text-[11px] text-red-400 font-semibold">{joinError}</p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isJoining || enteredCode.length !== 6}
                        className="w-full max-w-[240px] py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed font-semibold text-sm text-slate-100 shadow-lg shadow-brand-500/20 transition-all active:scale-98"
                      >
                        {isJoining ? 'Connecting...' : 'Connect Device'}
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>

              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
