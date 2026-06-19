import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Type Definitions ────────────────────────────────────────

export type Protocol = 'parallel-http' | 'webrtc' | 'http-chunk' | 'detecting';
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
  targetDeviceId?: string;
  relativePath?: string;
  blobUrl?: string;
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

  // Chat
  chatMessages: ChatMessageData[];
  peerTyping: boolean;
  unreadCount: number;
  chatOpen: boolean;

  // Clipboard
  clipboardHistory: ClipboardEntryData[];
  clipboardSyncEnabled: boolean;

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

  // Actions — Chat
  addChatMessage: (message: ChatMessageData) => void;
  clearChat: () => void;
  setUnreadCount: (count: number) => void;
  setChatOpen: (open: boolean) => void;
  setPeerTyping: (typing: boolean) => void;
  markMessageRead: (messageId: string) => void;

  // Actions — Clipboard
  addClipboardEntry: (entry: ClipboardEntryData) => void;
  clearClipboard: () => void;
  setClipboardSyncEnabled: (enabled: boolean) => void;
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
      chatMessages: [],
      peerTyping: false,
      unreadCount: 0,
      chatOpen: false,
      clipboardHistory: [],
      clipboardSyncEnabled: true,

      // Connection
      setConnected: (connected: boolean) => set({ connected }),
      setServerInfo: (serverIp: string, serverPort: number, ftpPort: number) => set({ serverIp, serverPort, ftpPort }),
      setSocketUrl: (socketUrl: string) => set({ socketUrl }),
      setApiBaseUrl: (apiBaseUrl: string) => set({ apiBaseUrl }),
      setDeferredPrompt: (deferredPrompt: any) => set({ deferredPrompt }),

      // Devices
      addDevice: (device: Device) =>
        set((state: HyperDropState) => {
          const existing = state.devices.findIndex((d: Device) => d.id === device.id);
          if (existing >= 0) {
            const updated = [...state.devices];
            updated[existing] = { ...device, lastSeen: Date.now() };
            return { devices: updated };
          }
          return { devices: [...state.devices, { ...device, lastSeen: Date.now() }] };
        }),

      removeDevice: (id: string) =>
        set((state: HyperDropState) => ({
          devices: state.devices.filter((d: Device) => d.id !== id),
          selectedDevice: state.selectedDevice?.id === id ? null : state.selectedDevice,
        })),

      updateDeviceLastSeen: (id: string) =>
        set((state: HyperDropState) => ({
          devices: state.devices.map((d: Device) =>
            d.id === id ? { ...d, lastSeen: Date.now() } : d
          ),
        })),

      setDevices: (devices: Device[]) => set({ devices }),

      selectDevice: (device: Device | null) => set({ selectedDevice: device }),

      pruneStaleDevices: (maxAge: number) =>
        set((state: HyperDropState) => {
          const now = Date.now();
          const active = state.devices.filter((d: Device) => now - d.lastSeen < maxAge);
          return {
            devices: active,
            selectedDevice:
              state.selectedDevice && active.find((d: Device) => d.id === state.selectedDevice!.id)
                ? state.selectedDevice
                : null,
          };
        }),

      // Transfers
      addTransfer: (transfer: Transfer) =>
        set((state: HyperDropState) => ({
          transfers: [...state.transfers, transfer],
          activeTransferId: transfer.id,
        })),

      updateTransfer: (id: string, updates: Partial<Transfer>) =>
        set((state: HyperDropState) => ({
          transfers: state.transfers.map((t: Transfer) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        })),

      removeTransfer: (id: string) =>
        set((state: HyperDropState) => ({
          transfers: state.transfers.filter((t: Transfer) => t.id !== id),
          activeTransferId: state.activeTransferId === id ? null : state.activeTransferId,
        })),

      setActiveTransfer: (id: string | null) => set({ activeTransferId: id }),

      // Disconnect Alert
      showDisconnectAlert: (alert: Omit<DisconnectAlert, 'visible'>) =>
        set({ disconnectAlert: { ...alert, visible: true } }),
      dismissDisconnectAlert: () => set({ disconnectAlert: null }),

      // History
      addHistoryEntry: (entry: HistoryEntry) =>
        set((state: HyperDropState) => {
          if (state.history.some((h: HistoryEntry) => h.id === entry.id)) {
            return state;
          }
          return {
            history: [entry, ...state.history].slice(0, 100), // Keep last 100
          };
        }),

      clearHistory: () => set({ history: [] }),

      // Files
      setSelectedFiles: (files: File[]) => set({ selectedFiles: files }),
      clearSelectedFiles: () => set({ selectedFiles: [] }),

      // Chat
      addChatMessage: (message: ChatMessageData) =>
        set((state: HyperDropState) => {
          // Deduplicate by message ID
          if (state.chatMessages.some((m) => m.id === message.id)) {
            return state;
          }
          return {
            chatMessages: [...state.chatMessages, message].slice(-200), // Keep last 200
            unreadCount: state.chatOpen ? state.unreadCount : state.unreadCount + (message.senderId !== 'self' ? 1 : 0),
          };
        }),
      clearChat: () => set({ chatMessages: [], unreadCount: 0 }),
      setUnreadCount: (unreadCount: number) => set({ unreadCount }),
      setChatOpen: (chatOpen: boolean) => set((state: HyperDropState) => ({ chatOpen, unreadCount: chatOpen ? 0 : state.unreadCount })),
      setPeerTyping: (peerTyping: boolean) => set({ peerTyping }),
      markMessageRead: (messageId: string) =>
        set((state: HyperDropState) => ({
          chatMessages: state.chatMessages.map((m) =>
            m.id === messageId ? { ...m, read: true } : m
          ),
        })),

      // Clipboard
      addClipboardEntry: (entry: ClipboardEntryData) =>
        set((state: HyperDropState) => ({
          clipboardHistory: [entry, ...state.clipboardHistory].slice(0, 50),
        })),
      clearClipboard: () => set({ clipboardHistory: [] }),
      setClipboardSyncEnabled: (clipboardSyncEnabled: boolean) => set({ clipboardSyncEnabled }),
    }),
    {
      name: 'hyperdrop-storage',
      // Only persist history — transfers are volatile (connections lost on reload)
      partialize: (state) => ({
        history: state.history,
      }),
    }
  )
);
