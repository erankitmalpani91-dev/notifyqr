/* ═══════════════════════════════════════════════════════════════
   scan.js  —  3-screen flow

   CONVERSATION LIFECYCLE:
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. Finder scans → Screen 1 (select issue)                   │
   │ 2. Notify sent  → Screen 2 (waiting for owner)              │
   │                                                             │
   │ AUTO-CLOSE RULES (whichever fires first):                   │
   │   A) Owner never replied          → close after 10 min      │
   │   B) Owner replied, no follow-up  → close after 5 min       │
   │      from finder from owner's reply time                    │
   │   C) Owner sent reply2 (follow-up exchange done) → close    │
   │      immediately (conversation naturally complete)          │
   │                                                             │
   │ ON CLOSE → Show "Conversation Completed" screen             │
   │            Clear gate → next scan gets fresh Screen 1       │
   │                                                             │
   │ BACK / REFRESH → Show "Scan QR Again" card (gate still set) │
   │                                                             │
   │ CONCURRENT SCAN (person B while person A active):           │
   │   Server returns active_until timestamp in qr-info          │
   │   → Show "Owner already notified, please wait X min"        │
   └─────────────────────────────────────────────────────────────┘

   GATE (localStorage):
   { scanId, ts, ownerRepliedAt }
   - ts           = when notify was sent (for 10-min no-reply window)
   - ownerRepliedAt = when owner first replied (for 5-min follow-up window)
═══════════════════════════════════════════════════════════════ */

const params = new URLSearchParams(window.location.search);
const qrId = params.get("qr");
const messageCache = new Set();

let selectedMessage = "";
let allMessages = [];
let pollInterval = null;
let currentScanId = null;

/* Conversation render flags */
const rendered = {
    ownerReply: false,
    finderFollowup: false,
    ownerReply2: false,
};

/* ══════════════════════════════════════════════════════════════
   TIMERS (server-authoritative via wall-clock timestamps)
   Browser setInterval is throttled when minimised — we do NOT
   rely on countdown ticks. Instead every poll tick compares
   Date.now() against stored timestamps, so the check fires
   correctly the moment the tab is foregrounded again.
══════════════════════════════════════════════════════════════ */
const TIMEOUT_NO_REPLY_MS = 10 * 60 * 1000;   // 10 min — owner never replied
const TIMEOUT_NO_FOLLOWUP_MS = 5 * 60 * 1000;  //  5 min — owner replied, finder silent

/* ══════════════════════════════════════════════════════════════
   GATE  (localStorage)
══════════════════════════════════════════════════════════════ */
const GATE_KEY = "roo_gate_" + (qrId || "none");

function getGate() {
    try {
        const raw = localStorage.getItem(GATE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);   // { scanId, ts, ownerRepliedAt? }
    } catch (e) { return null; }
}
function setGate(scanId) {
    const existing = getGate() || {};
    localStorage.setItem(GATE_KEY, JSON.stringify({
        ...existing,
        scanId,
        ts: existing.ts || Date.now(),   // don't reset ts on update
    }));
}
function updateGateOwnerReplied() {
    const gate = getGate();
    if (!gate) return;
    gate.ownerRepliedAt = gate.ownerRepliedAt || Date.now();  // set once
    localStorage.setItem(GATE_KEY, JSON.stringify(gate));
}
function clearGate() {
    localStorage.removeItem(GATE_KEY);
}

/* Returns { expired: bool, reason: 'no_reply'|'no_followup'|null } */
function checkExpiry(gate) {
    if (!gate) return { expired: false, reason: null };
    const elapsed = Date.now() - gate.ts;

    // Rule A: 10 min with no owner reply at all
    if (!gate.ownerRepliedAt && elapsed > TIMEOUT_NO_REPLY_MS) {
        return { expired: true, reason: "no_reply" };
    }

    // Rule B: owner replied but finder sent no follow-up for 5 min
    if (gate.ownerRepliedAt) {
        const sinceReply = Date.now() - gate.ownerRepliedAt;
        if (!rendered.finderFollowup && sinceReply > TIMEOUT_NO_FOLLOWUP_MS) {
            return { expired: true, reason: "no_followup" };
        }
    }

    return { expired: false, reason: null };
}

