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

    ensureUsageLogsSchema();

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

function ensureUsageLogsSchema() {
  db.all("PRAGMA table_info(usage_logs)", [], (err, rows) => {
    if (err) {
      console.error("Failed to inspect usage_logs schema:", err);
      return;
    }

    const hasWindowTitleColumn = rows.some((row) => row.name === 'window_title');
    const hasCompositePrimaryKey = rows.some((row) => row.name === 'date' && row.pk === 1)
      && rows.some((row) => row.name === 'app_name' && row.pk === 2)
      && rows.some((row) => row.name === 'window_title' && row.pk === 3);

    if (hasWindowTitleColumn && hasCompositePrimaryKey) {
      return;
    }

    db.serialize(() => {
      db.run("ALTER TABLE usage_logs RENAME TO usage_logs_legacy", (renameErr) => {
        if (renameErr) {
          console.error("Failed to rename legacy usage_logs table:", renameErr);
          return;
        }

        db.run(`
          CREATE TABLE usage_logs (
            date TEXT,
            app_name TEXT,
            window_title TEXT,
            duration INTEGER,
            category TEXT,
            PRIMARY KEY (date, app_name, window_title)
          )
        `, (createErr) => {
          if (createErr) {
            console.error("Failed to create migrated usage_logs table:", createErr);
            return;
          }

          const windowTitleExpr = hasWindowTitleColumn ? "COALESCE(window_title, 'General')" : "'General'";

          db.run(`
            INSERT INTO usage_logs (date, app_name, window_title, duration, category)
            SELECT
              date,
              app_name,
              ${windowTitleExpr} AS window_title,
              SUM(COALESCE(duration, 0)) AS duration,
              COALESCE(MAX(category), 'Neutral') AS category
            FROM usage_logs_legacy
            GROUP BY date, app_name, window_title
          `, (copyErr) => {
            if (copyErr) {
              console.error("Failed to migrate legacy usage logs:", copyErr);
              return;
            }

            db.run("DROP TABLE usage_logs_legacy", (dropErr) => {
              if (dropErr) {
                console.error("Failed to remove legacy usage_logs table:", dropErr);
              }
            });
          });
        });
      });
    });
  });
}

// 3. Helper: Get formatted date "YYYY-MM-DD"
function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 4. CORE: Log App Usage
export function logAppUsage(appName, windowTitle = 'General', durationSeconds = 1) {
  const today = getTodayKey();
  const safeTitle = (windowTitle && windowTitle.trim()) ? windowTitle.trim() : 'General';
  const safeDuration = Math.max(1, Number.isFinite(durationSeconds) ? Math.floor(durationSeconds) : 1);

  db.get("SELECT category FROM category_rules WHERE app_name = ?", [appName], (err, row) => {
    let category = 'Neutral';
    if (row && row.category) category = row.category;

    db.run(`
      INSERT INTO usage_logs (date, app_name, window_title, duration, category)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date, app_name, window_title)
      DO UPDATE SET duration = duration + excluded.duration, category = excluded.category
    `, [today, appName, safeTitle, safeDuration, category]);
  });
}

export function getAppCategory(appName) {
  return new Promise((resolve) => {
    db.get("SELECT category FROM category_rules WHERE app_name = ?", [appName], (err, row) => {
      if (err) {
        return resolve('Neutral');
      }

      resolve(row?.category || 'Neutral');
    });
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

export function getTodayUsage() {
  return new Promise((resolve) => {
    const today = getTodayKey();

    db.all(`
      SELECT app_name, SUM(duration) as duration, COALESCE(MAX(category), 'Neutral') as category
      FROM usage_logs
      WHERE date = ?
      GROUP BY app_name
      ORDER BY duration DESC
    `, [today], (err, rows) => {
      if (err) {
        console.error("DB Error:", err);
        return resolve({ total_time: 0, apps: {} });
      }

      const todayData = { total_time: 0, apps: {} };

      rows.forEach((row) => {
        todayData.total_time += row.duration;
        todayData.apps[row.app_name] = {
          total_duration: row.duration,
          category: row.category
        };
      });

      resolve(todayData);
    });
  });
}