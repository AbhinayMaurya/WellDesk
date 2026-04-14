# WellDesk

WellDesk is a Windows desktop app for digital wellbeing and focus management. It tracks active app usage locally, shows daily and weekly activity in the dashboard, lets you classify apps as productive or distracting, and keeps you in focus mode with a tray-based background experience.

## What It Does

- Tracks the foreground app and window title every 2 seconds.
- Stores usage history locally in SQLite.
- Shows today’s usage, a productivity score, and a usage breakdown chart.
- Lets you categorize apps as `Productive`, `Neutral`, or `Distraction`.
- Shows window-title level history so you can drill into app activity.
- Runs in the system tray and keeps tracking even when the window is closed.
- Supports focus sessions with a configurable timer.
- Supports auto-launch in packaged builds.
- Stores UI preferences locally in the renderer.

## Production Notes

- This app is built for Windows.
- Closing the main window hides it to the tray instead of quitting.
- Auto-launch is only enabled in the packaged app, not in development mode.
- All tracking data stays on the machine; no cloud account or internet connection is required for the core workflow.

## Features

### Dashboard

- Live view of today’s total tracked time.
- Productivity score based on the share of time assigned to productive apps.
- Top app summary.
- Per-app category selector.

### History

- Weekly usage chart.
- Day-by-day drill-down.
- Window title breakdown for each app.

### Focus Mode

- Timer-driven focus sessions.
- Apps marked as distracting are surfaced while focus mode is active.
- Custom timer input in minutes or `MM:SS` format.

### Settings

- Start WellDesk with Windows.
- Dashboard refresh interval.
- History week limit.
- Optional completion alert when focus ends.
- Optional confirmation before clearing data.

## Tech Stack

- Electron
- Node.js
- SQLite3
- Chart.js
- active-win

## Data Storage

- Usage logs are stored in `welldesk.db` inside the app user data folder.
- App category rules are stored locally in SQLite.
- Renderer preferences are stored in browser localStorage.

## Project Structure

- `src/main.js` handles the Electron main process, tray behavior, tracking, and IPC.
- `src/preload.cjs` exposes the renderer bridge.
- `src/data/database.js` manages the SQLite schema and queries.
- `src/renderer/` contains the UI, charts, and client-side behavior.

## Notes

- The app is designed to keep running in the background until you choose Quit from the tray menu.
- A patch-package step runs after install, so keep the `patches/` directory in the repository.