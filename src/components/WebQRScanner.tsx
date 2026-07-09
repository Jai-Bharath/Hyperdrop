import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera, AlertTriangle, Check, Loader2 } from 'lucide-react';
import jsQR from 'jsqr';

interface WebQRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onDeviceFound?: (ip: string, port: number) => void;
}

/**
 * QR Code Scanner — scans for `hyperdrop://IP:PORT` URLs.
 * Uses the device camera + jsQR library for decoding.
 */
export default function WebQRScanner({ isOpen, onClose, onDeviceFound }: WebQRScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    let animationFrameId: number;

    const startCamera = async () => {
      setCameraError(null);
      setSuccessMsg(null);
      setIsStarting(true);

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
          setIsStarting(false);
          scanLoop();
        }
      } catch (err) {
        console.error('[QR] Camera error:', err);
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.includes('NotAllowed') || msg.includes('Permission')) {
          setCameraError('Camera permission denied. Please allow camera access in your device settings.');
        } else {
          setCameraError(`Cannot access camera: ${msg}`);
        }
        setIsStarting(false);
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
          setSuccessMsg(`Found: ${parsed.ip}:${parsed.port}`);
          onDeviceFound?.(parsed.ip, parsed.port);

          // Stop scanning after success
          setTimeout(() => {
            onClose();
          }, 1200);
          return; // Stop scan loop
        }
      }

      animationFrameId = requestAnimationFrame(scanLoop);
    };

    startCamera();

    return () => {
      active = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, onClose, onDeviceFound]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-sm rounded-3xl bg-[#141420] border border-white/10 overflow-hidden shadow-2xl"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-brand-400" />
              <h3 className="text-sm font-bold text-slate-200">Scan QR Code</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-white/10 text-slate-400 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Camera viewport */}
          <div className="relative aspect-square bg-black">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-56 border-2 border-brand-400/50 rounded-2xl relative">
                {/* Corner markers */}
                <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-2 border-l-2 border-brand-400 rounded-tl-lg" />
                <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-2 border-r-2 border-brand-400 rounded-tr-lg" />
                <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-2 border-l-2 border-brand-400 rounded-bl-lg" />
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-2 border-r-2 border-brand-400 rounded-br-lg" />

                {/* Scan line animation */}
                <motion.div
                  className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-brand-400 to-transparent"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </div>

            {/* Loading state */}
            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 text-brand-400 animate-spin" />
                <p className="mt-3 text-xs text-slate-400">Starting camera…</p>
              </div>
            )}

            {/* Error state */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6">
                <AlertTriangle className="h-8 w-8 text-amber-400" />
                <p className="mt-3 text-xs text-slate-300 text-center">{cameraError}</p>
              </div>
            )}

            {/* Success state */}
            {successMsg && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                >
                  <Check className="h-12 w-12 text-emerald-400" />
                </motion.div>
                <p className="mt-3 text-sm font-bold text-emerald-300">{successMsg}</p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-5 py-3 text-center border-t border-white/[0.06]">
            <p className="text-[10px] text-slate-500">
              Point camera at the QR code shown on the receiver's device
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Parse QR data. Accepts:
 * - hyperdrop://192.168.43.1:53317
 * - http://192.168.43.1:53317
 * - 192.168.43.1:53317
 * - 192.168.43.1
 */
function parseQRData(data: string): { ip: string; port: number } | null {
  const cleaned = data.trim();

  // Try hyperdrop:// protocol
  const hdMatch = cleaned.match(/^hyperdrop:\/\/([^/:]+)(?::(\d+))?/);
  if (hdMatch) {
    return { ip: hdMatch[1], port: parseInt(hdMatch[2] || '53317', 10) };
  }

  // Try http:// URL
  const httpMatch = cleaned.match(/^https?:\/\/([^/:]+)(?::(\d+))?/);
  if (httpMatch) {
    return { ip: httpMatch[1], port: parseInt(httpMatch[2] || '53317', 10) };
  }

  // Try plain IP:port
  const ipPortMatch = cleaned.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d+))?$/);
  if (ipPortMatch) {
    return { ip: ipPortMatch[1], port: parseInt(ipPortMatch[2] || '53317', 10) };
  }

  return null;
}