/* ══════════════════════════════════════════════════════════════
   PREDEFINED MESSAGES
══════════════════════════════════════════════════════════════ */
const messageMap = {
    car: ["Your car is blocking the way", "Your car lights are on", "Please move your car", "Car parked in a no parking zone", "Car alarm is ringing", "Car window is open", "Smoke or fire seen in your car", "Fluid leaking from your car", "Your car was hit or damaged"],
    bike: ["Your bike is blocking the way", "Your bike lights are on", "Please move your bike", "Bike parked in a no parking zone", "Bike alarm is ringing", "Bike has fallen or tipped over", "Fuel or oil leaking from your bike"],
    auto: ["Your auto is blocking the way", "Please move your auto", "Auto parked in a no parking zone", "Your auto lights are on", "Auto seems to have an issue"],
    CV: ["Your vehicle is blocking the way", "Please move your vehicle", "Vehicle parked in a restricted area", "Your vehicle lights are on", "Possible issue noticed in your vehicle"],
    bag: ["I found your bag", "Your bag is unattended", "Your bag was left behind", "Bag found at this location"],
    luggage: ["I found your luggage", "Your luggage is unattended", "Luggage found at this location"],
    laptop: ["I found your laptop", "Your laptop is unattended", "Laptop left behind at this location"],
    mobile: ["I found your mobile phone", "Mobile phone left behind", "Your phone is unattended"],
    key: ["I found your keys", "Your keys were left behind", "Keys found at this location"],
    pet: ["I found your pet", "Your pet seems lost", "Your pet is unattended", "Pet found roaming nearby"],
    kids: ["I found a child with this tag", "Child needs assistance", "Child appears lost", "Child is alone and needs help"],
    elderly: ["An elderly person needs assistance", "Elderly person seems lost", "Found elderly person with this tag", "Elderly person needs help"],
    homedelivery: ["Someone standing at your house door", "Cylinder delivery boy is waiting for you", "Relative is waiting outside", "Please contact regarding your delivery", "Delivery person tried to reach you"],
    default: ["I found your item", "Your item is unattended", "Please contact me", "Item found at this location"],
};

/* ══════════════════════════════════════════════════════════════
   SCREEN NAVIGATION
══════════════════════════════════════════════════════════════ */
function showScreen(n) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const el = document.getElementById("screen" + n);
    if (el) el.classList.add("active");
}

function showInfoCard(msg, isError) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const card = document.getElementById("infoCard");
    card.innerHTML = msg;
    card.className = "info-card active" + (isError ? " error" : "");
}

/* ══════════════════════════════════════════════════════════════
   COMPLETED SCREEN — shown when any auto-close rule fires
══════════════════════════════════════════════════════════════ */
function showConversationCompleted(reason) {
    clearInterval(pollInterval);
    clearGate();  // next scan gets fresh Screen 1

    let msg = "";
    if (reason === "no_reply") {
        msg = `
            <div style="font-size:36px;margin-bottom:12px">⏱️</div>
            <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:#1a1a2e">
                Conversation Closed
            </div>
            <div style="font-size:13px;color:#666;line-height:1.7;margin-bottom:16px">
                The owner did not respond within 10 minutes.<br>
                <strong>Scan the QR code again</strong> if you still need to notify them.
            </div>`;
    } else if (reason === "no_followup") {
        msg = `
            <div style="font-size:36px;margin-bottom:12px">✅</div>
            <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:#1a1a2e">
                Conversation Completed
            </div>
            <div style="font-size:13px;color:#666;line-height:1.7;margin-bottom:16px">
                The owner has been informed and the session has closed.<br>
                Thank you for helping!
            </div>`;
    } else {
        // reason === "exchange_done" (owner sent reply2)
        msg = `
            <div style="font-size:36px;margin-bottom:12px">🎉</div>
            <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:#1a1a2e">
                All Done!
            </div>
            <div style="font-size:13px;color:#666;line-height:1.7;margin-bottom:16px">
                The owner has replied to your follow-up.<br>
                This conversation is now complete. Thank you!
            </div>`;
    }

    showInfoCard(msg, false);
}

/* ══════════════════════════════════════════════════════════════
   "SCAN AGAIN" card — shown on Back / Refresh while gate active
══════════════════════════════════════════════════════════════ */
function showScanAgain() {
    showInfoCard(
        `<div style="font-size:32px;margin-bottom:12px">📷</div>
         <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:#1a1a2e">
           Owner Already Notified
         </div>
         <div style="font-size:13px;color:#666;line-height:1.6;margin-bottom:16px">
           To send a new notification,<br>
           please <strong>scan the QR code again</strong>.
         </div>`,
        false
    );
}

