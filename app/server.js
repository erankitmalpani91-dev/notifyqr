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
        saveUninitialized: false
    })
);

/* -------------------- STATIC FILES -------------------- */
// Serve website pages
app.use("/", express.static(path.join(__dirname, "../Website")));

// Serve QR images
app.use("/qrcodes", express.static(path.join(__dirname, "../storage/qrcodes")));

// Admin/public assets
app.use("/app", express.static(path.join(__dirname, "public")));


/* -------------------- ROUTES -------------------- */
app.use("/admin", require("./routes/admin.routes"));
app.use("/auth", require("./routes/auth.routes"));
app.use("/order", require("./routes/order.routes"));
app.use("/payment", require("./routes/payment.routes"));
app.use("/renewal", require("./routes/renewal.routes"));
app.use("/subscription", require("./routes/subscription.routes"));
app.use("/secure", require("./routes/qr.secure.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/assets", require("./routes/assets.routes"));
app.use("/api/qr", require("./routes/qr.manage.routes"));
app.use("/api/alerts", require("./routes/alert.routes"));
app.use("/", require("./routes/qr.routes"));


/* -------------------- START SERVER -------------------- */
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});