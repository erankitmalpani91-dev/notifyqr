const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

const generateQrId = require("../utils/qrGenerator");
const db = require("../config/db");
const { activateOrUpgrade } = require("../services/subscription.service");
const { sendWhatsApp } = require("../services/whatsapp.service");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const { sendEmail } = require("../services/email.service");

/* ==============================
   CREATE RAZORPAY ORDER
============================== */

router.post("/create-order", async (req, res) => {

    const { quantity, name, phone, email } = req.body;
    console.log("CREATE ORDER BODY:", req.body);

    const pricePerQR = 199;

    if (!quantity || quantity < 1) {
        return res.status(400).json({ error: "Invalid quantity" });
    }

    const amount = quantity * pricePerQR * 100; // in paise

    try {

        const order = await razorpay.orders.create({
            amount,
            currency: "INR",
            receipt: "receipt_" + Date.now()
        });

        db.run(
            `
            INSERT INTO orders
            (plan_type, amount, payment_status, payment_reference, transaction_type, slots)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [
                "QR_PURCHASE",
                quantity * pricePerQR,
                "pending",
                order.id,
                "purchase",
                quantity
            ]
        );

        res.json({
            success: true,
            orderId: order.id,
            key: process.env.RAZORPAY_KEY_ID,
            amount
        });

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Razorpay order creation failed" });

    }

});

/* ==============================
   VERIFY PAYMENT
============================== */

router.post("/verify-payment", async (req, res) => {

    console.log("VERIFY PAYMENT STARTED");

    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        phone,
        email,
        name
    } = req.body;

    try {

        // ✅ VERIFY SIGNATURE
        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ error: "Invalid payment signature" });
        }

        // ✅ GET ORDER
        db.get(
            `SELECT * FROM orders WHERE payment_reference = ?`,
            [razorpay_order_id],
            async (err, order) => {

                if (err) return res.status(500).json({ error: "Database error" });
                if (!order) return res.status(400).json({ error: "Order not found" });

                // ✅ HANDLE RENEWAL FAST
                if (order.transaction_type === "renewal") {

                    db.run(
                        `UPDATE qr_codes
                        SET status='active',
                        expiry_date = DATE('now', '+1 year')
                        WHERE user_id=?`,
                        [order.user_id]
                    );

                    db.run(
                        `UPDATE qr_codes
                         SET status = 'active'
                         WHERE user_id = ?`,
                        [order.user_id]
                    );

                    db.run(
                        `UPDATE orders
                         SET payment_status = 'paid'
                         WHERE payment_reference = ?`,
                        [razorpay_order_id]
                    );

                    return res.json({ success: true, renewal: true });
                }

                // ✅ FIND USER
                db.get(
                    `SELECT * FROM users WHERE phone = ?`,
                    [phone],
                    async (err, user) => {

                        if (err) return res.status(500).json({ error: "User lookup failed" });

                        let userId;
                        let password;

                        if (user) {
                            userId = user.id;

                            // 👇 ADD THIS LINE
                            password = "USE_YOUR_EXISTING_PASSWORD";
                        } else {

                            password = Math.random().toString(36).slice(-8);
                            const hash = await bcrypt.hash(password, 10);

                            const result = await new Promise((resolve, reject) => {
                                db.run(
                                    `INSERT INTO users (name,email,password_hash,phone)
                                     VALUES (?,?,?,?)`,
                                    [name, email, hash, phone],
                                    function (err) {
                                        if (err) reject(err);
                                        resolve(this.lastID);
                                    }
                                );
                            });

                            userId = result;
                        }

                        // 🚀🔥 CRITICAL FIX — SEND RESPONSE IMMEDIATELY
                        res.json({ success: true });

                        // 🧠 BACKGROUND PROCESS STARTS HERE
                        (async () => {

                            // 🔐 CREATE MAGIC LOGIN TOKEN
                            const token = crypto.randomBytes(20).toString("hex");

                            await new Promise((resolve, reject) => {
                                db.run(
                                    `UPDATE users SET login_token=? WHERE id=?`,
                                    [token, userId],
                                    function (err) {
                                        if (err) reject(err);
                                        resolve();
                                    }
                                );
                            });

                            const loginLink = `https://reachoutowner.com/magic-login/${token}`;

                            try {

                                // ACTIVATE PLAN
                                await activateOrUpgrade(userId, "BASIC");

                                // how many QR purchased
                                const totalQrs = (order && order.slots) ? order.slots : 1;

                                // update slot count
                                db.run(
                                    `UPDATE users 
                                     SET max_qr_slots = COALESCE(max_qr_slots,0) + ?
                                     WHERE id = ?`,
                                    [totalQrs, userId]
                                );

                                const expiryDate = new Date();
                                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
                                const expiryString = expiryDate.toISOString();

                                // ✅ GENERATE QR

                                for (let i = 0; i < totalQrs; i++) {

                                    let qrId;
                                    let exists = true;

                                    while (exists) {

                                        qrId = generateQrId();

                                        const existing = await new Promise((resolve) => {
                                            db.get(
                                                `SELECT qr_id FROM qr_codes WHERE qr_id=?`,
                                                [qrId],
                                                (err, row) => resolve(row)
                                            );
                                        });

                                        if (!existing) exists = false;
                                    }

                                    const qrUrl = `https://reachoutowner.com/secure/${qrId}`;
                                    const qrFolder = path.join(__dirname, "../../storage/qrcodes");

                                    if (!fs.existsSync(qrFolder)) {
                                        fs.mkdirSync(qrFolder, { recursive: true });
                                    }

                                    const qrPath = path.join(qrFolder, `${qrId}.png`);
                                    await QRCode.toFile(qrPath, qrUrl);

                                    db.run(
                                        `INSERT INTO qr_codes (qr_id, user_id, plan_type, status, source, expiry_date)
                                        VALUES (?, ?, ?, 'inactive', 'web', ?)`,
                                        [qrId, userId, order.plan_type, expiryString]
                                    );
                                }

                                //Genrate Message
                                let message = `
<div style="font-family:Arial">
  <p>Dear ${name},</p>

  <p>Your QR purchase is successful 🎉</p>

  <p>
    You can access your dashboard using the link sent on WhatsApp.
  </p>

  <p>
    If needed, you can request login link from login page.
  </p>

  <p>Regards,<br>ReachOutOwner Team</p>
</div>
`;

                                await sendWhatsApp(phone, {
                                    name,
                                    link: loginLink
                                });
                                await sendEmail(email, "ReachOutOwner Activated", message);

                                // ✅ UPDATE ORDER
                                db.run(
                                    `UPDATE orders
                                     SET payment_status='paid', user_id=?
                                     WHERE payment_reference=?`,
                                    [userId, razorpay_order_id]
                                );

                            } catch (err) {
                                console.error("BACKGROUND ERROR:", err);
                            }

                        })();

                    }
                );

            }
        );

    } catch (err) {

        console.error("VERIFY ERROR:", err);
        res.status(500).json({ error: "Payment verification failed" });

    }

});


