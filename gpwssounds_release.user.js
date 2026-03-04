// ==UserScript==
// @name         Altis, GPWS Sounds for Geo-fs
// @namespace    https://jafaras.uz/
// @version      8.0
// @description  Advanced Priority Queue, Anti-Overlapping Logic, and 26-Audio Support.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    let soundsEnabled = false;
    let lastAltitude = 99999;
    let currentPriority = 0; // 0 - bo'sh, 10 - eng yuqori (Stall)
    let activeAudio = null;

    const RAW_URL = "https://raw.githubusercontent.com/avramovic/GeoFS-alerts/7fc27f444cc167fb588cd28afebff0526e7c53c7/audio/";

    // 1. OVOZLAR VA ULARNING PRIORITETI (1-10)
    const SOUNDS = {
        stall:     { audio: new Audio(RAW_URL + "airbus-stall-warning.mp3"), p: 10, loop: true },
        windshear: { audio: new Audio(RAW_URL + "windshear.mp3"), p: 9, loop: false },
        whoop:     { audio: new Audio(RAW_URL + "terrain-terrain-pull-up.mp3"), p: 8, loop: false },
        sink:      { audio: new Audio(RAW_URL + "sink-rate.mp3"), p: 7, loop: false },
        terrain:   { audio: new Audio(RAW_URL + "too-low-terrain.mp3"), p: 6, loop: false },
        gear:      { audio: new Audio(RAW_URL + "too-low-gear.mp3"), p: 5, loop: false },
        flaps:     { audio: new Audio(RAW_URL + "too-low-flaps.mp3"), p: 5, loop: false },
        glideslope:{ audio: new Audio(RAW_URL + "glideslope.mp3"), p: 4, loop: false },
        bank:      { audio: new Audio(RAW_URL + "bank-angle.mp3"), p: 3, loop: false },
        dontsink:  { audio: new Audio(RAW_URL + "dont-sink.mp3"), p: 5, loop: false },
        retard:    { audio: new Audio(RAW_URL + "retard.mp3"), p: 2, loop: false },
        mins:      { audio: new Audio(RAW_URL + "minimums.mp3"), p: 2, loop: false },
        appMins:   { audio: new Audio(RAW_URL + "approaching-minimums.mp3"), p: 2, loop: false }
    };

    const CALLOUTS = {};
    [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10].forEach(h => {
        CALLOUTS[h] = { audio: new Audio(RAW_URL + h + ".mp3"), p: 1 };
    });

    // 2. AUDIO MANAGER (Ovozlarni tartibga soluvchi "militsiya")
    function playSafe(soundKey, isCallout = false) {
        const soundObj = isCallout ? CALLOUTS[soundKey] : SOUNDS[soundKey];
        if (!soundObj) return;

        // Agar yangi ovozning prioriteti hozirgisidan baland bo'lsa yoki hozir hech nima chalmayotgan bo'lsa
        if (soundObj.p > currentPriority || (activeAudio && activeAudio.paused)) {
            if (activeAudio) {
                activeAudio.pause();
                activeAudio.currentTime = 0;
            }

            activeAudio = soundObj.audio;
            currentPriority = soundObj.p;
            
            if (soundObj.loop) activeAudio.loop = true;
            
            let playPromise = activeAudio.play();
            if (playPromise) {
                playPromise.then(() => {
                    // Ovoz tugagach prioritetni nolga tushirish (faqat loop bo'lmasa)
                    if (!soundObj.loop) {
                        activeAudio.onended = () => { currentPriority = 0; };
                    }
                }).catch(() => { currentPriority = 0; });
            }
        }
    }

    function stopAll() {
        if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; }
        currentPriority = 0;
    }

    // 3. ASOSIY MANTIQ
    function mainLoop() {
        if (!window.geofs?.animation?.values || !soundsEnabled || document.querySelector(".geofs-replay-container")) return;

        try {
            const v = window.geofs.animation.values;
            const ac = window.geofs.aircraft.instance;
            const alt = Math.round(v.altitude - v.groundElevationFeet);
            const vs = v.verticalSpeed;
            const kias = v.kias;
            const gear = v.gearPosition > 0.5;

            if (v.groundContact === 1) { stopAll(); return; }

            // --- SHARTLARNI TEKSHIRISH ---
            
            // 1. Stall
            if (ac.stalling || (v.aoa > 18 && kias < 110)) { playSafe('stall'); return; } 
            else if (activeAudio === SOUNDS.stall.audio) { stopAll(); }

            // 2. Whoop Whoop / Sink Rate
            if (alt < 1000 && vs < -3800) { playSafe('whoop'); }
            else if (alt < 2500 && vs < -2200) { playSafe('sink'); }

            // 3. Configuration (Gear/Flaps)
            if (alt < 500 && alt > 50 && !gear) { playSafe('gear'); }
            if (alt < 200 && alt > 50 && gear && v.flapsValue < 0.1) { playSafe('flaps'); }

            // 4. Minimums
            if (alt <= 305 && lastAltitude > 305) playSafe('appMins');
            if (alt <= 205 && lastAltitude > 205) playSafe('mins');

            // 5. Callouts
            for (let h in CALLOUTS) {
                let h_val = parseInt(h);
                if (alt <= h_val && lastAltitude > h_val) {
                    playSafe(h, true);
                }
            }

            // 6. Bank Angle
            if (Math.abs(v.roll) > 45) { playSafe('bank'); }

            lastAltitude = alt;
        } catch (e) {}
    }

    // UI VA BOSHQARUV
    function toggleGPWS() {
        soundsEnabled = !soundsEnabled;
        if (!soundsEnabled) stopAll();
        // Unlock Audio
        Object.values(SOUNDS).forEach(s => { s.audio.play().then(()=> {s.audio.pause(); s.audio.currentTime=0;}).catch(()=>{}); });
        updateUI();
    }

    document.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'q') toggleGPWS(); });

    function updateUI() {
        const bar = document.querySelector(".geofs-ui-bottom");
        if (!bar) return;
        let btn = document.getElementById("gpws-v8-btn") || document.createElement("div");
        if (!btn.id) { btn.id = "gpws-v8-btn"; btn.onclick = toggleGPWS; bar.appendChild(btn); }
        btn.style.cssText = `display:inline-block; vertical-align:middle; margin-left:10px; cursor:pointer; padding:5px 10px; border-radius:4px; background:${soundsEnabled ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255,255,255,0.1)'}; color:white; font-family:sans-serif; font-size:11px; font-weight:bold;`;
        btn.innerText = `GPWS: ${soundsEnabled ? 'ACTIVE' : 'OFF'} [Q]`;
    }

    setInterval(mainLoop, 150);
    setInterval(updateUI, 2000);
})();
