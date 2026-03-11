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

//Users Table

db.run(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'owner', -- owner or admin
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
`);

// ---- SUBSCRIPTION COLUMNS (Safe Add) ----
db.run(`ALTER TABLE users ADD COLUMN plan_type TEXT DEFAULT 'NONE'`, () => { });
db.run(`ALTER TABLE users ADD COLUMN max_qr_slots INTEGER DEFAULT 0`, () => { });
db.run(`ALTER TABLE users ADD COLUMN subscription_expiry TEXT`, () => { });
db.run(`ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'inactive'`, () => { });

// qr code table

db.run(`
CREATE TABLE IF NOT EXISTS qr_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_id TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  plan_type TEXT NOT NULL,
  status TEXT DEFAULT 'inactive', -- inactive, active, suspended
  metallic INTEGER DEFAULT 0,
  phone_primary TEXT,
  phone_secondary TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  plan_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  payment_status TEXT DEFAULT 'pending', -- pending, paid, failed
  payment_reference TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)
`);

db.run(`
CREATE TABLE IF NOT EXISTS scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_id TEXT NOT NULL,
  scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  user_agent TEXT
)
`);
// ---- QR PHONE NUMBERS TABLE ----
db.run(`
CREATE TABLE IF NOT EXISTS qr_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  type TEXT DEFAULT 'primary', -- primary / secondary / extra
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(qr_id) REFERENCES qr_codes(qr_id)
)
`);

// ---- ADD ORDER EXTENSIONS ----
db.run(`ALTER TABLE orders ADD COLUMN transaction_type TEXT DEFAULT 'purchase'`, () => { });
db.run(`ALTER TABLE orders ADD COLUMN slots INTEGER DEFAULT 0`, () => { });
db.run(`ALTER TABLE qr_codes ADD COLUMN claimed_at TEXT`, () => { });
db.run(`CREATE INDEX IF NOT EXISTS idx_qr_id ON qr_codes(qr_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_scan_qr ON scan_logs(qr_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_scan_time ON scan_logs(scanned_at)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_scan_qr ON scan_logs(qr_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_scan_time ON scan_logs(scanned_at)`);

module.exports = db;
