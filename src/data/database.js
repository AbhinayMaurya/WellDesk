// src/data/database.js

import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron';

// 1. Setup Database Path
const dbPath = path.join(app.getPath('userData'), 'welldesk.db');
const db = new sqlite3.Database(dbPath);

// 2. Initialize Tables (Updated for Window Titles)
export function initDB() {
  db.serialize(() => {
    // UPDATED: Now includes 'window_title' as part of the Primary Key
    db.run(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        date TEXT,
        app_name TEXT,
        window_title TEXT,
        duration INTEGER,
        category TEXT,
        PRIMARY KEY (date, app_name, window_title)
      )
    `);

    // Settings tables remain the same
    db.run(`CREATE TABLE IF NOT EXISTS category_rules (app_name TEXT PRIMARY KEY, category TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
  });
}

// Helper
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

// 3. CORE: Log App Usage (With Window Title)
export function logAppUsage(appName, windowTitle) {
  const today = getTodayKey();
  
  // Clean the window title (remove file paths or sensitive info if needed, or keep raw)
  // For simplicity, we just trim it.
  const cleanTitle = windowTitle ? windowTitle.trim() : 'Unknown';

  db.get("SELECT category FROM category_rules WHERE app_name = ?", [appName], (err, row) => {
    let category = 'Neutral';
    if (row && row.category) category = row.category;

    // UPDATED: Insert/Update specific to the Window Title
    db.run(`
      INSERT INTO usage_logs (date, app_name, window_title, duration, category)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(date, app_name, window_title) 
      DO UPDATE SET duration = duration + 1, category = excluded.category
    `, [today, appName, cleanTitle, category]);
  });
}

// 4. Update Category (Updates all logs for that app on that day)
export function setAppCategory(appName, newCategory) {
  db.run(`
    INSERT INTO category_rules (app_name, category)
    VALUES (?, ?)
    ON CONFLICT(app_name) DO UPDATE SET category = excluded.category
  `, [appName, newCategory]);

  const today = getTodayKey();
  db.run(`
    UPDATE usage_logs 
    SET category = ? 
    WHERE app_name = ? AND date = ?
  `, [newCategory, appName, today]);
}

// 5. Retrieve Data (Aggregated Structure)
export function getHistory() {
  return new Promise((resolve, reject) => {
    const history = {};

    db.all("SELECT * FROM usage_logs ORDER BY date DESC", [], (err, rows) => {
      if (err) return resolve({});

      rows.forEach(row => {
        if (!history[row.date]) {
          history[row.date] = { total_time: 0, apps: {} };
        }

        // 1. Add to Daily Total
        history[row.date].total_time += row.duration;

        // 2. Initialize App Object if missing
        if (!history[row.date].apps[row.app_name]) {
          history[row.date].apps[row.app_name] = {
            total_duration: 0,
            category: row.category,
            window_titles: {} // Nested object for details
          };
        }

        // 3. Add to App Total
        history[row.date].apps[row.app_name].total_duration += row.duration;

        // 4. Add to Specific Window Title count
        const wTitle = row.window_title || "Unknown";
        if (!history[row.date].apps[row.app_name].window_titles[wTitle]) {
          history[row.date].apps[row.app_name].window_titles[wTitle] = 0;
        }
        history[row.date].apps[row.app_name].window_titles[wTitle] += row.duration;
      });

      resolve(history);
    });
  });
}

// 6. Clear History
export function clearAllHistory() {
  return new Promise((resolve) => {
    db.run("DELETE FROM usage_logs", [], () => resolve(true));
  });
}