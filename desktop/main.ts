/**
 * HyperDrop Electron — Main Process
 *
 * Embeds the local Express + Socket.IO server and serves the Vite-built
 * frontend in a BrowserWindow. System tray for background operation.
 *
 * Zero cloud. Zero internet. Fully offline.
 */

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork, ChildProcess } from 'child_process';

// ─── Constants ────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_PORT = 3001;
const APP_URL = `http://localhost:${SERVER_PORT}`;
const IS_DEV = process.env.NODE_ENV === 'development';

// ─── State ────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;
let isQuitting = false;

// ─── Server Lifecycle ─────────────────────────────────────────────────

function startEmbeddedServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const serverPath = IS_DEV
      ? path.join(__dirname, '..', 'server', 'index.ts')
      : path.join(__dirname, '..', 'server', 'index.js');

    const execArgv = IS_DEV ? ['--import', 'tsx'] : [];

    serverProcess = fork(serverPath, [], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      execArgv,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'production',
        ELECTRON: 'true',
      },
    });

    serverProcess.stdout?.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[server] ${msg}`);
      // Resolve once we see the server start message
      if (msg.includes('HyperDrop Server')) {
        resolve();
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error(`[server:err] ${data.toString().trim()}`);
    });

    serverProcess.on('error', (err) => {
      console.error('[server] Failed to start embedded server:', err);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      console.log(`[server] Server process exited with code ${code}`);
      serverProcess = null;
    });

    // Timeout: if server doesn't start in 10s, resolve anyway and try to connect
    setTimeout(() => resolve(), 10_000);
  });
}

function stopEmbeddedServer(): void {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ─── Window Creation ──────────────────────────────────────────────────

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 420,
    minHeight: 600,
    title: 'HyperDrop',
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    backgroundColor: '#0f0f13',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // Load the app
  if (IS_DEV) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(APP_URL);
  }

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();

      // Show notification on first minimize
      const notifiedKey = 'hyperdrop-tray-notified';
      if (!process.env[notifiedKey]) {
        process.env[notifiedKey] = '1';
        new Notification({
          title: 'HyperDrop',
          body: 'HyperDrop is running in the background. Click the tray icon to open.',
        }).show();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── System Tray ──────────────────────────────────────────────────────

function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'public', 'icon.png');
  let trayIcon: Electron.NativeImage;

  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('HyperDrop — Offline File Transfer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open HyperDrop',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createMainWindow();
        }
      },
    },
    {
      label: 'Open in Browser',
      click: () => {
        shell.openExternal(APP_URL);
      },
    },
    { type: 'separator' },
    {
      label: `Server: localhost:${SERVER_PORT}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit HyperDrop',
      click: () => {
        isQuitting = true;
        stopEmbeddedServer();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    } else {
      createMainWindow();
    }
  });
}

// ─── IPC Handlers ─────────────────────────────────────────────────────

function setupIPC(): void {
  // Open native file dialog
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
    });
    return result.filePaths;
  });

  // Open native folder dialog
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.filePaths;
  });

  // Get app version
  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });

  // Get downloads path
  ipcMain.handle('app:downloadsPath', () => {
    return app.getPath('downloads');
  });

  // Show native notification
  ipcMain.on('notify', (_event, { title, body }: { title: string; body: string }) => {
    new Notification({ title, body }).show();
  });
}

// ─── App Lifecycle ────────────────────────────────────────────────────

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('ready', async () => {
    console.log('[electron] Starting HyperDrop Desktop...');

    // Start the embedded server first
    try {
      await startEmbeddedServer();
      console.log('[electron] Embedded server started successfully');
    } catch (err) {
      console.error('[electron] Failed to start server:', err);
    }

    setupIPC();
    createTray();
    createMainWindow();
  });

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (mainWindow === null) {
      createMainWindow();
    } else {
      mainWindow.show();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    stopEmbeddedServer();
  });

  app.on('window-all-closed', () => {
    // Don't quit on macOS (tray keeps running)
    if (process.platform !== 'darwin' && isQuitting) {
      app.quit();
    }
  });
}
