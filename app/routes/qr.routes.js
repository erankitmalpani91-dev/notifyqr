const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { logScan } = require("../services/scanbuffer.service");

router.get("/:qrId", (req, res) => {
    const qrId = req.params.qrId;

    // First check qr_codes (activated QRs)
    db.get(
        `SELECT status FROM qr_codes WHERE qr_id = ?`,
        [qrId],
        (err, qr) => {
            if (err) return res.send("Invalid QR Code");

            if (qr) {
                // QR exists and is activated — handle status
                if (qr.status === "inactive") {
                    return res.send(`<h2 style="font-family:Arial;text-align:center;margin-top:60px">QR Not Activated</h2><p style="text-align:center;color:#666">Please contact the owner.</p>`);
                }
                if (qr.status === "disabled") {
                    return res.send(`<h2 style="font-family:Arial;text-align:center;margin-top:60px">QR Disabled</h2><p style="text-align:center;color:#666">This QR is currently inactive.</p>`);
                }
                if (qr.status === "expired") {
                    return res.send(`<h2 style="font-family:Arial;text-align:center;margin-top:60px">QR Expired</h2><p style="text-align:center;color:#666">This QR's protection has expired.</p>`);
                }

                // Active QR — log scan and redirect to scan page
                logScan(qrId, req.ip, req.headers["user-agent"]);
                return res.redirect(`/scan.html?qr=${qrId}`);
            }

            // Not in qr_codes — check qr_inventory (retail unactivated QR)
            db.get(
                `SELECT qr_id, status FROM qr_inventory WHERE qr_id = ?`,
                [qrId],
                (err2, inv) => {
                    if (err2 || !inv) {
                        return res.send(`<h2 style="font-family:Arial;text-align:center;margin-top:60px">Invalid QR Code</h2>`);
                    }

                    if (inv.status === "activated") {
                        // Was in inventory and activated — should be in qr_codes too
                        // Edge case: redirect to scan page anyway
                        return res.redirect(`/scan.html?qr=${qrId}`);
                    }

                    // Available retail QR — redirect to activation page
                    return res.redirect(`/activate?qr=${qrId}`);
                }
            );
        }
    );
});

module.exports = router;