const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../config/db");

router.post("/razorpay-webhook", express.json({ type: "*/*" }), (req, res) => {

    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const signature = req.headers["x-razorpay-signature"];

    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(req.body))
        .digest("hex");

    if (signature !== expectedSignature) {

        console.log("Webhook signature mismatch");

        return res.status(400).send("Invalid signature");

    }

    const event = req.body.event;

    if (event === "payment.captured") {

        const payment = req.body.payload.payment.entity;

        const orderId = payment.order_id;

        console.log("Webhook payment captured:", orderId);

        db.run(
            `UPDATE orders 
             SET payment_status='paid' 
             WHERE payment_reference=?`,
            [orderId]
        );

    }

    res.json({ status: "ok" });

});

module.exports = router;