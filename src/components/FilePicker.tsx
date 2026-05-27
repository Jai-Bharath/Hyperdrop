import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, CloudDownload, X, FileText } from 'lucide-react';
import { formatBytes } from '../utils/formatBytes';

interface FilePickerProps {
  onFilesSelected: (files: File[]) => void;
  selectedFiles: File[];
}

export default function FilePicker({ onFilesSelected, selectedFiles }: FilePickerProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      onFilesSelected([...selectedFiles, ...accepted]);
    },
    [onFilesSelected, selectedFiles],
  );

  const removeFile = useCallback(
    (index: number) => {
      onFilesSelected(selectedFiles.filter((_, i) => i !== index));
    },
    [onFilesSelected, selectedFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  return (
    <section id="file-picker" className="w-full space-y-4">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        id="file-drop-zone"
        className={`
          relative flex flex-col items-center justify-center gap-3
          rounded-2xl border-2 border-dashed px-6 py-12
          cursor-pointer transition-all duration-200 group
          ${
            isDragActive
              ? 'border-brand-500 bg-brand-500/10 glow-brand'
              : 'border-border hover:border-brand-500/40 hover:bg-surface-light/30'
          }
        `}
      >
        <input {...getInputProps()} />

        <motion.div
          animate={isDragActive ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          {isDragActive ? (
            <CloudDownload className="h-12 w-12 text-brand-400" />
          ) : (
            <Upload className="h-12 w-12 text-slate-500 group-hover:text-brand-400 transition-colors duration-200" />
          )}
        </motion.div>

        <div className="text-center">
          <p className="text-sm font-medium text-slate-200">
            {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            or click to browse · any file type
          </p>
        </div>

        {isDragActive && (
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-brand-500/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
        )}
      </div>

      {/* Selected files list */}
      <AnimatePresence mode="popLayout">
        {selectedFiles.length > 0 && (
          <motion.ul
            id="file-list"
            className="space-y-2"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {selectedFiles.map((file, index) => (
              <motion.li
                key={`${file.name}-${file.size}-${index}`}
                id={`file-item-${index}`}
                className="flex items-center gap-3 rounded-xl bg-surface border border-border px-4 py-3 group/item"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16, scale: 0.95 }}
                transition={{ delay: index * 0.05, duration: 0.2 }}
                layout
              >
                <FileText className="h-5 w-5 shrink-0 text-brand-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <button
                  id={`remove-file-${index}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {selectedFiles.length > 0 && (
        <p id="file-count" className="text-xs text-slate-500 text-center">
          {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected ·{' '}
          {formatBytes(selectedFiles.reduce((s, f) => s + f.size, 0))} total
        </p>
      )}
    </section>
  );
}
