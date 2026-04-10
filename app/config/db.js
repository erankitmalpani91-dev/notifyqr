const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "../../database/reachoutowner.sqlite");

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Database error:", err);
    } else {
        console.log("Connected to SQLite database");
        console.log("DB PATH:", dbPath);

        // Enable WAL mode for better concurrency
        db.run("PRAGMA journal_mode=WAL;");
        db.run("PRAGMA synchronous=NORMAL;");

        // Enable foreign keys
        db.run("PRAGMA foreign_keys = ON");
    }
});
db.run(`ALTER TABLE qr_codes ADD COLUMN asset_label TEXT`, () => { });

module.exports = db;