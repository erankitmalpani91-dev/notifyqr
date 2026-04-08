const params = new URLSearchParams(window.location.search);
const qrId = params.get("qr");

let selectedMessage = "";
let allMessages = [];
let pollInterval = null;
let currentScanId = null;

// Predefined messages per asset type
const messageMap = {
    car: [
        "Your car is blocking the way",
        "Your car lights are on",
        "Please move your car",
        "Car parked in no parking zone",
        "Car alarm is ringing",
        "Car window is open"
    ],
    bike: [
        "Your bike is blocking the way",
        "Your bike lights are on",
        "Please move your bike",
        "Bike parked in no parking zone",
        "Bike alarm is ringing"
    ],
    bag: [
        "I found your bag",
        "Your bag is unattended",
        "Your bag was left behind"
    ],
    laptop: [
        "I found your laptop",
        "Your laptop is unattended"
    ],
    keys: [
        "I found your keys",
        "Your keys were left behind"
    ],
    pet: [
        "I found your pet",
        "Your pet is unattended",
        "Your pet seems lost"
    ],
    child: [
        "I found a child with this tag",
        "A child needs assistance"
    ],
    default: [
        "I found your item",
        "Your item is unattended",
        "Please contact me"
    ]
};

if (!qrId) {
    document.getElementById("title").innerText = "Invalid QR Code";
} else {
    loadQR();
}

// Load QR info from server
function loadQR() {
    fetch("/api/alerts/qr-info/" + qrId)
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                document.getElementById("title").innerText = data.message || "QR Not Active";
                return;
            }

            const assetType = (data.product_type || "default").toLowerCase();
            const assetLabel = data.asset_name || data.product_type || "Item";

            document.getElementById("title").innerText = "Notify Owner";
            document.getElementById("mainContent").style.display = "block";

            allMessages = messageMap[assetType] || messageMap["default"];
            renderButtons(allMessages.slice(0, 3));
        })
        .catch(() => {
            document.getElementById("title").innerText = "Unable to load QR";
        });
}

// Render predefined message buttons
function renderButtons(msgs) {
    const btnDiv = document.getElementById("buttons");
    btnDiv.innerHTML = "";

    msgs.forEach(msg => {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.innerText = msg;

        btn.onclick = () => {
            selectedMessage = msg;
            document.querySelectorAll("#buttons .btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");

            // Always overwrite with the selected message
            const customBox = document.getElementById("customMsg");
            customBox.value = msg;
            customBox.dataset.prefilled = "true";
            updateCharCount();
        };


        btnDiv.appendChild(btn);
    });

    // Auto-select first
    const first = btnDiv.querySelector(".btn");
    if (first) first.click();
}

// Show all messages
function showMore() {
    renderButtons(allMessages);
    document.getElementById("moreOptions").style.display = "none";
}

// Update char count
function updateCharCount() {
    const val = document.getElementById("customMsg").value.length;
    document.getElementById("charCount").innerText = val;
    // Once user edits manually, stop auto-replacing
    document.getElementById("customMsg").dataset.prefilled = "false";
}

// Main notify function
function notifyOwner() {
    const customText = document.getElementById("customMsg").value.trim();
    const finalMessage = customText || selectedMessage;

    if (!finalMessage) {
        alert("Please select an issue or write a message");
        return;
    }

    const btn = document.getElementById("notifyBtn");
    btn.disabled = true;
    btn.innerText = "Sending...";

    showStatus("sending", "Sending notification...");

    // Try to get location — if denied, send without it
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                const location = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;
                sendAlert(finalMessage, location);
            },
            () => {
                // Location denied — send without it
                sendAlert(finalMessage, null);
            },
            { timeout: 5000 }
        );
    } else {
        sendAlert(finalMessage, null);
    }
}

// Send alert to server
function sendAlert(message, location) {
    fetch("/api/alerts/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_id: qrId, message, location })
    })
        .then(res => res.json())
        .then(data => {
            const btn = document.getElementById("notifyBtn");

            if (data.success) {
                currentScanId = data.scan_id;

                btn.innerText = "✅ Owner Notified";
                showStatus("success", "Owner has been notified. Waiting for reply...");

                // Start polling for reply
                startPolling(currentScanId);

                // Start 3 min cooldown
                setTimeout(() => startCooldown(), 2000);

            } else {
                btn.disabled = false;
                btn.innerText = "Notify Owner";
                showStatus("error", data.message || "Failed to notify. Please try again.");
            }
        })
        .catch(() => {
            const btn = document.getElementById("notifyBtn");
            btn.disabled = false;
            btn.innerText = "Notify Owner";
            showStatus("error", "Network error. Please try again.");
        });
}

// Poll for owner reply
function startPolling(scanId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(() => {
        fetch("/api/alerts/reply/" + scanId)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.reply) {
                    clearInterval(pollInterval);

                    // Show reply in dedicated box
                    document.getElementById("replyText").innerText = data.reply;
                    document.getElementById("replyBox").style.display = "block";

                    // Update status box
                    showStatus("success", "✅ Owner has responded!");
                }
            })
            .catch(() => { });
    }, 5000);

    // Stop polling after 10 minutes
    setTimeout(() => {
        clearInterval(pollInterval);
    }, 600000);
}

// 3 minute cooldown timer
function startCooldown() {
    const btn = document.getElementById("notifyBtn");
    const timer = document.getElementById("timer");

    let time = 180;
    btn.disabled = true;
    btn.style.background = "#95a5a6";

    const interval = setInterval(() => {
        const min = Math.floor(time / 60);
        const sec = time % 60;
        timer.innerText = `Can notify again in ${min}:${sec < 10 ? "0" + sec : sec}`;
        time--;

        if (time < 0) {
            clearInterval(interval);
            btn.disabled = false;
            btn.innerText = "Notify Again";
            btn.style.background = "#27ae60";
            timer.innerText = "";
        }
    }, 1000);
}

// Show status message
function showStatus(type, message) {
    const box = document.getElementById("statusBox");
    box.className = "status-box " + type;
    box.innerHTML = message;
} 