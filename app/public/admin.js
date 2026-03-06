document.addEventListener("DOMContentLoaded", () => {

    initCharts();
    loadQRPage();

});

/* ---------------- TAB SWITCH ---------------- */

window.showTab = function (tabId) {

    document.querySelectorAll(".tab-section").forEach(section => {
        section.classList.add("hidden");
    });

    document.querySelectorAll(".nav-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    document.getElementById(tabId).classList.remove("hidden");

    event.target.classList.add("active");

};



/* ---------------- CHARTS ---------------- */

function initCharts() {

    const scanCtx = document.getElementById('scanChart');

    if (!scanCtx) return;

    new Chart(scanCtx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Scans',
                data: [3, 5, 2, 8, 4, 6, 7],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.1)',
                tension: 0.4
            }]
        },
        options: {
            maintainAspectRatio: false
        }
    });

    const subCtx = document.getElementById('subscriptionChart');

    new Chart(subCtx, {
        type: 'doughnut',
        data: {
            labels: ['Active', 'Expired'],
            datasets: [{
                data: [75, 25],
                backgroundColor: ['#10b981', '#ef4444']
            }]
        },
        options: {
            maintainAspectRatio: false
        }
    });

}

/* ---------------- QR PAGINATION ---------------- */

let currentPage = 1;
const limit = 20;

function loadQRPage() {

    fetch(`/admin/qr?page=${currentPage}&limit=${limit}`)
        .then(r => r.json())
        .then(res => {

            const body = document.getElementById("qrTableBody");

            if (!body) return;

            body.innerHTML = "";

            res.data.forEach(qr => {

                body.innerHTML += `
<tr>
<td>${qr.code}</td>
<td>${qr.status}</td>
<td>${qr.owner_email || "-"}</td>
<td>${qr.last_scan || "-"}</td>
</tr>
`;

            });

            document.getElementById("pageNumber").innerText = currentPage;

        })
        .catch(err => {
            console.error("QR load error", err);
        });

}

window.nextPage = function () {

    currentPage++;
    loadQRPage();

};

window.prevPage = function () {

    if (currentPage > 1) {
        currentPage--;
        loadQRPage();
    }

};

/* Logout Logic*/

window.logout = function () {

    fetch("/admin/logout", {
        method: "POST"
    })
        .then(() => {

            window.location = "/admin/login";

        })
        .catch(err => {
            console.error("Logout error", err);
        });

}
router.post("/logout", (req, res) => {

    req.session.destroy(() => {

        res.json({ success: true });

    });

});

/* QR Generation*/

window.generateQR = function () {

    const prefix = document.getElementById("qrPrefix").value.trim();
    const count = parseInt(document.getElementById("qrCount").value);

    if (!prefix) {
        alert("Enter QR prefix");
        return;
    }

    if (!count || count <= 0) {
        alert("Enter valid QR count");
        return;
    }

    fetch("/admin/generate-qr", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ prefix, count })
    })
        .then(r => r.json())
        .then(res => {

            alert(res.message);

            loadQRPage();

        });

}

