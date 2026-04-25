const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const db = require("../config/db");
const path = require("path");
const QRCode = require("qrcode");
const fs = require("fs");
const PDFDocument = require("pdfkit");


const qrImageFolder = path.join(__dirname, "../../storage/qr-images");
if (!fs.existsSync(qrImageFolder)) {
    fs.mkdirSync(qrImageFolder, { recursive: true });
}

const dbGet = (sql, p = []) =>
    new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const dbRun = (sql, p = []) =>
    new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const dbAll = (sql, p = []) =>
    new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));

function checkAdmin(req, res, next) {
    if (!req.session.admin) return res.status(401).json({ error: "Unauthorized" });
    next();
}

/* ── PAGES ── */
router.get("/login", (req, res) =>
    res.sendFile(path.join(__dirname, "../public/admin-login.html")));

router.get("/dashboard", (req, res) => {
    if (!req.session.admin) return res.redirect("/admin/login");
    res.sendFile(path.join(__dirname, "../public/admin-dashboard.html"));
});

/* ── AUTH ── */
/* ── AUTH — replace your existing /login POST with this ── */

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.json({ success: false, message: "Missing credentials" });

    try {
        const user = await dbGet(
            `SELECT * FROM users WHERE email=? AND role='admin'`,
            [email]
        );

        if (!user) {
            console.warn(`[Admin Login] No admin found for email: ${email}`);
            return res.json({ success: false });
        }

        if (!user.password_hash) {
            console.error(`[Admin Login] password_hash is NULL for user: ${email}`);
            return res.json({ success: false });
        }

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            console.warn(`[Admin Login] Wrong password for: ${email}`);
            return res.json({ success: false });
        }

        req.session.admin = { id: user.id, email: user.email };

        if (req.body.remember)
            req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000;

        console.log(`[Admin Login] ✅ Login success: ${email}`);
        return res.json({ success: true });

    } catch (err) {
        console.error("[Admin Login] DB error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

router.post("/logout", (req, res) => req.session.destroy(() => res.json({ success: true })));

/* ── STATS ── */
router.get("/stats", checkAdmin, async (req, res) => {
    try {
        const inv = await dbGet(`SELECT COUNT(*) as total, SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) as available, SUM(CASE WHEN status='activated' THEN 1 ELSE 0 END) as activated, SUM(CASE WHEN status='shipped' THEN 1 ELSE 0 END) as shipped FROM qr_inventory`);
        const users = await dbGet(`SELECT COUNT(*) as total FROM users`);
        const revenue = await dbGet(`SELECT COALESCE(SUM(amount),0) as total FROM orders WHERE payment_status='paid'`);
        const today = await dbGet(`SELECT COUNT(*) as cnt FROM scan_logs WHERE DATE(scanned_at)=DATE('now')`);
        const activeQR = await dbGet(`SELECT COUNT(*) as cnt FROM qr_codes WHERE status='active'`);
        res.json({
            total_inventory: inv.total || 0,
            available: inv.available || 0,
            activated: inv.activated || 0,
            shipped: inv.shipped || 0,
            total_users: users.total || 0,
            total_revenue: revenue.total || 0,
            scans_today: today.cnt || 0,
            active_qrs: activeQR.cnt || 0
        });
    } catch (e) { res.status(500).json({ error: "Stats failed" }); }
});

/* ── QR INVENTORY LIST ── */
router.get("/qr", checkAdmin, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;
    const type = req.query.product_type || null;
    const search = req.query.search || null;
    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;

    let where = "WHERE 1=1";
    const params = [];
    if (status) { where += " AND qi.status=?"; params.push(status); }
    if (type) { where += " AND qi.product_type=?"; params.push(type); }
    if (search) { where += " AND qi.qr_id LIKE ?"; params.push(`%${search}%`); }
    if (dateFrom) { where += " AND DATE(qi.created_at) >= ?"; params.push(dateFrom); }
    if (dateTo) { where += " AND DATE(qi.created_at) <= ?"; params.push(dateTo); }

    // Get total count first
    db.get(`SELECT COUNT(*) as total FROM qr_inventory qi ${where}`, params, (err, countRow) => {
        const total = countRow?.total || 0;

        db.all(`
            SELECT qi.qr_id, qi.product_type, qi.activation_pin, qi.status,
                   qi.created_at, qi.shipped_at, qi.courier, qi.tracking_no,
                   u.name as owner_name, u.email as owner_email, u.phone as owner_phone,
                   qc.activated_at, qc.expiry_date, qc.asset_label,
                   qn_p.phone as primary_phone,
                   qn_s.phone as secondary_phone,
                   (SELECT scanned_at FROM scan_logs WHERE qr_id=qi.qr_id ORDER BY scanned_at DESC LIMIT 1) as last_scan
            FROM qr_inventory qi
            LEFT JOIN qr_codes qc ON qi.qr_id = qc.qr_id
            LEFT JOIN users u ON qc.user_id = u.id
            LEFT JOIN qr_numbers qn_p ON qi.qr_id = qn_p.qr_id AND qn_p.type='primary'
            LEFT JOIN qr_numbers qn_s ON qi.qr_id = qn_s.qr_id AND qn_s.type='secondary'
            ${where}
            ORDER BY qi.id DESC LIMIT ? OFFSET ?
        `, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: "DB error" });
            res.json({ data: rows, page, limit, total, pages: Math.ceil(total / limit) });
        });
    });
});

