import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, Laptop, Trash2, Edit2, Check, Shield } from 'lucide-react';
import { useStore } from '../../store/useStore';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsSheet({ isOpen, onClose }: SettingsSheetProps) {
  const history = useStore((s) => s.history);
  const clearHistory = useStore((s) => s.clearHistory);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const customDeviceName = useStore((s) => s.customDeviceName);
  const setCustomDeviceName = useStore((s) => s.setCustomDeviceName);

  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(customDeviceName);

  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system') => {
    // Add transitioning class for smooth crossfade
    const root = document.documentElement;
    root.classList.add('theme-transitioning');

    setTheme(newTheme);

    // Apply class
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else if (newTheme === 'light') {
      root.classList.remove('dark');
    } else {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (systemDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    // Remove transitioning class after animation completes
    setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 400);
  };

  const handleSaveName = () => {
    const clean = tempName.trim();
    if (clean) {
      setCustomDeviceName(clean);

      // Re-register with socket if available
      const socket = (window as any).__hyperdrop_socket;
      if (socket) {
        const deviceId = localStorage.getItem('hyperdrop-device-id') || '';
        socket.emit('device:register', {
          deviceId,
          name: clean,
          platform: 'web',
          supports5GHz: true,
          port: window.location.port ? parseInt(window.location.port, 10) : 80
        });
      }
    }
    setEditingName(false);
  };

  const themeOptions: { key: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
    { key: 'light', label: 'Light', icon: Sun },
    { key: 'dark', label: 'Dark', icon: Moon },
    { key: 'system', label: 'System', icon: Laptop },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Spring Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative z-10 w-full max-w-lg bg-surface-default border-t border-border rounded-t-[32px] p-6 shadow-2xl safe-bottom max-h-[85dvh] flex flex-col"
          >
            {/* Sheet Handle */}
            <div className="mx-auto w-12 h-1.5 rounded-full bg-border-default mb-4 shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6 shrink-0">
              <h2 className="text-base font-bold text-text-primary">Settings</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl text-text-secondary hover:bg-surface-light hover:text-text-primary active:scale-95 transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto space-y-6 pb-4">
              
              {/* Device Profile Section */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Device Profile
                </h3>
                <div className="bg-surface-light border border-border rounded-2xl p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider mb-1">
                      Local Device Name
                    </p>
                    {editingName ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                          autoFocus
                          className="flex-1 bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-500/50 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={handleSaveName}
                          className="p-2 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-500 hover:bg-brand-500/20 transition-colors"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {customDeviceName || 'Hyperdrop Web Client'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTempName(customDeviceName);
                            setEditingName(true);
                          }}
                          className="p-1 rounded text-text-muted hover:text-brand-500 transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Theme Section */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Appearance
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {themeOptions.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleThemeChange(key)}
                      className={`flex flex-col items-center justify-center gap-2 py-3.5 rounded-2xl border text-xs font-bold transition-all duration-200 active:scale-[0.97] ${
                        theme === key
                          ? 'bg-brand-500/10 border-brand-500/30 text-brand-500 shadow-sm'
                          : 'bg-surface-light border-border text-text-secondary hover:text-text-primary hover:border-border'
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* History Section */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  History & Storage
                </h3>
                <div className="bg-surface-light border border-border rounded-2xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-text-primary">Clear Transfer History</p>
                      <p className="text-[10px] text-text-muted">Delete recent transfer history cache.</p>
                    </div>
                    
                    <button
                      type="button"
                      disabled={history.length === 0}
                      onClick={() => {
                        if (confirm('Clear all transfer history?')) {
                          clearHistory();
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/15 text-xs font-bold text-red-500 hover:bg-red-500/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear ({history.length})
                    </button>
                  </div>
                </div>
              </div>

              {/* Security Banner */}
              <div className="flex gap-3 rounded-2xl bg-brand-500/5 border border-brand-500/10 p-4 text-xs text-brand-500">
                <Shield className="h-5 w-5 shrink-0 text-brand-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold leading-none">End-to-End Encrypted</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Transfers use TLS (HTTPS) on Native platforms and DTLS on WebRTC DataChannels. Your data never touches any cloud relay.
                  </p>
                </div>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