/* ══════════════════════════════════════════════════════════════
   CONCURRENT SCAN BLOCK
   Server returns { active_until: <ISO timestamp> } in qr-info
   when another conversation is already active on this QR.
   We show a countdown to when they can scan.
══════════════════════════════════════════════════════════════ */
function showOwnerAlreadyNotified(activeUntil) {
    // activeUntil is a JS Date object
    function render() {
        const secsLeft = Math.max(0, Math.ceil((activeUntil - Date.now()) / 1000));
        const mins = Math.floor(secsLeft / 60);
        const secs = secsLeft % 60;
        const timeStr = mins > 0
            ? `${mins} min ${secs}s`
            : `${secs}s`;

        showInfoCard(
            `<div style="font-size:32px;margin-bottom:12px">🔔</div>
             <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:#1a1a2e">
               Owner Already Notified
             </div>
             <div style="font-size:13px;color:#666;line-height:1.6;margin-bottom:16px">
               Someone has already alerted the owner.<br>
               Please wait <strong id="concurrentCountdown">${timeStr}</strong> before scanning again.
             </div>`,
            false
        );

        if (secsLeft <= 0) {
            clearInterval(countdownTick);
            // Auto-reload so they can scan fresh
            showInfoCard(
                `<div style="font-size:32px;margin-bottom:12px">📷</div>
                 <div style="font-weight:700;font-size:16px;margin-bottom:8px;color:#1a1a2e">
                   You Can Notify Now
                 </div>
                 <div style="font-size:13px;color:#666;line-height:1.6">
                   The previous session has ended.<br>
                   <strong>Scan the QR code</strong> to notify the owner.
                 </div>`,
                false
            );
        }
    }

    render();
    const countdownTick = setInterval(render, 1000);
}

/* ══════════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════════ */
if (!qrId) {
    showInfoCard("❌ Invalid QR Code", true);
} else {
    const gate = getGate();
    if (!gate) {
        // No prior gate — fresh scan
        loadQR();
    } else {
        // Gate exists — this is a Back/Refresh
        // Check expiry first (conversation may have already ended while minimised)
        const { expired, reason } = checkExpiry(gate);
        if (expired) {
            clearGate();
            showConversationCompleted(reason);
        } else {
            showScanAgain();
        }
    }
}

/* ══════════════════════════════════════════════════════════════
   LOAD QR INFO
   Server should return:
   { success: true, product_type, active_until? }
   active_until is present only when another conversation is
   active on this QR right now. It is an ISO date string.
══════════════════════════════════════════════════════════════ */
function loadQR() {
    showInfoCard("Loading...", false);

    fetch("/api/alerts/qr-info/" + qrId)
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                showInfoCard("⚠️ " + (data.message || "QR Not Active"), true);
                return;
            }

            // Another conversation is live on this QR
            if (data.active_until) {
                showOwnerAlreadyNotified(new Date(data.active_until));
                return;
            }

            const assetType = (data.product_type || "default").toLowerCase();
            allMessages = messageMap[assetType] || messageMap["default"];
            renderButtons(allMessages.slice(0, 3));
            showScreen(1);
        })
        .catch(() => showInfoCard("Unable to load. Please try again.", true));
}

/* ══════════════════════════════════════════════════════════════
   SCREEN 1 — Issue buttons
══════════════════════════════════════════════════════════════ */
function renderButtons(msgs) {
    const container = document.getElementById("issueButtons");
    container.innerHTML = "";
    msgs.forEach(msg => {
        const btn = document.createElement("button");
        btn.className = "issue-btn";
        btn.innerHTML = `<span>${msg}</span><span class="tick">✓</span>`;
        btn.onclick = () => {
            selectedMessage = msg;
            container.querySelectorAll(".issue-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            const box = document.getElementById("customMsg");
            box.value = msg;
            document.getElementById("charCount").innerText = msg.length;
        };
        container.appendChild(btn);
    });
    const first = container.querySelector(".issue-btn");
    if (first) first.click();
}

function showMore() {
    renderButtons(allMessages);
    document.getElementById("moreLink").style.display = "none";
}

function onCustomInput() {
    const val = document.getElementById("customMsg").value;
    document.getElementById("charCount").innerText = val.length;
    document.querySelectorAll(".issue-btn").forEach(b => b.classList.remove("selected"));
    selectedMessage = "";
}

/* ══════════════════════════════════════════════════════════════
   NOTIFY
══════════════════════════════════════════════════════════════ */
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

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            pos => sendAlert(finalMessage, `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`),
            () => sendAlert(finalMessage, null),
            { timeout: 5000 }
        );
    } else {
        sendAlert(finalMessage, null);
    }
}

