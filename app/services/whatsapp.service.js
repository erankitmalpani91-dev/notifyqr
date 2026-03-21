const axios = require("axios");



async function sendWhatsApp(to, data) {
    try {
        // CLEAN PHONE NUMBER
        to = to.replace(/\D/g, "");

        // FIX FORMAT STRICTLY
        if (to.length === 10) {
            to = "91" + to;
        } else if (to.length === 12 && to.startsWith("91")) {
            // correct
        } else {
            console.log("❌ INVALID NUMBER:", to);
        }

        // FINAL LOG
        console.log("📲 FINAL NUMBER:", to);

        await axios.post(
            `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "template",
                template: {
                    name: "qr_purchase_success",
                    language: { code: "en" },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                { type: "text", text: data.name },
                                { type: "text", text: data.link }
                            ]
                        }
                    ]
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ WHATSAPP SENT:", to);

    } catch (err) {
        console.log("❌ WHATSAPP ERROR:", err.response?.data || err.message);
    }
}

module.exports = { sendWhatsApp };