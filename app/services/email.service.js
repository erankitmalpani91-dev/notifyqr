const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

transporter.verify((error, success) => {
    if (error) {
        console.error("Transporter error:", error);
    } else {
        console.log("Email server ready");
    }
});

async function sendEmail(email, subject, message) {
    try {
        await transporter.sendMail({
            from: `"ReachOutOwner" <${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            html: message,
        });

        console.log("EMAIL SENT TO:", email);
    } catch (err) {
        console.error("EMAIL ERROR:", err.message, err);
    }
}

module.exports = { sendEmail };