/* ── GENERATE QR BATCH ── */
const generatePIN = () => Math.floor(100000 + Math.random() * 900000).toString();

async function generateUniqueQrId(prefix) {
    let qrId, exists = true;
    while (exists) {
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        qrId = `${prefix}${rand}`;
        const row = await dbGet(
            `SELECT qr_id FROM qr_inventory WHERE qr_id=? UNION SELECT qr_id FROM qr_codes WHERE qr_id=?`,
            [qrId, qrId]
        ).catch(() => null);
        if (!row) exists = false;
    }
    return qrId;
}

router.post("/generate-qr", checkAdmin, async (req, res) => {
    const { prefix, count, productType } = req.body;
    const validTypes = ["car", "bike", "carcombo", "bikecombo", "bag", "laptop", "mobile", "keys", "luggage", "child", "pet", "senior", "doorbell", "apartment", "rental", "office", "equipment"];

    if (!prefix || prefix.length < 2 || prefix.length > 5)
        return res.status(400).json({ success: false, message: "Prefix must be 2–5 letters" });
    if (!productType || !validTypes.includes(productType))
        return res.status(400).json({ success: false, message: "Invalid product type" });
    const qty = parseInt(count);
    if (!qty || qty < 1 || qty > 500)
        return res.status(400).json({ success: false, message: "Quantity must be 1–500" });

    try {
        const generated = [];
        const baseUrl = process.env.BASE_URL || "https://reachoutowner.com";

        for (let i = 0; i < qty; i++) {
            const qrId = await generateUniqueQrId(prefix.toUpperCase());
            const pin = generatePIN();
            const qrUrl = `${baseUrl}/secure/${qrId}`;
            const filePath = path.join(qrImageFolder, `${qrId}.png`);

            await QRCode.toFile(filePath, qrUrl, {
                width: 500,
                margin: 2
            });
            await dbRun(
                `INSERT INTO qr_inventory (qr_id, product_type, activation_pin, status, source) VALUES (?,?,?,'available','inventory')`,
                [qrId, productType, pin]
            );
            generated.push({
                qr_id: qrId, product_type: productType, activation_pin: pin,
                qr_url: `${baseUrl}/secure/${qrId}`, activation_url: `${baseUrl}/activate?qr=${qrId}`, status: "available"
            });           
        }
        res.json({ success: true, count: generated.length, data: generated });
    } catch (err) {
        console.error("Generate QR error:", err);
        res.status(500).json({ success: false, message: "Generation failed" });
    }
});

