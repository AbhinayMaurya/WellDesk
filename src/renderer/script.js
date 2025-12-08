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
    
    let topApp = { name: '-', duration: 0 }; 

    for (const [appName, appDetails] of Object.entries(appsObj)) {
      const duration = appDetails.total_duration || 0;
      const category = appDetails.category || 'Neutral';
      
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

// --- NAVIGATION LOGIC ---

const navLinks = document.querySelectorAll('.nav-links li');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const viewName = link.innerText.trim();
        
        if (viewName === 'Dashboard') {
            document.getElementById('view-dashboard').style.display = 'block';
            document.getElementById('view-focus').style.display = 'none';
        } 
        else if (viewName === 'Focus Mode') {
            document.getElementById('view-dashboard').style.display = 'none';
            document.getElementById('view-focus').style.display = 'block';
        }
    });
});

// --- FOCUS MODE LOGIC ---

let focusInterval;
let isFocusRunning = false;
let defaultDuration = 25 * 60; // 25 minutes in seconds
let timeLeft = defaultDuration;

// 1. formatting helper (MM:SS)
function formatTimerDisplay(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// 2. The Main Toggle Function (Linked to the HTML Button)
window.toggleFocus = async () => {
    const btn = document.getElementById('btn-start-focus');
    
    if (!isFocusRunning) {
        // --- START FOCUS ---
        isFocusRunning = true;
        btn.innerText = "Stop Focus";
        btn.classList.add('btn-danger'); // Turn Red
        
        console.log("Focus Mode STARTED"); 
        
        // --- NEW: Enable the Block via Bridge ---
        await window.electronAPI.setFocusMode(true); 

        // Start Countdown
        focusInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').innerText = formatTimerDisplay(timeLeft);

            if (timeLeft <= 0) {
                finishFocusSession();
            }
        }, 1000);

    } else {
        // --- STOP FOCUS ---
        stopFocusSession();
    }
};

function stopFocusSession() {
    clearInterval(focusInterval);
    isFocusRunning = false;
    timeLeft = defaultDuration; 
    
    // Reset UI
    document.getElementById('timer').innerText = formatTimerDisplay(timeLeft);
    const btn = document.getElementById('btn-start-focus');
    btn.innerText = "Start Focus";
    btn.classList.remove('btn-danger');
    
    console.log("Focus Mode STOPPED");
    
    // --- NEW: Disable the Block via Bridge ---
    window.electronAPI.setFocusMode(false);
}

function finishFocusSession() {
    stopFocusSession();
    alert("Focus Session Complete! Great job.");
}