const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/auth.middleware");
const {
    activateOrUpgrade,
    renewSubscription
} = require("../services/subscription.service");

// Upgrade or Activate
router.post("/upgrade", verifyToken, async (req, res) => {

    const { planType } = req.body;

    try {
        await activateOrUpgrade(req.user.id, planType);
        res.json({ success: true, message: "Plan activated/upgraded" });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }

});

// Renewal
router.post("/renew", verifyToken, async (req, res) => {

    const { selectedSlots } = req.body;

    try {
        await renewSubscription(req.user.id, selectedSlots);
        res.json({ success: true, message: "Subscription renewed" });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }

});

module.exports = router;