function sendAlert(message, location) {
    fetch("/api/alerts/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_id: qrId, message, location }),
    })
        .then(async res => {
            let data = null;
            try { data = await res.json(); } catch (e) { }
            return { ok: res.ok, data };
        })
        .then(({ ok, data }) => {
            const btn = document.getElementById("notifyBtn");
            if (!ok || !data || !data.success) {
                btn.disabled = false;
                btn.innerText = "Notify Owner";
                alert(data?.message || "Failed to notify. Please try again.");
                return;
            }

            currentScanId = data.scan_id;

            // Set gate — ts recorded here is the "conversation start" time
            setGate(currentScanId);

            // Reset conversation state
            rendered.ownerReply = false;
            rendered.finderFollowup = false;
            rendered.ownerReply2 = false;
            messageCache.clear();
            document.getElementById("convoThread").innerHTML = "";
            document.getElementById("followupMsg").value = "";
            document.getElementById("followupArea").style.display = "block";
            document.getElementById("miniWaiting").style.display = "none";

            window._finderMessage = message;

            showScreen(2);
            startPolling(currentScanId);
        })
        .catch(() => {
            const btn = document.getElementById("notifyBtn");
            btn.disabled = false;
            btn.innerText = "Notify Owner";
            alert("Network error. Please try again.");
        });
}

/* ══════════════════════════════════════════════════════════════
   POLLING  (every 5s)

   On each tick we check BOTH the server reply AND the
   wall-clock auto-close rules. This means even if the phone
   was minimised for 15 min, the correct state fires the
   moment the tab is brought back to focus.
══════════════════════════════════════════════════════════════ */
function startPolling(scanId) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(() => {

        // ── Wall-clock auto-close check (runs before API call) ──
        const gate = getGate();
        const { expired, reason } = checkExpiry(gate);
        if (expired) {
            showConversationCompleted(reason);
            return;   // clearInterval already called inside showConversationCompleted
        }

        // ── Poll server for replies ──
        fetch("/api/alerts/reply/" + scanId)
            .then(r => r.json())
            .then(data => {
                if (!data.success) return;

                // Owner reply 1 → move to Screen 3 + record time for 5-min rule
                if (data.reply && !rendered.ownerReply) {
                    rendered.ownerReply = true;
                    updateGateOwnerReplied();   // stamps ownerRepliedAt in localStorage
                    addBubble("finder", window._finderMessage || "");
                    addBubble("owner", data.reply);
                    showScreen(3);
                }

                // Finder follow-up confirmed by server
                if (data.finder_followup && !rendered.finderFollowup) {
                    rendered.finderFollowup = true;
                    document.getElementById("followupArea").style.display = "none";
                    addBubble("finder", data.finder_followup);
                    document.getElementById("miniWaiting").style.display = "block";
                }

                // Owner reply 2 → Rule C: exchange complete, close immediately
                if (data.owner_reply2 && !rendered.ownerReply2) {
                    rendered.ownerReply2 = true;
                    document.getElementById("miniWaiting").style.display = "none";
                    addBubble("owner", data.owner_reply2);
                    document.getElementById("followupArea").style.display = "none";
                    showConversationCompleted("exchange_done");
                }
            })
            .catch(() => { });

    }, 5000);
}

/* ══════════════════════════════════════════════════════════════
   FOLLOW-UP
══════════════════════════════════════════════════════════════ */
function sendFollowup() {
    const msg = document.getElementById("followupMsg").value.trim();
    if (!msg) { alert("Please type a follow-up message"); return; }
    if (!currentScanId) return;

    const btn = document.getElementById("followupBtn");
    btn.disabled = true;
    btn.innerText = "Sending...";
    rendered.finderFollowup = true;

    fetch("/api/alerts/send-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: currentScanId, message: msg }),
    })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                document.getElementById("followupArea").style.display = "none";
                addBubble("finder", msg);
                document.getElementById("miniWaiting").style.display = "block";
            } else {
                rendered.finderFollowup = false;
                btn.disabled = false;
                btn.innerText = "Send Follow-up";
                alert(data.message || "Failed to send. Please try again.");
            }
        })
        .catch(() => {
            rendered.finderFollowup = false;
            btn.disabled = false;
            btn.innerText = "Send Follow-up";
            alert("Network error. Please try again.");
        });
}

/* ══════════════════════════════════════════════════════════════
   BUBBLE HELPER
══════════════════════════════════════════════════════════════ */
function addBubble(who, text) {
    if (!text || !text.trim()) return;
    const thread = document.getElementById("convoThread");
    const key = who + "|" + text.trim();
    if (messageCache.has(key)) return;
    messageCache.add(key);

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;flex-direction:column;align-items:" +
        (who === "owner" ? "flex-end" : "flex-start");

    const label = document.createElement("div");
    label.className = "bubble-label" + (who === "owner" ? " right" : "");
    label.innerText = who === "owner" ? "Owner" : "You";

    const bubble = document.createElement("div");
    bubble.className = "bubble bubble-" + who;
    bubble.innerText = text.trim();

    wrapper.appendChild(label);
    wrapper.appendChild(bubble);
    thread.appendChild(wrapper);
    wrapper.scrollIntoView({ behavior: "smooth", block: "nearest" });
}