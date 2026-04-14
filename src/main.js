// src/main.js

import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron';
import activeWin from 'active-win';
import { initDB, logAppUsage, getHistory, getTodayUsage, getAppCategory, setAppCategory, clearAllHistory } from './data/database.js';
import path from 'path'; 
import { fileURLToPath } from 'url'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let tray = null;
let intervalId;
let isFocusMode = false; 
let isQuitting = false;
let lastTrackedApp = null;
let lastTrackedWindowTitle = 'General';
let lastTrackedAt = null;
const categoryCache = new Map();
const launchedHidden = process.argv.includes('--hidden');

function createWindow(showOnCreate = true) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.removeMenu(); 
  mainWindow.loadFile('src/renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    if (showOnCreate) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  if (tray) {
    return;
  }

  // Use app executable icon when available; otherwise fall back to a tiny built-in image.
  const fallbackIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAQ0lEQVQoka2QMQ4AIAgD6f9/rjNQkqb0IJTRZF7k5EKD4HEDYAUg1I2cQfEKQJjIhIY8eA0T6yXxgJvWb0W0I7q8mD8b4Yw5Q6wP4Vf4A0v8Yw2M8h90AAAAASUVORK5CYII='
  );
  const icon = app.isPackaged ? nativeImage.createFromPath(process.execPath) : fallbackIcon;

  tray = new Tray(icon.isEmpty() ? fallbackIcon : icon);
  tray.setToolTip('WellDesk');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open WellDesk',
      click: () => {
        if (!mainWindow) {
          createWindow(true);
          return;
        }

        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!mainWindow) {
      createWindow(true);
      return;
    }

    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// --- MODULE A + C: WATCHER & ENFORCER ---
async function startTracking() {
  // Timestamp-based accounting keeps precision while reducing poll frequency.
  intervalId = setInterval(async () => {
    try {
      const now = Date.now();
      const windowInfo = await activeWin();

      if (windowInfo) {
        const appName = windowInfo.owner?.name || 'Unknown App';
        const windowTitle = (windowInfo.title && windowInfo.title.trim()) ? windowInfo.title.trim() : 'General';

        if (lastTrackedApp && lastTrackedAt) {
          const elapsedSeconds = Math.max(0, Math.floor((now - lastTrackedAt) / 1000));
          if (elapsedSeconds > 0) {
            logAppUsage(lastTrackedApp, lastTrackedWindowTitle, elapsedSeconds);
          }
        }

        lastTrackedApp = appName;
        lastTrackedWindowTitle = windowTitle;
        lastTrackedAt = now;

        // 2. ENFORCEMENT (Focus Mode)
        if (isFocusMode) {
            void checkAndBlock(appName);
        }
      }
    } catch (error) {
      // Ignore errors silently
    }
  }, 2000);
}

function flushPendingUsage() {
  if (!lastTrackedApp || !lastTrackedAt) {
    return;
  }

  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((now - lastTrackedAt) / 1000));
  if (elapsedSeconds > 0) {
    logAppUsage(lastTrackedApp, lastTrackedWindowTitle, elapsedSeconds);
    lastTrackedAt = now;
  }
}

// --- HELPER: The Blocking Logic ---
async function resolveCategory(appName) {
  if (categoryCache.has(appName)) {
    return categoryCache.get(appName);
  }

  const category = await getAppCategory(appName);
  categoryCache.set(appName, category);
  return category;
}

async function checkAndBlock(appName) {
    const category = await resolveCategory(appName);

    // 2. If it is a distraction
    if (category === 'Distraction') {
        // A. Force WellDesk to the front
        if (mainWindow) {
            mainWindow.show();
            mainWindow.setAlwaysOnTop(true); 
            mainWindow.focus();
        }
    } else {
        // If user goes back to work, stop being annoying
        if (mainWindow) {
            mainWindow.setAlwaysOnTop(false);
        }
    }
}

app.whenReady().then(() => {
  // 1. Initialize the Database Table first
  initDB();

  // --- IPC Handlers ---

  // UPDATED: Now Async because DB access takes time
  ipcMain.handle('get-usage-data', async () => {
    return await getHistory();
  });

  ipcMain.handle('get-today-usage', async () => {
    return await getTodayUsage();
  });
  
  // Set Category (Fire and forget, but usually fast)
  ipcMain.handle('set-category', (event, appName, category) => {
    setAppCategory(appName, category);
    categoryCache.set(appName, category);
    return true;
  });

  // Focus Mode State (Memory only, so sync is fine)
  ipcMain.handle('set-focus-mode', (event, state) => {
    isFocusMode = state;
    return true;
  });

  // UPDATED: Now Async because clearing DB takes time
  ipcMain.handle('clear-data', async () => {
    await clearAllHistory();
    return true;
  });
  // --- NEW: Auto-Launch Logic ---
  
  // 1. Force enable by default on first run (Optional, but requested)
  // app.setLoginItemSettings({
  //   openAtLogin: true,
  //   path: app.getPath('exe') // path to the executable
  // });

  // 2. Allow UI to toggle it
 // --- UPDATED: Safer Auto-Launch Logic ---
  
  ipcMain.handle('set-auto-launch', (event, state) => {
    // 1. Safety Check: Only allow this in the built app (.exe)
    if (!app.isPackaged) {
      console.log("⚠️ Auto-Launch is disabled in Dev Mode to prevent Blue Screen errors.");
      return false; // Return false so the UI toggle snaps back to OFF
    }

    // 2. Register the correct path
    app.setLoginItemSettings({
      openAtLogin: state,
      openAsHidden: true,
      args: ['--hidden'],
      path: app.getPath('exe') // This points to the real WellDesk.exe
    });
    return state;
  });

  ipcMain.handle('get-auto-launch', () => {
    if (!app.isPackaged) {
      return false;
    }

    return app.getLoginItemSettings({
      path: app.getPath('exe')
    }).openAtLogin;
  });

  ipcMain.handle('get-app-info', () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch
    };
  });
  
  createWindow(!launchedHidden);
  createTray();
  startTracking();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(true);
      return;
    }

    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep process alive for tray/background behavior.
});

app.on('before-quit', () => {
  isQuitting = true;
  flushPendingUsage();
  clearInterval(intervalId);
});