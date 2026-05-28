import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Type Definitions ────────────────────────────────────────

export type Protocol = 'parallel-http' | 'http-stream' | 'ftp' | 'webrtc' | 'http-chunk' | 'detecting';
export type TransferDirection = 'send' | 'receive';
export type TransferStatus = 'pending' | 'transferring' | 'verifying' | 'done' | 'error' | 'cancelled';

export interface Device {
  id: string;
  name: string;
  ip: string;
  port: number;
  platform: string;
  supports5GHz: boolean;
  lastSeen: number;
}

export interface ChunkProgress {
  total: number;
  done: number;
  failed: number[];
}

export interface Transfer {
  id: string;
  fileName: string;
  fileSize: number;
  transferred: number;
  speed: number;
  protocol: Protocol;
  direction: TransferDirection;
  status: TransferStatus;
  startedAt: number;
  error?: string;
  chunks: ChunkProgress;
}

export interface HistoryEntry {
  id: string;
  fileName: string;
  fileSize: number;
  protocol: Protocol;
  direction: TransferDirection;
  speed: number;
  duration: number;
  completedAt: number;
  deviceName: string;
}

// ─── Store Interface ─────────────────────────────────────────

export interface DisconnectAlert {
  visible: boolean;
  deviceName: string;
  transferId: string;
  fileName: string;
}

interface HyperDropState {
  // Connection
  connected: boolean;
  serverIp: string;
  serverPort: number;
  ftpPort: number;
  socketUrl: string;
  apiBaseUrl: string;

  // Devices
  devices: Device[];
  selectedDevice: Device | null;

  // Transfers
  transfers: Transfer[];
  activeTransferId: string | null;

  // Disconnect Alert
  disconnectAlert: DisconnectAlert | null;

  // History
  history: HistoryEntry[];

  // Files
  selectedFiles: File[];

  // PWA Installation
  deferredPrompt: any;
  setDeferredPrompt: (prompt: any) => void;

  // Actions — Connection
  setConnected: (connected: boolean) => void;
  setServerInfo: (ip: string, port: number, ftpPort: number) => void;
  setSocketUrl: (socketUrl: string) => void;
  setApiBaseUrl: (url: string) => void;

  // Actions — Devices
  addDevice: (device: Device) => void;
  removeDevice: (id: string) => void;
  updateDeviceLastSeen: (id: string) => void;
  setDevices: (devices: Device[]) => void;
  selectDevice: (device: Device | null) => void;
  pruneStaleDevices: (maxAge: number) => void;

  // Actions — Transfers
  addTransfer: (transfer: Transfer) => void;
  updateTransfer: (id: string, updates: Partial<Transfer>) => void;
  removeTransfer: (id: string) => void;
  setActiveTransfer: (id: string | null) => void;

  // Actions — Disconnect Alert
  showDisconnectAlert: (alert: Omit<DisconnectAlert, 'visible'>) => void;
  dismissDisconnectAlert: () => void;

  // Actions — History
  addHistoryEntry: (entry: HistoryEntry) => void;
  clearHistory: () => void;

  // Actions — Files
  setSelectedFiles: (files: File[]) => void;
  clearSelectedFiles: () => void;
}

// ─── Store Implementation ────────────────────────────────────

export const useStore = create<HyperDropState>()(
  persist(
    (set, get) => ({
      // Initial state
      connected: false,
      serverIp: '',
      serverPort: 3001,
      ftpPort: 2121,
      socketUrl: '',
      apiBaseUrl: '',
      devices: [],
      selectedDevice: null,
      transfers: [],
      activeTransferId: null,
      disconnectAlert: null,
      history: [],
      selectedFiles: [],
      deferredPrompt: null,

      // Connection
      setConnected: (connected) => set({ connected }),
      setServerInfo: (serverIp, serverPort, ftpPort) => set({ serverIp, serverPort, ftpPort }),
      setSocketUrl: (socketUrl: string) => set({ socketUrl }),
      setApiBaseUrl: (apiBaseUrl: string) => set({ apiBaseUrl }),
      setDeferredPrompt: (deferredPrompt) => set({ deferredPrompt }),

      // Devices
      addDevice: (device) =>
        set((state) => {
          const existing = state.devices.findIndex((d) => d.id === device.id);
          if (existing >= 0) {
            const updated = [...state.devices];
            updated[existing] = { ...device, lastSeen: Date.now() };
            return { devices: updated };
          }
          return { devices: [...state.devices, { ...device, lastSeen: Date.now() }] };
        }),

      removeDevice: (id) =>
        set((state) => ({
          devices: state.devices.filter((d) => d.id !== id),
          selectedDevice: state.selectedDevice?.id === id ? null : state.selectedDevice,
        })),

      updateDeviceLastSeen: (id) =>
        set((state) => ({
          devices: state.devices.map((d) =>
            d.id === id ? { ...d, lastSeen: Date.now() } : d
          ),
        })),

      setDevices: (devices) => set({ devices }),

      selectDevice: (device) => set({ selectedDevice: device }),

      pruneStaleDevices: (maxAge) =>
        set((state) => {
          const now = Date.now();
          const active = state.devices.filter((d) => now - d.lastSeen < maxAge);
          return {
            devices: active,
            selectedDevice:
              state.selectedDevice && active.find((d) => d.id === state.selectedDevice!.id)
                ? state.selectedDevice
                : null,
          };
        }),

      // Transfers
      addTransfer: (transfer) =>
        set((state) => ({
          transfers: [...state.transfers, transfer],
          activeTransferId: transfer.id,
        })),

      updateTransfer: (id, updates) =>
        set((state) => ({
          transfers: state.transfers.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      removeTransfer: (id) =>
        set((state) => ({
          transfers: state.transfers.filter((t) => t.id !== id),
          activeTransferId: state.activeTransferId === id ? null : state.activeTransferId,
        })),

      setActiveTransfer: (id) => set({ activeTransferId: id }),

      // Disconnect Alert
      showDisconnectAlert: (alert) =>
        set({ disconnectAlert: { ...alert, visible: true } }),
      dismissDisconnectAlert: () => set({ disconnectAlert: null }),

      // History
      addHistoryEntry: (entry) =>
        set((state) => {
          if (state.history.some((h) => h.id === entry.id)) {
            return state;
          }
          return {
            history: [entry, ...state.history].slice(0, 100), // Keep last 100
          };
        }),

      clearHistory: () => set({ history: [] }),

      // Files
      setSelectedFiles: (files) => set({ selectedFiles: files }),
      clearSelectedFiles: () => set({ selectedFiles: [] }),
    }),
    {
      name: 'hyperdrop-storage',
      // Only persist history — other state is ephemeral (sockets, File objects, etc.)
      partialize: (state) => ({ history: state.history }),
    }
  )
);
