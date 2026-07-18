import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Send, File, FolderOpen, X, Image, FileText } from 'lucide-react';
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

  const removeAttachment = (idx: number) => {
    setSelectedAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalAttachmentSize = selectedAttachments.reduce((s, f) => s + f.size, 0);

  return (
    <div className="relative border-t border-border bg-surface-default/60 backdrop-blur-lg px-4 py-3.5 space-y-3 z-30">
      
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderSelect}
        {...{ webkitdirectory: '', directory: '' } as any}
      />

      {/* Attachment previews container */}
      <AnimatePresence>
        {selectedAttachments.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 pb-2.5 max-h-36 overflow-y-auto">
              {selectedAttachments.map((file, idx) => (
                <motion.div
                  key={`${file.name}-${idx}`}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="flex items-center gap-2 bg-surface-light border border-border pl-2.5 pr-1.5 py-1.5 rounded-xl text-xs text-text-primary group shrink-0"
                >
                  <FileText className="h-3.5 w-3.5 text-brand-500" />
                  <div className="max-w-[120px] truncate font-medium">
                    {file.name}
                  </div>
                  <span className="text-[9px] text-text-muted">
                    ({formatBytes(file.size)})
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="p-1 rounded-md text-text-muted hover:text-red-400 hover:bg-white/5 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
              
              {selectedAttachments.length > 0 && (
                <div className="w-full text-[10px] text-text-muted pt-1">
                  {selectedAttachments.length} file{selectedAttachments.length > 1 ? 's' : ''} selected · Total size: {formatBytes(totalAttachmentSize)}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <div className="flex items-center gap-3 relative">
        {/* Attachment menu trigger */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-all active:scale-95 ${
            menuOpen
              ? 'bg-brand-500/10 border-brand-500/35 text-brand-500 rotate-45'
              : 'bg-surface-light border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          <Plus className="h-5.5 w-5.5 transition-transform duration-200" />
        </button>

        {/* Attachment menu list popover */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
              className="absolute bottom-16 left-0 w-44 glass-strong border border-border shadow-2xl rounded-2xl p-2 flex flex-col gap-1 z-50 origin-bottom-left"
            >
              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs text-text-primary text-left font-semibold transition-colors"
              >
                <File className="h-4.5 w-4.5 text-sky-500" />
                Select File(s)
              </button>
              
              <button
                type="button"
                onClick={() => {
                  folderInputRef.current?.click();
                  setMenuOpen(false);
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 text-xs text-text-primary text-left font-semibold transition-colors"
              >
                <FolderOpen className="h-4.5 w-4.5 text-amber-500" />
                Select Folder
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input box */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder={selectedAttachments.length > 0 ? "Add files description..." : "Message or drag files here..."}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            className="w-full h-11 pl-4 pr-12 bg-surface-light border border-border rounded-2xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all duration-200"
          />
        </div>

        {/* Send message button */}
        <motion.button
          type="button"
          onClick={handleSend}
          disabled={!text.trim() && selectedAttachments.length === 0}
          whileTap={{ scale: 0.95 }}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-all duration-200 ${
            text.trim() || selectedAttachments.length > 0
              ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/25 glow-brand'
              : 'bg-surface-light border border-border text-text-muted cursor-not-allowed'
          }`}
        >
          <Send className="h-4.5 w-4.5 translate-x-[1px] translate-y-[-0.5px]" />
        </motion.button>
      </div>
    </div>
  );
}
