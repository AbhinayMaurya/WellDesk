// src/preload.cjs

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getUsageData: () => ipcRenderer.invoke('get-usage-data'),
  setCategory: (appName, category) => ipcRenderer.invoke('set-category', appName, category),
  setFocusMode: (state) => ipcRenderer.invoke('set-focus-mode', state),
  clearData: () => ipcRenderer.invoke('clear-data') 
});