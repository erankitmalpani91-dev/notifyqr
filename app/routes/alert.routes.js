const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { sendWhatsApp, sendWhatsAppText } = require("../services/whatsapp.service");
const crypto = require("crypto");

// ─── Sync message IDs we sent — ignore if they come back as webhook ───
const syncMessageIds = new Set();

// ─── Send a plain-text notification to the OTHER number ───
// Called after every DB write so the inactive number stays informed.
// `activePhone`  = the number that just acted (do NOT send to them)
// `msg`          = the exact text to forward
// `label`        = human-readable prefix, e.g. "📢 Reply from your other number"
async function syncToOther(qr_id, activePhone, msg, label) {
    try {
        const numbers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT phone FROM qr_numbers WHERE qr_id = ?`,
                [qr_id],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        for (const num of numbers) {
            if (num.phone === activePhone) continue;
            try {
                const msgId = await sendWhatsAppText(num.phone, `*${label}*\n${msg}`);
                if (msgId) syncMessageIds.add(msgId);
                console.log(`🔄 Sync [${label}] → ${num.phone}`);
            } catch (e) {
                console.log("⚠️ Sync failed:", num.phone, e.message);
            }
        }
    } catch (err) {
        console.log("⚠️ syncToOther error:", err.message);
    }
}

// ─── Helper: look up a scan_alert by scan_id and call syncToOther ───
function syncAfterWrite(scanId, activePhone, msg, label) {
    db.get(
        `SELECT qr_id FROM scan_alerts WHERE scan_id = ?`,
        [scanId],
        (err, row) => {
            if (!err && row) syncToOther(row.qr_id, activePhone, msg, label);
        }
    );
}

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

        if (qr.expiry_date && new Date() > new Date(qr.expiry_date)) {
            return res.json({ success: false, message: "QR expired. Please renew." });
        }

        const alertsUsed = qr.alerts_used || 0;
        const alertsLimit = qr.alerts_limit || 600;
        if (alertsUsed >= alertsLimit) {
            return res.json({ success: false, message: "🚫 Notification limit reached. Please recharge your plan." });
        }

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

        // Save alert — reply_from starts NULL (no one has replied yet)
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO scan_alerts
                (scan_id, qr_id, owner_phone, finder_message, location,
                 reply_from, finder_followup, owner_reply, owner_reply2)
                VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
                [scanId, qr_id, ownerPhone, message, location || null],
                err => err ? reject(err) : resolve()
            );
        });

        const cleanMessage = message.replace(/\n/g, " ").replace(/\t/g, " ").replace(/\s{2,}/g, " ").trim();
        const cleanLocation = (location || "Not shared").replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
        const finalMessage = cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1);

        let assetLabel = qr.product_type || "Item";
        assetLabel = assetLabel.charAt(0).toUpperCase() + assetLabel.slice(1);
        if (qr.asset_label && qr.asset_label.trim()) {
            assetLabel = `${assetLabel} (${qr.asset_label.trim()})`;
        }

        // Send initial alert via template to primary (mandatory — no 24hr window yet)
        const primaryMsgId = await sendWhatsApp(ownerPhone, {
            template: "qr_scan_alert",
            params: [assetLabel, finalMessage, cleanLocation]
        });

        if (!primaryMsgId) {
            return res.json({ success: false, message: "Failed to send alert" });
        }

        // Send to secondary
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

        // Save message IDs
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE scan_alerts SET wa_message_id = ?, wa_message_id_secondary = ? WHERE scan_id = ?`,
                [primaryMsgId, secondaryMsgId, scanId],
                err => err ? reject(err) : resolve()
            );
        });

        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE qr_codes SET alerts_used = alerts_used + 1 WHERE qr_id = ?`,
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

// ✅ Finder polls for owner reply
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

// ✅ Finder sends a follow-up message
router.post("/send-followup", async (req, res) => {
    try {
        const { scan_id, message } = req.body;

        if (!scan_id || !message) {
            return res.json({ success: false, message: "Missing data" });
        }

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

        // Save follow-up
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE scan_alerts SET finder_followup = ?, followup_at = CURRENT_TIMESTAMP WHERE scan_id = ?`,
                [finalMsg, scan_id],
                err => err ? reject(err) : resolve()
            );
        });

        // Get all registered numbers for this QR
        const numbers = await new Promise((resolve, reject) => {
            db.all(
                `SELECT phone, type FROM qr_numbers WHERE qr_id = ?`,
                [alert.qr_id],
                (err, rows) => err ? reject(err) : resolve(rows)
            );
        });

        // Determine active number (whoever replied first = reply_from, else primary)
        const activePhone = alert.reply_from || alert.owner_phone;

        // Send follow-up ONLY to the active number (free text — 24hr window open)
        // Send sync notification to the OTHER number
        let followupMsgId = null;
        for (const num of numbers) {
            if (num.phone === activePhone) {
                // Active number gets the actual follow-up
                try {
                    const msgId = await sendWhatsAppText(num.phone, `*💬 Finder Follow-up*\n${finalMsg}`);
                    if (msgId) {
                        followupMsgId = msgId;
                        syncMessageIds.add(msgId);
                    }
                    console.log("✅ Follow-up sent to active:", num.phone);
                } catch (e) {
                    console.log("⚠️ Follow-up to active failed:", num.phone);
                }
            } else {
                // Inactive number gets a sync notification
                try {
                    const msgId = await sendWhatsAppText(num.phone, `💬 Finder Follow-up: ${finalMsg}`);
                    if (msgId) syncMessageIds.add(msgId);
                    console.log("✅ Follow-up sync to inactive:", num.phone);
                } catch (e) {
                    console.log("⚠️ Follow-up sync failed:", num.phone);
                }
            }
        }

        // Save follow-up message ID for reply2 context matching
        if (followupMsgId) {
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE scan_alerts SET wa_followup_msg_id = ? WHERE scan_id = ?`,
                    [followupMsgId, scan_id],
                    err => err ? reject(err) : resolve()
                );
            });
        }

        console.log("✅ Follow-up done for scan_id:", scan_id);
        res.json({ success: true });

    } catch (err) {
        console.error("Follow-up error:", err);
        res.json({ success: false, message: "Server error" });
    }
});

// ✅ WhatsApp webhook verification (GET)
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

// ✅ WhatsApp webhook (POST)
router.post("/whatsapp-webhook", (req, res) => {
    res.sendStatus(200); // Must respond immediately

    console.log("🔥 WEBHOOK HIT:", JSON.stringify(req.body, null, 2));

    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const message = changes?.value?.messages?.[0];

        if (!message) return;

        let from = message.from.replace(/\D/g, "");
        if (from.startsWith("91") && from.length === 12) from = from.slice(2);

        let text = null;
        if (message.type === "text" && message.text?.body) {
            text = message.text.body;
        } else if (message.type === "button") {
            console.log("Button tap from:", from, "— ignoring");
            return;
        }
        if (!text) return;

        // Ignore our own sync messages by ID
        const msgId = message.id;
        if (msgId && syncMessageIds.has(msgId)) {
            console.log("⛔ Ignoring our own sync echo:", msgId);
            syncMessageIds.delete(msgId);
            return;
        }

        console.log("📨 Reply from:", from, "→", text);

        const contextId = message.context?.id;

        if (contextId) {
            handleContextReply(text, from, contextId);
        } else {
            matchByPhone(text, from);
        }

    } catch (err) {
        console.error("Webhook error:", err);
    }
});

// ─── Handle reply with context (owner used reply gesture) ───
function handleContextReply(text, from, contextId) {

    // Try reply1: context matches original alert message ID, no reply yet
    db.get(
        `SELECT scan_id, qr_id, owner_phone, reply_from, owner_reply, finder_followup, owner_reply2
         FROM scan_alerts
         WHERE (wa_message_id = ? OR wa_message_id_secondary = ?)
         LIMIT 1`,
        [contextId, contextId],
        (err, alert) => {
            if (err || !alert) {
                // Context didn't match original alert — try follow-up message
                handleFollowupContextReply(text, from, contextId);
                return;
            }

            if (!alert.owner_reply) {
                // ── REPLY 1 ──
                // Lock check: if reply_from is already set, someone else replied first — ignore
                if (alert.reply_from && alert.reply_from !== from) {
                    console.log("⛔ Ignored — active number already set to:", alert.reply_from);
                    return;
                }

                db.run(
                    `UPDATE scan_alerts
                     SET owner_reply = ?, replied_at = CURRENT_TIMESTAMP, reply_from = ?
                     WHERE scan_id = ? AND owner_reply IS NULL`,
                    [text, from, alert.scan_id],
                    function (e) {
                        if (!e && this.changes > 0) {
                            console.log("✅ Reply 1 saved (context):", from);
                            const label = (alert.owner_phone === from)
                                ? "📢 Reply from your other number"
                                : "📢 Reply from your other number";
                            syncToOther(alert.qr_id, from, text, label);
                        }
                    }
                );

            } else if (alert.finder_followup && !alert.owner_reply2) {
                // ── REPLY 2 ──
                // Only active number can reply2
                if (alert.reply_from && alert.reply_from !== from) {
                    console.log("⛔ Ignored reply2 — not the active number");
                    return;
                }

                db.run(
                    `UPDATE scan_alerts
                     SET owner_reply2 = ?, replied2_at = CURRENT_TIMESTAMP
                     WHERE scan_id = ? AND owner_reply2 IS NULL`,
                    [text, alert.scan_id],
                    function (e) {
                        if (!e && this.changes > 0) {
                            console.log("✅ Reply 2 saved (context on original):", from);
                            syncToOther(alert.qr_id, from, text, "📢 Follow-up reply from your other number");
                        }
                    }
                );
            }
        }
    );
}

// ─── Handle reply where context points to follow-up message ID ───
function handleFollowupContextReply(text, from, contextId) {
    db.get(
        `SELECT scan_id, qr_id, owner_phone, reply_from, finder_followup, owner_reply2
         FROM scan_alerts
         WHERE wa_followup_msg_id = ?
         LIMIT 1`,
        [contextId],
        (err, alert) => {
            if (err || !alert || !alert.finder_followup || alert.owner_reply2) {
                // No match — fall through to phone matching
                matchByPhone(text, from);
                return;
            }

            // Only active number can reply2
            if (alert.reply_from && alert.reply_from !== from) {
                console.log("⛔ Ignored followup reply — not the active number");
                return;
            }

            db.run(
                `UPDATE scan_alerts
                 SET owner_reply2 = ?, replied2_at = CURRENT_TIMESTAMP
                 WHERE scan_id = ? AND owner_reply2 IS NULL`,
                [text, alert.scan_id],
                function (e) {
                    if (!e && this.changes > 0) {
                        console.log("✅ Reply 2 saved (followup context):", from);
                        syncToOther(alert.qr_id, from, text, "📢 Follow-up reply from your other number");
                    }
                }
            );
        }
    );
}

// ─── Handle free-text reply (owner typed without using reply gesture) ───
function matchByPhone(text, from) {

    // Find the most recent alert for this number where reply2 is needed
    // (active number already replied once, finder sent follow-up, reply2 pending)
    db.get(
        `SELECT sa.scan_id, sa.qr_id, sa.owner_phone, sa.reply_from, sa.owner_reply2
         FROM scan_alerts sa
         LEFT JOIN qr_numbers qn ON sa.qr_id = qn.qr_id AND qn.phone = ?
         WHERE (sa.owner_phone = ? OR qn.phone IS NOT NULL)
         AND sa.owner_reply IS NOT NULL
         AND sa.finder_followup IS NOT NULL
         AND sa.owner_reply2 IS NULL
         AND sa.created_at >= DATETIME('now', '-60 minutes')
         ORDER BY sa.id DESC LIMIT 1`,
        [from, from],
        (err, alert) => {
            if (!err && alert) {
                // Lock check for reply2
                if (alert.reply_from && alert.reply_from !== from) {
                    console.log("⛔ Ignored reply2 phone match — not active number:", from);
                    return;
                }

                db.run(
                    `UPDATE scan_alerts
                     SET owner_reply2 = ?, replied2_at = CURRENT_TIMESTAMP
                     WHERE scan_id = ? AND owner_reply2 IS NULL`,
                    [text, alert.scan_id],
                    function (e) {
                        if (!e && this.changes > 0) {
                            console.log("✅ Reply 2 matched by phone:", from);
                            syncToOther(alert.qr_id, from, text, "📢 Follow-up reply from your other number");
                        }
                    }
                );
                return;
            }

            // Find most recent alert with no reply yet (reply1)
            db.get(
                `SELECT sa.scan_id, sa.qr_id, sa.owner_phone, sa.reply_from
                 FROM scan_alerts sa
                 LEFT JOIN qr_numbers qn ON sa.qr_id = qn.qr_id AND qn.phone = ?
                 WHERE (sa.owner_phone = ? OR qn.phone IS NOT NULL)
                 AND sa.owner_reply IS NULL
                 AND sa.created_at >= DATETIME('now', '-30 minutes')
                 ORDER BY sa.id DESC LIMIT 1`,
                [from, from],
                (err2, alert2) => {
                    if (err2 || !alert2) {
                        // No time limit fallback
                        db.get(
                            `SELECT sa.scan_id, sa.qr_id, sa.owner_phone, sa.reply_from
                             FROM scan_alerts sa
                             LEFT JOIN qr_numbers qn ON sa.qr_id = qn.qr_id AND qn.phone = ?
                             WHERE (sa.owner_phone = ? OR qn.phone IS NOT NULL)
                             AND sa.owner_reply IS NULL
                             ORDER BY sa.id DESC LIMIT 1`,
                            [from, from],
                            (err3, alert3) => {
                                if (err3 || !alert3) {
                                    console.log("❌ No alert found for phone:", from);
                                    return;
                                }
                                saveReply1(alert3, from, text);
                            }
                        );
                        return;
                    }
                    saveReply1(alert2, from, text);
                }
            );
        }
    );
}

// ─── Save reply1 with lock check ───
function saveReply1(alert, from, text) {
    // Lock check: if reply_from already set to a DIFFERENT number, ignore
    if (alert.reply_from && alert.reply_from !== from) {
        console.log("⛔ Ignored reply1 — active number already:", alert.reply_from);
        return;
    }

    db.run(
        `UPDATE scan_alerts
         SET owner_reply = ?, replied_at = CURRENT_TIMESTAMP, reply_from = ?
         WHERE scan_id = ? AND owner_reply IS NULL`,
        [text, from, alert.scan_id],
        function (e) {
            if (!e && this.changes > 0) {
                console.log("✅ Reply 1 saved (phone match):", from);
                syncToOther(alert.qr_id, from, text, "📢 Reply from your other number");
            } else if (e) {
                console.error("Phone match error:", e);
            } else {
                console.log("❌ No rows updated for scan_id:", alert.scan_id);
            }
        }
    );
}

module.exports = router;