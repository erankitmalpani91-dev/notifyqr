PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS scan_logs;
DROP TABLE IF EXISTS qr_numbers;
DROP TABLE IF EXISTS qr_codes;
DROP TABLE IF EXISTS qr_inventory;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS contact_sales;
DROP TABLE IF EXISTS login_requests;

PRAGMA foreign_keys = ON;

-- USERS (Magic login users)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  login_token TEXT,
  subscription_expiry TEXT,
  subscription_status TEXT DEFAULT 'inactive',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ORDERS (Checkout + Payment + Shipping)
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  owner_name TEXT,
  owner_email TEXT,
  owner_phone TEXT,
  shipping_address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  amount INTEGER,
  payment_status TEXT DEFAULT 'pending',
  payment_reference TEXT,
  transaction_type TEXT DEFAULT 'purchase',
  order_source TEXT DEFAULT 'website',
  plan_years INTEGER DEFAULT 1,   -- NEW COLUMN
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  payment_id TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- ORDER ITEMS
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  product_type TEXT,
  quantity INTEGER,
  price INTEGER,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

-- QR INVENTORY
CREATE TABLE qr_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_id TEXT UNIQUE,
  product_type TEXT,
  status TEXT DEFAULT 'available',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- QR CODES
CREATE TABLE qr_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_id TEXT UNIQUE,
  user_id INTEGER,
  order_id INTEGER,
  product_type TEXT,
  asset_name TEXT,
  status TEXT DEFAULT 'inactive',
  expiry_date TEXT,
  plan_years INTEGER DEFAULT 1,   -- NEW COLUMN
  source TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  activated_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(order_id) REFERENCES orders(id)
);

-- QR NUMBERS
CREATE TABLE qr_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_id TEXT,
  phone TEXT,
  type TEXT DEFAULT 'primary',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(qr_id) REFERENCES qr_codes(qr_id)
);

-- SCAN LOGS
CREATE TABLE scan_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_id TEXT,
  scanned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  user_agent TEXT,
  location TEXT,
  FOREIGN KEY(qr_id) REFERENCES qr_codes(qr_id)
);

-- CONTACT SALES / LEADS
CREATE TABLE contact_sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT,
  email TEXT,
  company TEXT,
  message TEXT,
  source TEXT DEFAULT 'FORM',
  status TEXT DEFAULT 'NEW',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- LOGIN REQUESTS (Rate limit magic login)
CREATE TABLE login_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- SCAN ALERTS (notifications sent to owners)
CREATE TABLE scan_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id TEXT,                -- unique identifier for alert
  qr_id TEXT,                  -- which QR triggered the alert
  owner_phone TEXT,            -- phone number notified
  finder_message TEXT,         -- message entered by finder
  location TEXT,               -- optional location
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  owner_reply TEXT,            -- reply from owner (captured via webhook)
  replied_at TEXT,             -- timestamp of reply
  FOREIGN KEY(qr_id) REFERENCES qr_codes(qr_id)
);


-- INDEXES
CREATE INDEX idx_qr_id ON qr_codes(qr_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_reference ON orders(payment_reference);
CREATE INDEX idx_scan_qr ON scan_logs(qr_id);
CREATE INDEX idx_scan_time ON scan_logs(scanned_at);
CREATE INDEX idx_login_requests_user_time ON login_requests(user_id, requested_at);
CREATE INDEX idx_alerts_qr ON scan_alerts(qr_id);
CREATE INDEX idx_alerts_owner ON scan_alerts(owner_phone);
CREATE INDEX idx_alerts_time ON scan_alerts(created_at);