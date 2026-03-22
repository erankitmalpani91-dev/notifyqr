const express = require("express");
const router = express.Router();
const db = require("../config/db");
const crypto = require("crypto");
const { sendWhatsApp } = require("../services/whatsapp.service");

router.post("/activate-retail", (req, res) => {

    const { qr_id, name, phone, email, asset, primary, secondary } = req.body;

    db.get(`SELECT * FROM qr_codes WHERE qr_id=?`, [qr_id], (err, qr) => {

        if (!qr) return res.json({ success: false, message: "Invalid QR" });

        // Create user if not exists
        db.get(`SELECT * FROM users WHERE phone=?`, [phone], (err, user) => {

            const createUserAndActivate = (userId) => {

                const expiryDate = new Date();
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
                const expiryString = expiryDate.toISOString();

                db.run(
                    `UPDATE qr_codes 
     SET user_id=?,
         asset_name=?,
         status='active',
         expiry_date = DATE('now', '+365 days'),
         claimed_at = CURRENT_TIMESTAMP
     WHERE qr_id=?`,
                    [userId, asset, qr_id]
                );

                db.run(
                    `INSERT INTO qr_numbers (qr_id, phone, type)
                     VALUES (?, ?, 'primary')`,
                    [qr_id, primary]
                );

                if (secondary) {
                    db.run(
                        `INSERT INTO qr_numbers (qr_id, phone, type)
                         VALUES (?, ?, 'secondary')`,
                        [qr_id, secondary]
                    );
                }

                // Magic login
                const token = crypto.randomBytes(20).toString("hex");

                db.run(
                    `UPDATE users SET login_token=? WHERE id=?`,
                    [token, userId]
                );

                const link = `https://reachoutowner.com/magic-login/${token}`;

                sendWhatsApp(phone, { link });

                res.json({ success: true });
            };

            if (user) {
                createUserAndActivate(user.id);
            } else {
                db.run(
                    `INSERT INTO users (name,email,phone)
                     VALUES (?,?,?)`,
                    [name, email, phone],
                    function () {
                        createUserAndActivate(this.lastID);
                    }
                );
            }

        });

    });

});

module.exports = router;