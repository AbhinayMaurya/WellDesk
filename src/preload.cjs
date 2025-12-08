const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getUsageData: () => ipcRenderer.invoke('get-usage-data'),
  setCategory: (appName, category) => ipcRenderer.invoke('set-category', appName, category),
  
  // --- NEW FUNCTION ---
  setFocusMode: (state) => ipcRenderer.invoke('set-focus-mode', state),
  // --- NEW FUNCTION ---
  clearData: () => ipcRenderer.invoke('clear-data') 
});