const express = require("express");
const router = express.Router();
const db = require("../config/db");
const verify = require("../middlewares/auth.middleware");

// Helper to promisify db.run/db.get/db.all
const runQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });

const getQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

const allQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

/* ===============================
   ACTIVATE QR
================================ */
router.post("/activate", verify, async (req, res) => {
    const { qr_id, asset_name, primary, secondary } = req.body;

    if (!qr_id || !asset_name || !primary) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    // Phone validation
    if (!/^[0-9]{10}$/.test(primary)) {
        return res.status(400).json({ error: "Invalid primary phone" });
    }

    if (secondary && !/^[0-9]{10}$/.test(secondary)) {
        return res.status(400).json({ error: "Invalid secondary phone" });
    }

    try {
        // Check ownership
        const qr = await getQuery(
            `SELECT qr_id FROM qr_codes WHERE qr_id=? AND user_id=?`,
            [qr_id, req.user.id]
        );
        if (!qr) return res.status(403).json({ error: "Unauthorized QR" });

        await runQuery("BEGIN TRANSACTION");

        // Activate QR + expiry logic
        await runQuery(
            `UPDATE qr_codes
       SET status='active',
           asset_name=?,
           expiry_date = CASE
             WHEN expiry_date IS NULL THEN DATE('now', '+365 days')
             WHEN expiry_date < DATE('now') THEN DATE('now', '+365 days')
             ELSE expiry_date
           END,
           claimed_at = CURRENT_TIMESTAMP
       WHERE qr_id=? AND user_id=?`,
            [asset_name, qr_id, req.user.id]
        );

        // Remove old numbers
        await runQuery(`DELETE FROM qr_numbers WHERE qr_id=?`, [qr_id]);

        // Insert primary number
        await runQuery(
            `INSERT INTO qr_numbers (qr_id, phone, type)
       VALUES (?, ?, 'primary')`,
            [qr_id, primary]
        );

        // Insert secondary if exists
        if (secondary) {
            await runQuery(
                `INSERT INTO qr_numbers (qr_id, phone, type)
         VALUES (?, ?, 'secondary')`,
                [qr_id, secondary]
            );
        }

        await runQuery("COMMIT");

        res.json({ success: true });

    } catch (err) {
        console.error("Activate QR error:", err);
        await runQuery("ROLLBACK");
        res.status(500).json({ error: "Failed to activate QR" });
    }
});

/* ===============================
   DEACTIVATE QR
================================ */
router.post("/deactivate", verify, async (req, res) => {
    const { qr_id } = req.body;
    if (!qr_id) return res.status(400).json({ error: "Missing qr_id" });

    try {
        await runQuery(
            `UPDATE qr_codes 
       SET status='disabled'
       WHERE qr_id=? AND user_id=?`,
            [qr_id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Deactivate QR error:", err);
        res.status(500).json({ error: "Failed to deactivate QR" });
    }
});

/* ===============================
   REACTIVATE QR
================================ */
router.post("/reactivate", verify, async (req, res) => {
    const { qr_id } = req.body;
    if (!qr_id) return res.status(400).json({ error: "Missing qr_id" });

    try {
        await runQuery(
            `UPDATE qr_codes
       SET status = CASE
         WHEN expiry_date IS NOT NULL AND expiry_date < DATE('now')
         THEN 'expired'
         ELSE 'active'
       END
       WHERE qr_id=? AND user_id=?`,
            [qr_id, req.user.id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error("Reactivate QR error:", err);
        res.status(500).json({ error: "Failed to reactivate QR" });
    }
});

/* ===============================
   ADD SECONDARY NUMBER
================================ */
router.post("/add-secondary", verify, async (req, res) => {
    const { qr_id, phone } = req.body;

    if (!qr_id || !phone)
        return res.status(400).json({ error: "Missing fields" });

    if (!/^[0-9]{10}$/.test(phone))
        return res.status(400).json({ error: "Invalid phone number" });

    try {
        const qr = await getQuery(
            `SELECT qr_id FROM qr_codes WHERE qr_id=? AND user_id=?`,
            [qr_id, req.user.id]
        );
        if (!qr) return res.json({ success: false, message: "QR not found" });

        const existing = await getQuery(
            `SELECT * FROM qr_numbers WHERE qr_id=? AND type='secondary'`,
            [qr_id]
        );
        if (existing)
            return res.json({ success: false, message: "Secondary already exists" });

        await runQuery(
            `INSERT INTO qr_numbers (qr_id, phone, type)
       VALUES (?, ?, 'secondary')`,
            [qr_id, phone]
        );

        res.json({ success: true });

    } catch (err) {
        console.error("Add secondary error:", err);
        res.status(500).json({ error: "Failed to add secondary number" });
    }
});

/* ===============================
   UPDATE SECONDARY NUMBER
================================ */
router.post("/update-secondary", verify, async (req, res) => {
    const { qr_id, phone } = req.body;

    if (!qr_id || !phone)
        return res.status(400).json({ error: "Missing fields" });

    if (!/^[0-9]{10}$/.test(phone))
        return res.status(400).json({ error: "Invalid phone number" });

    try {
        await runQuery(
            `UPDATE qr_numbers
       SET phone=?
       WHERE qr_id=? AND type='secondary'`,
            [phone, qr_id]
        );

        res.json({ success: true });

    } catch (err) {
        console.error("Update secondary error:", err);
        res.status(500).json({ error: "Failed to update secondary number" });
    }
});

module.exports = router;