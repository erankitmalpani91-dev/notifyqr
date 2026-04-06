const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { sendWhatsApp } = require("../services/whatsapp.service");

// ✅ Send alert when finder clicks "Notify Owner"
router.post("/send-alert", (req, res) => {
    const { qr_id, message, location } = req.body;

    if (!qr_id || !message) {
        return res.json({ success: false, message: "Missing data" });
    }

    // 🔍 Validate QR and fetch plan_years
    db.get(
        `SELECT q.qr_id, q.status, q.expiry_date, q.plan_years, u.id as user_id
         FROM qr_codes q
         JOIN users u ON q.user_id = u.id
         WHERE q.qr_id=?`,
        [qr_id],
        (err, qr) => {
            if (err || !qr) {
                return res.json({ success: false, message: "Invalid QR" });
            }

            // ❌ Status checks
            if (qr.status === "inactive") {
                return res.json({ success: false, message: "QR not activated" });
            }
            if (qr.status === "disabled") {
                return res.json({ success: false, message: "QR disabled" });
            }
            if (qr.expiry_date) {
                const today = new Date();
                const expiry = new Date(qr.expiry_date);
                if (today > expiry) {
                    return res.json({ success: false, message: "QR expired" });
                }
            }

            // ✅ Get primary + optional secondary numbers
            db.all(`SELECT phone, type FROM qr_numbers WHERE qr_id=?`, [qr_id], (err2, rows) => {
                if (!rows || rows.length === 0) {
                    return res.json({ success: false, message: "No contact found" });
                }

                const primaryRow = rows.find(r => r.type === "primary") || rows[0];
                const ownerPhone = primaryRow.phone;

                // 🔒 Enforce alerts/year * plan_years
                const planYears = qr.plan_years || 1;
                const maxAlerts = 600 * planYears;

                db.get(
                    `SELECT COUNT(*) as cnt
                       FROM scan_alerts
                       WHERE owner_phone=? AND strftime('%Y', created_at)=strftime('%Y','now')`,
                    [ownerPhone],
                    (err3, countRow) => {
                        if (countRow && countRow.cnt >= maxAlerts) {
                            return res.json({
                                success: false,
                                message: `Annual alert limit reached (${maxAlerts} for ${planYears}-year plan)`
                            });
                        }

                        // ✅ WhatsApp template format
                        const fullMsg = `
                        Reachoutowner Alert ⚠️

                        Someone scanned your asset type QR.

                        Message: ${message}

                        📍 Location: ${location || "Not shared"}

                        Reply to this message to respond to the finder.
                        They will see your reply on their screen.
                        `;

                        // Send WhatsApp to all numbers (primary + optional secondary)
                        rows.forEach(r => {
                            sendWhatsApp(r.phone, fullMsg);
                        });

                        // Log scan + alert
                        db.run(`INSERT INTO scan_logs (qr_id) VALUES (?)`, [qr_id]);
                        db.run(
                            `INSERT INTO scan_alerts (scan_id, qr_id, owner_phone, finder_message, location)
                             VALUES (?, ?, ?, ?, ?)`,
                            [Date.now().toString(), qr_id, ownerPhone, message, location]
                        );

                        res.json({ success: true });
                    }
                );
            });
        }
    );
});

// ✅ Webhook to capture owner replies (free-text)
router.post("/whatsapp-webhook", (req, res) => {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (message && message.text) {
        const from = message.from; // owner phone
        const text = message.text.body;

        db.run(
            `UPDATE scan_alerts
               SET owner_reply=?, replied_at=CURRENT_TIMESTAMP
               WHERE owner_phone=? ORDER BY id DESC LIMIT 1`,
            [text, from]
        );
    }

    res.sendStatus(200);
});

// ✅ Finder can poll for latest owner reply
router.get("/status/:qrId", (req, res) => {
    const { qrId } = req.params;
    db.get(
        `SELECT owner_reply, replied_at
         FROM scan_alerts
         WHERE qr_id=?
         ORDER BY id DESC LIMIT 1`,
        [qrId],
        (err, row) => {
            if (err || !row) return res.json({ success: false });
            res.json({ success: true, reply: row.owner_reply, replied_at: row.replied_at });
        }
    );
});

module.exports = router;