/* ── DOWNLOAD CSV ── */
router.get("/download-csv", checkAdmin, async (req, res) => {
    const type = req.query.product_type || null;
    const limit = Math.min(500, parseInt(req.query.limit) || 200);
    const baseUrl = process.env.BASE_URL || "https://reachoutowner.com";

    let where = "WHERE status='available'";
    const params = [];
    if (type) { where += " AND product_type=?"; params.push(type); }

    try {
        const rows = await dbAll(
            `SELECT qr_id, product_type, activation_pin, status, created_at FROM qr_inventory ${where} ORDER BY created_at DESC LIMIT ?`,
            [...params, limit]
        );
        let csv = "QR ID,Product Type,Activation PIN,QR URL,Activation URL,Status,Created At\n";
        rows.forEach(r => {
            csv += `${r.qr_id},${r.product_type},${r.activation_pin},${baseUrl}/secure/${r.qr_id},${baseUrl}/activate?qr=${r.qr_id},${r.status},${r.created_at}\n`;
        });
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=qr_${type || "all"}_${Date.now()}.csv`);
        res.send(csv);
    } catch (e) { res.status(500).json({ error: "Export failed" }); }
});

/* ── OWNERS ── */
router.get("/owners", checkAdmin, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * 20;
    const search = req.query.search || "";
    try {
        const rows = await dbAll(`
            SELECT u.id, u.name, u.email, u.phone, u.created_at,
                   COUNT(DISTINCT qc.qr_id) as total_qrs,
                   SUM(CASE WHEN qc.status='active' THEN 1 ELSE 0 END) as active_qrs,
                   o.city, o.state, o.pincode, o.shipping_address
            FROM users u
            LEFT JOIN qr_codes qc ON u.id = qc.user_id
            LEFT JOIN orders o ON o.user_id = u.id AND o.id = (
                SELECT MAX(id) FROM orders WHERE user_id = u.id
            )
            WHERE (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)
            GROUP BY u.id
            ORDER BY u.created_at DESC LIMIT 20 OFFSET ?
        `, [`%${search}%`, `%${search}%`, `%${search}%`, offset]);

        const total = await dbGet(`SELECT COUNT(*) as cnt FROM users WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?`,
            [`%${search}%`, `%${search}%`, `%${search}%`]);

        res.json({ data: rows, page, total: total.cnt });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// Owner's QR drill-down
router.get("/owner-qrs/:userId", checkAdmin, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT qc.qr_id, qc.product_type, qc.asset_label, qc.status,
                   qc.activated_at, qc.expiry_date,
                   qn.phone as primary_phone
            FROM qr_codes qc
            LEFT JOIN qr_numbers qn ON qc.qr_id = qn.qr_id AND qn.type='primary'
            WHERE qc.user_id = ?
            ORDER BY qc.created_at DESC
        `, [req.params.userId]);
        res.json({ data: rows });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
});

/* ── ORDERS ── */
router.get("/orders", checkAdmin, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * 20;
    const status = req.query.status || null;
    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;

    let where = "WHERE 1=1";
    const params = [];
    if (status) { where += " AND o.payment_status=?"; params.push(status); }
    if (dateFrom) { where += " AND DATE(o.created_at) >= ?"; params.push(dateFrom); }
    if (dateTo) { where += " AND DATE(o.created_at) <= ?"; params.push(dateTo); }

    try {
        const rows = await dbAll(`
            SELECT o.id, o.owner_name, o.owner_email, o.owner_phone,
                   o.amount, o.payment_status, o.transaction_type,
                   o.order_source, o.shipping_address, o.city, o.state,
                   o.pincode, o.plan_years, o.created_at
            FROM orders o ${where}
            ORDER BY o.created_at DESC LIMIT 20 OFFSET ?
        `, [...params, offset]);

        const total = await dbGet(`SELECT COUNT(*) as cnt FROM orders o ${where}`, params);
        res.json({ data: rows, page, total: total.cnt });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
});

