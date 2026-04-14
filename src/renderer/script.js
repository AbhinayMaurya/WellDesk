// src/renderer/script.js

const STORAGE_KEY = 'welldesk.preferences.v1';
const DEFAULT_PREFERENCES = {
    dashboardRefreshMs: 10000,
    historyWeekLimit: 4,
    showFocusCompletionAlert: true,
    confirmBeforeReset: true
};

let preferences = { ...DEFAULT_PREFERENCES };
let dashboardRefreshMs = DEFAULT_PREFERENCES.dashboardRefreshMs;
let latestDashboardTotalSeconds = 0;
let latestDashboardFetchAt = Date.now();
let maxHistoryWeekOffset = DEFAULT_PREFERENCES.historyWeekLimit;
let dashboardPollIntervalId;

// --- SYSTEM SETTINGS LOGIC ---

window.toggleAutoLaunch = async (isChecked) => {
    const actualState = await window.electronAPI.setAutoLaunch(isChecked);
    const checkbox = document.getElementById('setting-auto-launch');

    if (checkbox) {
        checkbox.checked = actualState;
    }

    console.log(`Auto-launch set to: ${actualState}`);
};
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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

        const nameCell = document.createElement('td');
        nameCell.style.display = 'flex';
        nameCell.style.alignItems = 'center';

        const dot = document.createElement('span');
        dot.style.width = '10px';
        dot.style.height = '10px';
        dot.style.background = stringToColor(appName);
        dot.style.borderRadius = '50%';
        dot.style.marginRight = '10px';

        const nameText = document.createTextNode(appName);
        nameCell.appendChild(dot);
        nameCell.appendChild(nameText);

        const durationCell = document.createElement('td');
        durationCell.innerText = formatTime(duration);

        const categoryCell = document.createElement('td');
        const select = document.createElement('select');
        select.className = 'category-select';
        select.dataset.val = category;

        ['Productive', 'Neutral', 'Distraction'].forEach((optionValue) => {
            const option = document.createElement('option');
            option.value = optionValue;
            option.innerText = optionValue;
            option.selected = category === optionValue;
            select.appendChild(option);
        });

        select.addEventListener('change', async () => {
            select.dataset.val = select.value;
            await window.updateCategory(appName, select.value);
        });

        categoryCell.appendChild(select);
        row.appendChild(nameCell);
        row.appendChild(durationCell);
        row.appendChild(categoryCell);
    tbody.appendChild(row);
  });
}

window.updateCategory = async (appName, newCategory) => {
  await window.electronAPI.setCategory(appName, newCategory);
  loadData();
};

async function loadData() {
  try {
    const todayData = await window.electronAPI.getTodayUsage();
    
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

    latestDashboardTotalSeconds = totalSeconds;
    latestDashboardFetchAt = Date.now();

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

function tickDashboardClock() {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - latestDashboardFetchAt) / 1000));
  const timeEl = document.getElementById('total-time-display');
  if (timeEl) {
    timeEl.innerText = formatTime(latestDashboardTotalSeconds + elapsedSeconds);
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

// --- HISTORY LOGIC (Updated with Drill-Down) ---

let historyWeekOffset = 0; // 0 = Current Week, 1 = Last Week
let currentHistoryData = {}; // Store raw data for click events
let currentWeekKeys = [];    // Store mapping of bar index to date key

function updateHistoryNavButtons() {
    const prevBtn = document.getElementById('history-prev-btn');
    const nextBtn = document.getElementById('history-next-btn');

    if (prevBtn) prevBtn.disabled = historyWeekOffset >= maxHistoryWeekOffset;
    if (nextBtn) nextBtn.disabled = historyWeekOffset <= 0;
}

window.changeHistoryWeek = (direction) => {
    historyWeekOffset += direction;
    // Limits
    if (historyWeekOffset < 0) historyWeekOffset = 0;
    if (historyWeekOffset > maxHistoryWeekOffset) historyWeekOffset = maxHistoryWeekOffset;
    
    updateHistoryNavButtons();
    loadHistoryChart();
}

async function loadHistoryChart() {
    try {
        const fullHistory = await window.electronAPI.getUsageData();
        currentHistoryData = fullHistory; // Save for click handlers
        
        const labels = [];
        const dataPoints = [];
        const backgroundColors = [];
        currentWeekKeys = []; // Reset keys

        // Calculate fixed week range: Sunday -> Saturday
        const referenceDate = new Date();
        referenceDate.setDate(referenceDate.getDate() - (historyWeekOffset * 7));
        const weekStart = new Date(referenceDate);
        weekStart.setDate(referenceDate.getDate() - referenceDate.getDay());
        
        // Always render in calendar order from Sunday to Saturday
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            const dateKey = d.toISOString().split('T')[0];
            const dayName = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });

            currentWeekKeys.push(dateKey); // Save key for this bar index
            labels.push(dayName);

            const dayData = fullHistory[dateKey];
            if (dayData) {
                const hours = (dayData.total_time / 3600).toFixed(1);
                dataPoints.push(hours);
                backgroundColors.push('#3498db');
            } else {
                dataPoints.push(0);
                backgroundColors.push('#ecf0f1');
            }
        }

        // Update Label UI
        const startStr = labels[0];
        const endStr = labels[6];
        const labelEl = document.getElementById('history-week-label');
        if (labelEl) labelEl.innerText = `${startStr} - ${endStr}`;
        updateHistoryNavButtons();

        const ctx = document.getElementById('historyChart').getContext('2d');
        if (window.historyChartInstance) window.historyChartInstance.destroy();

        window.historyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Hours Spent',
                    data: dataPoints,
                    backgroundColor: backgroundColors,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } },
                // --- INTERACTIVE CLICK HANDLER ---
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const dateKey = currentWeekKeys[index];
                        showDayDetails(dateKey);
                    }
                },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                }
            }
        });

        // --- NEW: AUTO-OPEN TODAY'S DATA ---
        // If we are on the "Current Week" view (offset 0), automatically show today's list
        if (historyWeekOffset === 0) {
            const todayKey = new Date().toISOString().split('T')[0];
            // Only show if there is data for today
            if (currentHistoryData[todayKey]) {
                showDayDetails(todayKey);
            } else {
                 // If no data today, hide the card to be clean
                const detailsCard = document.getElementById('history-details-card');
                if (detailsCard) detailsCard.style.display = 'none';
            }
        } else {
            // If viewing previous weeks, hide details until user clicks a bar
            const detailsCard = document.getElementById('history-details-card');
            if (detailsCard) detailsCard.style.display = 'none';
        }

    } catch (error) {
        console.error("Error loading history:", error);
    }
}

