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
            if (qr.status === "inactive") {
                return res.json({ success: false, message: "QR not activated" });
            }

            if (qr.status === "disabled") {
                return res.json({ success: false, message: "QR disabled" });
            }

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

        if (qr.expiry_date && new Date() > new Date(qr.expiry_date)) {
            return res.json({
                success: false,
                message: "QR expired. Please renew."
            });
        }

        // 🚫 Check alert limit — must be inside route, after qr is fetched
        const alertsUsed = qr.alerts_used || 0;
        const alertsLimit = qr.alerts_limit || 600;
        if (alertsUsed >= alertsLimit) {
            return res.json({
                success: false,
                message: "🚫 Notification limit reached. Please recharge your plan."
            });
        }

        const rows = await new Promise((resolve, reject) => {
            db.all(
                `SELECT phone, type FROM qr_numbers WHERE qr_id = ?`,
                [qr_id],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        // 🚫 Check expiry
        if (qr.expiry_date && new Date() > new Date(qr.expiry_date)) {
            return res.json({
                success: false,
                message: "QR expired. Please renew."
            });
        }



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

        if (!primaryMsgId) {
            return res.json({
                success: false,
                message: "Failed to send alert"
            });
        }

        // 🔥 Send to secondary
        let secondaryMsgId = null;

        const secondary = rows.find(r => r.type === "secondary");

        if (secondary) {
            try {
                secondaryMsgId = await sendWhatsApp(secondary.phone, {
                    template: "qr_scan_alert",
                    params: [assetLabel, finalMessage, cleanLocation]
                });
            } catch (err) {
                console.log("⚠️ Secondary send failed:", err.message);
            }
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

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE qr_codes 
         SET alerts_used = alerts_used + 1 
         WHERE qr_id = ?`,
                [qr_id],
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
        `SELECT owner_reply, replied_at, finder_followup, followup_at, owner_reply2, replied2_at 
         FROM scan_alerts WHERE scan_id = ?`,
        [scanId],
        (err, row) => {
            if (err || !row) return res.json({ success: false });
            res.json({
                success: true,
                reply: row.owner_reply || null,
                replied_at: row.replied_at || null,
                finder_followup: row.finder_followup || null,
                owner_reply2: row.owner_reply2 || null,
                replied2_at: row.replied2_at || null
            });
        }
    );
});

// ✅ Finder sends a follow-up message after owner has replied
router.post("/send-followup", async (req, res) => {
    try {
        const { scan_id, message } = req.body;

        if (!scan_id || !message) {
            return res.json({ success: false, message: "Missing data" });
        }

        // Only allow follow-up if owner has already replied
        const alert = await new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM scan_alerts WHERE scan_id = ?`,
                [scan_id],
                (err, row) => err ? reject(err) : resolve(row)
            );
        });

        if (!alert) return res.json({ success: false, message: "Alert not found" });
        if (!alert.owner_reply) return res.json({ success: false, message: "Owner hasn't replied yet" });
        if (alert.finder_followup) return res.json({ success: false, message: "Follow-up already sent" });

        const cleanMsg = message.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
        const finalMsg = cleanMsg.charAt(0).toUpperCase() + cleanMsg.slice(1);

        // Save follow-up to DB
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE scan_alerts SET finder_followup = ?, followup_at = CURRENT_TIMESTAMP WHERE scan_id = ?`,
                [finalMsg, scan_id],
                err => err ? reject(err) : resolve()
            );
        });

        // Send to owner on WhatsApp as a free-text reply
        // We use the same template with a "Follow-up" label so owner knows context
        const qr = await new Promise((resolve, reject) => {
            db.get(`SELECT * FROM qr_codes WHERE qr_id = ?`, [alert.qr_id],
                (err, row) => err ? reject(err) : resolve(row));
        });

        let assetLabel = qr?.product_type || "Item";
        assetLabel = assetLabel.charAt(0).toUpperCase() + assetLabel.slice(1);
        if (qr?.asset_label?.trim()) assetLabel = `${assetLabel} (${qr.asset_label.trim()})`;

        const targetPhone = alert.reply_from || alert.owner_phone;

        await sendWhatsApp(targetPhone, {
            template: "qr_scan_alert",
            params: [assetLabel, `Follow-up: ${finalMsg}`, "—"]
        });

        console.log("✅ Follow-up sent for scan_id:", scan_id);
        res.json({ success: true });

    } catch (err) {
        console.error("Follow-up error:", err);
        res.json({ success: false, message: "Server error" });
    }
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

    // ✅ FIX: Respond 200 IMMEDIATELY — Meta requires < 5s response or it retries/disables
    res.sendStatus(200);

    console.log("🔥 WEBHOOK HIT:", JSON.stringify(req.body, null, 2));

    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];

        if (message) {
            // ✅ FIX: Normalize to 10-digit to match how owner_phone is stored in DB
            let from = message.from.replace(/\D/g, "");
            if (from.startsWith("91") && from.length === 12) from = from.slice(2);
            let text = null;

            if (message.type === "text" && message.text?.body) {
                text = message.text.body;
            } else if (message.type === "button") {
                // Owner tapped Quick Reply button — ignore, wait for real text
                console.log("Button tap from:", from, "— ignoring");
                return; // res already sent above
            }

            if (!text) return; // res already sent above

            console.log("📨 Reply from:", from, "→", text);

            const contextId = message.context?.id;

            if (contextId) {
                // Try exact message ID match first (owner used reply gesture)
                db.run(
                    `UPDATE scan_alerts
                     SET owner_reply = ?, replied_at = CURRENT_TIMESTAMP, reply_from = ?
                     WHERE (wa_message_id = ? OR wa_message_id_secondary = ?)
                     AND owner_reply IS NULL`,
                    [text, contextId, contextId, from],
                    function (err) {
                        if (!err && this.changes > 0) {
                            console.log("✅ Matched by message ID (reply 1)");
                            return;
                        }
                        // Try as second reply — finder sent a follow-up and owner is replying to it
                        db.run(
                            `UPDATE scan_alerts
                             SET owner_reply2 = ?, replied2_at = CURRENT_TIMESTAMP
                             WHERE (wa_message_id = ? OR wa_message_id_secondary = ?)
                             AND owner_reply IS NOT NULL
                             AND finder_followup IS NOT NULL
                             AND owner_reply2 IS NULL`,
                            [text, contextId, contextId],
                            function (err2) {
                                if (!err2 && this.changes > 0) {
                                    console.log("✅ Matched by message ID (reply 2)");
                                    return;
                                }
                                matchByPhone(text, from);
                            }
                        );
                    }
                );
            } else {
                matchByPhone(text, from);
            }
        }
    } catch (err) {
        console.error("Webhook error:", err);
    }
    // ✅ res.sendStatus(200) already called at top of handler
});

function matchByPhone(text, from) {
    // First try to match as reply2 (owner already replied once, finder sent follow-up, now owner replies again)
    db.run(
        `UPDATE scan_alerts
         SET owner_reply2 = ?, replied2_at = CURRENT_TIMESTAMP
         WHERE id = (
           SELECT id FROM scan_alerts
           WHERE owner_phone = ?
           AND owner_reply IS NOT NULL
           AND finder_followup IS NOT NULL
           AND owner_reply2 IS NULL
           AND created_at >= DATETIME('now', '-60 minutes')
           ORDER BY id DESC LIMIT 1
         )`,
        [text, from],
        function (err) {
            if (!err && this.changes > 0) {
                console.log("✅ Matched as reply2 by phone:", from);
                return;
            }
            // Fall through to first reply match
            db.run(
                `UPDATE scan_alerts
                 SET owner_reply = ?, replied_at = CURRENT_TIMESTAMP, reply_from = ?
                 WHERE id = (
                   SELECT id FROM scan_alerts
                   WHERE owner_phone = ?
                   AND owner_reply IS NULL
                   AND created_at >= DATETIME('now', '-30 minutes')
                   ORDER BY id DESC LIMIT 1
                 )`,
                [text, from],
                function (err2) {
                    if (err2) {
                        console.error("Phone match error:", err2);
                    } else if (this.changes > 0) {
                        console.log("✅ Matched by phone:", from);
                    } else {
                        db.run(
                            `UPDATE scan_alerts
                             SET owner_reply = ?, replied_at = CURRENT_TIMESTAMP, reply_from = ?
                             WHERE id = (
                               SELECT id FROM scan_alerts
                               WHERE owner_phone = ?
                               AND owner_reply IS NULL
                               ORDER BY id DESC LIMIT 1
                             )`,
                            [text, from],
                            function (err3) {
                                if (!err3 && this.changes > 0) {
                                    console.log("✅ Matched by phone (no time limit):", from);
                                } else {
                                    console.log("❌ No alert found for phone:", from);
                                }
                            }
                        );
                    }
                }
            );
        }
    );
}


module.exports = router;