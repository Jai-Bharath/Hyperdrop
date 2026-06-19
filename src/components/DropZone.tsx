import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, CheckCircle2, Loader2, FileText, Zap, FolderOpen } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useStore } from '../store/useStore';

type DropState = 'idle' | 'hovering' | 'sending' | 'success';

/**
 * Recursively read all files from a dropped folder using FileSystemEntry API.
 */
async function readEntriesRecursively(entry: FileSystemDirectoryEntry): Promise<File[]> {
  const files: File[] = [];
  const reader = entry.createReader();

  const readBatch = (): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
  };

  // readEntries may not return all entries in one call
  let entries: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];
  do {
    batch = await readBatch();
    entries = entries.concat(batch);
  } while (batch.length > 0);

  for (const child of entries) {
    if (child.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (child as FileSystemFileEntry).file(resolve, reject);
      });
      // Preserve relative path using a custom property
      Object.defineProperty(file, 'webkitRelativePath', {
        value: child.fullPath.replace(/^\//, ''),
        writable: false,
        enumerable: true,
      });
      files.push(file);
    } else if (child.isDirectory) {
      const subFiles = await readEntriesRecursively(child as FileSystemDirectoryEntry);
      files.push(...subFiles);
    }
  }

  return files;
}

/**
 * Handle a drop event that might contain folders.
 * Uses DataTransferItem.webkitGetAsEntry() to detect folders.
 */
async function handleDropWithFolders(acceptedFiles: File[], event?: React.DragEvent): Promise<File[]> {
  // If we don't have the drag event, just return the files as-is
  if (!event?.dataTransfer?.items) return acceptedFiles;

  const items = event.dataTransfer.items;
  const allFiles: File[] = [];
  let hasFolder = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== 'file') continue;

    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      hasFolder = true;
      const folderFiles = await readEntriesRecursively(entry as FileSystemDirectoryEntry);
      allFiles.push(...folderFiles);
    } else if (entry?.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      });
      allFiles.push(file);
    }
  }

  // If no folders detected, use react-dropzone's files (already processed)
  if (!hasFolder) return acceptedFiles;
  return allFiles;
}

