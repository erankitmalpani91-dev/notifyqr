const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const db = require("../config/db");
const { sendWhatsApp } = require("../services/whatsapp.service");
const { sendEmail } = require("../services/email.service");

// Promisify DB
const runQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
        });
    });

const getQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

const allQuery = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

/* SEND MAGIC LOGIN LINK */
router.post("/send-login-link", async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required" });

    try {
        const user = await getQuery(`SELECT * FROM users WHERE phone=?`, [phone]);
        if (!user) return res.json({ success: false, message: "User not found" });

        // Rate limit 3 per hour
        const recentRequests = await allQuery(
            `SELECT COUNT(*) as count
               FROM login_requests
               WHERE user_id=?
               AND requested_at >= DATETIME('now', '-1 hour')`,
            [user.id]
        );

        if (recentRequests[0].count >= 3) {
            return res.status(429).json({ error: "Too many login requests. Try again later." });
        }

        // Generate token
        const token = crypto.randomBytes(32).toString("hex");

        await runQuery(
            `UPDATE users SET login_token=? WHERE id=?`,
            [token, user.id]
        );

        await runQuery(
            `INSERT INTO login_requests (user_id) VALUES (?)`,
            [user.id]
        );

        const loginLink = `${process.env.BASE_URL}/magic-login/${token}`;

        await Promise.all([
            sendWhatsApp(user.phone, { name: user.name, link: loginLink }),
            sendEmail(user.email, "Login Link", `<a href="${loginLink}">Login</a>`)
        ]);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to send login link" });
    }
});

/* MAGIC LOGIN */
router.get("/magic-login/:token", async (req, res) => {
    const token = req.params.token;

    try {
        const user = await getQuery(
            `SELECT * FROM users WHERE login_token=?`,
            [token]
        );

        if (!user) return res.send("Invalid login link");

        req.session.userId = user.id;

        res.redirect("/dashboard.html");

    } catch (err) {
        console.error(err);
        res.status(500).send("Login failed");
    }
});

/* LOGOUT */
router.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

module.exports = router;