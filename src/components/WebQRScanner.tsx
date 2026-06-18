import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, AlertTriangle, Check } from 'lucide-react';
import jsQR from 'jsqr';
import { useStore } from '../store/useStore';
import { joinPairingRoom } from '../hooks/useSocket';

interface WebQRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export default function WebQRScanner({ isOpen, onClose, onSuccess }: WebQRScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<(() => void) | null>(null);
  
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  
  const setSocketUrl = useStore((s) => s.setSocketUrl);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    let animationFrameId: number;

    const startCamera = async () => {
      setCameraError(null);
      setSuccessMsg(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } }
        });
        
        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        setPermissionState('granted');

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          void videoRef.current.play();
          
          // Start the decode loop
          animationFrameId = requestAnimationFrame(tick);
        }
      } catch (err: any) {
        console.error('[WebQRScanner] Camera access failed:', err);
        setPermissionState('denied');
        setCameraError(
          err.name === 'NotAllowedError' 
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : 'Failed to access camera. Please make sure no other app is using it.'
        );
      }
    };

    const tick = () => {
      if (!active || !videoRef.current || !canvasRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code) {
          console.log('[WebQRScanner] Decoded QR code:', code.data);
          handleQRCode(code.data);
          return; // Stop scan loop on success
        }
      }

      animationFrameId = requestAnimationFrame(tick);
    };

    tickRef.current = tick;

    void startCamera();

    return () => {
      active = false;
      tickRef.current = null;
      cancelAnimationFrame(animationFrameId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  const handleQRCode = (data: string) => {
    try {
      // Check if it's a HyperDrop pairing URL
      // Formats:
      // 1. hyperdrop://pair?room=XXXXXX
      // 2. http://10.196.102.8:3001
      // 3. https://hyperdrop.net/pair?room=XXXXXX
      
      let matched = false;
      let room = '';

      if (data.startsWith('hyperdrop://')) {
        const url = new URL(data.replace('hyperdrop://', 'http://'));
        room = url.searchParams.get('room') || '';
        matched = true;
      } else if (data.startsWith('http://') || data.startsWith('https://')) {
        const url = new URL(data);
        room = url.searchParams.get('room') || '';
        
        // If it's a direct local address (e.g. http://10.196.102.8:3001), set local Socket URL
        const isDirectIpPort = /:\d+/.test(url.host) || /^(192\.168\.|10\.|172\.)/.test(url.hostname);
        if (isDirectIpPort && !room) {
          const cleanSocketUrl = `${url.protocol}//${url.host}`;
          setSocketUrl(cleanSocketUrl);
          console.log(`[WebQRScanner] Switched local signaling target directly to: ${cleanSocketUrl}`);
          setSuccessMsg('Successfully connected to Laptop!');
          matched = true;
        } else if (room) {
          matched = true;
        }
      }

      if (matched) {
        // Trigger haptic rumble feedback if browser supports it
        if ('vibrate' in navigator) {
          navigator.vibrate(100);
        }

        if (room) {
          joinPairingRoom(room);
          setSuccessMsg(`Joined room ${room} successfully!`);
        }

        setTimeout(() => {
          if (onSuccess) {
            onSuccess(room ? `Room ${room} Paired` : 'Laptop Connected');
          }
          onClose();
        }, 1200);
      } else {
        // Not a HyperDrop QR code
        console.warn('[WebQRScanner] Scanned code is not a valid HyperDrop connection:', data);
        // Continue scanning after a short delay
        setTimeout(() => {
          if (isOpen && streamRef.current) {
            requestAnimationFrame(() => {
              if (videoRef.current && tickRef.current) {
                // Restart frame loop
                requestAnimationFrame(tickRef.current);
              }
            });
          }
        }, 1500);
      }
    } catch (err) {
      console.error('[WebQRScanner] Failed parsing scanned URL:', err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="qr-scanner-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Dark Backdrop with blur */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />

          {/* Scanner Container */}
          <motion.div
            id="qr-scanner-modal"
            className="glass-strong relative z-10 w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 p-6 shadow-2xl"
            initial={{ scale: 0.95, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-brand-400" />
                <h2 className="text-base font-bold text-slate-100">Scan QR Code</h2>
              </div>
              <button
                id="close-scanner"
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
                aria-label="Close Scanner"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Viewport Area */}
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black border border-white/5 shadow-inner">
              {/* Invisible helper canvas and camera stream */}
              <canvas ref={canvasRef} className="hidden" />
              
              {permissionState === 'granted' && !successMsg && (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover transform"
                />
              )}

              {/* Glowing Laser target overlays */}
              {permissionState === 'granted' && !successMsg && (
                <>
                  {/* Frosted vignette */}
                  <div className="absolute inset-0 border-[24px] border-black/40 pointer-events-none" />
                  
                  {/* Glowing Box */}
                  <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 border-2 border-brand-400/80 rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.3)] pointer-events-none">
                    {/* Laser Target line */}
                    <div className="absolute left-0 right-0 h-[2px] bg-brand-400 shadow-[0_0_8px_#8b5cf6] animate-laser" />
                  </div>
                </>
              )}

              {/* Success Overlay */}
              {successMsg && (
                <motion.div
                  className="absolute inset-0 flex flex-col items-center justify-center bg-brand-500/20 backdrop-blur-sm text-center p-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-3 border border-emerald-500/30">
                    <Check className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-semibold text-slate-100">{successMsg}</p>
                </motion.div>
              )}

              {/* Permission/Error State */}
              {permissionState !== 'granted' && !successMsg && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-400">
                  {permissionState === 'prompt' && (
                    <>
                      <Camera className="h-10 w-10 text-brand-400/50 mb-3 animate-pulse" />
                      <p className="text-xs font-semibold text-slate-300">Requesting Camera Permission</p>
                      <p className="text-[10px] text-slate-500 mt-1 max-w-xs">
                        Please tap "Allow" when prompted by your browser to scan the QR code.
                      </p>
                    </>
                  )}

                  {permissionState === 'denied' && (
                    <div className="space-y-2.5">
                      <AlertTriangle className="h-10 w-10 text-amber-500/80 mx-auto" />
                      <p className="text-xs font-semibold text-slate-300">Camera Access Denied</p>
                      <p className="text-[10px] text-slate-500 leading-relaxed max-w-xs px-2">
                        {cameraError}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Instruction Footer */}
            <div className="mt-4 text-center">
              <p className="text-xs text-slate-500 leading-relaxed">
                Scan the **Pair Device** QR Code displayed on the laptop to connect instantly.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
