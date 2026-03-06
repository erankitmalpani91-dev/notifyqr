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

module.exports = router;