const API = "/api";

async function login() {

    const phone = document.getElementById("phone").value;
    const password = document.getElementById("password").value;

    const res = await fetch("/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            phone: phone,
            password: password
        })
    });

    const data = await res.json();

    if (data.token) {

        localStorage.setItem("token", data.token);

        document.getElementById("loginSection").style.display = "none";
        document.getElementById("dashboardSection").style.display = "block";

        loadQrs();

    } else {

        alert(data.message || "Login failed");

    }

}




async function loadQrs() {

    const token = localStorage.getItem("token");

    const res = await fetch("/api/dashboard/qrs", {
        headers: {
            Authorization: token
        }
    });

    const qrs = await res.json();

    const container = document.getElementById("qrList");

    container.innerHTML = "";

    qrs.forEach(qr => {

        const div = document.createElement("div");

        div.innerHTML = `
        <div class="qr-card">
            <b>${qr.qr_id}</b>
            <button onclick="activateQr('${qr.qr_id}')">Activate</button>
        </div>
        `;

        container.appendChild(div);

    });

}