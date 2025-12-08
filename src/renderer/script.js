// src/renderer/script.js

// 1. Helper: Convert seconds to "1h 30m" or "45s"
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// 2. Helper: Get Friendly Date (e.g., "Monday, Dec 08")
function getFriendlyDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return new Date().toLocaleDateString('en-US', options);
}

async function loadData() {
  try {
    const history = await window.electronAPI.getUsageData();
    const todayKey = new Date().toISOString().split('T')[0];
    const todayData = history[todayKey] || { apps: {} };
    
    // --- UI UPDATE: Header ---
    document.getElementById('date-display').innerText = getFriendlyDate();

    // --- DATA PROCESSING ---
    const appsObj = todayData.apps;
    const labels = [];
    const dataPoints = [];
    const colors = [];

    // Calculate Total Time for the big card
    let totalSeconds = 0;

    for (const [appName, appDetails] of Object.entries(appsObj)) {
      labels.push(appName);
      dataPoints.push(appDetails.total_duration);
      totalSeconds += appDetails.total_duration;
      colors.push(`hsl(${Math.random() * 360}, 70%, 60%)`);
    }

    // Update Total Time Card
    document.getElementById('total-time-display').innerText = formatTime(totalSeconds);

    // --- RENDER CHART ---
    renderChart(labels, dataPoints, colors);

  } catch (error) {
    console.error("Error loading dashboard:", error);
  }
}

function renderChart(labels, data, colors) {
  const ctx = document.getElementById('usageChart').getContext('2d');
  
  // Destroy old chart if it exists (prevents glitching on reload)
  if (window.myChart) window.myChart.destroy();

  window.myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            // FIX: Convert raw seconds to formatted time in the tooltip
            label: function(context) {
              const label = context.label || '';
              const value = context.raw; // raw seconds
              return ` ${label}: ${formatTime(value)}`;
            }
          }
        }
      }
    }
  });
}

loadData();