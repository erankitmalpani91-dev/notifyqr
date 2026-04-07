require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

/* -------------------- MIDDLEWARE -------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: "notifyqr-secret",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === "production",
            httpOnly: true,
            sameSite: "lax"
        }
    })
);

/* -------------------- STATIC FILES -------------------- */
// Website pages
app.use("/", express.static(path.join(__dirname, "../Website")));

// QR images
app.use("/qrcodes", express.static(path.join(__dirname, "../storage/qrcodes")));

// Public assets
app.use("/app", express.static(path.join(__dirname, "public")));


/* -------------------- ROUTES -------------------- */

// Auth / Magic login
app.use("/api/auth", require("./routes/auth.routes"));

// Auth / Magic login
app.use("/api/auth", require("./routes/auth.routes"));

// Magic login route (public)
app.use("/", require("./routes/auth.routes"));

// Orders (create order, verify payment, renewal)
app.use("/api/order", require("./routes/order.routes"));

// Razorpay webhook
app.use("/api/payment", require("./routes/payment.routes"));

// Dashboard
app.use("/api/dashboard", require("./routes/dashboard.routes"));

// QR management
app.use("/api/qr", require("./routes/qr.manage.routes"));

// Assets
app.use("/api/assets", require("./routes/assets.routes"));

// Alerts
app.use("/api/alerts", require("./routes/alert.routes"));

// Secure routes
app.use("/secure", require("./routes/qr.secure.routes"));

// Admin
app.use("/api/admin", require("./routes/admin.routes"));

// Retail / bulk
app.use("/api/retail", require("./routes/retail.routes"));

// QR scan route (public scanning)
app.use("/", require("./routes/qr.routes"));


/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});