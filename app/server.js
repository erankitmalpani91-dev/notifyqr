const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const twilio = require("twilio");
const QRCode = require("qrcode");
const session = require("express-session");
const path = require("path");
require("dotenv").config();



const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------- MIDDLEWARE -------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // REQUIRED for Twilio
app.use("/", express.static(path.join(__dirname, "../Website")));
app.use("/app", express.static(path.join(__dirname,"public")));


app.use(
    session({
        secret: "notifyqr-admin-secret",
        resave: false,
        saveUninitialized: false
    })
);

/* -------------------- DATABASE -------------------- */
const db = new sqlite3.Database("./db.sqlite");

// Issued stickers
db.run(`
  CREATE TABLE IF NOT EXISTS issued_stickers (
    id TEXT PRIMARY KEY,
    issued_at TEXT,
    is_active INTEGER DEFAULT 1
  )
`);

// Registered stickers
db.run(`
  CREATE TABLE IF NOT EXISTS stickers (
    id TEXT PRIMARY KEY,
    phone TEXT,
    is_active INTEGER DEFAULT 1
  )
`);

// Analytics
db.run(`
  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sticker_id TEXT,
    category TEXT,
    issue TEXT,
    created_at TEXT
  )
`);

// Owner replies
db.run(`
  CREATE TABLE IF NOT EXISTS owner_replies (
    sticker_id TEXT PRIMARY KEY,
    reply TEXT,
    replied_at TEXT
  )
`);

// Admin settings
db.run(`
  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

/* -------------------- TWILIO -------------------- */
const client = twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH
);

/* -------------------- ADMIN AUTH -------------------- */
function requireAdmin(req, res, next) {
    if (!req.session.admin) return res.status(401).json({ success: false });
    next();
}

app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (
        username === process.env.ADMIN_USER &&
        password === process.env.ADMIN_PASS
    ) {
        req.session.admin = true;
        return res.json({ success: true });
    }
    res.json({ success: false });
});

/* -------------------- REGISTER STICKER -------------------- */
app.post("/register", (req, res) => {
    const { stickerId, phone } = req.body;
    if (!stickerId || !phone) return res.json({ success: false });

    db.get(
        "SELECT id FROM issued_stickers WHERE id=? AND is_active=1",
        [stickerId],
        (err, row) => {
            if (!row) {
                return res.json({ success: false, message: "Invalid Sticker ID" });
            }

            db.run(
                "INSERT OR REPLACE INTO stickers (id, phone, is_active) VALUES (?, ?, 1)",
                [stickerId, phone],
                () => res.json({ success: true })
            );
        }
    );
});

/* -------------------- NOTIFY OWNER (WITH BUTTONS) -------------------- */
app.post("/notify", (req, res) => {
    const { stickerId, reason, category, lang } = req.body;
    if (!stickerId || !reason) return res.json({ success: false });

    db.get(
        "SELECT phone FROM stickers WHERE id=? AND is_active=1",
        [stickerId],
        async (err, row) => {
            if (!row) return res.json({ success: false });

            const text =
                lang === "hi"
                    ? `🚨 वाहन अलर्ट\nसमस्या: ${reason}\nकृपया जवाब दें:`
                    : `🚨 Vehicle Alert\nIssue: ${reason}\nPlease respond:`;

            try {
                await client.messages.create({
                    from: process.env.TWILIO_WHATSAPP,
                    to: `whatsapp:${row.phone}`,
                    interactive: {
                        type: "button",
                        body: { text },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "COMING", title: "✅ I'm coming" } },
                                { type: "reply", reply: { id: "5MIN", title: "⏱ 5 minutes" } },
                                { type: "reply", reply: { id: "10MIN", title: "⏱ 10 minutes" } }
                            ]
                        }
                    }
                });

                db.run(
                    `INSERT INTO analytics (sticker_id, category, issue, created_at)
           VALUES (?, ?, ?, datetime('now'))`,
                    [stickerId, category, reason]
                );

                res.json({ success: true });
            } catch (e) {
                console.error("Twilio error:", e.message);
                res.json({ success: false });
            }
        }
    );
});

/* -------------------- WHATSAPP BUTTON REPLY (WEBHOOK) -------------------- */
app.post("/whatsapp-reply", (req, res) => {
    try {
        const replyId = req.body?.interactive?.button_reply?.id;
        const from = req.body?.from;

        if (!replyId || !from) return res.sendStatus(200);

        const replyText =
            replyId === "COMING"
                ? "I'm coming"
                : replyId === "5MIN"
                    ? "5 minutes"
                    : replyId === "10MIN"
                        ? "10 minutes"
                        : null;

        if (!replyText) return res.sendStatus(200);

        db.get(
            "SELECT id FROM stickers WHERE phone=?",
            [from.replace("whatsapp:", "")],
            (err, row) => {
                if (row) {
                    db.run(
                        `INSERT OR REPLACE INTO owner_replies
             (sticker_id, reply, replied_at)
             VALUES (?, ?, datetime('now'))`,
                        [row.id, replyText]
                    );
                }
            }
        );

        res.sendStatus(200);
    } catch (e) {
        console.error("Reply webhook error", e);
        res.sendStatus(200);
    }
});

/* -------------------- CHECK OWNER REPLY (SCAN PAGE) -------------------- */
app.get("/check-reply", (req, res) => {
    const { id } = req.query;

    db.get(
        "SELECT reply FROM owner_replies WHERE sticker_id=?",
        [id],
        (err, row) => {
            res.json({ reply: row ? row.reply : null });
        }
    );
});

/* -------------------- QR GENERATOR -------------------- */
app.get("/generate-qr/:id", async (req, res) => {
    const stickerId = req.params.id.trim();
    const url = `http://localhost:${PORT}/scan.html?id=${stickerId}`;

    try {
        const qr = await QRCode.toDataURL(url);
        res.send(`
      <h2>QR Code for Sticker: ${stickerId}</h2>
      <img src="${qr}" />
      <p>${url}</p>
    `);
    } catch {
        res.send("Error generating QR");
    }
});

/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
