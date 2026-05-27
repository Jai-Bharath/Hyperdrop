import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send as SendIcon, Zap } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useDiscovery } from '../hooks/useDiscovery';
import { useTransfer } from '../hooks/useTransfer';
import FilePicker from '../components/FilePicker';
import DeviceRadar from '../components/DeviceRadar';
import TransferCard from '../components/TransferCard';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function SendPage() {
  const { devices } = useDiscovery();
  const selectedDevice = useStore((s) => s.selectedDevice);
  const selectDevice = useStore((s) => s.selectDevice);
  const { activeTransfer, sendFiles, cancelTransfer } = useTransfer();
  const selectedFiles = useStore((s) => s.selectedFiles);
  const setSelectedFiles = useStore((s) => s.setSelectedFiles);

  const canSend = selectedFiles.length > 0 && selectedDevice !== null && !activeTransfer;

  const handleSend = useCallback(() => {
    if (!selectedDevice || selectedFiles.length === 0) return;
    sendFiles(selectedFiles, selectedDevice);
  }, [selectedDevice, selectedFiles, sendFiles]);

  const handleDismiss = useCallback(() => {
    useStore.getState().setActiveTransfer(null);
    useStore.getState().clearSelectedFiles();
  }, []);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (activeTransfer && ['done', 'error', 'cancelled'].includes(activeTransfer.status)) {
      useStore.getState().setActiveTransfer(null);
    }
    setSelectedFiles(files);
  }, [activeTransfer, setSelectedFiles]);

  return (
    <motion.div
      className="mx-auto max-w-5xl space-y-6"
      initial="initial"
      animate="animate"
    >
      <motion.div variants={fadeUp}>
        <h1 className="text-2xl font-bold text-slate-100">Send Files</h1>
        <p className="mt-1 text-sm text-slate-500">
          Select files and choose a device to start transferring
        </p>
      </motion.div>

      {/* Two-column layout on desktop/tablet */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Left: File Picker */}
        <motion.div variants={fadeUp} transition={{ delay: 0.05 }}>
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
              Select Files
            </h2>
            <FilePicker
              onFilesSelected={handleFilesSelected}
              selectedFiles={selectedFiles}
            />
          </div>
        </motion.div>

        {/* Right: Device Radar */}
        <motion.div variants={fadeUp} transition={{ delay: 0.1 }}>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-widest">
                Choose Device
              </h2>
              {selectedDevice && (
                <span className="badge bg-brand-500/10 text-brand-400">
                  {selectedDevice.name}
                </span>
              )}
            </div>
            <DeviceRadar
              devices={devices}
              onSelectDevice={selectDevice}
              selectedDeviceId={selectedDevice?.id}
            />
          </div>
        </motion.div>
      </div>

      {/* ─── Send Button / Transfer Card ───────────────────── */}
      <AnimatePresence mode="wait">
        {activeTransfer ? (
          <motion.div
            key="transfer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.25 }}
          >
            <TransferCard
              transfer={activeTransfer}
              onCancel={cancelTransfer}
              onDismiss={handleDismiss}
            />
          </motion.div>
        ) : canSend ? (
          <motion.div
            key="send-btn"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <button
              id="btn-send"
              type="button"
              onClick={handleSend}
              className="btn-primary w-full flex items-center justify-center gap-3 py-4 text-base glow-brand"
            >
              <Zap className="h-5 w-5" />
              Send {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} to{' '}
              <span className="truncate max-w-[100px] sm:max-w-[200px] inline-block align-bottom" title={selectedDevice?.name}>
                {selectedDevice?.name}
              </span>
              <SendIcon className="h-4 w-4" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
