let html5QrCode;
let flashOn = false;

function startScanner() {

    html5QrCode = new Html5Qrcode("reader");

    Html5Qrcode.getCameras().then(devices => {

        if (devices && devices.length) {

            // Prefer back camera if available
            let cameraId = devices.find(d =>
                d.label.toLowerCase().includes("back")
            )?.id || devices[0].id;

            html5QrCode.start(
                cameraId,
                {
                    fps: 10,
                    qrbox: 250
                },
                qrCodeMessage => {

                    // Subtle vibration
                    if (navigator.vibrate) {
                        navigator.vibrate(200);
                    }

                    // Stop scan animation line
                    const line = document.querySelector(".scan-line");
                    if (line) line.style.animation = "none";

                    // Small delay before redirect
                    setTimeout(() => {
                        window.location.href = qrCodeMessage;
                    }, 300);
                }
            );
        }

    }).catch(() => {
        alert("Camera permission required.");
    });
}


function closeScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            window.history.back();
        }).catch(() => {
            window.history.back();
        });
    } else {
        window.history.back();
    }
}


function toggleFlash() {

    if (!html5QrCode) return;

    const button = document.getElementById("flashBtn");

    html5QrCode.applyVideoConstraints({
        advanced: [{ torch: !flashOn }]
    }).then(() => {

        flashOn = !flashOn;

        // Visual state change
        if (flashOn) {
            button.style.color = "#3b5bff";
        } else {
            button.style.color = "white";
        }

    }).catch(() => {
        // Some phones don't support torch
        alert("Flash not supported on this device.");
    });
}


window.onload = startScanner;