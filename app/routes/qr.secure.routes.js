const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/auth.middleware");
const { createQr } = require("../services/qr.service");
const checkSubscription = require("../middlewares/subscription.middleware");

router.post("/create-qr", verifyToken, checkSubscription, async (req, res) => {

    const { planType, metallic, phonePrimary, phoneSecondary } = req.body;

    try {

        const qrId = await createQr(
            req.user.id,
            planType,
            metallic,
            phonePrimary,
            phoneSecondary
        );

        res.json({ success: true, qrId });

    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post("/claim/:qrId", verifyToken, (req, res) => {

    const qrId = req.params.qrId;

    db.run(
        `UPDATE qr_codes
SET user_id=?, status='active'
WHERE qr_id=? AND status='inactive'`,
        [req.user.id, qrId],
        function (err) {

            if (err) {
                return res.status(500).json({ error: "Claim failed" });
            }

            res.json({ success: true });

        });

});

const db = require("../config/db");

router.get("/:qr_id", (req, res) => {

    const { qr_id } = req.params;

    db.get(
        `
        SELECT q.qr_id, q.status, q.asset_name,
               u.subscription_expiry
        FROM qr_codes q
        JOIN users u ON q.user_id = u.id
        WHERE q.qr_id=?
        `,
        [qr_id],
        (err, qr) => {

            if (err || !qr) {
                return res.json({
                    success: false,
                    type: "invalid",
                    message: "QR not found"
                });
            }

            // 🔥 Check expiry
            if (qr.subscription_expiry) {
                const today = new Date();
                const expiry = new Date(qr.subscription_expiry);

                if (today > expiry) {
                    return res.json({
                        success: false,
                        type: "expired",
                        message: "This QR is expired"
                    });
                }
            }

            // 🔥 Check status
            if (qr.status === "disabled") {
                return res.json({
                    success: false,
                    type: "inactive",
                    message: "This QR is inactive"
                });
            }

            // ✅ VALID QR
            res.json({
                success: true,
                qr_id: qr.qr_id,
                asset_name: qr.asset_name
            });

        }
    );

});

module.exports = router;