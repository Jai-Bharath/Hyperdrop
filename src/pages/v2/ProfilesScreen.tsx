import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, QrCode, Settings, Search, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { rescanSubnet, getMyIp } from '../../hooks/useDiscovery';
import ProfileRow from '../../components/v2/ProfileRow';
import EmptyState from '../../components/v2/EmptyState';
import PairingSheet from '../../components/v2/PairingSheet';
import SettingsSheet from '../../components/v2/SettingsSheet';
import SkeletonRow from '../../components/v2/SkeletonRow';

type FilterChip = 'all' | 'online' | 'recent';

interface ProfilesScreenProps {
  isDesktop?: boolean;
}

export default function ProfilesScreen({ isDesktop = false }: ProfilesScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const devices = useStore((s) => s.devices);
  const connected = useStore((s) => s.connected);
  const serverIp = useStore((s) => s.serverIp);
  const conversations = useStore((s) => s.conversations);
  const selectedDevice = useStore((s) => s.selectedDevice);

  const [isScanning, setIsScanning] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterChip>('all');

  const myIp = serverIp || getMyIp();

  // Determine which device is currently selected (from URL on desktop)
  const activeDeviceId = isDesktop
    ? location.pathname.match(/\/chat\/(.+)/)?.[1] || null
    : selectedDevice?.id || null;

  // Handle rescan
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

  // Initial scan
  useEffect(() => {
    handleRescan();
  }, []);

  // Filter and sort devices
  const filteredDevices = useMemo(() => {
    let result = [...devices];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.ip.toLowerCase().includes(q)
      );
    }

    // Chip filter
    const now = Date.now();
    if (activeFilter === 'online') {
      result = result.filter((d) => now - d.lastSeen < 30000);
    } else if (activeFilter === 'recent') {
      // Devices with conversation history
      result = result.filter((d) => (conversations[d.id]?.length || 0) > 0);
    }

    // Sort: online first, then by lastSeen descending
    result.sort((a, b) => {
      const aOnline = now - a.lastSeen < 30000 ? 1 : 0;
      const bOnline = now - b.lastSeen < 30000 ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return b.lastSeen - a.lastSeen;
    });

    return result;
  }, [devices, searchQuery, activeFilter, conversations]);

  const handleDeviceClick = (device: typeof devices[0]) => {
    useStore.getState().selectDevice(device);
    navigate(`/chat/${device.id}`);
  };

  const filters: { key: FilterChip; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'online', label: 'Online' },
    { key: 'recent', label: 'Recent' },
  ];

  const onlineCount = devices.filter((d) => Date.now() - d.lastSeen < 30000).length;

  return (
    <div className={`flex flex-col h-full select-none ${isDesktop ? '' : 'px-4 pt-4 pb-8 max-w-lg mx-auto min-h-[calc(100dvh-2rem)]'}`}>

      {/* ─── Top Header ────────────────────────────────────── */}
      <div className={`flex items-center justify-between shrink-0 ${isDesktop ? 'px-5 pt-5 pb-3' : 'px-1 mb-4'}`}>
        <div>
          <h1 className="text-xl font-extrabold text-text-primary tracking-tight flex items-center gap-1.5">
            <span className="text-gradient">Hyperdrop</span>
          </h1>
          <p className="text-[9px] text-text-muted font-bold uppercase tracking-wider mt-0.5 flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {connected ? `Online · ${myIp || 'LAN'}` : 'Disconnected'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRescan}
            className={`p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-light active:scale-95 transition-all ${
              isScanning ? 'animate-spin' : ''
            }`}
            aria-label="Rescan network"
          >
            <RefreshCw className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-light active:scale-95 transition-all"
            aria-label="Settings"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      {/* ─── Search Bar ────────────────────────────────────── */}
      <div className={`shrink-0 ${isDesktop ? 'px-4 pb-3' : 'px-1 mb-3'}`}>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search devices or chats"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-9 bg-surface-light border border-border rounded-xl text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/15 transition-all duration-200"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Filter Chips ──────────────────────────────────── */}
      <div className={`flex items-center gap-2 shrink-0 ${isDesktop ? 'px-5 pb-3' : 'px-1 mb-4'}`}>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setActiveFilter(f.key)}
            className={activeFilter === f.key ? 'chip-active' : 'chip'}
          >
            {f.label}
            {f.key === 'online' && onlineCount > 0 && (
              <span className="ml-1 text-[9px] font-bold opacity-70">{onlineCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Device List ───────────────────────────────────── */}
      <div className={`flex-1 overflow-y-auto min-h-0 space-y-1.5 ${isDesktop ? 'px-3' : 'px-1'}`}>
        {isScanning && filteredDevices.length === 0 ? (
          <div className="space-y-2 px-1">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : filteredDevices.length === 0 ? (
          <EmptyState type="profiles" onPairClick={() => setPairingOpen(true)} />
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredDevices.map((device, index) => {
              const deviceMessages = conversations[device.id] || [];
              const lastMsg = deviceMessages[deviceMessages.length - 1];
              let snippet = 'No messages yet';
              let snippetTime = '';

              if (lastMsg) {
                if (lastMsg.type === 'file' || lastMsg.type === 'folder') {
                  snippet = `📁 ${lastMsg.fileMeta?.name || 'File sent'}`;
                } else if (lastMsg.type === 'transfer') {
                  snippet = `⚡ ${lastMsg.fileMeta?.name || 'Transferring...'}`;
                } else {
                  snippet = lastMsg.text;
                }

                // Relative timestamp
                const diff = Date.now() - lastMsg.timestamp;
                if (diff < 60000) snippetTime = 'now';
                else if (diff < 3600000) snippetTime = `${Math.floor(diff / 60000)}m`;
                else if (diff < 86400000) snippetTime = `${Math.floor(diff / 3600000)}h`;
                else snippetTime = new Date(lastMsg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
              }

              const unreads = deviceMessages.filter(
                (m) => !m.read && m.senderId !== 'self'
              ).length;

              return (
                <motion.div
                  key={device.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 28,
                    delay: index * 0.06,
                  }}
                >
                  <ProfileRow
                    device={device}
                    lastActivity={snippet}
                    lastActivityTime={snippetTime}
                    unreadCount={unreads}
                    isOnline={Date.now() - device.lastSeen < 30000}
                    isSelected={activeDeviceId === device.id}
                    onClick={() => handleDeviceClick(device)}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* ─── Floating Pair Button (mobile only) ────────────── */}
      {!isDesktop && (
        <motion.button
          type="button"
          onClick={() => setPairingOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-br from-brand-600 to-brand-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/25 active:scale-95 transition-all z-40 glow-brand"
          aria-label="Pair new device"
        >
          <QrCode className="h-6 w-6" />
        </motion.button>
      )}

      {/* ─── Pair Button (desktop — bottom of sidebar) ──────── */}
      {isDesktop && (
        <div className="shrink-0 px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={() => setPairingOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-500 text-xs font-bold hover:bg-brand-500/15 active:scale-[0.98] transition-all"
          >
            <QrCode className="h-4 w-4" />
            Pair New Device
          </button>
        </div>
      )}

      {/* ─── Sheets ────────────────────────────────────────── */}
      <PairingSheet isOpen={pairingOpen} onClose={() => setPairingOpen(false)} />
      <SettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
