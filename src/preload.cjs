// src/preload.cjs

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getUsageData: () => ipcRenderer.invoke('get-usage-data'),
  getTodayUsage: () => ipcRenderer.invoke('get-today-usage'),
  setCategory: (appName, category) => ipcRenderer.invoke('set-category', appName, category),
  setFocusMode: (state) => ipcRenderer.invoke('set-focus-mode', state),
  // --- NEW FUNCTION ---
  clearData: () => ipcRenderer.invoke('clear-data'),
  setAutoLaunch: (state) => ipcRenderer.invoke('set-auto-launch', state),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch')
});
