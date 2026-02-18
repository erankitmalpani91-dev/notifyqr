const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const twilio = require("twilio");
const QRCode = require("qrcode");
const session = require("express-session");
const path = require("path");
require("dotenv").config();
const contactRoutes = require("./routes/contact.routes");
const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------- MIDDLEWARE -------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // REQUIRED for Twilio
app.use("/api", contactRoutes);
app.use("/", express.static(path.join(__dirname, "../Website")));
app.use("/app", express.static(path.join(__dirname, "public")));



app.use(
    session({
        secret: "notifyqr-admin-secret",
        resave: false,
        saveUninitialized: false
    })
);


/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
