import { app, BrowserWindow, ipcMain } from 'electron';
import activeWin from 'active-win';
import { initDB, logAppUsage, getHistory, setAppCategory, clearAllHistory } from './data/database.js';
import Store from 'electron-store'; 
import path from 'path'; 
import { fileURLToPath } from 'url'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const store = new Store(); 

let mainWindow;
let intervalId;
let isFocusMode = false; 

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
  // Silent startup
  intervalId = setInterval(async () => {
    try {
      const windowInfo = await activeWin();

      if (windowInfo) {
        const appName = windowInfo.owner.name;
        const windowTitle = windowInfo.title;

        // 1. Log Usage
        logAppUsage(appName, windowTitle);

        // 2. ENFORCEMENT (Focus Mode)
        if (isFocusMode) {
            checkAndBlock(appName);
        }
      }
    } catch (error) {
      // Ignore errors silently
    }
  }, 1000);
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
  
  createWindow();
  startTracking();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  clearInterval(intervalId); 
  if (process.platform !== 'darwin') app.quit();
});