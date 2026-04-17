const express = require("express");
const router = express.Router();
const db = require("../config/db");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const generateQrId = require("../utils/qrGenerator");
const { sendWhatsApp } = require("../services/whatsapp.service");
const { sendEmail } = require("../services/email.service");

const qrFolder = path.join(__dirname, "../../storage/qrcodes");

// Promisify helpers
const dbGet = (sql, p) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const dbRun = (sql, p) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const dbAll = (sql, p) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));

/* -----------------------------------------------
   GET /activate — serve activation HTML page
----------------------------------------------- */
router.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../../Website/activate.html"));
});

/* -----------------------------------------------
   POST /api/activate/verify — verify QR ID + PIN
----------------------------------------------- */

router.post("/verify", async (req, res) => {
    try {

        console.log("🔥 VERIFY API HIT:", req.body); // ✅ ADD THIS LINE

        const { qr_id, pin } = req.body;


        if (!qr_id || !pin) {
            return res.json({ success: false, message: "QR ID and PIN are required" });
        }

        // Look up in qr_inventory
        const qr = await dbGet(
            `SELECT * FROM qr_inventory WHERE qr_id = ?`,
            [qr_id.toUpperCase()]
        );

        if (!qr) {
            return res.json({ success: false, message: "QR ID not found. Please check and try again." });
        }

        if (qr.status === "activated") {
            return res.json({ success: false, message: "This QR has already been activated." });
        }

        if (qr.status !== "available") {
            return res.json({ success: false, message: "This QR is not available for activation." });
        }

        // Verify PIN
        if (qr.activation_pin !== pin.trim()) {
            return res.json({ success: false, message: "Incorrect PIN. Please check your sticker." });
        }

        res.json({
            success: true,
            qr_id: qr.qr_id,
            product_type: qr.product_type
        });

    } catch (err) {
        console.error("Verify error:", err);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
});

/* -----------------------------------------------
   POST /api/activate/submit — complete activation
----------------------------------------------- */
router.post("/submit", async (req, res) => {
    try {
        const { qr_id, name, email, phone, phone2, asset_label, product_type } = req.body;

        // Validate required fields
        if (!qr_id || !name || !email || !phone || !asset_label) {
            return res.json({ success: false, message: "All required fields must be filled" });
        }

        if (!/^[6-9]\d{9}$/.test(phone)) {
            return res.json({ success: false, message: "Invalid primary phone number" });
        }

        if (phone2 && !/^[6-9]\d{9}$/.test(phone2)) {
            return res.json({ success: false, message: "Invalid secondary phone number" });
        }

        if (asset_label.trim().length > 30) {
            return res.json({ success: false, message: "Asset label must be 30 characters or less" });
        }

        // Re-verify QR is still available (prevent double submission)
        const qr = await dbGet(
            `SELECT * FROM qr_inventory WHERE qr_id = ? AND status = 'available'`,
            [qr_id.toUpperCase()]
        );

        if (!qr) {
            return res.json({ success: false, message: "QR not available. It may have already been activated." });
        }

        // Find or create user
        let user = await dbGet(
            `SELECT * FROM users WHERE phone = ? AND email = ?`,
            [phone, email]
        );

        let userId;

        if (user) {
            userId = user.id;
            // Update name if changed
            await dbRun(`UPDATE users SET name = ? WHERE id = ?`, [name, userId]);
        } else {
            // Create new user
            const result = await dbRun(
                `INSERT INTO users (name, email, phone) VALUES (?, ?, ?)`,
                [name, email, phone]
            );
            userId = result.lastID;
        }

        // Calculate expiry (1 year from activation)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        const expiryString = expiryDate.toISOString().split("T")[0];

        // Generate QR image
        const qrUrl = `https://reachoutowner.com/secure/${qr_id}`;
        fs.promises.mkdir(qrFolder, { recursive: true }).catch(() => { });
        const qrPath = path.join(qrFolder, `${qr_id}.png`);
        await QRCode.toFile(qrPath, qrUrl);

        // Insert into qr_codes (activated)
        await dbRun(
            `INSERT INTO qr_codes
             (qr_id, user_id, product_type, asset_name, asset_label, status, source, expiry_date, activated_at, claimed_at, plan_years)
             VALUES (?, ?, ?, ?, ?, 'active', 'retail', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)`,
            [qr_id, userId, product_type, product_type, asset_label.trim(), expiryString]
        );

        // Insert phone numbers
        await dbRun(
            `INSERT INTO qr_numbers (qr_id, phone, type) VALUES (?, ?, 'primary')`,
            [qr_id, phone]
        );

        if (phone2) {
            await dbRun(
                `INSERT INTO qr_numbers (qr_id, phone, type) VALUES (?, ?, 'secondary')`,
                [qr_id, phone2]
            );
        }

        // Mark inventory as activated
        await dbRun(
            `UPDATE qr_inventory 
             SET status = 'activated', pin_used = 1 
             WHERE qr_id = ?`,
            [qr_id]
        );

        // Generate magic login token
        const token = crypto.randomBytes(32).toString("hex");
        await dbRun(`UPDATE users SET login_token = ? WHERE id = ?`, [token, userId]);

        const loginLink = `https://reachoutowner.com/magic-login/${token}`;

        // Send WhatsApp + Email in background
        (async () => {
            try {
                const emailHtml = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:30px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#2f80ed;padding:28px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">ReachOutOwner</h1>
          <p style="margin:6px 0 0;color:#cce0ff;font-size:13px;">QR Safety Protection</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;font-size:16px;color:#333;">Dear <strong>${name}</strong>,</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6;">
            Your QR sticker has been successfully activated! 🎉<br>
            Click below to access your dashboard.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
            <tr><td style="background:#27ae60;border-radius:8px;padding:14px 32px;">
              <a href="${loginLink}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">
                Open Dashboard →
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#aaa;">
            QR ID: ${qr_id} · Asset: ${asset_label}
          </p>
        </td></tr>
        <tr><td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
          <p style="margin:0;font-size:12px;color:#aaa;">© 2026 ReachOutOwner · reachoutowner.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

                await Promise.all([
                    sendWhatsApp(phone, {
                        template: "qr_purchase_success",
                        params: [name, loginLink]
                    }),
                    sendEmail(email, "QR Activated — ReachOutOwner", emailHtml)
                ]);

                console.log("✅ Activation messages sent to:", phone, email);
            } catch (err) {
                console.error("Activation messaging error:", err);
            }
        })();

        // Respond immediately
        res.json({ success: true });

    } catch (err) {
        console.error("Activation submit error:", err);
        res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
});

module.exports = router;