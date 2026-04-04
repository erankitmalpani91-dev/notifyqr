const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { logScan } = require("../services/scanBuffer.service");

router.get("/q/:qrId", (req, res) => {
    const qrId = req.params.qrId;

    db.get(
        `SELECT status FROM qr_codes WHERE qr_id = ?`,
        [qrId],
        (err, qr) => {

            if (err || !qr) {
                return res.send("Invalid QR Code");
            }

            if (qr.status === "inactive") {
                return res.send(`
                    <h2>QR Not Activated</h2>
                    <p>Please contact owner.</p>
                `);
            }

            if (qr.status === "disabled") {
                return res.send(`
                    <h2>QR Disabled</h2>
                    <p>This QR is currently inactive.</p>
                `);
            }

            if (qr.status === "expired") {
                return res.send(`
                    <h2>QR Expired</h2>
                    <p>Subscription expired.</p>
                `);
            }

            // Log scan
            logScan(qrId, req.ip, req.headers["user-agent"]);

            // ACTIVE QR → Redirect to scan page
            res.redirect(`/scan.html?qr=${qrId}`);
        }
    );
});

module.exports = router;