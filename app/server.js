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
        secret: process.env.SESSION_SECRET,
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
// Public assets
app.use("/app", express.static(path.join(__dirname, "public")));


// Website pages
app.use("/", express.static(path.join(__dirname, "../Website")));

// QR images
app.use("/qrcodes", express.static(path.join(__dirname, "../storage/qrcodes")));



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

// Secure routes — redirect to scan page
app.use("/secure", require("./routes/qr.routes"));

//Actiavte QR Retail//
app.use("/activate", require("./routes/activate.routes"));
app.use("/api/activate", require("./routes/activate.routes"));

// Admin
app.use("/admin", require("./routes/admin.routes"));

// Retail / bulk
app.use("/api/retail", require("./routes/retail.routes"));

// QR scan route (public scanning)
app.use("/", require("./routes/qr.routes"));




/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});