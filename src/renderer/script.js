// src/renderer/script.js

console.log("Renderer script loaded.");

async function loadData() {
  try {
    // 1. Ask the Main Process for data via the Bridge
    const data = await window.electronAPI.getUsageData();
    
    // 2. Log it to the Browser Console to verify
    console.log("RECEIVED DATA FROM BACKEND:", data);

    // 3. Display it on the screen
    const displayElement = document.getElementById('debug-output');
    if (displayElement) {
      displayElement.innerText = JSON.stringify(data, null, 2);
    }
  } catch (error) {
    console.error("Error loading data:", error);
  }
}

// Run immediately when page loads
loadData();