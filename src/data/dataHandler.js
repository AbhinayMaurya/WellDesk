import Store from 'electron-store';

const store = new Store({
  defaults: {
    history: {},
    settings: {
      blocked_apps: [],
      focus_duration: 25,
      app_categories: {} 
    }
  }
});

function getTodayKey() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

// 1. Save Usage with Category Auto-Detection
export function logAppUsage(appName, windowTitle) {
  const today = getTodayKey();
  const appPath = `history.${today}.apps.${appName}`;

  // A. Increment Time
  const currentDailyTotal = store.get(`history.${today}.total_time`) || 0;
  store.set(`history.${today}.total_time`, currentDailyTotal + 1);

  const currentAppDuration = store.get(`${appPath}.total_duration`) || 0;
  store.set(`${appPath}.total_duration`, currentAppDuration + 1);

  // B. Auto-Assign Category from Settings
  const savedCategory = store.get(`settings.app_categories.${appName}`);
  if (savedCategory) {
    store.set(`${appPath}.category`, savedCategory);
  } else if (!store.has(`${appPath}.category`)) {
    store.set(`${appPath}.category`, 'Neutral'); 
  }

  // C. Track Window Titles (Sanitize dots)
  const safeTitle = windowTitle.replace(/\./g, ' '); 
  const titlePath = `${appPath}.window_titles.${safeTitle}`;
  const currentTitleDuration = store.get(titlePath) || 0;
  store.set(titlePath, currentTitleDuration + 1);
}

// 2. Function to manually change a category
export function setAppCategory(appName, newCategory) {
  // A. Save rule globally
  store.set(`settings.app_categories.${appName}`, newCategory);

  // B. Update today's existing record
  const today = getTodayKey();
  const appPath = `history.${today}.apps.${appName}`;
  if (store.has(appPath)) {
    store.set(`${appPath}.category`, newCategory);
  }
}

// 3. Function to wipe all history but keep settings
export function clearAllHistory() {
  store.set('history', {});
  return true;
}

// 4. Retrieve Data
export function getHistory() {
  return store.get('history');
}