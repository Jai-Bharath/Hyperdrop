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
    openFileDialog: () => {
        return ipcRenderer.invoke('dialog:openFile');
    },
    /**
     * Open native folder picker dialog.
     * Returns array of selected folder paths.
     */
    openFolderDialog: () => {
        return ipcRenderer.invoke('dialog:openFolder');
    },
    /**
     * Get the app version string.
     */
    getVersion: () => {
        return ipcRenderer.invoke('app:version');
    },
    /**
     * Get the user's downloads directory path.
     */
    getDownloadsPath: () => {
        return ipcRenderer.invoke('app:downloadsPath');
    },
    /**
     * Show a native OS notification.
     */
    notify: (title, body) => {
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
