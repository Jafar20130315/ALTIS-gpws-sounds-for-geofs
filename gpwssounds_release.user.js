// ==UserScript==
// @name         Altis GeoFS GPWS
// @namespace    https://jafaras.uz/
// @version      8.4
// @description  Realistic GPWS Warning sounds for GeoFS.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @author       Jafar
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
    let lastAutopilotState = false;
    let flareTimer = 0;
    let lastBankWarning = 0;

    // Ссылки на репозитории (оставил корень main, так как аудиофайлы скорее всего там)
    const AVRAMOVIC_URL = "https://raw.githubusercontent.com/avramovic/GeoFS-alerts/master/audio/";
    const JAFAR_URL = "https://raw.githubusercontent.com/Jafar20130315/gpwssounds_geofs/audio/";

    const SOUND_FILES = {
        stall:         { url: AVRAMOVIC_URL + "airbus-stall-warning.mp3", p: 10, loop: true },
        autopilotOff:  { url: AVRAMOVIC_URL + "airbus-autopilot-off.mp3", p: 10, loop: false },
        bank:          { url: AVRAMOVIC_URL + "bank-angle-bank-angle.mp3", p: 3, loop: false },
        retard:        { url: AVRAMOVIC_URL + "airbus-retard.mp3", p: 2, loop: false },
        whoop:         { url: AVRAMOVIC_URL + "gpws-whoop-whoop.mp3", p: 8, loop: false },
        pullup:        { url: AVRAMOVIC_URL + "terrain-terrain-pull-up.mp3", p: 9, loop: false },
        sink:          { url: AVRAMOVIC_URL + "sink-rate.mp3", p: 7, loop: false },
        tooLowGear:    { url: AVRAMOVIC_URL + "too-low-gear.mp3", p: 5, loop: false },
        tooLowFlaps:   { url: AVRAMOVIC_URL + "too-low-flaps.mp3", p: 5, loop: false },
        mins:          { url: AVRAMOVIC_URL + "minimums.mp3", p: 2, loop: false },
        appMins:       { url: AVRAMOVIC_URL + "approaching-minimums.mp3", p: 2, loop: false },

        // Твои файлы
        windshear:     { url: JAFAR_URL + "windshear.mp3", p: 9, loop: false },
        tooLowTerrain: { url: JAFAR_URL + "too-low-terrain.mp3", p: 5, loop: false },
        dontsink:      { url: JAFAR_URL + "dont-sink.mp3", p: 6, loop: false },
        glideslope:    { url: JAFAR_URL + "glideslope.mp3", p: 4, loop: false },
        longFlare:     { url: JAFAR_URL + "runway-too-short.mp3", p: 8, loop: false }
    };

    const SOUNDS = {};
    for (const key in SOUND_FILES) {
        SOUNDS[key] = { audio: null, p: SOUND_FILES[key].p, loop: SOUND_FILES[key].loop, url: SOUND_FILES[key].url };
    }

    const CALLOUT_HEIGHTS = [2500, 2000, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10, 5];
    const CALLOUTS = {};
    CALLOUT_HEIGHTS.forEach(h => {
        CALLOUTS[h] = { audio: null, p: 1, url: AVRAMOVIC_URL + h + ".mp3" };
    });

    async function preloadAllAudio() {
        if (preloaded) return;
        const tasks = [];

        for (const key in SOUNDS) {
            tasks.push(fetch(SOUNDS[key].url)
                .then(r => { if(!r.ok) throw new Error("404"); return r.blob(); })
                .then(blob => {
                    const a = new Audio(URL.createObjectURL(blob));
                    a.preload = "auto";
                    SOUNDS[key].audio = a;
                }).catch(e => console.warn(`Файл не найден (${key}): ${SOUNDS[key].url}`)));
        }

        for (const h in CALLOUTS) {
            tasks.push(fetch(CALLOUTS[h].url)
                .then(r => r.blob())
                .then(blob => {
                    const a = new Audio(URL.createObjectURL(blob));
                    a.preload = "auto";
                    CALLOUTS[h].audio = a;
                }).catch(e => {}));
        }

        await Promise.all(tasks);
        preloaded = true;
    }

    function playSafe(soundKey, isCallout = false) {
        const soundObj = isCallout ? CALLOUTS[soundKey] : SOUNDS[soundKey];
        if (!soundObj || !soundObj.audio || !soundsEnabled) return;

        const prio = soundObj.p ?? 1;

        // Жесткая и надежная система приоритетов
        if (prio >= currentPriority || !activeAudio || activeAudio.paused) {
            if (activeAudio && activeKey !== soundKey && activeKey !== ("callout_" + soundKey)) {
                activeAudio.pause();
                activeAudio.currentTime = 0;
            }

            activeAudio = soundObj.audio;
            activeKey = isCallout ? ("callout_" + soundKey) : soundKey;
            currentPriority = prio;

            if (soundObj.loop) activeAudio.loop = true;
            activeAudio.play().catch(() => {});

            activeAudio.onended = () => {
                currentPriority = 0;
                activeKey = null;
            };
        }
    }

    function stopAll() {
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.currentTime = 0;
            activeAudio.loop = false;
        }
        currentPriority = 0;
        activeKey = null;
        activeAudio = null;
    }

    function gearIsDown(v) {
        if (v.gearTarget !== undefined) return v.gearTarget === 1;
        if (v.gearPosition !== undefined) return v.gearPosition > 0.9;
        return true;
    }

    function mainLoop() {
        if (!window.geofs?.animation?.values || !soundsEnabled) return;
        if (document.querySelector(".geofs-replay-container")) return;

        const v = window.geofs.animation.values;
        const ac = window.geofs.aircraft?.instance;

        const alt = Math.round((v.altitude || 0) - (v.groundElevationFeet || 0));
        const vs = v.verticalSpeed || 0;
        const kias = v.kias || 0;
        const now = Date.now();

        if (v.groundContact === 1) {
            if (activeKey !== null) stopAll();
            lastAltitude = alt;
            flareTimer = 0;
            return;
        }

        const apOn = ac?.autopilot?.on || false;
        if (!apOn && lastAutopilotState) playSafe('autopilotOff');
        lastAutopilotState = apOn;

        const isStall = ac?.stalling || (v.aoa > 18 && kias < 110);
        if (isStall) {
            playSafe('stall');
        } else if (activeKey === 'stall') {
            stopAll();
        }

        // --- ВОССТАНОВЛЕНО: Чтение крена из v.aroll (из-за этого не работал Bank Angle) ---
        const rollAngle = Math.abs(v.aroll || v.roll || 0);
        if (rollAngle > 35 && (now - lastBankWarning > 3000)) {
            playSafe('bank');
            lastBankWarning = now;
        }

        // Windshear
        if (alt < 1000 && alt > 50 && vs < -1500 && v.throttle > 0.8) {
            playSafe('windshear');
        }

        // Pull up / Sink rate
        if (alt < 1000 && vs < -3500) playSafe('pullup');
        else if (alt < 2500 && vs < -2000) playSafe('sink');

        const gearDown = gearIsDown(v);
        const flaps = v.flapsPosition || 0;

        if (alt < 500 && alt > 50 && !gearDown) {
            playSafe('tooLowGear');
        } else if (alt < 200 && alt > 50 && gearDown && flaps < 0.1) {
            playSafe('tooLowFlaps');
        } else if (alt < 1000 && alt > 500 && !gearDown) {
            playSafe('tooLowTerrain');
        }

        // Long flare
        if (alt > 5 && alt < 30 && gearDown) {
            flareTimer += 100;
            if (flareTimer > 5000) {
                playSafe('longFlare');
                flareTimer = 0; // Сброс, чтобы звук не накладывался сам на себя
            }
        } else {
            flareTimer = 0;
        }

        if (alt <= 305 && lastAltitude > 305) playSafe('appMins');
        if (alt <= 205 && lastAltitude > 205) playSafe('mins');
        if (alt <= 20 && lastAltitude > 20 && v.throttle > 0.1) playSafe('retard');

        // Отсчет высот
        CALLOUT_HEIGHTS.forEach(h_val => {
            if (alt <= h_val && lastAltitude > h_val) playSafe(h_val.toString(), true);
        });

        lastAltitude = alt;
    }

    function toggleGPWS() {
        soundsEnabled = !soundsEnabled;
        if (soundsEnabled) {
            preloadAllAudio();
        } else {
            stopAll();
        }
        updateUI();
    }

    document.addEventListener('keydown', (e) => {
        if (e.key?.toLowerCase() === 'q') toggleGPWS();
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

        const logoUrl = "https://raw.githubusercontent.com/Jafar20130315/gpwssounds_geofs/refs/heads/main/Altis-icon.png";
        const statusText = soundsEnabled ? 'GPWS sounds on' : 'GPWS sounds off';
        const clickAction = soundsEnabled ? ' [Q]' : '[Q]';

        btn.style.cssText = `
            display:inline-flex;
            align-items:center;
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
        `;

        btn.innerHTML = `
            <img src="${logoUrl}" style="height:16px; width:16px; margin-right:8px;">
            <span>${statusText}<span style="font-weight:400; opacity:0.7;"> ${clickAction}</span></span>
        `;
    }

    setInterval(mainLoop, 100);
    setInterval(updateUI, 2000);

})();
