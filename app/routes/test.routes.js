const express = require("express");
const router = express.Router();
const { createQr } = require("../services/qr.service");

router.get("/test-create-qr", async (req, res) => {
    try {
        const qrId = await createQr(
            1,
            "299",
            0,
            "9876543210",
            null
        );

        res.send(`QR Created: ${qrId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating QR");
    }
});

module.exports = router;