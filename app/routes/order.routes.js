const express = require("express");
const router = express.Router();
const Razorpay = require("razorpay");
const crypto = require("crypto");
const verifyToken = require("../middlewares/auth.middleware");
const db = require("../config/db");
const { activateOrUpgrade } = require("../services/subscription.service");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});



// 1️⃣ Create Razorpay Order
router.post("/create-order", verifyToken, async (req, res) => {

    const { planType } = req.body;

    let amount = 0;

    if (planType === "299") amount = 29900; // in paise
    if (planType === "499") amount = 49900;

    try {

        const order = await razorpay.orders.create({
            amount: amount,
            currency: "INR",
            receipt: "receipt_" + Date.now()
        });

        // Store order in DB
        db.run(
            `
            INSERT INTO orders 
            (user_id, plan_type, amount, payment_status, payment_reference, transaction_type, slots)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [req.user.id, planType, amount / 100, "pending", order.id, "purchase", 0]
        );

        res.json({
            success: true,
            orderId: order.id,
            key: process.env.RAZORPAY_KEY_ID,
            amount: amount
        });

    } catch (err) {
        res.status(500).json({ error: "Razorpay order creation failed" });
    }

});


// 2️⃣ Verify Payment
router.post("/verify-payment", verifyToken, async (req, res) => {

    const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
    } = req.body;

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

            if (!order) {
                return res.status(400).json({ error: "Order not found" });
            }

            try {

                await activateOrUpgrade(order.user_id, order.plan_type);

                db.run(
                    `UPDATE orders 
                     SET payment_status = 'paid' 
                     WHERE payment_reference = ?`,
                    [razorpay_order_id]
                );

                res.json({ success: true });

            } catch (e) {
                res.status(500).json({ error: "Subscription activation failed" });
            }
        }
    );

});


module.exports = router;