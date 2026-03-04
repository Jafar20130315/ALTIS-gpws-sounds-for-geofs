// ==UserScript==
// @name         GPWS sounds, GeoFS (Full 26-Audio Master)
// @namespace    geofs.gpws.jafar
// @version      7.0
// @description  Full 26-audio suite from Avramovic: Windshear, Minimums, Don't Sink, and all Callouts.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    let soundsEnabled = false;
    let lastAltitude = 99999;
    let takeoffMode = false;
    const RAW_URL = "https://raw.githubusercontent.com/avramovic/GeoFS-alerts/7fc27f444cc167fb588cd28afebff0526e7c53c7/audio/";

    // 1. BARCHA 26 TA OVOZNI INTEGRATSIYA QILISH
    const AUDIO = {
        stall: new Audio(RAW_URL + "airbus-stall-warning.mp3"),
        whoop: new Audio(RAW_URL + "terrain-terrain-pull-up.mp3"),
        sink: new Audio(RAW_URL + "sink-rate.mp3"),
        gear: new Audio(RAW_URL + "too-low-gear.mp3"),
        flaps: new Audio(RAW_URL + "too-low-flaps.mp3"),
        terrain: new Audio(RAW_URL + "too-low-terrain.mp3"),
        bank: new Audio(RAW_URL + "bank-angle.mp3"),
        overspeed: new Audio(RAW_URL + "overspeed.mp3"),
        glideslope: new Audio(RAW_URL + "glideslope.mp3"),
        retard: new Audio(RAW_URL + "retard.mp3"),
        dontSink: new Audio(RAW_URL + "dont-sink.mp3"),
        windshear: new Audio(RAW_URL + "windshear.mp3"),
        mins: new Audio(RAW_URL + "minimums.mp3"),
        appMins: new Audio(RAW_URL + "approaching-minimums.mp3")
    };

    const CALLOUTS = {};
    [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10].forEach(h => {
        CALLOUTS[h] = new Audio(RAW_URL + h + ".mp3");
    });

    AUDIO.stall.loop = true;
    AUDIO.overspeed.loop = true;

    function stopAll() {
        [...Object.values(AUDIO), ...Object.values(CALLOUTS)].forEach(a => { a.pause(); a.currentTime = 0; });
    }

    function toggleGPWS() {
        soundsEnabled = !soundsEnabled;
        if (soundsEnabled) {
            Object.values(AUDIO).forEach(a => { let p = a.play(); if(p) p.then(()=>{a.pause(); a.currentTime=0;}).catch(()=>{}); });
        } else { stopAll(); }
        updateUI();
    }

    // [Q] tugmasi bilan yoqish/o'chirish
    document.addEventListener('keydown', (e) => {
        if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
        if (e.key.toLowerCase() === 'q') toggleGPWS();
    });

    function updateUI() {
        const bar = document.querySelector(".geofs-ui-bottom");
        if (!bar) return;
        let btn = document.getElementById("gpws-v7-btn") || document.createElement("div");
        if (!btn.id) { btn.id = "gpws-v7-btn"; btn.onclick = toggleGPWS; bar.appendChild(btn); }
        const isReplay = document.querySelector(".geofs-replay-container");
        btn.style.cssText = `display:inline-block; vertical-align:middle; margin-left:${isReplay ? '55px' : '10px'}; cursor:pointer; padding:5px 8px; border-radius:4px; background:${soundsEnabled ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)'}; transition:0.2s; z-index:9999;`;
        btn.innerHTML = `<span style="color:${soundsEnabled ? '#00ff00' : '#ccc'}; font-size:11px; font-weight:bold; font-family:sans-serif;">GPWS ${soundsEnabled ? 'ON' : 'OFF'} [Q]</span>`;
    }

    // 2. HAQIQIY PARVOZ MANTIQI (EGPWS MODALARI)
    function mainLoop() {
        if (!window.geofs?.animation?.values || !soundsEnabled || document.querySelector(".geofs-replay-container")) return;

        try {
            const v = window.geofs.animation.values;
            const ac = window.geofs.aircraft.instance;
            const alt = Math.round(v.altitude - v.groundElevationFeet);
            const vs = v.verticalSpeed;
            const kias = v.kias;
            const gearDown = v.gearPosition > 0.5;
            const ground = v.groundContact === 1;

            if (ground) { stopAll(); takeoffMode = (kias > 40); return; }

            // --- MODE 1: STALL ---
            if (ac.stalling || (v.aoa > 18 && kias < 110)) {
                if (AUDIO.stall.paused) { stopAll(); AUDIO.stall.play(); }
                return;
            } else { AUDIO.stall.pause(); }

            // --- MODE 2: WINDSHEAR (Simulated) ---
            if (alt < 1500 && Math.abs(vs) > 4000) {
                if (AUDIO.windshear.paused) AUDIO.windshear.play();
            }

            // --- MODE 3: DON'T SINK (Takeoff vaqtida balandlik yo'qotsa) ---
            if (takeoffMode && alt > 50 && alt < 700 && vs < -200) {
                if (AUDIO.dontSink.paused) AUDIO.dontSink.play();
            }

            // --- MODE 4: WHOOP WHOOP & SINK RATE ---
            if (alt < 1000 && vs < -3500) { if (AUDIO.whoop.paused) AUDIO.whoop.play(); }
            else { AUDIO.whoop.pause(); if (alt < 2500 && vs < -2200) { if (AUDIO.sink.paused) AUDIO.sink.play(); } else { AUDIO.sink.pause(); } }

            // --- MODE 5: MINIMUMS ---
            if (alt <= 300 && lastAltitude > 300) AUDIO.appMins.play();
            if (alt <= 200 && lastAltitude > 200) AUDIO.mins.play();

            // --- MODE 6: CONFIGURATION (Gear/Flaps) ---
            if (alt < 500 && alt > 30 && !gearDown) { if (AUDIO.gear.paused) AUDIO.gear.play(); }
            if (alt < 200 && alt > 30 && gearDown && v.flapsValue < 0.1) { if (AUDIO.flaps.paused) AUDIO.flaps.play(); }

            // --- CALLOUTS ---
            for (let h in CALLOUTS) {
                let h_val = parseInt(h);
                if (alt <= h_val && lastAltitude > h_val) CALLOUTS[h].play();
            }
            if (alt < 20 && lastAltitude >= 20) AUDIO.retard.play();

            // Bank Angle & Overspeed
            if (Math.abs(v.roll) > 45) { if (AUDIO.bank.paused) AUDIO.bank.play(); }
            if (kias > (ac.definition.vne || 450)) { if (AUDIO.overspeed.paused) AUDIO.overspeed.play(); } else { AUDIO.overspeed.pause(); }

            lastAltitude = alt;
        } catch (e) {}
    }

    setInterval(mainLoop, 150);
    setInterval(updateUI, 2000);
})();
