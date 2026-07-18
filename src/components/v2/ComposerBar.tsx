import { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Send, File, FolderOpen, X, Image, Camera } from 'lucide-react';
import { formatBytes } from '../../utils/formatBytes';

interface ComposerBarProps {
  onSendMessage: (text: string) => void;
  onSendFiles: (files: File[]) => void;
  onTyping: (isTyping: boolean) => void;
}

export default function ComposerBar({
  onSendMessage,
  onSendFiles,
  onTyping,
}: ComposerBarProps) {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Send typing events with throttling
  useEffect(() => {
    if (text.length > 0) {
      onTyping(true);
      const timer = setTimeout(() => onTyping(false), 2500);
      return () => clearTimeout(timer);
    } else {
      onTyping(false);
    }
  }, [text, onTyping]);

  const handleSend = () => {
    if (selectedAttachments.length > 0) {
      onSendFiles(selectedAttachments);
      setSelectedAttachments([]);
      setMenuOpen(false);
    } else if (text.trim()) {
      onSendMessage(text);
      setText('');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedAttachments((prev) => [...prev, ...Array.from(files)]);
    }
    setMenuOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedAttachments((prev) => [...prev, ...Array.from(files)]);
    }
    setMenuOpen(false);
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedAttachments((prev) => [...prev, ...Array.from(files)]);
    }
    setMenuOpen(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleCameraCapture = useCallback(async () => {
    setMenuOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play();

      // Wait a frame for the video to be ready
      await new Promise((r) => setTimeout(r, 300));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')!.drawImage(video, 0, 0);

      stream.getTracks().forEach((t) => t.stop());

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new window.File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
          setSelectedAttachments((prev) => [...prev, file]);
        }
      }, 'image/jpeg', 0.92);
    } catch (err) {
      console.warn('[Composer] Camera access failed:', err);
    }
  }, []);

  const removeAttachment = (idx: number) => {
    setSelectedAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalAttachmentSize = selectedAttachments.reduce((s, f) => s + f.size, 0);
  const hasContent = text.trim().length > 0 || selectedAttachments.length > 0;

  // Attach menu items
  const attachOptions = [
    { icon: <File className="h-4 w-4 text-sky-500" />, label: 'File', onClick: () => { fileInputRef.current?.click(); setMenuOpen(false); } },
    { icon: <Image className="h-4 w-4 text-emerald-500" />, label: 'Photos & Videos', onClick: () => { imageInputRef.current?.click(); setMenuOpen(false); } },
    { icon: <FolderOpen className="h-4 w-4 text-amber-500" />, label: 'Folder', onClick: () => { folderInputRef.current?.click(); setMenuOpen(false); } },
    { icon: <Camera className="h-4 w-4 text-violet-500" />, label: 'Camera', onClick: handleCameraCapture },
  ];

  return (
    <div className="relative border-t border-border bg-surface-default/70 backdrop-blur-lg px-4 py-3 space-y-2.5 z-30 shrink-0">
      
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
      <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleFolderSelect} {...{ webkitdirectory: '', directory: '' } as any} />
      <input ref={imageInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleImageSelect} />

      {/* Attachment previews */}
      <AnimatePresence>
        {selectedAttachments.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 pb-2 max-h-28 overflow-y-auto">
              {selectedAttachments.map((file, idx) => (
                <motion.div
                  key={`${file.name}-${idx}`}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="flex items-center gap-1.5 bg-surface-light border border-border pl-2.5 pr-1 py-1 rounded-lg text-[11px] text-text-primary group shrink-0"
                >
                  <File className="h-3 w-3 text-brand-500 shrink-0" />
                  <span className="max-w-[100px] truncate font-medium">{file.name}</span>
                  <span className="text-[9px] text-text-muted">({formatBytes(file.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="p-0.5 rounded text-text-muted hover:text-red-400 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </motion.div>
              ))}
              
              <div className="w-full text-[10px] text-text-muted pt-0.5">
                {selectedAttachments.length} file{selectedAttachments.length > 1 ? 's' : ''} · {formatBytes(totalAttachmentSize)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <div className="flex items-center gap-2.5 relative">
        {/* Attach menu trigger */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all active:scale-95 ${
            menuOpen
              ? 'bg-brand-500/10 border-brand-500/30 text-brand-500 rotate-45'
              : 'bg-surface-light border-border text-text-secondary hover:text-text-primary'
          }`}
          aria-label="Attach files"
        >
          <Plus className="h-5 w-5 transition-transform duration-200" />
        </button>

        {/* Attach menu popover */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
              className="absolute bottom-14 left-0 w-48 glass-strong border border-border shadow-2xl rounded-xl p-1.5 flex flex-col z-50 origin-bottom-left"
            >
              {attachOptions.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={opt.onClick}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-surface-light text-xs text-text-primary text-left font-semibold transition-colors"
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Text input */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder={selectedAttachments.length > 0 ? "Add a caption..." : "Message or drag files here..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="w-full h-10 pl-4 pr-4 bg-surface-light border border-border rounded-xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/15 transition-all duration-200"
          />
        </div>

        {/* Send button */}
        <motion.button
          type="button"
          onClick={handleSend}
          disabled={!hasContent}
          whileTap={{ scale: 0.93 }}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
            hasContent
              ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/20 glow-brand'
              : 'bg-surface-light border border-border text-text-muted cursor-not-allowed'
          }`}
          aria-label="Send message"
        >
          <Send className="h-4 w-4 translate-x-[0.5px] translate-y-[-0.5px]" />
        </motion.button>
      </div>
    </div>
  );
}