// --- NEW FUNCTION: Show Detailed Table (Accordion Style) ---
function showDayDetails(dateKey) {
    const card = document.getElementById('history-details-card');
    const tbody = document.getElementById('history-details-body');
    const title = document.getElementById('history-details-title');

    const dayData = currentHistoryData[dateKey];
    
    if (!dayData || !dayData.apps) {
        card.style.display = 'none';
        return;
    }

    card.style.display = 'block';
    title.innerText = `Details for ${dateKey}`;
    tbody.innerHTML = ''; 

    // Sort apps by total duration
    const sortedApps = Object.entries(dayData.apps).sort(([,a], [,b]) => b.total_duration - a.total_duration);

    sortedApps.forEach(([appName, stats], index) => {
        // Unique ID for accordion
        const safeId = `details-${index}`;

        // 1. Sort Window Titles
        const sortedWindows = Object.entries(stats.window_titles || {})
            .sort(([,a], [,b]) => b - a);

        // 2. Build Window List HTML
        const windowListHTML = sortedWindows.map(([title, time]) => `
            <li>
                <span style="flex: 1; margin-right: 15px; word-break: break-all;">${escapeHtml(title)}</span>
                <span style="font-family: monospace; color: #2c3e50;">${formatTime(time)}</span>
            </li>
        `).join('');

        // 3. Create Main Row (Clickable)
        const mainRow = document.createElement('tr');
        mainRow.className = 'app-row';
        mainRow.addEventListener('click', () => toggleDetails(safeId));
        
        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'toggle-details-btn';
        toggleButton.innerHTML = `<span id="icon-${safeId}" class="toggle-icon">▶</span>`;
        toggleButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleDetails(safeId);
        });
        
        const nameCell = document.createElement('td');
        nameCell.style.padding = '12px';

        const nameWrap = document.createElement('div');
        nameWrap.style.display = 'flex';
        nameWrap.style.alignItems = 'center';

        const dot = document.createElement('div');
        dot.className = 'app-dot';
        dot.style.backgroundColor = stringToColor(appName);

        const nameLabel = document.createElement('strong');
        nameLabel.style.fontSize = '15px';
        nameLabel.innerText = appName;

        nameWrap.appendChild(toggleButton);
        nameWrap.appendChild(dot);
        nameWrap.appendChild(nameLabel);
        nameCell.appendChild(nameWrap);

        const timeCell = document.createElement('td');
        timeCell.style.textAlign = 'right';
        timeCell.style.fontFamily = 'monospace';
        timeCell.style.fontSize = '14px';
        timeCell.innerText = formatTime(stats.total_duration);

        const categoryCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `badge ${stats.category}`;
        badge.innerText = stats.category;
        categoryCell.appendChild(badge);

        mainRow.appendChild(nameCell);
        mainRow.appendChild(timeCell);
        mainRow.appendChild(categoryCell);

        // 4. Create Hidden Details Row
        const detailsRow = document.createElement('tr');
        detailsRow.id = safeId;
        detailsRow.className = 'details-row'; // Hidden by default CSS
        
        detailsRow.innerHTML = `
            <td colspan="3" style="padding: 0;">
                <div class="details-container">
                    <ul class="window-list">
                        ${windowListHTML || '<li style="color: #999;">No window title details available.</li>'}
                    </ul>
                </div>
            </td>
        `;

        tbody.appendChild(mainRow);
        tbody.appendChild(detailsRow);
    });
}