router.post("/create-renewal-order", async (req, res) => {

    const userId = req.session.userId;

    if (!userId) {
        return res.json({ success: false, message: "Not logged in" });
    }

    db.get(
        `SELECT COUNT(*) as totalQR FROM qr_codes WHERE user_id=?`,
        [userId],
        async (err, row) => {

            if (err || !row) {
                console.log(err);
                return res.status(500).json({ success: false });
            }

            const totalQR = row.totalQR || 0;

            if (totalQR === 0) {
                return res.json({ success: false, message: "No QR found" });
            }

            const amount = totalQR * 99 * 100; // paise

            try {

                const order = await razorpay.orders.create({
                    amount,
                    currency: "INR",
                    receipt: "renewal_" + Date.now()
                });

                db.run(
                    `
                    INSERT INTO orders
                    (user_id, amount, payment_status, payment_reference, transaction_type, slots)
                    VALUES (?, ?, ?, ?, ?, ?)
                    `,
                    [userId, totalQR * 99, "pending", order.id, "renewal", totalQR]
                );

                res.json({
                    success: true,
                    orderId: order.id,
                    key: process.env.RAZORPAY_KEY_ID,
                    amount,
                    totalQR
                });

            } catch (error) {
                console.error("Renewal Order Error:", error);
                res.status(500).json({ success: false });
            }

        }
    );

});

router.get("/magic-login/:token", (req, res) => {

    const { token } = req.params;

    db.get(
        `SELECT * FROM users WHERE login_token=?`,
        [token],
        (err, user) => {

            if (!user) {
                return res.send("Invalid link");
            }

            req.session.userId = user.id;

            return res.redirect("/dashboard.html");
        }
    );
});

router.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

module.exports = router;