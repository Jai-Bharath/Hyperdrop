/**
 * HyperDrop Electron — Preload Script
 *
 * Exposes safe Node.js APIs to the renderer process via contextBridge.
 * Provides native file system access, notifications, and app info.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ─── Expose HyperDrop Desktop API to renderer ────────────────────────

contextBridge.exposeInMainWorld('__ELECTRON__', true);

contextBridge.exposeInMainWorld('hyperdropDesktop', {
  /**
   * Open native file picker dialog.
   * Returns array of selected file paths.
   */
  openFileDialog: (): Promise<string[]> => {
    return ipcRenderer.invoke('dialog:openFile');
  },

  /**
   * Open native folder picker dialog.
   * Returns array of selected folder paths.
   */
  openFolderDialog: (): Promise<string[]> => {
    return ipcRenderer.invoke('dialog:openFolder');
  },

  /**
   * Get the app version string.
   */
  getVersion: (): Promise<string> => {
    return ipcRenderer.invoke('app:version');
  },

  /**
   * Get the user's downloads directory path.
   */
  getDownloadsPath: (): Promise<string> => {
    return ipcRenderer.invoke('app:downloadsPath');
  },

  /**
   * Show a native OS notification.
   */
  notify: (title: string, body: string): void => {
    ipcRenderer.send('notify', { title, body });
  },

  /**
   * Platform identifier.
   */
  platform: process.platform,

  /**
   * Whether this is running in Electron.
   */
  isElectron: true,
});
