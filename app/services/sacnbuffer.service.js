const db = require("../config/db");

let scanQueue = [];

/* PUSH SCAN INTO MEMORY */

function logScan(qrId, ip, userAgent) {

    scanQueue.push({
        qrId,
        ip,
        userAgent,
        time: new Date().toISOString()
    });

}

/* FLUSH QUEUE TO DATABASE */

function flushScans() {

    if (scanQueue.length === 0) return;

    const batch = [...scanQueue];
    scanQueue = [];

    const stmt = db.prepare(`
        INSERT INTO scan_logs (qr_id, ip, user_agent, scanned_at)
        VALUES (?, ?, ?, ?)
    `);

    batch.forEach(scan => {
        stmt.run(scan.qrId, scan.ip, scan.userAgent, scan.time);
    });

    stmt.finalize();

}

/* RUN EVERY 5 SECONDS */

setInterval(flushScans, 5000);

module.exports = {
    logScan
};