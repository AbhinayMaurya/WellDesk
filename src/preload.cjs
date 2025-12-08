const { contextBridge, ipcRenderer } = require('electron');
// CHANGE: Use 'import' instead of 'require'
// import { contextBridge, ipcRenderer } from 'electron';

// We expose a secure API to the Frontend (Renderer)
contextBridge.exposeInMainWorld('electronAPI', {
  // Function 1: Request usage data
  getUsageData: () => ipcRenderer.invoke('get-usage-data'),
  
  // Function 2: We can add more later (e.g., saveSettings)
});