// Order items drill-down
router.get("/order-items/:orderId", checkAdmin, async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT product_type, quantity, price FROM order_items WHERE order_id=?`,
            [req.params.orderId]
        );
        res.json({ data: rows });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
});

/* ── MARK SHIPPED ── */
router.post("/mark-shipped", checkAdmin, async (req, res) => {
    const { qr_id, courier, tracking_no, remarks } = req.body;
    if (!qr_id) return res.status(400).json({ success: false });
    try {
        await dbRun(`
            UPDATE qr_inventory 
            SET shipped=1, status='shipped', shipped_at=CURRENT_TIMESTAMP,
                courier=?, tracking_no=?, remarks=?
            WHERE qr_id=?
        `, [courier || null, tracking_no || null, remarks || null, qr_id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

/* ── Revenue Route ── */
router.get("/revenue-monthly", checkAdmin, async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT strftime('%Y-%m', created_at) as month,
                   COUNT(*) as orders,
                   SUM(amount) as revenue,
                   SUM(CASE WHEN order_source='website' THEN amount ELSE 0 END) as website_revenue,
                   SUM(CASE WHEN order_source='retail'  THEN amount ELSE 0 END) as retail_revenue
            FROM orders
            WHERE payment_status='paid'
            GROUP BY month
            ORDER BY month DESC
            LIMIT 12
        `);
        res.json({ data: rows });
    } catch (e) { res.status(500).json({ error: "Failed" }); }
});


router.get("/download-print-pdf", checkAdmin, async (req, res) => {

    const type = req.query.product_type || 'car';

    try {

        const rows = await dbAll(`
            SELECT qr_id
            FROM qr_inventory
            WHERE product_type=?
            ORDER BY created_at DESC
            LIMIT 100
        `, [type]);

        const doc = new PDFDocument({ margin: 20 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename=qr-print.pdf");

        doc.pipe(res);

        let x = 20, y = 20;
        const boxWidth = 180;
        const boxHeight = 180;

        rows.forEach((qr) => {

            const imgPath = path.join(qrImageFolder, `${qr.qr_id}.png`);

            if (fs.existsSync(imgPath)) {
                doc.image(imgPath, x + 30, y + 10, { width: 120 });
            } else {
                doc.text("QR Missing", x + 40, y + 60);
            }

            doc.fontSize(8).text(qr.qr_id, x, y + 135, {
                width: boxWidth,
                align: "center"
            });

            doc.rect(x, y, boxWidth, boxHeight).stroke();

            x += boxWidth + 10;

            if (x + boxWidth > 550) {
                x = 20;
                y += boxHeight + 10;
            }

            if (y + boxHeight > 750) {
                doc.addPage();
                x = 20;
                y = 20;
            }

        });

        doc.end();

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "PDF generation failed" });
    }

});

router.post("/print-selected", checkAdmin, async (req, res) => {

    const { qr_ids } = req.body;

    if (!qr_ids || qr_ids.length === 0) {
        return res.status(400).json({ error: "No QR selected" });
    }

    try {

        const placeholders = qr_ids.map(() => '?').join(',');

        const rows = await dbAll(`
            SELECT qr_id
            FROM qr_inventory
            WHERE qr_id IN (${placeholders})
        `, qr_ids);

        const doc = new PDFDocument({ margin: 20 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename=qr-print.pdf");

        doc.pipe(res);

        let x = 20, y = 20;
        const boxWidth = 180;
        const boxHeight = 180;

        rows.forEach((qr) => {

            const imgPath = path.join(qrImageFolder, `${qr.qr_id}.png`);

            if (fs.existsSync(imgPath)) {
                doc.image(imgPath, x + 30, y + 10, { width: 120 });
            } else {
                doc.text("QR Missing", x + 40, y + 60);
            }

            doc.fontSize(8).text(qr.qr_id, x, y + 135, {
                width: boxWidth,
                align: "center"
            });

            doc.rect(x, y, boxWidth, boxHeight).stroke();

            x += boxWidth + 10;

            if (x + boxWidth > 550) {
                x = 20;
                y += boxHeight + 10;
            }

            if (y + boxHeight > 750) {
                doc.addPage();
                x = 20;
                y = 20;
            }

        });

        doc.end();

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Print failed" });
    }
});

module.exports = router;