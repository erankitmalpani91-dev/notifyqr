const params = new URLSearchParams(window.location.search);
const qrId = params.get("qr");

let selectedMessage = "";
let cooldownTime = 180; // 3 minutes

let allMessages = [];

if (!qrId) {
    document.getElementById("title").innerText = "Invalid QR";
    throw new Error("QR missing");
}

// 🔥 LOAD QR
fetch("/secure/" + qrId)
    .then(res => res.json())
    .then(data => {

        if (!data.success) {
            document.getElementById("title").innerText = "QR Not Active";
            return;
        }

        const asset = data.asset_name || "Item";

        document.getElementById("title").innerText = "Notify Owner (" + asset + ")";

        const messages = {
            Car: [
                "Your car is blocking the way",
                "Your car lights are on",
                "Please move your car",
                "Car parked in no parking",
                "Car alarm is ringing",
                "Car window is open"
            ]
        };

        allMessages = messages[asset] || ["Found your item"];

        renderButtons(allMessages.slice(0, 3));

    });


// 🔥 RENDER BUTTONS
function renderButtons(msgs) {

    const btnDiv = document.getElementById("buttons");
    btnDiv.innerHTML = "";

    msgs.forEach(msg => {

        const btn = document.createElement("button");
        btn.className = "btn";
        btn.innerText = msg;

        btn.onclick = () => {

            selectedMessage = msg;

            document.querySelectorAll(".btn").forEach(b => {
                b.classList.remove("selected");
            });

            btn.classList.add("selected");
        };

        btnDiv.appendChild(btn);
    });

    setTimeout(() => {
        const first = document.querySelector(".btn");
        if (first) first.click();
    }, 100);
}


// 🔥 SHOW MORE
function showMore() {
    renderButtons(allMessages);
    document.getElementById("moreOptions").style.display = "none";
}


// 🔥 NOTIFY
function notifyOwner() {

    if (!selectedMessage) {
        alert("Select a message");
        return;
    }

    const btn = document.querySelector(".notify-btn");

    btn.innerText = "Sending...";
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(pos => {

        const location = `https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`;

        fetch("/api/alerts/send-alert", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                qr_id: qrId,
                message: selectedMessage,
                location
            })
        })
            .then(res => res.json())
            .then(data => {

                const btn = document.querySelector(".notify-btn");
                const timer = document.getElementById("timer");

                if (data.success) {

                    // ✅ SHOW SUCCESS MESSAGE
                    btn.innerText = "✅ Owner Notified";
                    btn.style.background = "#27ae60";

                    timer.innerText = "Owner has been notified. They may respond shortly.";

                    // 🔥 START COOLDOWN AFTER 2 SEC
                    setTimeout(() => {
                        startCooldown();
                    }, 2000);

                } else {
                    btn.innerText = "Notify Owner";
                    btn.disabled = false;
                    alert("Failed");
                }

            });

    });
}


// 🔥 COOLDOWN TIMER
function startCooldown() {

    const btn = document.querySelector(".notify-btn");
    const timer = document.getElementById("timer");

    let time = 180;

    btn.disabled = true;
    btn.style.background = "#95a5a6";

    const interval = setInterval(() => {

        const min = Math.floor(time / 60);
        const sec = time % 60;

        timer.innerText = `Try again in ${min}:${sec < 10 ? '0' + sec : sec}`;

        time--;

        if (time < 0) {
            clearInterval(interval);

            btn.disabled = false;
            btn.innerText = "Notify Owner";
            btn.style.background = "#27ae60";

            timer.innerText = "";
        }

    }, 1000);
}