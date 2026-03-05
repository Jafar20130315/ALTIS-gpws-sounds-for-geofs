// ==UserScript==
// @name         Altis GeoFS
// @namespace    https://jafaras.uz/
// @version      8.2
// @description  Warning sounds for GeoFS.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @author       Jafar_AS
// @icon         https://i.ibb.co/Zpk1B4s3/Altis-icon-1.png
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    let soundsEnabled = false;
    let lastAltitude = 99999;
    let currentPriority = 0;
    let activeKey = null;      
    let activeAudio = null;
    let preloaded = false;
    let lastAutopilotState = false; // Avtopilot holatini saqlash uchun

    const RAW_URL = "https://raw.githubusercontent.com/avramovic/GeoFS-alerts/7fc27f444cc167fb588cd28afebff0526e7c53c7/audio/";

    // Audio fayllar (kalit -> filename)
    const SOUND_FILES = {
        stall:      "airbus-stall-warning.mp3",
        windshear:  "windshear.mp3",
        pullup:     "pull-up.mp3",
        terrain:    "terrain.mp3",
        whoop:      "terrain-terrain-pull-up.mp3",
        sink:       "sink-rate.mp3",
        dontsink:   "dont-sink.mp3",
        tooLowGear: "too-low-gear.mp3",
        tooLowFlaps:"too-low-flaps.mp3",
        tooLowTerrain:"too-low-terrain.mp3",
        glideslope: "glideslope.mp3",
        bank:       "bank-angle.mp3",
        retard:     "retard.mp3",
        mins:       "minimums.mp3",
        appMins:    "approaching-minimums.mp3",
        hundredAbove: "hundred-above.mp3",
        autopilotOff: "autopilot-off.mp3",
        autopilotOn:  "autopilot-on.mp3"
    };

    // Ob'ekt: key -> { audio: Audio, p:priority, loop: bool }
    const SOUNDS = {
        stall:      { audio: null, p: 10, loop: true },
        windshear:  { audio: null, p: 9, loop: false },
        pullup:     { audio: null, p: 9, loop: false },
        terrain:    { audio: null, p: 8, loop: false },
        whoop:      { audio: null, p: 8, loop: false },
        sink:       { audio: null, p: 7, loop: false },
        dontsink:   { audio: null, p: 6, loop: false },
        tooLowGear: { audio: null, p: 5, loop: false },
        tooLowFlaps:{ audio: null, p: 5, loop: false },
        tooLowTerrain:{ audio: null, p: 5, loop: false },
        glideslope: { audio: null, p: 4, loop: false },
        bank:       { audio: null, p: 3, loop: false },
        retard:     { audio: null, p: 2, loop: false },
        mins:       { audio: null, p: 2, loop: false },
        appMins:    { audio: null, p: 2, loop: false },
        hundredAbove:{ audio: null, p: 2, loop: false },
        autopilotOff:{ audio: null, p: 10, loop: false }, // AP uchun yuqori prioritet
        autopilotOn:{ audio: null, p: 10, loop: false }
    };

    const CALLOUTS = {};
    [2500, 2000, 1500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10].forEach(h => {
        CALLOUTS[h] = { audio: null, p: 1, filename: h + ".mp3" };
    });

    async function preloadAllAudio() {
        if (preloaded) return;
        const tasks = [];

        for (const key in SOUND_FILES) {
            const filename = SOUND_FILES[key];
            const url = RAW_URL + filename;
            tasks.push(fetch(url).then(r => {
                if (!r.ok) throw new Error("Fetch failed: " + url + " -> " + r.status);
                return r.blob();
            }).then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const a = new Audio(blobUrl);
                a.preload = "auto";
                a.crossOrigin = "anonymous";
                if (SOUNDS[key]) SOUNDS[key].audio = a;
            }).catch(err => {
                console.warn("Audio preload failed for", filename, err);
            }));
        }

        for (const h in CALLOUTS) {
            const filename = CALLOUTS[h].filename;
            const url = RAW_URL + filename;
            tasks.push(fetch(url).then(r => {
                if (!r.ok) throw new Error("Fetch failed: " + url);
                return r.blob();
            }).then(blob => {
                const blobUrl = URL.createObjectURL(blob);
                const a = new Audio(blobUrl);
                a.preload = "auto";
                a.crossOrigin = "anonymous";
                CALLOUTS[h].audio = a;
            }).catch(err => {
                console.warn("Callout preload failed for", filename, err);
            }));
        }

        await Promise.all(tasks);
        preloaded = true;
        console.log("GPWS: All audio correctly loaded.");
    }

    function playSafe(soundKey, isCallout = false) {
        const soundObj = isCallout ? CALLOUTS[soundKey] : SOUNDS[soundKey];
        if (!soundObj || !soundObj.audio) return;

        const prio = soundObj.p ?? 1;

        if (prio > currentPriority || !activeAudio || activeAudio.paused) {
            if (activeAudio) {
                try { activeAudio.pause(); } catch(e) {}
                try { activeAudio.currentTime = 0; } catch(e) {}
                if (activeKey && SOUNDS[activeKey]) SOUNDS[activeKey].audio && (SOUNDS[activeKey].audio.loop = false);
            }

            activeAudio = soundObj.audio;
            activeKey = isCallout ? ("callout_" + soundKey) : soundKey;
            currentPriority = prio;

            if (soundObj.loop) activeAudio.loop = true;

            const p = activeAudio.play();
            if (p && p.catch) {
                p.catch(err => {
                    currentPriority = 0;
                    activeKey = null;
                });
            }

            if (!soundObj.loop) {
                activeAudio.onended = () => {
                    if (activeKey === soundKey || (activeKey && activeKey.startsWith("callout_") && activeKey.endsWith(soundKey))) {
                        currentPriority = 0;
                        activeKey = null;
                    }
                };
            }
        }
    }

    function stopAll() {
        if (activeAudio) {
            try { activeAudio.pause(); activeAudio.currentTime = 0; } catch(e){}
            if (activeKey && SOUNDS[activeKey]) SOUNDS[activeKey].audio && (SOUNDS[activeKey].audio.loop = false);
        }
        currentPriority = 0;
        activeKey = null;
        activeAudio = null;
    }

    // Yaxshilangan Gear Detection (Shassi tekshiruvi)
    function gearIsDown(v, ac) {
        try {
            // Agar umuman shassi ma'lumoti bo'lmasa, demak bu Cessna 172 kabi doim ochiq shassili samolyot (Fixed gear).
            if (typeof v.gearTarget === "undefined" && typeof v.gearPosition === "undefined" && typeof v.gear === "undefined") {
                return true; 
            }
            
            // Retractable gear (yig'iladigan shassilar) uchun tekshiruv
            if (typeof v.gearTarget === "number") return v.gearTarget === 1; // 1 = down
            if (typeof v.gearPosition === "number") return v.gearPosition > 0.5; // o'rta holatdan pastda bo'lsa
            if (typeof v.gear === "boolean") return v.gear;

            return true; // Xavfsizlik uchun doim ochiq deb qabul qilamiz
        } catch (e) {
            return true;
        }
    }

    function mainLoop() {
        if (!window.geofs || !window.geofs.animation || !window.geofs.animation.values || !soundsEnabled) return;
        if (document.querySelector(".geofs-replay-container")) return; 

        try {
            const v = window.geofs.animation.values;
            const ac = window.geofs.aircraft && window.geofs.aircraft.instance ? window.geofs.aircraft.instance : null;
            const alt = Math.round((v.altitude || 0) - (v.groundElevationFeet || 0));
            const vs = v.verticalSpeed || 0;
            const kias = v.kias || 0;

            if (v.groundContact === 1) { stopAll(); lastAltitude = alt; return; }

            // Avtopilot holatini tekshirish
            const apOn = (ac && ac.autopilot && ac.autopilot.on) ? true : false;
            if (apOn && !lastAutopilotState) { playSafe('autopilotOn'); }
            if (!apOn && lastAutopilotState) { playSafe('autopilotOff'); }
            lastAutopilotState = apOn;

            // Stall
            const isStall = (ac && ac.stalling) || (typeof v.aoa === "number" && v.aoa > 18 && kias < 110);
            if (isStall) { playSafe('stall'); lastAltitude = alt; return; }
            else if (activeKey === 'stall') { stopAll(); }

            // Whoop / Sink
            if (alt < 1000 && vs < -3800) { playSafe('whoop'); }
            else if (alt < 2500 && vs < -2200) { playSafe('sink'); }

            // Gear & Flaps
            const gearDown = gearIsDown(v, ac); 
            const flapsValue = typeof v.flapsPosition === "number" ? v.flapsPosition : (typeof v.flapsTarget === "number" ? v.flapsTarget : (typeof v.flapsValue === "number" ? v.flapsValue : 1));

            // Too Low Gear (faqat aniq yig'ilgan bo'lsa chaladi)
            if (alt < 500 && alt > 50 && gearDown === false) { playSafe('tooLowGear'); }

            // Too Low Flaps
            if (alt < 200 && alt > 50 && gearDown === true && flapsValue < 0.1) { playSafe('tooLowFlaps'); }

            // Minimums
            if (alt <= 305 && lastAltitude > 305) playSafe('appMins');
            if (alt <= 205 && lastAltitude > 205) playSafe('mins');
            if (alt <= 100 && lastAltitude > 100) playSafe('hundredAbove');

            // Retard (Yerdan 20ft balandda, agar dvigatel quvvati tushirilmagan bo'lsa)
            if (alt <= 20 && lastAltitude > 20 && v.throttle > 0.1) playSafe('retard');

            // Callouts
            for (let h in CALLOUTS) {
                let h_val = parseInt(h);
                if (alt <= h_val && lastAltitude > h_val) {
                    playSafe(h, true);
                }
            }

            // Bank angle - TO'G'RILANGAN! GeoFS da roll qiymati v.aroll da o'lchanadi.
            const rollValue = typeof v.aroll === "number" ? v.aroll : (typeof v.roll === "number" ? v.roll : 0);
            if (Math.abs(rollValue) > 45) { playSafe('bank'); }

            lastAltitude = alt;
        } catch (e) {
            console.warn("GPWS mainLoop error", e);
        }
    }

    function toggleGPWS() {
        soundsEnabled = !soundsEnabled;
        updateUI();
        if (soundsEnabled) {
            preloadAllAudio().then(() => {
                try {
                    for (const k in SOUNDS) {
                        const s = SOUNDS[k];
                        if (s && s.audio) {
                            s.audio.volume = 0.001;
                            s.audio.play().then(()=>{ s.audio.pause(); s.audio.currentTime = 0; s.audio.volume = 1.0; }).catch(()=>{ s.audio.volume = 1.0; });
                        }
                    }
                } catch (e) {}
            }).catch(err => console.warn("GPWS preload error", err));
        } else {
            stopAll();
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.key && e.key.toLowerCase() === 'q') toggleGPWS();
    });

    function updateUI() {
        const bar = document.querySelector(".geofs-ui-bottom");
        if (!bar) return;
        let btn = document.getElementById("gpws-v8-btn-fixed") || document.createElement("div");
        if (!btn.id) {
            btn.id = "gpws-v8-btn-fixed";
            btn.onclick = toggleGPWS;
            bar.appendChild(btn);
        }
        btn.style.cssText = `
            display:inline-block;
            vertical-align:middle;
            margin-left:10px;
            cursor:pointer;
            padding:6px 12px;
            border-radius:6px;
            background:${soundsEnabled ? 'rgba(0,200,0,0.3)' : 'rgba(255,255,255,0.06)'};
            color:#fff;
            font-family:sans-serif;
            font-size:12px;
            font-weight:700;
            box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        `;
        btn.innerText = soundsEnabled ? 'GPWS: ACTIVE (click to disable)' : 'GPWS: OFF (click to enable)';
    }
    // updateUI: tugma va yangi logotip qo'shadi
