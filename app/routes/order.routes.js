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

                        const qrId = generateQrId();

                        const qrUrl = `https://reachoutowner.com/secure/${qrId}`;

                        const qrFolder = path.join(__dirname, "../../storage/qrcodes");

                        if (!fs.existsSync(qrFolder)) {
                            fs.mkdirSync(qrFolder, { recursive: true });
                        }

                        const qrPath = path.join(qrFolder, `${qrId}.png`);

                        await QRCode.toFile(qrPath, qrUrl);

                        db.run(
                            `
                            INSERT INTO qr_codes (qr_id, user_id, plan_type, status)
                            VALUES (?, ?, ?, 'active')
                            `,
                            [qrId, userId, order.plan_type]
                        );

                        /* ---------------------------
                           SEND WHATSAPP
                        --------------------------- */

                        const loginInfo = "Use mobile OTP to login";

                        const message = `
Welcome to ReachOutOwner

Your protection plan is active.

Login Phone:
${phone}

QR ID:
${qrId}

Download QR:
https://reachoutowner.com/qrcodes/${qrId}.png

Login:
https://reachoutowner.com/owner/login
`;

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

        console.error(err);
        res.status(500).json({ error: "Payment verification failed" });

    }

});

module.exports = router;