// --- Helper: Toggle the hidden row ---
function toggleDetails(rowId) {
    const row = document.getElementById(rowId);
    const icon = document.getElementById(`icon-${rowId}`);
    if (!row || !icon) return;
    
    if (row.classList.contains('open')) {
        row.classList.remove('open');
        icon.classList.remove('rotate-down');
    } else {
        row.classList.add('open');
        icon.classList.add('rotate-down');
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

function parseFocusDurationSeconds(rawValue) {
    const text = String(rawValue || '').trim();
    if (!text) return null;

    if (text.includes(':')) {
        const [minsRaw, secsRaw] = text.split(':');
        const mins = parseInt((minsRaw || '0').replace(/[^\d]/g, ''), 10);
        const secs = parseInt((secsRaw || '0').replace(/[^\d]/g, ''), 10);

        if (!Number.isFinite(mins) && !Number.isFinite(secs)) {
            return null;
        }

        const safeMins = Number.isFinite(mins) ? Math.max(0, mins) : 0;
        const safeSecs = Number.isFinite(secs) ? Math.max(0, Math.min(59, secs)) : 0;
        return Math.max(1, (safeMins * 60) + safeSecs);
    }

    const mins = parseInt(text.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(mins)) return null;
    return Math.max(1, mins * 60);
}

function getFocusDurationSeconds() {
    const timerEl = document.getElementById('timer');
    const rawValue = timerEl ? timerEl.innerText : '25:00';
    return parseFocusDurationSeconds(rawValue);
}

function setFocusDurationView(seconds) {
    const timerEl = document.getElementById('timer');
    if (!timerEl) return;

    timerEl.contentEditable = 'true';
    timerEl.innerText = formatTimerDisplay(Math.max(1, Number.isFinite(seconds) ? Math.floor(seconds) : 25 * 60));
}

function applyFocusDuration(seconds) {
    const safeSeconds = Math.max(1, Number.isFinite(seconds) ? Math.floor(seconds) : (25 * 60));
    defaultDuration = safeSeconds;
    timeLeft = defaultDuration;

    const timerEl = document.getElementById('timer');
    if (timerEl) {
        if (isFocusRunning) {
            timerEl.contentEditable = 'false';
            timerEl.innerText = formatTimerDisplay(timeLeft);
        } else {
            setFocusDurationView(safeSeconds);
        }
    }
}

window.toggleFocus = async () => {
    const btn = document.getElementById('btn-start-focus');
    
    if (!isFocusRunning) {
        const parsed = getFocusDurationSeconds();
        applyFocusDuration(parsed ?? defaultDuration);
        isFocusRunning = true;
        btn.innerText = "Stop Focus";
        btn.classList.add('btn-danger');
        const timerEl = document.getElementById('timer');
        if (timerEl) timerEl.contentEditable = 'false';
        
        await window.electronAPI.setFocusMode(true); 

        focusInterval = setInterval(() => {
            timeLeft--;
            const timerEl = document.getElementById('timer');
            if (timerEl) timerEl.innerText = formatTimerDisplay(timeLeft);

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
    
    const timerEl = document.getElementById('timer');
    if (timerEl) {
        setFocusDurationView(defaultDuration);
    }
    const btn = document.getElementById('btn-start-focus');
    btn.innerText = "Start Focus";
    btn.classList.remove('btn-danger');
    
    window.electronAPI.setFocusMode(false);
}

function finishFocusSession() {
    stopFocusSession();
    if (preferences.showFocusCompletionAlert) {
        alert("Focus Session Complete!");
    }
}

function readStoredPreferences() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_PREFERENCES };

        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_PREFERENCES,
            ...parsed
        };
    } catch (error) {
        return { ...DEFAULT_PREFERENCES };
    }
}

function writeStoredPreferences(nextPreferences) {
    preferences = { ...DEFAULT_PREFERENCES, ...nextPreferences };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    dashboardRefreshMs = Number(preferences.dashboardRefreshMs) || DEFAULT_PREFERENCES.dashboardRefreshMs;
    maxHistoryWeekOffset = Number(preferences.historyWeekLimit) || DEFAULT_PREFERENCES.historyWeekLimit;
}

function applyPollingPreferences() {
    if (dashboardPollIntervalId) {
        clearInterval(dashboardPollIntervalId);
    }

    dashboardPollIntervalId = setInterval(loadData, dashboardRefreshMs);
}

function renderSettingsFromPreferences() {
    const refreshSelect = document.getElementById('setting-dashboard-refresh');
    const historyLimitSelect = document.getElementById('setting-history-limit');
    const focusAlertToggle = document.getElementById('setting-focus-alert');
    const confirmResetToggle = document.getElementById('setting-confirm-reset');

    if (refreshSelect) refreshSelect.value = String(preferences.dashboardRefreshMs);
    if (historyLimitSelect) historyLimitSelect.value = String(preferences.historyWeekLimit);
    if (focusAlertToggle) focusAlertToggle.checked = Boolean(preferences.showFocusCompletionAlert);
    if (confirmResetToggle) confirmResetToggle.checked = Boolean(preferences.confirmBeforeReset);
}

async function loadAboutInfo() {
    try {
        const info = await window.electronAPI.getAppInfo();
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.innerText = value;
        };

        setText('about-name', info.name || 'WellDesk');
        setText('about-version', info.version || '-');
        setText('about-electron', info.electron || '-');
        setText('about-chromium', info.chromium || '-');
        setText('about-node', info.node || '-');
        setText('about-platform', `${info.platform || '-'} (${info.arch || '-'})`);
    } catch (error) {
        // Keep About panel resilient even if metadata isn't available.
    }
}

