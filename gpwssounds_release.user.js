// ==UserScript==
// @name         Altis GeoFS
// @namespace    https://jafaras.uz/
// @version      8.1
// @description  Warning sounds for GeoFS.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    let soundsEnabled = false;
    let lastAltitude = 99999;
    let currentPriority = 0;
    let activeKey = null;      // hozir chalayotgan ovoz kaliti
    let activeAudio = null;
    let preloaded = false;

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
        autopilotOff:{ audio: null, p: 2, loop: false },
        autopilotOn:{ audio: null, p: 2, loop: false }
    };

    // Callouts (heights):  key = height number -> { audio:null, p:1 }
    const CALLOUTS = {};
    [2500, 2000, 1500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10].forEach(h => {
        CALLOUTS[h] = { audio: null, p: 1, filename: h + ".mp3" };
    });

    // PRELOAD: fetch barcha audiolarni blob qilib, keyga Audio yarating.
    async function preloadAllAudio() {
        if (preloaded) return;
        const tasks = [];

        // SOUNDS
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
                if (SOUNDS[key]) {
                    SOUNDS[key].audio = a;
                } else {
                    // safety
                    SOUNDS[key] = { audio: a, p: 1, loop: false };
                }
            }).catch(err => {
                console.warn("Audio preload failed for", filename, err);
            }));
        }

        // CALLOUTS
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

        // Barchasini kut
        await Promise.all(tasks);
        preloaded = true;
        console.log("GPWS: all audio preload attempted");
    }

    // Play-safe: endi activeKey orqali tekshiradi
    function playSafe(soundKey, isCallout = false) {
        const soundObj = isCallout ? CALLOUTS[soundKey] : SOUNDS[soundKey];
        if (!soundObj || !soundObj.audio) {
            // audio yo'q bo'lsa, sinab ko'rish uchun preload qayta boshlash
            console.warn("GPWS: audio not ready for", soundKey);
            return;
        }

        const prio = soundObj.p ?? 1;

        // Agar yangi ovozning prioriteti baland yoki hozir hech nima chalmas ekan
        if (prio > currentPriority || !activeAudio || activeAudio.paused) {
            // Agar hozir loop ovoz bo'lsa yoki boshqa ovoz bo'lsa, to'xtat
            if (activeAudio) {
                try { activeAudio.pause(); } catch(e) {}
                try { activeAudio.currentTime = 0; } catch(e) {}
                if (activeKey && SOUNDS[activeKey]) SOUNDS[activeKey].audio && (SOUNDS[activeKey].audio.loop = false);
            }

            activeAudio = soundObj.audio;
            activeKey = isCallout ? ("callout_" + soundKey) : soundKey;
            currentPriority = prio;

            if (soundObj.loop) activeAudio.loop = true;

            // play va error handling
            const p = activeAudio.play();
            if (p && p.catch) {
                p.catch(err => {
                    console.warn("GPWS: play() failed for", soundKey, err);
                    currentPriority = 0;
                    activeKey = null;
                });
            } else {
                // no promise (old browsers) - ignore
            }

            // qaytadan o'rnatish
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
            // remove loop flag for previously looping
            if (activeKey && SOUNDS[activeKey]) SOUNDS[activeKey].audio && (SOUNDS[activeKey].audio.loop = false);
        }
        currentPriority = 0;
        activeKey = null;
        activeAudio = null;
    }

    // Gear detection: turli geoFS versiyalar uchun per-heuristic tekshiradi.
    // Return: true = gear down, false = gear up (retracted), null = unknown
    function gearIsDown(values, aircraftInstance) {
        try {
            // 1) animation.values may have gearPosition (0..1). Biz mappingni avtomatik aniqlashga harakat qilamiz:
            if (typeof values.gearPosition === "number") {
                // Heuristika: agar qiymat 0 yoki 1 bo'lsa - tekshir
                if (values.gearPosition === 0 || values.gearPosition === 1) {
                    // Ba'zi versiyalarda 1 = down, ba'zilarida 1 = up. Aniqlash uchun hozirgi altitudega qarab faraz qilamiz:
                    // Agar yerga yaqin va gearPosition === 1 => ehtimol down.
                    if (values.altitude - (values.groundElevationFeet || 0) < 200) {
                        // yaqin - deb =1 => down
                        return values.gearPosition === 1 ? true : false;
                    } else {
                        // balandlikda 1 => ehtimol up
                        return values.gearPosition === 1 ? false : true;
                    }
                } else {
                    // qiymat 0..1 orasida - > 0.5 deb down deb hisoblaymiz (ko'pchilikda shunday)
                    return values.gearPosition > 0.5;
                }
            }

            // 2) aircraftInstance may have landingGear or gear state
            if (aircraftInstance && typeof aircraftInstance.landingGear !== "undefined") {
                const lg = aircraftInstance.landingGear;
                // possible properties: deployed (bool), position (0..1), down (bool)
                if (typeof lg.deployed === "boolean") return lg.deployed;
                if (typeof lg.down === "boolean") return lg.down;
                if (typeof lg.position === "number") return lg.position > 0.5;
            }

            // 3) sometimes values.gear (boolean) exists
            if (typeof values.gear === "boolean") return values.gear;

            // Agar hech narsa topilmasa: unknown
            return null;
        } catch (e) {
            console.warn("GPWS: gearIsDown error", e);
            return null;
        }
    }

    // ASOSIY LOOP
    function mainLoop() {
        if (!window.geofs || !window.geofs.animation || !window.geofs.animation.values || !soundsEnabled) return;
        if (document.querySelector(".geofs-replay-container")) return; // replay rejimida ovoz bermaymiz

        try {
            const v = window.geofs.animation.values;
            const ac = window.geofs.aircraft && window.geofs.aircraft.instance ? window.geofs.aircraft.instance : null;
            const alt = Math.round((v.altitude || 0) - (v.groundElevationFeet || 0));
            const vs = v.verticalSpeed || 0;
            const kias = v.kias || 0;

            if (v.groundContact === 1) { stopAll(); lastAltitude = alt; return; }

            // Stall
            const isStall = (ac && ac.stalling) || (typeof v.aoa === "number" && v.aoa > 18 && kias < 110);
            if (isStall) { playSafe('stall'); lastAltitude = alt; return; }
            else if (activeKey === 'stall') { stopAll(); }

            // Whoop / sink
            if (alt < 1000 && vs < -3800) { playSafe('whoop'); }
            else if (alt < 2500 && vs < -2200) { playSafe('sink'); }

            // Configuration: gear/flaps - foydalanish uchun gearIsDown aniq false bo'lishi talab qilinadi
            const gearDown = gearIsDown(v, ac); // true/false/null

            // Too Low Gear: chalish faqat agar aniq ma'lumot bo'lib gear retracted (false)
            if (alt < 500 && alt > 50 && gearDown === false) { playSafe('tooLowGear'); }

            // Too Low Flaps: chalish faqat agar aniq ma'lumot mavjud va flaps juda kichik
            if (alt < 200 && alt > 50 && gearDown === true && typeof v.flapsValue === "number" && v.flapsValue < 0.1) { playSafe('tooLowFlaps'); }

            // Minimums
            if (alt <= 305 && lastAltitude > 305) playSafe('appMins');
            if (alt <= 205 && lastAltitude > 205) playSafe('mins');
            if (alt <= 100 && lastAltitude > 100) playSafe('hundredAbove');

            // Callouts
            for (let h in CALLOUTS) {
                let h_val = parseInt(h);
                if (alt <= h_val && lastAltitude > h_val) {
                    playSafe(h, true);
                }
            }

            // Bank angle
            if (typeof v.roll === "number" && Math.abs(v.roll) > 45) { playSafe('bank'); }

            lastAltitude = alt;
        } catch (e) {
            console.warn("GPWS mainLoop error", e);
        }
    }

    // UI: toggle + preload har clickda bajarilsin
    function toggleGPWS() {
        soundsEnabled = !soundsEnabled;
        updateUI();
        if (soundsEnabled) {
            // preloading boshlash va Audio unlock uchun foydalanuvchi actioni (click) kerak
            preloadAllAudio().then(() => {
                // audiolarni tez sinab ko'rish: kichik oynatda past hajmda
                try {
                    // o'ynatib darhol to'xtatish orqali unlock qilishga harakat
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

    // Q tugmasi bilan ham ochish
    document.addEventListener('keydown', (e) => {
        if (e.key && e.key.toLowerCase() === 'q') toggleGPWS();
    });

    // updateUI: tugma qo'shadi (foydalanuvchi bosishi kerak)
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

    // Start intervals
    setInterval(mainLoop, 150);
    setInterval(updateUI, 2000);

    // Small console hint
    console.log("GPWS script loaded. Press [Q] or click GPWS button below UI to enable sounds (first click will preload & unlock audio).");
})();
