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
  
  // Custom states that we'll add to useStore later (Phase 4)
  // For now, we'll read/write from local storage & component state as a bridge
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>(() => {
    return (localStorage.getItem('hyperdrop-theme') as any) || 'dark';
  });

  const [deviceName, setDeviceName] = useState(() => {
    return localStorage.getItem('hyperdrop-custom-device-name') || '';
  });

  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(deviceName);

  const handleThemeChange = (newTheme: 'dark' | 'light' | 'system') => {
    setTheme(newTheme);
    localStorage.setItem('hyperdrop-theme', newTheme);
    
    // Dispatch system toggle event
    const root = window.document.documentElement;
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
  };

  const handleSaveName = () => {
    const clean = tempName.trim();
    if (clean) {
      setDeviceName(clean);
      localStorage.setItem('hyperdrop-custom-device-name', clean);
      
      // Let's also update store so socket re-registers with new name
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
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
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

            {/* Content Area */}
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
                          className="flex-1 bg-surface-dark border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:border-brand-500"
                        />
                        <button
                          type="button"
                          onClick={handleSaveName}
                          className="p-2 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-500"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {deviceName || 'Hyperdrop Web Client'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setTempName(deviceName);
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

              {/* Theme Settings Section */}
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Appearance Theme
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleThemeChange('light')}
                    className={`flex flex-col items-center justify-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all ${
                      theme === 'light'
                        ? 'bg-brand-500/10 border-brand-500/30 text-brand-500 shadow-sm'
                        : 'bg-surface-light border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Sun className="h-4.5 w-4.5" />
                    <span>Light</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => handleThemeChange('dark')}
                    className={`flex flex-col items-center justify-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all ${
                      theme === 'dark'
                        ? 'bg-brand-500/10 border-brand-500/30 text-brand-500 shadow-sm'
                        : 'bg-surface-light border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Moon className="h-4.5 w-4.5" />
                    <span>Dark</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange('system')}
                    className={`flex flex-col items-center justify-center gap-2 py-3 rounded-2xl border text-xs font-bold transition-all ${
                      theme === 'system'
                        ? 'bg-brand-500/10 border-brand-500/30 text-brand-500 shadow-sm'
                        : 'bg-surface-light border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <Laptop className="h-4.5 w-4.5" />
                    <span>System</span>
                  </button>
                </div>
              </div>

              {/* Data & History Section */}
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-500 hover:bg-red-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
