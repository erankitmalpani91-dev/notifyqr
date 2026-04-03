const express = require("express");
const router = express.Router();
const db = require("../config/db");


router.get("/q/:qrId", (req, res) => {

    const qrId = req.params.qrId;

    db.get(
        `SELECT q.* FROM qr_codes q WHERE q.qr_id = ?`
        [qrId],
        (err, qr) => {

        if (err) return res.send("Server error");

        if (!qr) {
            return res.send("Invalid QR Code");
        }


            if (qr.status === "inactive") {

                return res.send(`
        <h2>Activate Your QR</h2>
        <p>This sticker is not linked yet.</p>
        <a href="/claim/${qrId}">Claim this QR</a>
    `);

            }

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