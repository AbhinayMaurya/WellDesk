import { app, BrowserWindow, ipcMain } from 'electron'; // <--- ADD ipcMain
import activeWin from 'active-win'; // Import the tracking library
import { logAppUsage, getHistory, setAppCategory } from './data/dataHandler.js'; // <--- ADD setAppCategory
import path from 'path'; // <--- ADD path
import { fileURLToPath } from 'url'; // <--- ADD this for path handling

// Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let intervalId; // To store the timer ID so we can stop it later

// --- 1. SETUP THE WINDOW ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Security: Renderer cannot use Node.js directly
      contextIsolation: true, // Security: Protects the global scope
      preload: path.join(__dirname, 'preload.cjs')  // <--- ENABLE THE BRIDGE
    }
  });

  mainWindow.removeMenu();

  // Load the UI (Dashboard)
  mainWindow.loadFile('src/renderer/index.html');
}

// --- 2. MODULE A: THE WATCHER LOGIC ---
async function startTracking() {
  console.log("--- Watcher Started ---");
  
  // Run this loop every 1000 milliseconds (1 second)
  intervalId = setInterval(async () => {
    try {
      // A. Ask the OS for the active window
      const windowInfo = await activeWin();

      // B. If we get data, log it to the console (Terminal)
      if (windowInfo) {
        /* windowInfo returns an object like:
           {
             title: "Inbox (1) - Gmail",
             owner: { name: "Google Chrome", path: "..." },
             url: "..." (sometimes available on Mac)
           }
        */
        const appName = windowInfo.owner.name;
        const windowTitle = windowInfo.title;
        
        // console.log(`[TRACKING] App: ${appName} | Title: ${windowTitle}`);
        // --- NEW: Save to Storage instead of Console ---
        // We still log brief info to console just to know it's running
        console.log(`[SAVING] ${appName}`);

        logAppUsage(appName, windowTitle); // <--- New Function call which saves the data
      }
    } catch (error) {
      // Sometimes tracking fails (e.g. if looking at the desktop or lock screen)
      // We just ignore it and try again next second.
    }
  }, 1000);
}

// --- 3. APP LIFECYCLE ---

app.whenReady().then(() => {
  // --- NEW: Set up the Listener ---
  // When Frontend asks for data, run this function
  ipcMain.handle('get-usage-data', () => {
    return getHistory(); // Returns the JSON object
  });

  // --- NEW HANDLER ---
  ipcMain.handle('set-category', (event, appName, category) => {
    setAppCategory(appName, category);
    return true; // Send success signal back
  });

  createWindow();
  startTracking(); // <--- Start the watcher immediately

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  clearInterval(intervalId); // Stop the loop cleanly
  if (process.platform !== 'darwin') app.quit();
});