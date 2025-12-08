import { app, BrowserWindow, ipcMain } from 'electron';
import activeWin from 'active-win'; 
import { logAppUsage, getHistory, setAppCategory } from './data/dataHandler.js'; 
import Store from 'electron-store'; // Need direct access to store for checking categories
import path from 'path'; 
import { fileURLToPath } from 'url'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const store = new Store(); // Initialize store to read settings

let mainWindow;
let intervalId;
let isFocusMode = false; // <--- GLOBAL FLAG

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
  console.log("--- Watcher Started ---");
  
  intervalId = setInterval(async () => {
    try {
      const windowInfo = await activeWin();

      if (windowInfo) {
        const appName = windowInfo.owner.name;
        const windowTitle = windowInfo.title;

        // 1. Log Usage (Standard Module A)
        // console.log(`[SAVING] ${appName}`); 
        logAppUsage(appName, windowTitle);

        // 2. ENFORCEMENT (Module C - Focus Mode)
        if (isFocusMode) {
            checkAndBlock(appName);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }, 1000);
}

// --- HELPER: The Blocking Logic ---
function checkAndBlock(appName) {
    // 1. Get the category of the current active app
    const category = store.get(`settings.app_categories.${appName}`);

    // 2. If it is a distraction
    if (category === 'Distraction') {
        console.log(`[BLOCKING] Distraction detected: ${appName}`);
        
        // A. Force WellDesk to the front
        if (mainWindow) {
            mainWindow.show();
            mainWindow.setAlwaysOnTop(true); // Keep it on top
            mainWindow.focus();
            
            // B. Send message to UI to show an alert (Optional polish)
            // setTimeout(() => mainWindow.setAlwaysOnTop(false), 5000); // Relax after 5s
        }
    } else {
        // If user goes back to work, stop being annoying
        if (mainWindow) {
            mainWindow.setAlwaysOnTop(false);
        }
    }
}

app.whenReady().then(() => {
  // --- IPC Handlers ---
  ipcMain.handle('get-usage-data', () => getHistory());
  
  ipcMain.handle('set-category', (event, appName, category) => {
    setAppCategory(appName, category);
    return true;
  });

  // --- NEW HANDLER: Toggle Focus Mode ---
  ipcMain.handle('set-focus-mode', (event, state) => {
    isFocusMode = state;
    console.log(`Focus Mode set to: ${state}`);
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