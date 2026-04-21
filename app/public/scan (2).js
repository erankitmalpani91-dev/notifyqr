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
        "Car parked in a no parking zone",
        "Car alarm is ringing",
        "Car window is open",
        "Smoke or fire seen in your car",
        "Fluid leaking from your car",
        "Your car was hit or damaged"
    ],

    bike: [
        "Your bike is blocking the way",
        "Your bike lights are on",
        "Please move your bike",
        "Bike parked in a no parking zone",
        "Bike alarm is ringing",
        "Bike has fallen or tipped over",
        "Fuel or oil leaking from your bike"
    ],

    auto: [
        "Your auto is blocking the way",
        "Please move your auto",
        "Auto parked in a no parking zone",
        "Your auto lights are on",
        "Auto seems to have an issue"
    ],

    CV: [
        "Your vehicle is blocking the way",
        "Please move your vehicle",
        "Vehicle parked in a restricted area",
        "Your vehicle lights are on",
        "Possible issue noticed in your vehicle"
    ],

    bag: [
        "I found your bag",
        "Your bag is unattended",
        "Your bag was left behind",
        "Bag found at this location"
    ],

    schoolbag: [
        "I found a school bag",
        "School bag left behind",
        "Your child's bag is unattended"
    ],

    laptop: [
        "I found your laptop",
        "Your laptop is unattended",
        "Laptop left behind at this location"
    ],

    mobile: [
        "I found your mobile phone",
        "Mobile phone left behind",
        "Your phone is unattended"
    ],

    key: [
        "I found your keys",
        "Your keys were left behind",
        "Keys found at this location"
    ],

    pet: [
        "I found your pet",
        "Your pet seems lost",
        "Your pet is unattended",
        "Pet found roaming nearby"
    ],

    kids: [
        "I found a child with this tag",
        "Child needs assistance",
        "Child appears lost",
        "Child is alone and needs help"
    ],

    elderly: [
        "An elderly person needs assistance",
        "Elderly person seems lost",
        "Found elderly person with this tag",
        "Elderly person needs help"
    ],

    homedelivery: [
        "Delivery attempt failed",
        "Package could not be delivered",
        "Please contact regarding your delivery",
        "Delivery person tried to reach you"
    ],

    employee: [
        "Employee ID found",
        "Employee needs assistance",
        "ID card was found",
        "Please contact regarding employee ID"
    ],

    shop: [
        "Shop is closed, customer waiting",
        "Issue at your shop location",
        "Please contact regarding your shop",
        "Customer needs assistance at your shop"
    ],

    default: [
        "I found your item",
        "Your item is unattended",
        "Please contact me",
        "Item found at this location"
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

                // Show the conversation thread with finder's message immediately
                const finalMsg = document.getElementById("customMsg").value.trim() || selectedMessage;
                document.getElementById("convoThread").style.display = "flex";
                addBubble("finder", finalMsg);

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

    // Track what we've already rendered so we don't re-render on every poll
    let rendered = {
        finderMsg: false,
        ownerReply: false,
        finderFollowup: false,
        ownerReply2: false
    };

    pollInterval = setInterval(() => {
        fetch("/api/alerts/reply/" + scanId)
            .then(res => res.json())
            .then(data => {
                if (!data.success) return;

                // ── Step 1: Show finder's own message in thread ──
                if (!rendered.finderMsg) {
                    rendered.finderMsg = true;
                    addBubble("finder", selectedMessage || document.getElementById("customMsg").value.trim());
                    document.getElementById("convoThread").style.display = "flex";
                }

                // ── Step 2: Owner replied ──
                if (data.reply && !rendered.ownerReply) {
                    rendered.ownerReply = true;
                    addBubble("owner", data.reply);
                    showStatus("success", "✅ Owner has responded!");

                    // Show follow-up box (only if no follow-up sent yet)
                    if (!data.finder_followup) {
                        document.getElementById("followupBox").style.display = "block";
                    }
                }

                // ── Step 3: Finder's follow-up appeared (they sent it, now confirm in thread) ──
                if (data.finder_followup && !rendered.finderFollowup) {
                    rendered.finderFollowup = true;
                    document.getElementById("followupBox").style.display = "none";
                    addBubble("finder", data.finder_followup);
                    showStatus("success", "✅ Follow-up sent. Waiting for owner...");
                }

                // ── Step 4: Owner replied a second time ──
                if (data.owner_reply2 && !rendered.ownerReply2) {
                    rendered.ownerReply2 = true;
                    addBubble("owner", data.owner_reply2);
                    showStatus("success", "✅ Owner replied again!");
                    clearInterval(pollInterval); // Conversation complete
                }
            })
            .catch(() => { });
    }, 5000);

    // Stop polling after 15 minutes
    setTimeout(() => clearInterval(pollInterval), 900000);
}

// Add a chat bubble to the conversation thread
function addBubble(who, text) {
    const thread = document.getElementById("convoThread");

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = who === "owner" ? "flex-end" : "flex-start";

    const label = document.createElement("div");
    label.className = "bubble-label" + (who === "owner" ? " right" : "");
    label.innerText = who === "owner" ? "Owner" : "You";

    const bubble = document.createElement("div");
    bubble.className = "bubble bubble-" + who;
    bubble.innerText = text;

    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    thread.appendChild(wrapper);

    // Scroll into view smoothly
    wrapper.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Send follow-up message
function sendFollowup() {
    const msg = document.getElementById("followupMsg").value.trim();
    if (!msg) { alert("Please type a follow-up message"); return; }
    if (!currentScanId) return;

    const btn = document.getElementById("followupBtn");
    btn.disabled = true;
    btn.innerText = "Sending...";

    fetch("/api/alerts/send-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: currentScanId, message: msg })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Immediately add to thread, hide input box
                document.getElementById("followupBox").style.display = "none";
                addBubble("finder", msg);
                showStatus("success", "✅ Follow-up sent. Waiting for owner...");
            } else {
                btn.disabled = false;
                btn.innerText = "Send Follow-up";
                alert(data.message || "Failed to send. Please try again.");
            }
        })
        .catch(() => {
            btn.disabled = false;
            btn.innerText = "Send Follow-up";
            alert("Network error. Please try again.");
        });
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