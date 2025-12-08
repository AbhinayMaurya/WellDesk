const { contextBridge, ipcRenderer } = require('electron');

// We expose a secure API to the Frontend (Renderer)
contextBridge.exposeInMainWorld('electronAPI', {
  // Function 1: Request usage data
  getUsageData: () => ipcRenderer.invoke('get-usage-data'),
  
  // --- NEW FUNCTION ---
  setCategory: (appName, category) => ipcRenderer.invoke('set-category', appName, category)
  // Function 2: We can add more later (e.g., saveSettings)
});