// --- SETTINGS LOGIC ---

async function loadSettings() {
    const checkbox = document.getElementById('setting-auto-launch');

    preferences = readStoredPreferences();
    writeStoredPreferences(preferences);
    renderSettingsFromPreferences();
    applyPollingPreferences();
    loadAboutInfo();

    if (checkbox) {
        const isAutoLaunch = await window.electronAPI.getAutoLaunch();
        checkbox.checked = isAutoLaunch;
    }

    const timerEl = document.getElementById('timer');
    if (timerEl) {
        timerEl.addEventListener('focus', () => {
            if (!isFocusRunning) {
                selectElementContents(timerEl);
            }
        });

        timerEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                timerEl.blur();
            }
        });

        timerEl.addEventListener('input', () => {
            if (isFocusRunning) return;
            const cleaned = timerEl.innerText.replace(/[^\d:]/g, '');
            const firstColonIndex = cleaned.indexOf(':');
            const normalized = firstColonIndex === -1
                ? cleaned.replace(/:/g, '').slice(0, 4)
                : `${cleaned.slice(0, firstColonIndex).replace(/:/g, '').slice(0, 3)}:${cleaned.slice(firstColonIndex + 1).replace(/:/g, '').slice(0, 2)}`;

            timerEl.innerText = normalized;
            placeCaretAtEnd(timerEl);
        });

        timerEl.addEventListener('blur', () => {
            if (isFocusRunning) return;
            const seconds = getFocusDurationSeconds();
            if (seconds === null) {
                setFocusDurationView(defaultDuration);
            } else {
                applyFocusDuration(seconds);
            }
        });
    }
}

window.saveSettings = () => {
    const refreshSelect = document.getElementById('setting-dashboard-refresh');
    const historyLimitSelect = document.getElementById('setting-history-limit');
    const focusAlertToggle = document.getElementById('setting-focus-alert');
    const confirmResetToggle = document.getElementById('setting-confirm-reset');

    const nextPreferences = {
        ...preferences,
        dashboardRefreshMs: refreshSelect ? Number(refreshSelect.value) : preferences.dashboardRefreshMs,
        historyWeekLimit: historyLimitSelect ? Number(historyLimitSelect.value) : preferences.historyWeekLimit,
        showFocusCompletionAlert: focusAlertToggle ? Boolean(focusAlertToggle.checked) : preferences.showFocusCompletionAlert,
        confirmBeforeReset: confirmResetToggle ? Boolean(confirmResetToggle.checked) : preferences.confirmBeforeReset
    };

    writeStoredPreferences(nextPreferences);
    renderSettingsFromPreferences();
    applyPollingPreferences();

    if (historyWeekOffset > maxHistoryWeekOffset) {
        historyWeekOffset = maxHistoryWeekOffset;
    }
    updateHistoryNavButtons();

    alert('Settings saved.');
};

function placeCaretAtEnd(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function selectElementContents(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

window.clearAllData = async () => {
    const shouldConfirm = preferences.confirmBeforeReset;
    if (!shouldConfirm || confirm("Are you sure? This will delete all history.")) {
        await window.electronAPI.clearData();
        location.reload(); 
    }
};

// --- INITIALIZATION ---
loadData();
loadSettings();
updateHistoryNavButtons();
setInterval(tickDashboardClock, 1000);