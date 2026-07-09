/**
 * TypeScript bridge to the native Android LocalServer Capacitor plugin.
 *
 * On native (Capacitor), this registers with the Kotlin LocalServerPlugin.
 * On web, the plugin is unavailable — callers should guard with
 * Capacitor.isNativePlatform() before using any method.
 */
import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface LocalServerPlugin {
  /** Start the embedded NanoHTTPD HTTP server */
  startServer(options: { port: number }): Promise<void>;

  /** Stop the HTTP server */
  stopServer(): Promise<void>;

  /** Start UDP multicast discovery (listen for peer announcements) */
  startDiscovery(): Promise<void>;

  /** Stop UDP multicast discovery */
  stopDiscovery(): Promise<void>;

  /** Broadcast an announce packet via UDP multicast */
  sendAnnounce(options: { message: string }): Promise<void>;

  /** Get the device's local Wi-Fi IP address */
  getLocalIpAddress(): Promise<{ ip: string }>;

  /** Respond to a pending transfer consent dialog */
  respondToTransfer(options: {
    sessionId: string;
    accepted: boolean;
    sessionToken?: string;
    reason?: string;
  }): Promise<void>;

  /** Listen for peer discovery announcements */
  addListener(
    eventName: 'peerAnnounce',
    listener: (data: { message: string; fromIp: string }) => void
  ): Promise<PluginListenerHandle>;

  /** Listen for incoming transfer requests (consent modal trigger) */
  addListener(
    eventName: 'transferRequest',
    listener: (data: {
      sessionId: string;
      senderAlias: string;
      senderFingerprint: string;
      senderPublicKey: string;
      files: string; // JSON array
      totalSize: number;
      fileCount: number;
    }) => void
  ): Promise<PluginListenerHandle>;

  /** Listen for transfer completion events */
  addListener(
    eventName: 'transferComplete',
    listener: (data: {
      transferId: string;
      fileName: string;
      fileSize: number;
      filePath: string;
    }) => void
  ): Promise<PluginListenerHandle>;

  /** Listen for incoming chat messages */
  addListener(
    eventName: 'chatMessage',
    listener: (data: {
      id: string;
      text: string;
      senderFingerprint: string;
      senderAlias: string;
      timestamp: number;
      isCode: boolean;
    }) => void
  ): Promise<PluginListenerHandle>;

  /** Listen for incoming clipboard sync */
  addListener(
    eventName: 'clipboardSync',
    listener: (data: {
      id: string;
      content: string;
      contentType: string;
      senderFingerprint: string;
      senderAlias: string;
      timestamp: number;
    }) => void
  ): Promise<PluginListenerHandle>;
}

export const LocalServer = registerPlugin<LocalServerPlugin>('LocalServer');
