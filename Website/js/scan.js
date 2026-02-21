let html5QrCode;
let currentCameraId;

function startScanner() {
    html5QrCode = new Html5Qrcode("preview");

    Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length) {
            currentCameraId = devices[0].id;

            html5QrCode.start(
                currentCameraId,
                {
                    fps: 10,
                    qrbox: 250
                },
                qrCodeMessage => {
                    window.location.href = qrCodeMessage;
                }
            );
        }
    }).catch(err => {
        alert("Camera permission required.");
    });
}

function toggleFlash() {
    if (!html5QrCode) return;

    html5QrCode.getRunningTrackSettings()
        .then(settings => {
            const track = html5QrCode.getRunningTrack();
            const capabilities = track.getCapabilities();

            if (capabilities.torch) {
                track.applyConstraints({
                    advanced: [{ torch: true }]
                });
            }
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

window.onload = startScanner;