export default function DropZone() {
  const [dropState, setDropState] = useState<DropState>('idle');
  const [lastDragEvent, setLastDragEvent] = useState<React.DragEvent | null>(null);
  const navigate = useNavigate();
  const devices = useStore((s) => s.devices);
  const selectedDevice = useStore((s) => s.selectedDevice);
  const selectDevice = useStore((s) => s.selectDevice);
  const setSelectedFiles = useStore((s) => s.setSelectedFiles);
  const transfers = useStore((s) => s.transfers);
  const activeTransfer = transfers.find(t => t.status === 'transferring');
  const hasPeer = devices.length > 0;

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Process folders if any
    const processedFiles = lastDragEvent
      ? await handleDropWithFolders(acceptedFiles, lastDragEvent)
      : acceptedFiles;

    if (processedFiles.length === 0) return;

    if (!hasPeer) {
      setSelectedFiles(processedFiles);
      navigate('/send');
      return;
    }

    // Auto-select first device if none selected
    if (!selectedDevice && devices.length > 0) {
      selectDevice(devices[0]);
    }

    setSelectedFiles(processedFiles);
    setDropState('sending');

    setTimeout(() => {
      navigate('/send');
      setDropState('idle');
    }, 500);
  }, [hasPeer, selectedDevice, devices, selectDevice, setSelectedFiles, navigate, lastDragEvent]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: false,
    onDragEnter: () => setDropState('hovering'),
    onDragLeave: () => setDropState('idle'),
  });

  // Intercept the native drop event to capture DataTransferItems (for folder detection)
  const handleNativeDrop = useCallback((e: React.DragEvent) => {
    setLastDragEvent(e);
  }, []);

  const currentState = isDragActive ? 'hovering' : dropState;

  return (
    <motion.div variants={{ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } }}>
      <div
        {...getRootProps()}
        onDrop={(e) => {
          handleNativeDrop(e);
          // Let react-dropzone's onDrop handler also fire
          getRootProps().onDrop?.(e as any);
        }}
        className={`relative overflow-hidden rounded-3xl cursor-pointer transition-all duration-500 group ${
          currentState === 'hovering'
            ? 'ring-2 ring-brand-400/50 shadow-[0_0_40px_rgba(99,102,241,0.2)]'
            : currentState === 'success'
            ? 'ring-2 ring-emerald-400/50 shadow-[0_0_40px_rgba(52,211,153,0.2)]'
            : ''
        }`}
      >
        <input {...getInputProps()} />

        {/* Background gradient */}
        <div className={`absolute inset-0 transition-all duration-500 ${
          currentState === 'hovering'
            ? 'bg-gradient-to-br from-brand-600/15 via-purple-600/10 to-cyan-600/15'
            : currentState === 'success'
            ? 'bg-gradient-to-br from-emerald-600/15 via-teal-600/10 to-cyan-600/15'
            : 'bg-gradient-to-br from-white/[0.02] via-brand-600/[0.03] to-white/[0.02]'
        }`} />

        {/* Border */}
        <div className={`absolute inset-0 rounded-3xl transition-all duration-500 ${
          currentState === 'hovering'
            ? 'border-2 border-dashed border-brand-400/40'
            : currentState === 'success'
            ? 'border-2 border-emerald-400/40'
            : 'border border-dashed border-white/[0.08] group-hover:border-white/[0.15]'
        }`} />

        {/* Pulse glow on hover */}
        {currentState === 'hovering' && (
          <motion.div
            className="absolute inset-0 rounded-3xl bg-brand-500/5"
            animate={{ opacity: [0, 0.3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}

        {/* Content */}
        <div className="relative p-6 sm:p-8 flex flex-col items-center text-center">
          <AnimatePresence mode="wait">
            {activeTransfer ? (
              <motion.div
                key="transferring"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-3"
              >
                <Loader2 className="h-10 w-10 text-brand-400 animate-spin" />
                <div>
                  <p className="text-sm font-bold text-white">{activeTransfer.fileName}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {Math.round((activeTransfer.transferred / activeTransfer.fileSize) * 100)}% · {(activeTransfer.speed / 1024 / 1024).toFixed(1)} MB/s
                  </p>
                </div>
                {/* Progress bar */}
                <div className="w-full max-w-[200px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-brand-500 to-cyan-400 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: `${Math.round((activeTransfer.transferred / activeTransfer.fileSize) * 100)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </motion.div>
            ) : currentState === 'success' ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-2"
              >
                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                <p className="text-sm font-bold text-emerald-300">Files Sent!</p>
              </motion.div>
            ) : currentState === 'hovering' ? (
              <motion.div
                key="hovering"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center gap-3"
              >
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  <FolderOpen className="h-10 w-10 text-brand-400" />
                </motion.div>
                <div>
                  <p className="text-sm font-bold text-brand-300">Drop Files or Folders</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {hasPeer ? `To ${devices[0]?.name || 'paired device'}` : 'Select device on Send page'}
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="relative">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-purple-500/10 border border-brand-500/15 group-hover:border-brand-400/30 transition-all">
                    <Upload className="h-6 w-6 text-brand-400 group-hover:text-brand-300 transition-colors" />
                  </div>
                  <motion.div
                    className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/20 border border-brand-400/20"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Zap className="h-2.5 w-2.5 text-brand-300" />
                  </motion.div>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                    Drop Zone
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5 group-hover:text-slate-500 transition-colors">
                    Drag files here or click to browse · Like AirDrop
                  </p>
                </div>
                {hasPeer && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/12 text-[9px] font-bold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {devices[0]?.name || 'Device'} ready
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
