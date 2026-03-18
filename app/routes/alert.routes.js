const express = require("express");
const router = express.Router();
const db = require("../config/db");
const verify = require("../middlewares/auth.middleware");

router.post("/toggle", verify, (req, res) => {

    const { qr_id, whatsapp_enabled } = req.body;

    db.run(
        `UPDATE qr_codes
SET whatsapp_enabled=?
WHERE qr_id=? AND user_id=?`,
        [whatsapp_enabled ? 1 : 0, qr_id, req.user.id],
        () => res.json({ success: true })
    );

});

const { sendWhatsApp } = require("../services/whatsapp.service");

router.post("/send-alert", (req, res) => {

    const { qr_id, message, location } = req.body;

    if (!qr_id || !message) {
        return res.json({ success: false, message: "Missing data" });
    }

    // 🔍 Validate QR + subscription
    db.get(
        `
        SELECT q.qr_id, q.status, u.subscription_expiry
        FROM qr_codes q
        JOIN users u ON q.user_id = u.id
        WHERE q.qr_id=?
        `,
        [qr_id],
        (err, qr) => {

            if (err || !qr) {
                return res.json({ success: false, message: "Invalid QR" });
            }

            // ❌ Expired check
            if (qr.subscription_expiry) {
                const today = new Date();
                const expiry = new Date(qr.subscription_expiry);

                if (today > expiry) {
                    return res.json({
                        success: false,
                        message: "QR expired"
                    });
                }
            }

            // ❌ Disabled check
            if (qr.status === "disabled") {
                return res.json({
                    success: false,
                    message: "QR inactive"
                });
            }

            // ✅ Get all numbers
            db.all(
                `SELECT phone FROM qr_numbers WHERE qr_id=?`,
                [qr_id],
                (err2, rows) => {

                    if (!rows || rows.length === 0) {
                        return res.json({
                            success: false,
                            message: "No contact found"
                        });
                    }

                    const fullMsg = `
🚨 ReachOutOwner Alert

${message}

📍 Location:
${location || "Not shared"}

QR: ${qr_id}
`;

                    rows.forEach(r => {
                        sendWhatsApp(r.phone, fullMsg);
                    });

                    // Optional: store scan log
                    db.run(
                        `
                        INSERT INTO scan_logs (qr_id)
                        VALUES (?)
                        `,
                        [qr_id]
                    );

                    res.json({ success: true });

                }
            );

        }
    );

});

router.post("/whatsapp-webhook", (req, res) => {

    const payload = req.body;

    const replyId = payload?.postback?.payload;
    // example: coming_RO123

    if (!replyId) return res.sendStatus(200);

    const [action, qrId] = replyId.split("_");

    let replyText = "";

    if (action === "coming") replyText = "Owner is coming";
    if (action === "2min") replyText = "Owner will arrive in 2 mins";
    if (action === "call") replyText = "Owner requested a call";

    db.run(
        `UPDATE qr_codes SET last_reply=? WHERE qr_id=?`,
        [replyText, qrId]
    );

    res.sendStatus(200);
});

module.exports = router;