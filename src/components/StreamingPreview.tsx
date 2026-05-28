import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, Loader2, Film } from 'lucide-react';
import { useStore } from '../store/useStore';

/**
 * Streaming Video Preview for HyperDrop.
 *
 * Monitors an active "receive" transfer and once it reaches 10% completion,
 * creates a progressive video player using HTTP Range requests against the
 * server's .part file. The video starts playing while the rest downloads.
 */

interface StreamingPreviewProps {
  transferId: string;
  fileName: string;
  fileSize: number;
  onClose: () => void;
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v'];

/**
 * Check if a filename is a video file.
 */
export function isVideoFile(fileName: string): boolean {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  return VIDEO_EXTENSIONS.includes(ext);
}

export default function StreamingPreview({
  transferId,
  fileName,
  fileSize,
  onClose,
}: StreamingPreviewProps) {
  const [canPlay, setCanPlay] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const apiBaseUrl = useStore((s) => s.apiBaseUrl) || 'http://127.0.0.1:3001';
  const transfer = useStore((s) => s.transfers.find((t) => t.id === transferId));

  const progress = transfer
    ? Math.round((transfer.transferred / transfer.fileSize) * 100)
    : 0;

  // Generate video source URL using range-capable download endpoint
  // The server serves .part files via the download endpoint while transfer is in progress
  const videoUrl = `${apiBaseUrl}/download/${encodeURIComponent(fileName)}`;

  // Wait until 10% of the file is transferred before attempting playback
  useEffect(() => {
    if (progress >= 10 && !canPlay) {
      setCanPlay(true);
    }
  }, [progress, canPlay]);

  // Auto-play when enough data is buffered
  useEffect(() => {
    if (canPlay && videoRef.current) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Browser may require user interaction
          setIsPlaying(false);
        });
    }
  }, [canPlay]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Player Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="relative w-full max-w-2xl rounded-2xl bg-[#0a0a0f] border border-white/10 overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                <Film className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-200 truncate">{fileName}</h3>
                <p className="text-[10px] text-slate-500">
                  Streaming preview — {progress}% downloaded
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Video Area */}
          <div className="relative aspect-video bg-black flex items-center justify-center">
            {!canPlay ? (
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
                <p className="text-sm font-medium">
                  Buffering... {progress}% downloaded
                </p>
                <p className="text-[11px] text-slate-500">
                  Preview starts at 10% completion
                </p>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  controls={false}
                  playsInline
                  onError={() => setError('Unable to preview this video format')}
                />

                {/* Play/Pause overlay */}
                <button
                  onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center group"
                >
                  <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-black/50 border border-white/10 backdrop-blur-sm transition-all duration-200 ${
                    isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                  }`}>
                    {isPlaying ? (
                      <Pause className="h-6 w-6 text-white" />
                    ) : (
                      <Play className="h-6 w-6 text-white ml-1" />
                    )}
                  </div>
                </button>
              </>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <p className="text-sm text-red-400 font-medium">{error}</p>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div className="px-4 py-2 border-t border-white/5">
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-500 to-indigo-400 rounded-full"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
              <span>{progress}% received</span>
              <span>{transfer?.status === 'done' ? 'Complete' : 'Streaming...'}</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
