document.addEventListener("DOMContentLoaded", () => {

    const loginBox = document.getElementById("loginBox");
    const dashboard = document.getElementById("dashboard");
    const loginError = document.getElementById("loginError");

    /* ---------------- LOGIN ---------------- */
    window.login = function () {
        fetch("/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: document.getElementById("username").value,
                password: document.getElementById("password").value
            })
        })
            .then(r => r.json())
            .then(res => {
                if (!res.success) {
                    loginError.innerText = "Invalid credentials";
                    return;
                }
                loginBox.classList.add("hidden");
                dashboard.classList.remove("hidden");
                loadAnalytics();
                loadSettings();
            })
            .catch(err => {
                loginError.innerText = "Server error";
                console.error(err);
            });
    };

    window.logout = function () {
        fetch("/admin/logout").then(() => location.reload());
    };

    /* ---------------- ISSUE SINGLE ---------------- */
    window.issueSingle = function () {
        const id = document.getElementById("singleId").value.trim();
        if (!id) return alert("Enter sticker ID");

        fetch(`/admin/issue-sticker/${id}`)
            .then(r => r.text())
            .then(msg => {
                alert(msg);
                loadAnalytics();
            })
            .catch(err => {
                alert("Failed to issue sticker");
                console.error(err);
            });
    };

    /* ---------------- ISSUE BULK ---------------- */
    window.issueBulk = function () {
        const prefix = document.getElementById("prefix").value.trim();
        const from = Number(document.getElementById("from").value);
        const to = Number(document.getElementById("to").value);

        if (!prefix || !from || !to || from > to) {
            return alert("Invalid bulk range");
        }

        fetch("/admin/issue-batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prefix, from, to })
        })
            .then(r => r.json())
            .then(res => {
                alert(`Issued ${res.issued} stickers`);
                loadAnalytics();
            })
            .catch(err => {
                alert("Bulk issue failed");
                console.error(err);
            });
    };

    /* ---------------- ANALYTICS ---------------- */
    function loadAnalytics() {
        fetch("/admin/analytics")
            .then(r => {
                if (r.status === 401) {
                    alert("Session expired. Please login again.");
                    location.reload();
                    return;
                }
                return r.json();
            })
            .then(rows => {
                const body = document.getElementById("analyticsBody");
                body.innerHTML = "";
                rows.forEach(r => {
                    body.innerHTML += `
            <tr>
              <td>${r.sticker_id}</td>
              <td>${r.total_scans}</td>
              <td>${r.emergencies}</td>
              <td>${r.last_scan || "-"}</td>
            </tr>`;
                });
            });
    }

    /* ---------------- SETTINGS ---------------- */
    function loadSettings() {
        fetch("/admin/settings")
            .then(r => r.json())
            .then(s => {
                const kw = document.getElementById("killWhatsapp");
                const ke = document.getElementById("killEmergency");

                kw.checked = s.disable_whatsapp === "true";
                ke.checked = s.disable_emergency === "true";

                kw.onchange = () => updateSetting("disable_whatsapp", kw.checked);
                ke.onchange = () => updateSetting("disable_emergency", ke.checked);
            });
    }

    function updateSetting(key, value) {
        fetch("/admin/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, value: String(value) })
        });
    }

});
