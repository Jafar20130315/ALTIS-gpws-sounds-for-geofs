// ==UserScript==
// @name         GPWS sounds, GeoFS.
// @namespace    geofs.gpws.jafar
// @version      4.1
// @description  Hear a warning sounds, it helps you to fly carefully. Optimized UI for Replay mode.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    const ICON_URL = "https://cdn-icons-png.flaticon.com/512/2800/2800000.png";
    const WATER_PLANES = ["Canadair CL-415", "DHC-6 Twin Otter", "Cessna 172 (Floats)", "Icon A5"];
    
    let soundsEnabled = false;
    let lastAltitude = 99999;
    let activeWarning = null;

    const AUDIO = {
        stall: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/airbus-stall-warning.mp3"),
        pull: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/terrain-terrain-pull-up.mp3"),
        sink: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/sink-rate.mp3"),
        gear: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/too-low-gear.mp3"),
        bank: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/bank-angle.mp3")
    };

    const CALLOUTS = {
        1000: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/1000.mp3"),
        500: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/500.mp3"),
        100: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/100.mp3"),
        50: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/50.mp3"),
        10: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/10.mp3")
    };

    function stopAll() {
        [...Object.values(AUDIO), ...Object.values(CALLOUTS)].forEach(a => { 
            a.pause(); 
            a.currentTime = 0; 
        });
        activeWarning = null;
    }

    // ================= PERSISTENT & ADAPTIVE UI =================
    function injectButton() {
        const bottomBar = document.querySelector(".geofs-ui-bottom");
        if (!bottomBar) return;

        // Repliy rejimini tekshirish (pastdagi EXIT PLAYER yozuvi orqali)
        const isReplay = document.querySelector(".geofs-replay-container") || document.body.innerText.includes("EXIT PLAYER");
        let btn = document.getElementById("gpws-stable-btn");

        if (!btn) {
            btn = document.createElement("div");
            btn.id = "gpws-stable-btn";
            btn.onclick = (e) => {
                e.stopPropagation();
                soundsEnabled = !soundsEnabled;
                if (!soundsEnabled) {
                    stopAll();
                } else {
                    [...Object.values(AUDIO), ...Object.values(CALLOUTS)].forEach(a => {
                        let p = a.play();
                        if(p) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
                    });
                }
                injectButton(); 
            };
            bottomBar.appendChild(btn);
        }

        // Repliy rejimida tugmani xalaqit bermasligi uchun suramiz
        btn.style = `
            display: inline-block;
            vertical-align: middle;
            margin-left: ${isReplay ? '25px' : '10px'}; 
            cursor: pointer;
            padding: 5px 8px;
            border-radius: 4px;
            background: ${soundsEnabled ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
            transition: 0.2s;
            z-index: 10000;
        `;
        
        btn.innerHTML = `
            <img src="${ICON_URL}" width="20" height="20" style="vertical-align:middle; filter:${soundsEnabled ? 'none' : 'grayscale(1)'};"> 
            <span style="color:${soundsEnabled ? '#00ff00' : '#aaa'}; font-size:11px; font-family:sans-serif; font-weight:bold; margin-left:5px;">
                GPWS ${soundsEnabled ? 'ON' : 'OFF'}
            </span>
        `;
    }

    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });

    // ================= MAIN SIMULATION LOOP =================
    function mainLoop() {
        const isReplay = document.querySelector(".geofs-replay-container") || document.body.innerText.includes("EXIT PLAYER");
        if (!window.geofs?.animation?.values || !soundsEnabled || isReplay) return;

        const v = window.geofs.animation.values;
        const aircraftName = window.geofs.aircraft?.instance?.definition?.name || "";
        const alt = Math.round(v.altitude - v.groundElevationFeet);
        const vs = Math.round(v.verticalSpeed);
        const roll = Math.abs(v.roll);
        const gearIsDown = v.gearPosition > 0.5;
        const ground = v.groundContact === 1;
        const stall = window.geofs.aircraft?.instance?.stalling;

        if (ground) {
            stopAll();
            return;
        }

        if (stall) {
            if (AUDIO.stall.paused) AUDIO.stall.play();
            activeWarning = 'stall';
        } else {
            if (!AUDIO.stall.paused) { AUDIO.stall.pause(); AUDIO.stall.currentTime = 0; }
            
            if (alt < 1000 && vs < -3200) {
                if (AUDIO.pull.paused) AUDIO.pull.play();
                activeWarning = 'pull';
            } else {
                if (!AUDIO.pull.paused) { AUDIO.pull.pause(); AUDIO.pull.currentTime = 0; }
                
                if (alt < 2500 && vs < -2100) {
                    if (AUDIO.sink.paused) AUDIO.sink.play();
                    activeWarning = 'sink';
                } else {
                    if (!AUDIO.sink.paused) { AUDIO.sink.pause(); AUDIO.sink.currentTime = 0; }
                }
            }
        }

        if (roll > 35) {
            if (AUDIO.bank.paused) AUDIO.bank.play();
        } else {
            if (!AUDIO.bank.paused) { AUDIO.bank.pause(); AUDIO.bank.currentTime = 0; }
        }

        const isWaterPlane = WATER_PLANES.some(name => aircraftName.includes(name));
        if (!isWaterPlane && alt < 500 && alt > 35 && !gearIsDown) {
            if (AUDIO.gear.paused) AUDIO.gear.play();
        } else {
            if (!AUDIO.gear.paused) { AUDIO.gear.pause(); AUDIO.gear.currentTime = 0; }
        }

        for (let h in CALLOUTS) {
            let h_val = parseInt(h);
            if (alt <= h_val && lastAltitude > h_val) {
                CALLOUTS[h].play().catch(() => {});
            }
        }
        lastAltitude = alt;
    }

    setInterval(mainLoop, 200);
    setInterval(injectButton, 1000);

})();
