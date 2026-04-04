const express = require("express");
const router = express.Router();
const db = require("../config/db");


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

            // ACTIVE QR → Redirect to scan page
            res.redirect(`/scan.html?qr=${qrId}`);
        }
    );
});

        // Log scan
            const { logScan } = require("../services/scanBuffer.service");

            logScan(qrId, req.ip, req.headers["user-agent"]);

            db.all(
                `SELECT phone FROM qr_numbers WHERE qr_id = ?`,
                [qrId],
                (err2, numbers) => {

                    if (err2) return res.send("Server error");

                    if (!numbers.length) {
                        return res.send("No contact numbers available.");
                    }

                    const links = numbers.map(n => `
            <a href="https://wa.me/${n.phone}">WhatsApp ${n.phone}</a><br/>
            <a href="tel:${n.phone}">Call ${n.phone}</a><br/><br/>
        `).join("");

                    res.send(`
            <h2>Asset Found</h2>
            <p>Contact owner securely below:</p>
            ${links}
        `);
                }
            );
    });

});

module.exports = router;