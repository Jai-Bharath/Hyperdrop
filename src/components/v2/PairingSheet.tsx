import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, QrCode, Copy, Check, Radio, Smartphone, Camera, Loader2, AlertTriangle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { joinPairingRoom } from '../../hooks/useSocket';
import QRCodeDisplay from '../QRCodeDisplay';
import jsQR from 'jsqr';
import { LOCAL_HTTP_PORT } from '../../shared/protocol';

interface PairingSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceFound?: (ip: string, port: number) => void;
}

export default function PairingSheet({ isOpen, onClose, onDeviceFound }: PairingSheetProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'show' | 'enter' | 'scan'>('show');
  const [enteredCode, setEnteredCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [isStartingCamera, setIsStartingCamera] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const devices = useStore((s) => s.devices);
  const prevDevicesLengthRef = useRef(devices.length);
  const pairCodeRef = useRef('');

  if (isOpen && !pairCodeRef.current) {
    pairCodeRef.current = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Join signaling room
  useEffect(() => {
    if (isOpen && pairCodeRef.current) {
      joinPairingRoom(pairCodeRef.current);
      prevDevicesLengthRef.current = devices.length;
    }
  }, [isOpen]);

  // Monitor device list for auto pairing success
  useEffect(() => {
    if (isOpen && devices.length > prevDevicesLengthRef.current) {
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
      onClose();
    }
    prevDevicesLengthRef.current = devices.length;
  }, [devices, isOpen, onClose]);

  // Start/Stop QR scanning camera when scan tab is active
  useEffect(() => {
    if (!isOpen || activeTab !== 'scan') {
      stopCamera();
      return;
    }

    let active = true;
    let animationFrameId: number;

    const startCamera = async () => {
      setCameraError(null);
      setScanSuccess(null);
      setIsStartingCamera(true);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
        });

        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setIsStartingCamera(false);
          scanLoop();
        }
      } catch (err) {
        console.error('[QR] Camera access error:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.includes('NotAllowed') || msg.includes('Permission')) {
          setCameraError('Camera permission denied.');
        } else {
          setCameraError('Cannot access camera.');
        }
        setIsStartingCamera(false);
      }
    };

    const scanLoop = () => {
      if (!active) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        animationFrameId = requestAnimationFrame(scanLoop);
        return;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        animationFrameId = requestAnimationFrame(scanLoop);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        const parsed = parseQRData(code.data);
        if (parsed) {
          setScanSuccess(`Matched: ${parsed.ip}:${parsed.port}`);
          
          if (onDeviceFound) {
            onDeviceFound(parsed.ip, parsed.port);
          } else {
            // Add fallback device immediately
            useStore.getState().addDevice({
              id: `qr-${parsed.ip}-${parsed.port}`,
              name: `Device (${parsed.ip})`,
              ip: parsed.ip,
              port: parsed.port,
              platform: 'mobile',
              supports5GHz: true,
              lastSeen: Date.now(),
              source: 'http',
            });
          }

          setTimeout(() => {
            onClose();
          }, 1000);
          return;
        }
      }

      animationFrameId = requestAnimationFrame(scanLoop);
    };

    startCamera();

    return () => {
      active = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      stopCamera();
    };
  }, [isOpen, activeTab]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const serverIp = useStore((s) => s.serverIp);
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
    } catch { /* ignore */ }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = enteredCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setJoinError('Must be exactly 6 characters.');
      return;
    }
    setJoinError(null);
    setIsJoining(true);
    joinPairingRoom(cleanCode);

    setTimeout(() => {
      setIsJoining(false);
    }, 4000);
  };

  const parseQRData = (data: string): { ip: string; port: number } | null => {
    const cleaned = data.trim();
    const hdMatch = cleaned.match(/^hyperdrop:\/\/([^/:]+)(?::(\d+))?/);
    if (hdMatch) return { ip: hdMatch[1], port: parseInt(hdMatch[2] || '53317', 10) };
    
    const httpMatch = cleaned.match(/^https?:\/\/([^/:]+)(?::(\d+))?/);
    if (httpMatch) return { ip: httpMatch[1], port: parseInt(httpMatch[2] || '53317', 10) };
    
    const ipPortMatch = cleaned.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3 decay})(?::(\d+))?$/);
    if (ipPortMatch) return { ip: ipPortMatch[1], port: parseInt(ipPortMatch[2] || '53317', 10) };
    
    return null;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Blur backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Spring-physics Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="relative z-10 w-full max-w-lg bg-surface-default border-t border-border rounded-t-[32px] p-6 shadow-2xl safe-bottom max-h-[92dvh] flex flex-col"
          >
            {/* Sheet Handle */}
            <div className="mx-auto w-12 h-1.5 rounded-full bg-border-default mb-4 shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between mb-5 shrink-0">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <QrCode className="h-5 w-5 text-brand-500" />
                Pair Devices
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-text-secondary hover:bg-surface-light hover:text-text-primary active:scale-95 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Selector */}
            <div className="flex gap-1.5 p-1 rounded-xl bg-surface-dark border border-border mb-5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('show')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'show'
                    ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`}
              >
                Show QR
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('scan')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'scan'
                    ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`}
              >
                Scan QR
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('enter')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'enter'
                    ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`}
              >
                Room Code
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pb-4">
              
              {activeTab === 'show' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 text-center py-4"
                >
                  <div className="relative flex items-center justify-center">
                    <div className="absolute h-9 w-9 animate-ping rounded-full bg-brand-400/20" />
                    <Radio className="h-5 w-5 text-brand-500 relative z-10" />
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-slate-950 p-3 border border-border-light dark:border-border shadow-md">
                    <QRCodeDisplay url={pairingUrl} size={150} />
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
                      Local Room Code
                    </p>
                    <div className="flex items-center gap-2 justify-center">
                      <span className="font-mono text-2xl font-extrabold tracking-wider text-brand-500">
                        {pairCodeRef.current}
                      </span>
                      <button
                        type="button"
                        onClick={copyUrl}
                        className="p-1.5 rounded-lg text-text-muted hover:text-brand-500 hover:bg-white/5 transition-all"
                      >
                        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'scan' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-2"
                >
                  <div className="relative w-full aspect-video max-w-sm rounded-2xl overflow-hidden bg-black/40 border border-border shadow-inner">
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Scanner Target Box */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-40 h-40 border border-brand-500/50 rounded-xl relative">
                        <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-brand-500 rounded-tl" />
                        <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-brand-500 rounded-tr" />
                        <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-brand-500 rounded-bl" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-brand-500 rounded-br" />
                        <motion.div
                          className="absolute left-1 right-1 h-0.5 bg-brand-500/80"
                          animate={{ top: ['10%', '90%', '10%'] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      </div>
                    </div>

                    {isStartingCamera && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-default/80">
                        <Loader2 className="h-7 w-7 text-brand-500 animate-spin" />
                        <p className="mt-2 text-[10px] text-text-secondary">Accessing camera...</p>
                      </div>
                    )}

                    {cameraError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-default/90 px-4 text-center">
                        <AlertTriangle className="h-7 w-7 text-amber-500" />
                        <p className="mt-2 text-xs font-semibold text-text-primary">{cameraError}</p>
                      </div>
                    )}

                    {scanSuccess && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-default/90">
                        <Check className="h-10 w-10 text-emerald-500" />
                        <p className="mt-2 text-xs font-bold text-emerald-500">{scanSuccess}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted mt-3 text-center">
                    Point your camera at another device's pairing QR code.
                  </p>
                </motion.div>
              )}

              {activeTab === 'enter' && (
                <motion.form
                  onSubmit={handleJoin}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-4 py-4 w-full"
                >
                  <div className="space-y-1 w-full text-center px-4">
                    <h3 className="text-sm font-semibold text-text-primary">Connect via Room Code</h3>
                    <p className="text-xs text-text-secondary">
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
                      className="w-full text-center font-mono text-2xl font-extrabold tracking-widest bg-surface-dark border border-border rounded-xl px-4 py-3 text-brand-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all placeholder:text-text-muted/40 uppercase"
                    />
                    {joinError && (
                      <p className="text-[10px] text-red-400 font-semibold text-center">{joinError}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isJoining || enteredCode.length !== 6}
                    className="w-full max-w-[240px] py-3 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs text-white shadow-md transition-all active:scale-95 glow-brand"
                  >
                    {isJoining ? 'Connecting...' : 'Connect'}
                  </button>
                </motion.form>
              )}

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
