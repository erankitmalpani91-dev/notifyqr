const axios = require("axios");

async function sendWhatsApp(to, data) {
    try {
        to = to.replace(/\D/g, "");
        if (to.length === 10) to = "91" + to;

        await axios.post(
            `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "template",
                template: {
                    name: data.template, // "qr_scan_alert" or "qr_purchase_success"
                    language: { code: "en" },
                    components: [
                        {
                            type: "body",
                            parameters: data.params.map(p => ({
                                type: "text",
                                text: p
                            }))
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

        console.log("✅ WHATSAPP SENT:", to, "using template:", data.template);
    } catch (err) {
        console.log("❌ WHATSAPP ERROR:", err.response?.data || err.message);
    }
}

module.exports = { sendWhatsApp };