function updateUI() {
    const bar = document.querySelector(".geofs-ui-bottom");
    if (!bar) return;
    let btn = document.getElementById("gpws-v8-btn-fixed") || document.createElement("div");
    if (!btn.id) {
        btn.id = "gpws-v8-btn-fixed";
        btn.onclick = toggleGPWS;
        bar.appendChild(btn);
    }
    btn.style.cssText = `
        display:inline-flex; /* Logotip va matnni bir qatorga tekislash */
        align-items:center;  /* Vertikal tekislash */
        margin-left:10px;
        cursor:pointer;
        padding:6px 12px;
        border-radius:6px;
        background:${soundsEnabled ? 'rgba(0,200,0,0.2)' : 'rgba(255,255,255,0.06)'};
        color:#fff;
        font-family:sans-serif;
        font-size:12px;
        font-weight:700;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        transition: background 0.3s;
    `;

    // Yangi Logotip URL manzili (bu yerda tasvir generatsiya qilinganidan keyin hosil bo'lgan URL bo'lishi kerak)
    const logoUrl = "https://raw.githubusercontent.com/Jafar20130315/gpwssounds_geofs/refs/heads/main/Altis-icon.png"; 

    const statusText = soundsEnabled ? 'Altis: ACTIVE' : 'Altis: OFF';
    const clickAction = soundsEnabled ? ' (click to disable)' : ' (click to enable)';

    btn.innerHTML = `
        <img src="${logoUrl}" alt="Altis Logo" style="height:16px; width:16px; margin-right:8px; display:inline-block; vertical-align:middle;">
        <span>${statusText}<span style="font-weight:400; opacity:0.7;">${clickAction}</span></span>
    `;
}

    setInterval(mainLoop, 150);
    setInterval(updateUI, 2000);

    console.log("GPWS Fixed Script loaded. Press [Q] to activate.");
})();
