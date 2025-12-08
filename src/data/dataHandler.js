import Store from 'electron-store';

// 1. Initialize the Store
// This automatically creates a JSON file in your system's AppData folder.
const store = new Store({
  defaults: {
    history: {},
    settings: {
      blocked_apps: [],
      focus_duration: 25
    }
  }
});

// 2. Helper to get Today's Date (YYYY-MM-DD)
function getTodayKey() {
  const now = new Date();
  return now.toISOString().split('T')[0]; // Returns "2025-12-08"
}

// 3. The Main Function: Save Data
export function logAppUsage(appName, windowTitle) {
  const today = getTodayKey();
  
  // Path to the specific app in the JSON object
  // history -> 2025-12-08 -> apps -> "Google Chrome"
  const appPath = `history.${today}.apps.${appName}`;

  // A. Increment Total Daily Time
  const currentDailyTotal = store.get(`history.${today}.total_time`) || 0;
  store.set(`history.${today}.total_time`, currentDailyTotal + 1);

  // B. Increment App Specific Time
  const currentAppDuration = store.get(`${appPath}.total_duration`) || 0;
  store.set(`${appPath}.total_duration`, currentAppDuration + 1);

  // C. Update Metadata (Icon/Category - placeholders for now)
  if (!store.has(`${appPath}.category`)) {
    store.set(`${appPath}.category`, 'Uncategorized');
  }

  // D. Increment Specific Window Title (Granular Tracking)
  // Replaces dots in titles to prevent JSON errors (Electron-store uses dots for nesting)
  const safeTitle = windowTitle.replace(/\./g, ' '); 
  const titlePath = `${appPath}.window_titles.${safeTitle}`;
  const currentTitleDuration = store.get(titlePath) || 0;
  store.set(titlePath, currentTitleDuration + 1);
}

// 4. Function to retrieve data (For the Dashboard later)
export function getHistory() {
  return store.get('history');
}