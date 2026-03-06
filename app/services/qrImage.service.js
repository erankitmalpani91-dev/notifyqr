const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

async function generateQrImage(qrId) {

    const baseUrl = "http://localhost:3000/q/";
    const fullUrl = baseUrl + qrId;

    const storagePath = path.join(__dirname, "../../storage/qrcodes");

    if (!fs.existsSync(storagePath)) {
        fs.mkdirSync(storagePath, { recursive: true });
    }

    const filePath = path.join(storagePath, `${qrId}.svg`);

    await QRCode.toFile(filePath, fullUrl, {
        type: "svg",
        errorCorrectionLevel: "H",
        margin: 2,
        width: 500
    });

    return filePath;
}

module.exports = { generateQrImage };