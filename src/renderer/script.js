// src/renderer/script.js

// --- HELPER FUNCTIONS ---

// 1. Convert seconds to "1h 30m" or "05:00"
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// 2. Format specifically for the Timer (MM:SS)
function formatTimerDisplay(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// 3. Get Friendly Date
function getFriendlyDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return new Date().toLocaleDateString('en-US', options);
}

// 4. Consistent Color Generator
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360); 
  return `hsl(${hue}, 70%, 60%)`;
}

// --- DASHBOARD LOGIC ---

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

window.updateCategory = async (appName, newCategory) => {
  await window.electronAPI.setCategory(appName, newCategory);
  loadData();
};

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
      if (category === 'Productive') productiveSeconds += duration;
      
      labels.push(appName);
      dataPoints.push(duration);
      colors.push(stringToColor(appName));
    }

    // Update Cards
    const timeEl = document.getElementById('total-time-display');
    if (timeEl) timeEl.innerText = formatTime(totalSeconds);

    let score = 0;
    if (totalSeconds > 0) score = Math.round((productiveSeconds / totalSeconds) * 100);
    
    const scoreEl = document.getElementById('score-display');
    if (scoreEl) {
        scoreEl.innerText = `${score}%`;
        scoreEl.style.color = score >= 50 ? '#27ae60' : '#e74c3c';
    }

    const topAppEl = document.getElementById('top-app-display');
    if (topAppEl) topAppEl.innerText = `${topApp.name} (${formatTime(topApp.duration)})`;

    renderChart(labels, dataPoints, colors);
    renderTable(appsObj);

  } catch (error) {
    console.error("Error loading dashboard:", error);
  }
}

function renderChart(labels, data, colors) {
  const ctx = document.getElementById('usageChart').getContext('2d');
  if (window.myChart) window.myChart.destroy();

  window.myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }]
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
              return ` ${context.label}: ${formatTime(context.raw)}`;
            }
          }
        }
      }
    }
  });
}

// --- HISTORY LOGIC ---

let historyWeekOffset = 0; // 0 = Current Week, 1 = Last Week

window.changeHistoryWeek = (direction) => {
    historyWeekOffset += direction;
    
    // Limits
    if (historyWeekOffset < 0) historyWeekOffset = 0;
    if (historyWeekOffset > 3) historyWeekOffset = 3; 

    loadHistoryChart();
}

async function loadHistoryChart() {
    try {
        const history = await window.electronAPI.getUsageData();
        const labels = [];
        const dataPoints = [];
        
        // Update Label UI
        const labelEl = document.getElementById('history-week-label');
        if (labelEl) {
             if (historyWeekOffset === 0) labelEl.innerText = "Current Week";
             else labelEl.innerText = `${historyWeekOffset} Week(s) Ago`;
        }

        const startOffset = historyWeekOffset * 7;

        for (let i = 6 + startOffset; i >= 0 + startOffset; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            
            labels.push(d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }));

            const dayData = history[dateKey];
            const seconds = dayData ? dayData.total_time : 0;
            dataPoints.push((seconds / 3600).toFixed(1)); 
        }

        const ctx = document.getElementById('historyChart').getContext('2d');
        if (window.historyChartInstance) window.historyChartInstance.destroy();

        window.historyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Hours Spent',
                    data: dataPoints,
                    backgroundColor: '#3498db',
                    borderRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } }
            }
        });
    } catch (error) {
        console.error("Error loading history:", error);
    }
}

// --- NAVIGATION LOGIC ---

const navLinks = document.querySelectorAll('.nav-links li');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const viewName = link.innerText.trim();
        
        document.getElementById('view-dashboard').style.display = 'none';
        document.getElementById('view-focus').style.display = 'none';
        document.getElementById('view-history').style.display = 'none';
        document.getElementById('view-settings').style.display = 'none';

        if (viewName === 'Dashboard') {
            document.getElementById('view-dashboard').style.display = 'block';
        } 
        else if (viewName === 'Focus Mode') {
            document.getElementById('view-focus').style.display = 'block';
        }
        else if (viewName === 'History') {
            document.getElementById('view-history').style.display = 'block';
            loadHistoryChart(); 
        }
        else if (viewName === 'Settings') {
            document.getElementById('view-settings').style.display = 'block';
        }
    });
});

// --- FOCUS MODE LOGIC ---

let focusInterval;
let isFocusRunning = false;
let defaultDuration = 25 * 60; 
let timeLeft = defaultDuration;

window.toggleFocus = async () => {
    const btn = document.getElementById('btn-start-focus');
    
    if (!isFocusRunning) {
        isFocusRunning = true;
        btn.innerText = "Stop Focus";
        btn.classList.add('btn-danger');
        
        await window.electronAPI.setFocusMode(true); 

        focusInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').innerText = formatTimerDisplay(timeLeft);

            if (timeLeft <= 0) {
                finishFocusSession();
            }
        }, 1000);

    } else {
        stopFocusSession();
    }
};

function stopFocusSession() {
    clearInterval(focusInterval);
    isFocusRunning = false;
    timeLeft = defaultDuration; 
    
    document.getElementById('timer').innerText = formatTimerDisplay(timeLeft);
    const btn = document.getElementById('btn-start-focus');
    btn.innerText = "Start Focus";
    btn.classList.remove('btn-danger');
    
    window.electronAPI.setFocusMode(false);
}

function finishFocusSession() {
    stopFocusSession();
    alert("Focus Session Complete!");
}

// --- SETTINGS LOGIC ---

window.saveSettings = () => {
    const inputEl = document.getElementById('setting-focus-duration');
    const rawValue = inputEl.value;
    
    let minutes = parseInt(rawValue);

    if (isNaN(minutes) || minutes < 1) {
        minutes = 25;
        inputEl.value = 25; 
    }

    defaultDuration = minutes * 60; 
    timeLeft = defaultDuration; 
    document.getElementById('timer').innerText = formatTimerDisplay(timeLeft);
    alert("Settings Saved!");
};

window.clearAllData = async () => {
    if (confirm("Are you sure? This will delete all history.")) {
        await window.electronAPI.clearData();
        location.reload(); 
    }
};

// --- INITIALIZATION ---
loadData();
setInterval(loadData, 5000);