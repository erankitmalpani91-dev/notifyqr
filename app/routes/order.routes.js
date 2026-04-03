const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");
const generateQrId = require("../utils/qrGenerator");
const db = require("../config/db");
const { sendWhatsApp } = require("../services/whatsapp.service");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});
const qrFolder = path.join(__dirname, "../../storage/qrcodes");
fs.promises.mkdir(qrFolder, { recursive: true }).catch(console.error);

const { sendEmail } = require("../services/email.service");

// CREATE RAZORPAY ORDER


    router.post("/create-order", async (req, res) => {
        const { quantity, name, phone, email, cart, address, city, state, pincode } = req.body;

        // ✅ Input validation
        if (!quantity || quantity < 1) return res.status(400).json({ error: "Invalid quantity" });
        if (!cart || typeof cart !== "object") return res.status(400).json({ error: "Invalid cart" });
        if (!address || !city || !state || !pincode) return res.status(400).json({ error: "Shipping address is incomplete" });
        if (!/^[0-9]{6}$/.test(pincode)) return res.status(400).json({ error: "Invalid pincode" });

        const PRICES = {
            car: 299, bike: 299, carcombo: 699, bikecombo: 599,
            bag: 299, laptop: 299, mobile: 299, keys: 299,
            luggage: 299, child: 299, pet: 299, senior: 299,
            doorbell: 299, apartment: 299, rental: 299,
            office: 299, equipment: 299
        };

        let amount = 0;

        for (const [type, qty] of Object.entries(cart)) {

            // Skip items with 0 quantity
            if (!qty || qty === 0) continue;

            if (!PRICES[type]) {
                return res.status(400).json({ error: "Invalid item: " + type });
            }

            if (!Number.isInteger(qty) || qty < 0) {
                return res.status(400).json({ error: "Invalid quantity for " + type });
            }

            amount += PRICES[type] * qty;
        }

        if (amount === 0) {
            return res.status(400).json({ error: "Cart is empty" });
        }

        const razorAmount = amount * 100;

        try {
            // ✅ Create Razorpay order
            const order = await razorpay.orders.create({
                amount: razorAmount,
                currency: "INR",
                receipt: "receipt_" + Date.now()
            });

            const shippingAddress = `${address}, ${city}, ${state} - ${pincode}`;

            // Helper to promisify db.run
            const runQuery = (sql, params = []) =>
                new Promise((resolve, reject) => {
                    db.run(sql, params, function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    });
                });

            db.serialize(async () => {
                try {
                    await runQuery("BEGIN TRANSACTION");

                    // ✅ Insert order
                    const orderDbId = await runQuery(
                        `INSERT INTO orders
                           (owner_name, owner_email, owner_phone, shipping_address, city, state, pincode,
                            amount, payment_status, payment_reference, transaction_type, order_source)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [name, email, phone, shippingAddress, city, state, pincode,
                            amount, "pending", order.id, "purchase", "website"]
                    );

                    // ✅ Insert order items
                    const insertItems = Object.entries(cart)
                    .filter(([type, qty]) => qty > 0)
                    .map(([type, qty]) =>
                        runQuery(
                            `INSERT INTO order_items (order_id, product_type, quantity, price)
                         VALUES (?, ?, ?, ?)`,
                            [orderDbId, type, qty, PRICES[type]]
                        )
                    );
                    await Promise.all(insertItems);

                    // ✅ Commit transaction
                    await runQuery("COMMIT");

                    res.json({
                        success: true,
                        orderId: order.id,
                        key: process.env.RAZORPAY_KEY_ID,
                        amount
                    });
                } catch (err) {
                    console.error("Transaction failed:", err);
                    await runQuery("ROLLBACK");
                    res.status(500).json({ error: "Order creation failed" });
                }
            });
        } catch (err) {
            console.error("Razorpay error:", err);
            res.status(500).json({ error: "Razorpay order creation failed" });
        }
    });


//VERIFY PAYMENT//

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

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "Missing payment fields" });
    }

    if (!phone || !name || !email) {
        return res.status(400).json({ error: "Missing user fields" });
    }

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
                if (order.payment_status === "paid") return res.json({ success: true, alreadyProcessed: true }); // ADD THIS LINE

                // ✅ HANDLE RENEWAL FAST
                if (order.transaction_type === "renewal") {

                    db.run(
                        `UPDATE qr_codes
                    SET
                        status='active',
                        expiry_date = DATE(
                            CASE
                                WHEN expiry_date IS NULL OR expiry_date < DATE('now')
                                THEN DATE('now')
                                ELSE expiry_date
                            END,
                            '+1 year'
                        )
                    WHERE user_id=?`,
                        [order.user_id]
                    );

                    db.run(
                        `UPDATE orders
                         SET payment_status = 'paid',
                             user_id = ?
                         WHERE payment_reference = ?`,
                        [order.user_id, razorpay_order_id]
                    );

                    return res.json({ success: true, renewal: true });
                }

                // ✅ FIND USER
                db.get(
                    `SELECT * FROM users WHERE phone = ? AND email = ?`,
                    [phone, email],
                    async (err, user) => {

                        if (err) return res.status(500).json({ error: "User lookup failed" });

                        let userId;
                        

                        if (user) {
                            userId = user.id;
                            

                            db.run(
                                `UPDATE users SET email=?, name=? WHERE id=?`,
                                [email, name, userId]
                            );
                        } else {

                            const result = await new Promise((resolve, reject) => {
                                db.run(
                                    `INSERT INTO users (name, email, phone)
                                    VALUES (?, ?, ?)`,
                                    [name, email, phone],
                                    function(err) {
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

                            
                            // 🔐 CREATE / REPLACE MAGIC LOGIN TOKEN
                            const token = crypto.randomBytes(32).toString("hex");

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

                            // GET ORDER ITEMS FROM DB
                            const items = await new Promise((resolve, reject) => {
                                db.all(
                                    `SELECT * FROM order_items WHERE order_id = ?`,
                                    [order.id],
                                    (err, rows) => {
                                        if (err) reject(err);
                                        resolve(rows);
                                    }
                                );
                            });

                            try {
                                                              
                                const expiryDate = new Date();
                                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
                                const expiryString = expiryDate.toISOString().split('T')[0];



                                // ✅ GENERATE QR FROM ORDER ITEMS

                                for (let item of items) {

                                    let type = item.product_type;
                                    let qty = item.quantity;

                                    for (let i = 0; i < qty; i++) {

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
                                        const qrPath = path.join(qrFolder, `${qrId}.png`);
                                        await QRCode.toFile(qrPath, qrUrl);

                                        db.run(
                                            `INSERT INTO qr_codes 
                                        (qr_id, user_id, order_id, product_type, asset_name, status, expiry_date, source)
                                        VALUES (?, ?, ?, ?, ?, 'inactive', ?, 'website')`,
                                            [qrId, userId, order.id, type, type, expiryString]
                                        );
                                    }
                                }

                                // ✅ UPDATE ORDER
                                db.run(
                                    `UPDATE orders
                                     SET payment_status='paid', user_id=?
                                     WHERE payment_reference=?`,
                                    [userId, razorpay_order_id]
                                );

                                //Genrate Message
                                let message = `
                                <div style="font-family:Arial">
                                  <p>Dear ${name},</p>

                                  <p>Your QR purchase is successful 🎉</p>

                                  <p>
                                    Access your dashboard:
                                    <br><br>
                                    <a href="${loginLink}">Open Dashboard</a>
                                  </p>

                                  <p>You can use this link anytime to login.</p>

                                  <p>Regards,<br>ReachOutOwner Team</p>
                                </div>
                                `;

                                await Promise.all([
                                    sendWhatsApp(phone, { name, link: loginLink }),
                                    sendEmail(email, "ReachOutOwner Activated", message)
                                ]);

                               

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
                (user_id, amount, payment_status, payment_reference, transaction_type, order_source)
                VALUES (?, ?, ?, ?, ?, ?)
                `,
                    [userId, totalQR * 99, "pending", order.id, "renewal", "website"]
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
                return res.send("Invalid or expired login link");
            }

            // Create session
            req.session.userId = user.id;
            res.redirect("/dashboard.html");
        }
    );
});

router.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

module.exports = router;