const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { sendWhatsApp } = require("../services/whatsapp.service");
const crypto = require("crypto");

// ✅ QR Info — called by scan page on load
router.get("/qr-info/:qrId", (req, res) => {
    const { qrId } = req.params;

    db.get(
        `SELECT qr_id, product_type, asset_name, status, expiry_date
         FROM qr_codes WHERE qr_id = ?`,
        [qrId],
        (err, qr) => {
            if (err || !qr) return res.json({ success: false, message: "QR not found" });
            if (qr.status === "inactive") return res.json({ success: false, message: "QR not activated" });
            if (qr.status === "disabled") return res.json({ success: false, message: "QR disabled" });
            if (qr.expiry_date && new Date() > new Date(qr.expiry_date)) {
                return res.json({ success: false, message: "QR expired" });
            }
            res.json({
                success: true,
                qr_id: qr.qr_id,
                product_type: qr.product_type,
                asset_name: qr.asset_name
            });
        }
    );
});

// ✅ Send alert when finder clicks "Notify Owner"
router.post("/send-alert", (req, res) => {
    const { qr_id, message, location } = req.body;

    if (!qr_id || !message) {
        return res.json({ success: false, message: "Missing data" });
    }

    db.get(
        `SELECT q.qr_id, q.status, q.expiry_date, q.plan_years, q.product_type, q.asset_name
         FROM qr_codes q
         WHERE q.qr_id = ?`,
        [qr_id],
        (err, qr) => {
            if (err || !qr) return res.json({ success: false, message: "Invalid QR" });

            if (qr.status === "inactive") return res.json({ success: false, message: "QR not activated" });
            if (qr.status === "disabled") return res.json({ success: false, message: "QR disabled" });
            if (qr.expiry_date && new Date() > new Date(qr.expiry_date)) {
                return res.json({ success: false, message: "QR expired" });
            }

            db.all(`SELECT phone, type FROM qr_numbers WHERE qr_id = ?`, [qr_id], (err2, rows) => {
                if (!rows || rows.length === 0) {
                    return res.json({ success: false, message: "No contact found" });
                }

                const primaryRow = rows.find(r => r.type === "primary") || rows[0];
                const ownerPhone = primaryRow.phone;

                // Enforce 600 alerts per year per plan_year
                const planYears = qr.plan_years || 1;
                const maxAlerts = 600 * planYears;

                db.get(
                    `SELECT COUNT(*) as cnt FROM scan_alerts
                     WHERE qr_id = ? AND created_at >= DATE('now', '-' || ? || ' years')`,
                    [qr_id, planYears],
                    (err3, countRow) => {
                        if (countRow && countRow.cnt >= maxAlerts) {
                            return res.json({
                                success: false,
                                message: "Alert limit reached for this QR"
                            });
                        }

                        // Generate unique scan_id for polling
                        const scanId = crypto.randomBytes(16).toString("hex");

                        // Log scan
                        db.run(`INSERT INTO scan_logs (qr_id) VALUES (?)`, [qr_id]);

                        // Save alert record
                        db.run(
                            `INSERT INTO scan_alerts (scan_id, qr_id, owner_phone, finder_message, location)
                             VALUES (?, ?, ?, ?, ?)`,
                            [scanId, qr_id, ownerPhone, message, location || null],
                            (insertErr) => {
                                if (insertErr) {
                                    console.error("Alert insert error:", insertErr);
                                    return res.json({ success: false, message: "Failed to log alert" });
                                }

                                // Send WhatsApp to primary number using approved template
                                const rawAsset = qr.asset_name || qr.product_type || "Asset";
                                const formattedAsset = rawAsset.charAt(0).toUpperCase() + rawAsset.slice(1);

                                // Send WhatsApp to primary
                                sendWhatsApp(ownerPhone, {
                                    template: "qr_scan_alert",
                                    params: [
                                        formattedAsset,
                                        message,
                                        location || "Not shared"
                                    ]
                                });

                                // Send to secondary
                                const secondary = rows.find(r => r.type === "secondary");
                                if (secondary) {
                                    sendWhatsApp(secondary.phone, {
                                        template: "qr_scan_alert",
                                        params: [
                                            formattedAsset,
                                            message,
                                            location || "Not shared"
                                        ]
                                    });
                                }


                                // Return scan_id so finder can poll for reply
                                res.json({ success: true, scan_id: scanId });
                            }
                        );
                    }
                );
            });
        }
    );
});

// ✅ Finder polls for owner reply using scan_id
router.get("/reply/:scanId", (req, res) => {
    const { scanId } = req.params;

    db.get(
        `SELECT owner_reply, replied_at FROM scan_alerts WHERE scan_id = ?`,
        [scanId],
        (err, row) => {
            if (err || !row) return res.json({ success: false });
            res.json({
                success: true,
                reply: row.owner_reply || null,
                replied_at: row.replied_at || null
            });
        }
    );
});

// ✅ WhatsApp webhook verification (GET) — required by Meta
router.get("/whatsapp-webhook", (req, res) => {
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (token === process.env.WEBHOOK_VERIFY_TOKEN) {
        console.log("WhatsApp webhook verified");
        res.send(challenge);
    } else {
        console.log("Webhook verification failed");
        res.sendStatus(403);
    }
});

// ✅ WhatsApp webhook — receives owner's reply
router.post("/whatsapp-webhook", (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];

        if (message && message.type === "text") {
            const from = message.from; // full international format
            const text = message.text.body;

            console.log("Owner reply received from:", from, "→", text);

            db.run(
                `UPDATE scan_alerts
                 SET owner_reply = ?, replied_at = CURRENT_TIMESTAMP
                 WHERE owner_phone = ? AND owner_reply IS NULL
                 ORDER BY id DESC LIMIT 1`,
                [text, from],
                (err) => {
                    if (err) console.error("Webhook DB error:", err);
                }
            );
        }
    } catch (err) {
        console.error("Webhook error:", err);
    }

    // Always respond 200 to Meta
    res.sendStatus(200);
});


module.exports = router;