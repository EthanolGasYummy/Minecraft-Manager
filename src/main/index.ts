import { app, BrowserWindow, ipcMain, shell, Notification } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import { setupIPC } from './ipc/index';
import { ServerManager } from './services/ServerManager';
import { JavaManager } from './services/JavaManager';
import { BackupManager } from './services/BackupManager';
import { Store } from './config/Store';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0B0F1A',
      symbolColor: '#94A3B8',
      height: 32,
    },
    backgroundColor: '#0B0F1A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    icon: path.join(app.getAppPath(), 'resources', 'icon.png'),
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setupAutoUpdater() {
  if (isDev) return; // updater only works in packaged app

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:status', { status: 'checking' });
  });
  autoUpdater.on('update-available', (info: any) => {
    mainWindow?.webContents.send('update:status', { status: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update:status', { status: 'uptodate' });
  });
  autoUpdater.on('download-progress', (p: any) => {
    mainWindow?.webContents.send('update:status', { status: 'downloading', percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update:status', { status: 'downloaded' });
  });
  autoUpdater.on('error', (err: Error) => {
    mainWindow?.webContents.send('update:status', { status: 'error', message: err.message });
  });

  // Check 15 seconds after launch so the UI is loaded first
  setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 15000);

  ipcMain.handle('update:check', () => autoUpdater.checkForUpdates().catch(() => {}));
  ipcMain.handle('update:download', () => autoUpdater.downloadUpdate().catch(() => {}));
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
}

app.whenReady().then(async () => {
  Store.init();
  const serverManager = ServerManager.getInstance();
  const javaManager = JavaManager.getInstance();
  const backupManager = BackupManager.getInstance();

  createWindow();
  setupIPC(mainWindow, serverManager, javaManager);
  setupAutoUpdater();

  const servers = Store.getServers();
  for (const [id, config] of Object.entries(servers)) {
    backupManager.setupSchedule(id);
    serverManager.setupScheduledRestart(id);
    if (config.autoStartOnLaunch) {
      serverManager.start(id, (msg) => {
        mainWindow?.webContents.send('server:log', { id, line: `[Manager] ${msg}` });
      }).catch((err) => {
        mainWindow?.webContents.send('server:log', { id, line: `[Manager] Auto-start failed: ${err.message}` });
      });
    }
  }

  serverManager.on('crash', (id: string) => {
    const cfg = Store.getServer(id);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Server Crashed',
        body: `${cfg?.name ?? id} has crashed. Open the app to restart it.`,
      }).show();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  const serverManager = ServerManager.getInstance();
  await serverManager.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async (e) => {
  const serverManager = ServerManager.getInstance();
  if (serverManager.hasRunning()) {
    e.preventDefault();
    await serverManager.stopAll();
    app.quit();
  }
});

ipcMain.on('get-window', (event) => {
  event.returnValue = mainWindow?.id ?? null;
});
