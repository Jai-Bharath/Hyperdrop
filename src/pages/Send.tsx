import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send as SendIcon, Zap, FileUp, QrCode, Globe, RefreshCw } from 'lucide-react';
import { useStore, type Device } from '../store/useStore';
import {
  addManualPeer,
  addQrPeer,
  rescanSubnet,
  isCurrentlyScanning,
} from '../hooks/useDiscovery';
import { useTransfer } from '../hooks/useTransfer';
import FilePicker from '../components/FilePicker';
import DeviceList from '../components/DeviceList';
import ManualIPEntry from '../components/ManualIPEntry';
import WebQRScanner from '../components/WebQRScanner';
import TransferCard from '../components/TransferCard';
import type { Peer } from '../components/DeviceList';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

export default function SendPage() {
  const devices = useStore((s) => s.devices);
  const selectedFiles = useStore((s) => s.selectedFiles);
  const setSelectedFiles = useStore((s) => s.setSelectedFiles);
  const selectedDevice = useStore((s) => s.selectedDevice);
  const selectDevice = useStore((s) => s.selectDevice);

  const { activeTransfer, sendFiles, cancelTransfer, retryTransfer } = useTransfer();

  const [showQR, setShowQR] = useState(false);
  const [showManualIP, setShowManualIP] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);

  // Convert store devices to Peer objects for DeviceList
  const peers: Peer[] = devices.map(d => ({
    fingerprint: d.id,
    alias: d.name,
    ip: d.ip,
    port: d.port,
    deviceType: (d.platform || 'mobile') as 'mobile' | 'desktop' | 'tablet' | 'web',
    source: 'scan' as const,
    verified: true,
    failCount: 0,
    lastSeen: d.lastSeen,
  }));

  const canSend = selectedFiles.length > 0 && selectedDevice !== null && !activeTransfer;

  const handleSelectPeer = useCallback((peer: Peer) => {
    selectDevice({
      id: peer.fingerprint,
      name: peer.alias,
      ip: peer.ip,
      port: peer.port,
      platform: peer.deviceType,
      supports5GHz: true,
      lastSeen: Date.now(),
    });
  }, [selectDevice]);

  const handleSend = useCallback(() => {
    if (!selectedDevice || selectedFiles.length === 0) return;
    sendFiles(selectedFiles, selectedDevice);
  }, [selectedFiles, selectedDevice, sendFiles]);

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

  const handleQrFound = useCallback(async (ip: string, port: number) => {
    const device = await addQrPeer(ip, port);
    // Auto-select immediately
    selectDevice({
      id: device.id,
      name: device.name,
      ip: device.ip,
      port: device.port,
      platform: device.platform,
      supports5GHz: true,
      lastSeen: Date.now(),
    });
  }, [selectDevice]);

  const handleManualConnect = useCallback(async (ip: string, port: number) => {
    return addManualPeer(ip, port);
  }, []);

  const handleRescan = useCallback(async () => {
    setIsRescanning(true);
    await rescanSubnet();
    setIsRescanning(false);
  }, []);

  return (
    <motion.div
      className="mx-auto max-w-2xl flex flex-col gap-4 pb-28"
      initial="initial"
      animate="animate"
    >
      {/* ─── Header ─────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/15">
          <FileUp className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Send Files</h1>
          <p className="text-[11px] text-slate-500">Pick files → Connect device → Send</p>
        </div>
      </motion.div>

      {/* ─── Active Transfer ────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTransfer && (
          <motion.div
            key="transfer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
          >
            <TransferCard
              transfer={activeTransfer}
              onCancel={cancelTransfer}
              onDismiss={handleDismiss}
              onRetry={retryTransfer}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Step 1: Select Files ───────────────────────────── */}
      <motion.div variants={fadeUp} transition={{ delay: 0.05 }}>
        <div className="card space-y-3">
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
            1. Select Files
          </h2>
          <FilePicker
            onFilesSelected={handleFilesSelected}
            selectedFiles={selectedFiles}
          />
        </div>
      </motion.div>

      {/* ─── Step 2: Connect to Device ──────────────────────── */}
      <motion.div variants={fadeUp} transition={{ delay: 0.1 }}>
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
              2. Connect to Device
            </h2>
            <button
              type="button"
              onClick={handleRescan}
              className="flex items-center gap-1.5 text-[10px] font-bold text-brand-400 hover:text-brand-300 transition-colors uppercase tracking-wider"
            >
              <RefreshCw className={`h-3 w-3 ${isRescanning ? 'animate-spin' : ''}`} />
              Rescan
            </button>
          </div>

          {/* Device list */}
          <DeviceList
            peers={peers}
            selectedId={selectedDevice?.id}
            onSelect={handleSelectPeer}
            isScanning={isRescanning}
          />

          {/* Quick pair buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowQR(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-bold text-slate-300 hover:bg-white/[0.07] hover:border-white/[0.12] active:scale-[0.97] transition-all"
            >
              <QrCode className="h-4 w-4 text-brand-400" />
              Scan QR
            </button>
            <button
              type="button"
              onClick={() => setShowManualIP(!showManualIP)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-bold active:scale-[0.97] transition-all ${
                showManualIP
                  ? 'bg-brand-500/10 border-brand-500/20 text-brand-400'
                  : 'bg-white/[0.04] border-white/[0.08] text-slate-300 hover:bg-white/[0.07] hover:border-white/[0.12]'
              }`}
            >
              <Globe className="h-4 w-4 text-brand-400" />
              Enter IP
            </button>
          </div>

          {/* Manual IP input (expandable) */}
          <AnimatePresence>
            {showManualIP && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <ManualIPEntry onConnect={handleManualConnect} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ─── STICKY Send Button ─────────────────────────────── */}
      <AnimatePresence>
        {canSend && !activeTransfer && (
          <motion.div
            key="send-sticky"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="fixed bottom-24 left-4 right-4 z-30 mx-auto max-w-md"
          >
            <button
              id="btn-send"
              type="button"
              onClick={handleSend}
              className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-base font-bold text-white
                bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-500
                shadow-[0_8px_32px_rgba(99,102,241,0.35),0_2px_8px_rgba(99,102,241,0.2)]
                hover:shadow-[0_12px_40px_rgba(99,102,241,0.5)]
                active:scale-[0.97] transition-all duration-200"
            >
              <Zap className="h-5 w-5" />
              Send {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} to{' '}
              <span className="truncate max-w-[120px] inline-block align-bottom font-extrabold">
                {selectedDevice?.name}
              </span>
              <SendIcon className="h-4 w-4 ml-1" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── QR Scanner Modal ───────────────────────────────── */}
      <WebQRScanner
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        onDeviceFound={handleQrFound}
      />
    </motion.div>
  );
}
