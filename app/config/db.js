const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "../../database/reachoutowner.sqlite");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Database error:", err);
    } else {
        console.log("Connected to SQLite database");
    }
});

// CONTACT SALES TABLE
db.run(`
CREATE TABLE IF NOT EXISTS contact_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  message TEXT,
  source TEXT DEFAULT 'FORM',  -- FORM or WHATSAPP
  status TEXT DEFAULT 'NEW',   -- NEW, CONTACTED, CLOSED
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`);


module.exports = db;
