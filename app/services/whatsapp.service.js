const axios = require("axios");

async function sendWhatsApp(to, data) {
    try {
        // Normalize phone
        to = to.replace(/\D/g, "");
        if (to.length === 10) to = "91" + to;

        const response = await axios.post(
            `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: to,
                type: "template",
                template: {
                    name: data.template,
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

        const messageId = response.data?.messages?.[0]?.id;

        if (!messageId) {
            console.log("⚠️ No messageId returned from WhatsApp:", response.data);
            return null;
        }

        console.log("✅ WHATSAPP SENT:", to);
        console.log("📩 MESSAGE ID:", messageId);

        return messageId;

    } catch (err) {
        console.log("❌ WHATSAPP ERROR:", err.response?.data || err.message);
        return null; // 🔥 IMPORTANT
    }
}

module.exports = { sendWhatsApp };