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

// 2. Helper: Get Friendly Date
function getFriendlyDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return new Date().toLocaleDateString('en-US', options);
}

// 3. Helper: Consistent Color Generator
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360); 
  return `hsl(${hue}, 70%, 60%)`;
}

// 4. Function to draw the table rows
function renderTable(appsObj) {
  const tbody = document.getElementById('app-list-body');
  if (!tbody) return; 
  tbody.innerHTML = ''; 

  const sortedApps = Object.entries(appsObj).sort((a, b) => {
    return (b[1].total_duration || 0) - (a[1].total_duration || 0);
  });

  sortedApps.forEach(([appName, details]) => {
    const duration = details.total_duration || 0;
    const category = details.category || 'Neutral';

    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td style="display: flex; align-items: center;">
        <span style="width: 10px; height: 10px; background: ${stringToColor(appName)}; border-radius: 50%; margin-right: 10px;"></span>
        ${appName}
      </td>
      <td>${formatTime(duration)}</td>
      <td>
        <select class="category-select" data-val="${category}" onchange="updateCategory('${appName}', this.value)">
          <option value="Productive" ${category === 'Productive' ? 'selected' : ''}>Productive</option>
          <option value="Neutral" ${category === 'Neutral' ? 'selected' : ''}>Neutral</option>
          <option value="Distraction" ${category === 'Distraction' ? 'selected' : ''}>Distraction</option>
        </select>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// 5. Function called when dropdown changes
window.updateCategory = async (appName, newCategory) => {
  console.log(`Setting ${appName} to ${newCategory}`);
  await window.electronAPI.setCategory(appName, newCategory);
  loadData();
};

// 6. Main Data Loading Function
async function loadData() {
  try {
    const history = await window.electronAPI.getUsageData();
    const todayKey = new Date().toISOString().split('T')[0];
    const todayData = history[todayKey] || { apps: {} };
    
    const dateEl = document.getElementById('date-display');
    if (dateEl) dateEl.innerText = getFriendlyDate();

    const appsObj = todayData.apps;
    const labels = [];
    const dataPoints = [];
    const colors = [];

    let totalSeconds = 0;
    let productiveSeconds = 0;
    
    // --- FIX: Initialize the Top App Variable ---
    let topApp = { name: '-', duration: 0 }; 

    for (const [appName, appDetails] of Object.entries(appsObj)) {
      const duration = appDetails.total_duration || 0;
      const category = appDetails.category || 'Neutral';
      
      // --- FIX: Logic to Find the Top App ---
      if (duration > topApp.duration) {
        topApp = { name: appName, duration: duration };
      }

      totalSeconds += duration;
      if (category === 'Productive') {
        productiveSeconds += duration;
      }
      
      labels.push(appName);
      dataPoints.push(duration);
      colors.push(stringToColor(appName));
    }

    // Update Total Time
    const timeEl = document.getElementById('total-time-display');
    if (timeEl) timeEl.innerText = formatTime(totalSeconds);

    // Update Productivity Score
    let score = 0;
    if (totalSeconds > 0) {
      score = Math.round((productiveSeconds / totalSeconds) * 100);
    }
    
    const scoreEl = document.getElementById('score-display');
    if (scoreEl) {
        scoreEl.innerText = `${score}%`;
        scoreEl.style.color = score >= 50 ? '#27ae60' : '#e74c3c';
    }

    // Update Top App Card
    const topAppEl = document.getElementById('top-app-display');
    if (topAppEl) {
        // Now topApp is defined, so this line won't crash!
        topAppEl.innerText = `${topApp.name} (${formatTime(topApp.duration)})`;
    }

    renderChart(labels, dataPoints, colors);
    renderTable(appsObj);

  } catch (error) {
    console.error("Error loading dashboard:", error);
  }
}

// 7. Chart Rendering Logic
function renderChart(labels, data, colors) {
  const ctx = document.getElementById('usageChart').getContext('2d');
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
      animation: { duration: 0 },
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.raw; 
              return ` ${label}: ${formatTime(value)}`;
            }
          }
        }
      }
    }
  });
}

loadData();
setInterval(loadData, 5000);