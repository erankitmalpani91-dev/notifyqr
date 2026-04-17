require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const axios = require("axios");

async function registerNumber() {
    

    try {
        const res = await axios.post(
            `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/register`,
            {
                messaging_product: "whatsapp",
                pin: "123456"
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("✅ REGISTERED:", res.data);

    } catch (err) {
        console.log("❌ ERROR:", err.response?.data || err.message);
        console.log("TOKEN:", process.env.WHATSAPP_TOKEN);
    }
}

registerNumber();