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
  /** How this device was discovered — 'socket' devices are managed by device:lost events and should NOT be pruned by the stale timer */
  source?: 'socket' | 'http' | 'mdns';
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
  deviceName?: string;
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
  conversations: Record<string, ChatMessageData[]>;
  theme: 'dark' | 'light' | 'system';
  customDeviceName: string;
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
  addChatMessage: (message: ChatMessageData, targetDeviceId?: string) => void;
  clearChat: (deviceId?: string) => void;
  setUnreadCount: (count: number) => void;
  setChatOpen: (open: boolean) => void;
  setPeerTyping: (typing: boolean) => void;
  markMessageRead: (messageId: string, deviceId?: string) => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  setCustomDeviceName: (name: string) => void;

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
      serverPort: 53317,
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
      conversations: {},
      theme: 'dark',
      customDeviceName: '',
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

      selectDevice: (device: Device | null) =>
        set((state: HyperDropState) => {
          const chatMsgs = device ? (state.conversations[device.id] || []) : [];
          return {
            selectedDevice: device,
            chatMessages: chatMsgs,
          };
        }),

      pruneStaleDevices: (maxAge: number) =>
        set((state: HyperDropState) => {
          const now = Date.now();
          // NEVER prune socket-discovered devices
          const active = state.devices.filter(
              (d: Device) => d.source === 'socket' || now - d.lastSeen < maxAge
          );
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
        set((state: HyperDropState) => {
          const deviceId = transfer.targetDeviceId;
          let newConversations = state.conversations;
          let newChatMessages = state.chatMessages;

          if (deviceId) {
            const currentMsgs = state.conversations[deviceId] || [];
            if (!currentMsgs.some(m => m.id === transfer.id)) {
              const msg: ChatMessageData = {
                id: transfer.id,
                text: `Transfer: ${transfer.fileName}`,
                senderId: transfer.direction === 'send' ? 'self' : deviceId,
                senderName: transfer.direction === 'send' ? 'Me' : (transfer.deviceName || 'Sender'),
                timestamp: transfer.startedAt,
                isCode: false,
                read: true,
                type: 'transfer',
                fileMeta: {
                  id: transfer.id,
                  name: transfer.fileName,
                  size: transfer.fileSize,
                  mimeType: 'application/octet-stream',
                  relativePath: transfer.relativePath,
                },
                transferState: {
                  status: transfer.status,
                  progress: 0,
                  transferred: 0,
                  speed: 0,
                },
              };
              const updatedMsgs = [...currentMsgs, msg];
              newConversations = {
                ...state.conversations,
                [deviceId]: updatedMsgs,
              };
              if (state.selectedDevice?.id === deviceId) {
                newChatMessages = updatedMsgs;
              }
            }
          }

          return {
            transfers: [...state.transfers, transfer],
            activeTransferId: transfer.id,
            conversations: newConversations,
            chatMessages: newChatMessages,
          };
        }),

      updateTransfer: (id: string, updates: Partial<Transfer>) =>
        set((state: HyperDropState) => {
          const newTransfers = state.transfers.map((t: Transfer) =>
            t.id === id ? { ...t, ...updates } : t
          );

          const transfer = state.transfers.find((t) => t.id === id);
          const deviceId = transfer?.targetDeviceId;

          let newConversations = state.conversations;
          let newChatMessages = state.chatMessages;

          if (deviceId && state.conversations[deviceId]) {
            const currentMsgs = state.conversations[deviceId] || [];
            const updatedMsgs = currentMsgs.map((m) => {
              if (m.id === id) {
                const total = updates.fileSize ?? transfer?.fileSize ?? 1;
                const done = updates.transferred ?? m.transferState?.transferred ?? 0;
                const status = updates.status ?? transfer?.status ?? m.transferState?.status ?? 'pending';
                const fileMeta = m.fileMeta;
                
                // If transfer completes, convert bubble from 'transfer' to 'file' style for persistent downloads
                const isCompleted = status === 'done';

                return {
                  ...m,
                  type: (isCompleted ? 'file' : 'transfer') as 'file' | 'transfer',
                  fileMeta: isCompleted && fileMeta ? {
                    ...fileMeta,
                    blobUrl: updates.blobUrl ?? transfer?.blobUrl ?? fileMeta.blobUrl,
                  } : fileMeta,
                  transferState: {
                    status: status as any,
                    progress: Math.min(100, Math.max(0, (done / total) * 100)),
                    transferred: done,
                    speed: updates.speed ?? m.transferState?.speed ?? 0,
                    error: updates.error ?? m.transferState?.error,
                  },
                };
              }
              return m;
            });

            newConversations = {
              ...state.conversations,
              [deviceId]: updatedMsgs,
            };

            if (state.selectedDevice?.id === deviceId) {
              newChatMessages = updatedMsgs;
            }
          }

          return {
            transfers: newTransfers,
            conversations: newConversations,
            chatMessages: newChatMessages,
          };
        }),

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
      addChatMessage: (message: ChatMessageData, targetDeviceId?: string) =>
        set((state: HyperDropState) => {
          const activeId = targetDeviceId || (message.senderId === 'self' ? state.selectedDevice?.id : message.senderId);
          if (!activeId) return state;

          const current = state.conversations[activeId] || [];
          if (current.some((m) => m.id === message.id)) {
            return state;
          }

          const updated = [...current, message].slice(-200);
          const isCurrentActive = state.chatOpen && state.selectedDevice?.id === activeId;
          const newConversations = {
            ...state.conversations,
            [activeId]: updated,
          };

          return {
            conversations: newConversations,
            chatMessages: state.selectedDevice?.id === activeId ? updated : state.chatMessages,
            unreadCount: isCurrentActive ? state.unreadCount : state.unreadCount + (message.senderId !== 'self' ? 1 : 0),
          };
        }),

      clearChat: (deviceId?: string) =>
        set((state: HyperDropState) => {
          const target = deviceId || state.selectedDevice?.id;
          if (!target) return state;
          const updated = { ...state.conversations };
          delete updated[target];
          return {
            conversations: updated,
            chatMessages: state.selectedDevice?.id === target ? [] : state.chatMessages,
          };
        }),

      setUnreadCount: (unreadCount: number) => set({ unreadCount }),
      setChatOpen: (chatOpen: boolean) => set((state: HyperDropState) => ({ chatOpen, unreadCount: chatOpen ? 0 : state.unreadCount })),
      setPeerTyping: (peerTyping: boolean) => set({ peerTyping }),
      markMessageRead: (messageId: string, deviceId?: string) =>
        set((state: HyperDropState) => {
          const target = deviceId || state.selectedDevice?.id;
          if (!target) return state;
          const current = state.conversations[target] || [];
          const updated = current.map((m) =>
            m.id === messageId ? { ...m, read: true } : m
          );
          return {
            conversations: {
              ...state.conversations,
              [target]: updated,
            },
            chatMessages: state.selectedDevice?.id === target ? updated : state.chatMessages,
          };
        }),

      setTheme: (theme: 'dark' | 'light' | 'system') => set({ theme }),
      setCustomDeviceName: (customDeviceName: string) => set({ customDeviceName }),

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
      partialize: (state) => ({
        history: state.history,
        conversations: state.conversations,
        theme: state.theme,
        customDeviceName: state.customDeviceName,
      }),
    }
  )
);
