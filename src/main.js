// src/main.js

import { app, BrowserWindow, ipcMain } from 'electron';
import activeWin from 'active-win';
import { initDB, logAppUsage, getHistory, getTodayUsage, setAppCategory, clearAllHistory } from './data/database.js';
import Store from 'electron-store'; 
import path from 'path'; 
import { fileURLToPath } from 'url'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const store = new Store(); 

let mainWindow;
let intervalId;
let isFocusMode = false; 
let lastTrackedApp = null;
let lastTrackedAt = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.removeMenu(); 
  mainWindow.loadFile('src/renderer/index.html');
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

        if (lastTrackedApp && lastTrackedAt) {
          const elapsedSeconds = Math.max(0, Math.floor((now - lastTrackedAt) / 1000));
          if (elapsedSeconds > 0) {
            logAppUsage(lastTrackedApp, elapsedSeconds);
          }
        }

        lastTrackedApp = appName;
        lastTrackedAt = now;

        // 2. ENFORCEMENT (Focus Mode)
        if (isFocusMode) {
            checkAndBlock(appName);
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
    logAppUsage(lastTrackedApp, elapsedSeconds);
    lastTrackedAt = now;
  }
}

// --- HELPER: The Blocking Logic ---
function checkAndBlock(appName) {
    // 1. Get the category of the current active app
    const category = store.get(`settings.app_categories.${appName}`);

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
  
  createWindow();
  startTracking();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  flushPendingUsage();
  clearInterval(intervalId); 
  if (process.platform !== 'darwin') app.quit();
});