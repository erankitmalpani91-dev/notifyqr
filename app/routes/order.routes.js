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

    const { planType, name, phone, email } = req.body;
    console.log("CREATE ORDER BODY:", req.body);

    let amount = 0;

    if (planType == 299) amount = 29900;
    if (planType == 499) amount = 49900;

    if (!amount) {
        return res.status(400).json({ error: "Invalid plan type" });
    }

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
            [planType, amount / 100, "pending", order.id, "purchase", 0]
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

    // 🧪 STEP 2 — DEBUG LOG
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

        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ error: "Invalid payment signature" });
        }

      

        db.get(
            `SELECT * FROM orders WHERE payment_reference = ?`,
            [razorpay_order_id],
            async (err, order) => {

                if (err) return res.status(500).json({ error: "Database error" });
                if (!order) return res.status(400).json({ error: "Order not found" });

                // 🧩 STEP — Handle Renewal Orders
                if (order.transaction_type === "renewal") {
                    const userId = order.user_id;

                    // Extend subscription by 1 year
                    db.run(
                        `
                UPDATE users
                SET subscription_expiry = DATE('now', '+1 year'),
                    subscription_status = 'active'
                WHERE id = ?
                `,
                        [userId]
                    );

                    // Activate all QR codes for this user
                    db.run(
                        `
                UPDATE qr_codes
                SET status = 'active'
                WHERE user_id = ?
                `,
                        [userId]
                    );

                    // Mark order as paid
                    db.run(
                        `
                UPDATE orders
                SET payment_status = 'paid'
                WHERE payment_reference = ?
                `,
                        [razorpay_order_id]
                    );

                    return res.json({ success: true, renewal: true });
                }

                db.get(
                    `SELECT * FROM users WHERE phone = ?`,
                    [phone],
                    async (err, user) => {

                        if (err) return res.status(500).json({ error: "User lookup failed" });

                        let userId;
                        let password;

                        /* ---------------------------
                           EXISTING USER
                        --------------------------- */

                        if (user) {

                            userId = user.id;

                        }

                        /* ---------------------------
                           NEW USER
                        --------------------------- */

                        else {

                            password = Math.random().toString(36).slice(-8);
                            const hash = await bcrypt.hash(password, 10);

                            const result = await new Promise((resolve, reject) => {

                                const uniqueEmail = phone + "_" + Date.now() + "@reachoutowner.com";

                                db.run(
                                    `INSERT INTO users (name,email,password_hash,phone)
                                    VALUES (?,?,?,?)`,
                                    [
                                        name,
                                        uniqueEmail,
                                        hash,
                                        phone
                                    ],
                                    function (err) {
                                        if (err) reject(err);
                                        resolve(this.lastID);
                                    }
                                );

                            });

                            userId = result;

                        }

                        /* ---------------------------
                           ACTIVATE PLAN
                        --------------------------- */

                        await activateOrUpgrade(userId, order.plan_type);

                        /* ---------------------------
                           GENERATE QR
                        --------------------------- */

                        let totalQrs = 1;

                        if (order.plan_type == "499") totalQrs = 3;
                        if (order.plan_type == "299") totalQrs = 1;

                        for (let i = 0; i < totalQrs; i++) {

                            // 🧩 STEP 4 — PREVENT DUPLICATE QR CREATION
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
                                `INSERT INTO qr_codes (qr_id, user_id, plan_type, status)
                                 VALUES (?, ?, ?, 'inactive')`,
                                [qrId, userId, order.plan_type]
                            );
                        }

                        /* ---------------------------
                           SEND WHATSAPP
                        --------------------------- */
                        let message;

                        if (password) {

                            message = `
                        Welcome to ReachOutOwner

                        Your protection plan is active.

                        LOGIN DETAILS
                        Mobile: ${phone}
                        Password: ${password}

                        Login:
                        https://reachoutowner.com/login.html

                        Your QR codes are available in your dashboard.

                        Please change your password after login.
                        `;

                        } else {

                            message = `
                        Welcome to ReachOutOwner

                        New QR codes have been added to your account.

                        Login:
                        https://reachoutowner.com/login.html

                        `;
                        }

                        await sendWhatsApp(phone, message);

                        await sendEmail(
                            email,
                            "ReachOutOwner Protection Activated",
                            message
                        );

                        /* ---------------------------
                           UPDATE ORDER
                        --------------------------- */

                        db.run(
                            `
                            UPDATE orders
                            SET payment_status='paid',
                            user_id=?
                            WHERE payment_reference=?
                            `,
                            [userId, razorpay_order_id]
                        );



                        res.json({ success: true });

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

    const { userId } = req.body;

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

module.exports = router;