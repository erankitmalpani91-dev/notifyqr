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
router.post("/send-alert", async (req, res) => {
    try {
        const { qr_id, message, location } = req.body;

        if (!qr_id || !message) {
            return res.json({ success: false, message: "Missing data" });
        }

        const qr = await new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM qr_codes WHERE qr_id = ?`,
                [qr_id],
                (err, row) => err ? reject(err) : resolve(row)
            );
        });

        if (!qr) return res.json({ success: false, message: "Invalid QR" });

        const rows = await new Promise((resolve, reject) => {
            db.all(
                `SELECT phone, type FROM qr_numbers WHERE qr_id = ?`,
                [qr_id],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        const primaryRow = rows.find(r => r.type === "primary") || rows[0];
        const ownerPhone = primaryRow.phone;

        const scanId = crypto.randomBytes(16).toString("hex");

        // Save alert first
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO scan_alerts 
                (scan_id, qr_id, owner_phone, finder_message, location)
                VALUES (?, ?, ?, ?, ?)`,
                [scanId, qr_id, ownerPhone, message, location || null],
                err => err ? reject(err) : resolve()
            );
        });

        // Clean message
        const cleanMessage = message
            .replace(/\n/g, " ")
            .replace(/\t/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();

        const cleanLocation = (location || "Not shared")
            .replace(/\n/g, " ")
            .replace(/\s{2,}/g, " ")
            .trim();

        const finalMessage =
            cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1);

        let assetLabel = qr.product_type || "Item";
        assetLabel = assetLabel.charAt(0).toUpperCase() + assetLabel.slice(1);

        // Add owner's custom label if available e.g. "Car (Honda City RJ45 6789)"
        if (qr.asset_label && qr.asset_label.trim()) {
            assetLabel = `${assetLabel} (${qr.asset_label.trim()})`;
        }

        // 🔥 Send to primary
        const primaryMsgId = await sendWhatsApp(ownerPhone, {
            template: "qr_scan_alert",
            params: [assetLabel, finalMessage, cleanLocation]
        });

        // 🔥 Send to secondary
        let secondaryMsgId = null;
        const secondary = rows.find(r => r.type === "secondary");

        if (secondary) {
            secondaryMsgId = await sendWhatsApp(secondary.phone, {
                template: "qr_scan_alert",
                params: [assetLabel, finalMessage, cleanLocation]
            });
        }

        // 🔥 Save message IDs
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE scan_alerts 
                 SET wa_message_id = ?, wa_message_id_secondary = ?
                 WHERE scan_id = ?`,
                [primaryMsgId, secondaryMsgId, scanId],
                err => err ? reject(err) : resolve()
            );
        });

        res.json({ success: true, scan_id: scanId });

    } catch (err) {
        console.error("Send alert error:", err);
        res.json({ success: false, message: "Server error" });
    }
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

//Whatsapp Webhook Code

router.post("/whatsapp-webhook", (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];

        if (message && message.text) {
            const text = message.text.body;
            const contextId = message.context?.id;

            console.log("Reply:", text);
            console.log("Context ID:", contextId);

            if (contextId) {
                db.run(
                    `UPDATE scan_alerts
                     SET owner_reply = ?, replied_at = CURRENT_TIMESTAMP
                     WHERE wa_message_id = ?
                        OR wa_message_id_secondary = ?`,
                    [text, contextId, contextId],
                    function (err) {
                        if (err) {
                            console.error("Webhook DB error:", err);
                        } else if (this.changes === 0) {
                            console.log("❌ No matching messageId found");
                        } else {
                            console.log("✅ Reply saved correctly");
                        }
                    }
                );
            }
        }
    } catch (err) {
        console.error("Webhook error:", err);
    }

    res.sendStatus(200);
});

module.exports = router;