import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, RefreshCw, QrCode, Settings, ShieldCheck, Zap } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { rescanSubnet, getMyIp } from '../../hooks/useDiscovery';
import ProfileRow from '../../components/v2/ProfileRow';
import EmptyState from '../../components/v2/EmptyState';
import PairingSheet from '../../components/v2/PairingSheet';
import SettingsSheet from '../../components/v2/SettingsSheet';
import SkeletonRow from '../../components/v2/SkeletonRow';

export default function ProfilesScreen() {
  const navigate = useNavigate();
  const devices = useStore((s) => s.devices);
  const connected = useStore((s) => s.connected);
  const serverIp = useStore((s) => s.serverIp);
  const conversations = useStore((s) => s.conversations);

  const [isScanning, setIsScanning] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const myIp = serverIp || getMyIp();

  // Handle pull-to-refresh / rescan
  const handleRescan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      await rescanSubnet();
    } catch (err) {
      console.error('[Profiles] Subnet scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  // Perform initial scan when screen mounts
  useEffect(() => {
    handleRescan();
  }, []);

  // Sort devices: online first, then by lastSeen descending
  const sortedDevices = [...devices].sort((a, b) => {
    return b.lastSeen - a.lastSeen;
  });

  return (
    <div className="max-w-lg mx-auto flex flex-col min-h-[calc(100dvh-6rem)] relative pb-24 select-none">
      
      {/* Dynamic Header */}
      <div className="flex items-center justify-between px-2 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight flex items-center gap-1.5">
            <span className="text-gradient">Hyperdrop</span>
          </h1>
          <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider mt-0.5">
            Local Discovery Active
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Scan button */}
          <button
            type="button"
            onClick={handleRescan}
            className={`p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-light active:scale-95 transition-all ${
              isScanning ? 'animate-spin' : ''
            }`}
          >
            <RefreshCw className="h-5 w-5" />
          </button>

          {/* Settings button */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-light active:scale-95 transition-all"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Network Status Badge */}
      <div className="px-2 mb-4">
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-2xl border text-xs font-semibold ${
          connected
            ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-500'
            : 'bg-red-500/5 border-red-500/10 text-red-500'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span>{connected ? `Online · IP: ${myIp || 'Local network'}` : 'Disconnected'}</span>
          </div>
          <span className="text-[9px] font-mono text-text-muted">PORT 53317</span>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 space-y-3 px-2">
        <h2 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2.5 px-2">
          Discovered Profiles
        </h2>

        {isScanning && sortedDevices.length === 0 ? (
          <div className="space-y-3">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : sortedDevices.length === 0 ? (
          <EmptyState type="profiles" onPairClick={() => setPairingOpen(true)} />
        ) : (
          <div className="space-y-2.5">
            <AnimatePresence mode="popLayout">
              {sortedDevices.map((device) => {
                const deviceMessages = conversations[device.id] || [];
                const lastMsg = deviceMessages[deviceMessages.length - 1];
                let snippet = 'No messages yet';
                if (lastMsg) {
                  if (lastMsg.type === 'file' || lastMsg.type === 'folder') {
                    snippet = `📁 Sent file: ${lastMsg.fileMeta?.name || ''}`;
                  } else if (lastMsg.type === 'transfer') {
                    snippet = `⚡ Active transfer: ${lastMsg.fileMeta?.name || ''}`;
                  } else {
                    snippet = lastMsg.text;
                  }
                }

                // Unread messages logic (simplistic implementation based on read state)
                const unreads = deviceMessages.filter(m => !m.read && m.senderId !== 'self').length;

                return (
                  <ProfileRow
                    key={device.id}
                    device={device}
                    lastActivity={snippet}
                    unreadCount={unreads}
                    isOnline={Date.now() - device.lastSeen < 30000} // Active heartbeat within 30s
                    onClick={() => {
                      useStore.getState().selectDevice(device);
                      navigate(`/chat/${device.id}`);
                    }}
                  />
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) for pairing */}
      <motion.button
        type="button"
        onClick={() => setPairingOpen(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-br from-brand-600 to-brand-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/25 active:scale-95 transition-all z-40 glow-brand"
      >
        <QrCode className="h-6 w-6" />
      </motion.button>

      {/* Slide up Pairing Sheet */}
      <PairingSheet isOpen={pairingOpen} onClose={() => setPairingOpen(false)} />

      {/* Slide up Settings Sheet */}
      <SettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
