// src/data/database.js
import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron';

// 1. Setup Database Path (in AppData folder)
const dbPath = path.join(app.getPath('userData'), 'welldesk.db');
const db = new sqlite3.Database(dbPath);

// 2. Initialize Tables (Run this when app starts)
export function initDB() {
  db.serialize(() => {
    // Table: Daily App Usage
    db.run(`
      CREATE TABLE IF NOT EXISTS usage_logs (
        date TEXT,
        app_name TEXT,
        duration INTEGER,
        category TEXT,
        PRIMARY KEY (date, app_name)
      )
    `);

    // Table: App Categories (Persistent Settings)
    db.run(`
      CREATE TABLE IF NOT EXISTS category_rules (
        app_name TEXT PRIMARY KEY,
        category TEXT
      )
    `);

    // Table: Global Settings (Focus duration, etc.)
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  });
}

// 3. Helper: Get formatted date "YYYY-MM-DD"
function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

// 4. CORE: Log App Usage
export function logAppUsage(appName, windowTitle) {
  const today = getTodayKey();

  // First, check if we have a saved category rule
  db.get("SELECT category FROM category_rules WHERE app_name = ?", [appName], (err, row) => {
    let category = 'Neutral'; // Default
    if (row && row.category) {
      category = row.category;
    }

    // Upsert: Update duration if exists, else Insert
    // Note: SQLite 'ON CONFLICT' is perfect for this
    db.run(`
      INSERT INTO usage_logs (date, app_name, duration, category)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(date, app_name) 
      DO UPDATE SET duration = duration + 1, category = excluded.category
    `, [today, appName, category]);
  });
}

// 5. Update Category (Manually from UI)
export function setAppCategory(appName, newCategory) {
  // A. Save the rule for future
  db.run(`
    INSERT INTO category_rules (app_name, category)
    VALUES (?, ?)
    ON CONFLICT(app_name) DO UPDATE SET category = excluded.category
  `, [appName, newCategory]);

  // B. Update today's logs immediately
  const today = getTodayKey();
  db.run(`
    UPDATE usage_logs 
    SET category = ? 
    WHERE app_name = ? AND date = ?
  `, [newCategory, appName, today]);
}

// 6. Retrieve Data for Frontend (Formatted like the old JSON)
export function getHistory() {
  return new Promise((resolve, reject) => {
    const history = {};

    db.all("SELECT * FROM usage_logs ORDER BY date DESC", [], (err, rows) => {
      if (err) {
        console.error("DB Error:", err);
        return resolve({});
      }

      // Convert flat SQL rows back to nested JSON for the UI
      rows.forEach(row => {
        if (!history[row.date]) {
          history[row.date] = { total_time: 0, apps: {} };
        }

        history[row.date].total_time += row.duration;
        history[row.date].apps[row.app_name] = {
          total_duration: row.duration,
          category: row.category
        };
      });

      resolve(history);
    });
  });
}

// 7. Clear History
export function clearAllHistory() {
  return new Promise((resolve) => {
    db.run("DELETE FROM usage_logs", [], (err) => {
      resolve(true);
    });
  });
}