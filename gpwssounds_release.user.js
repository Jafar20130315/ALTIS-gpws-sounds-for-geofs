// ==UserScript==
// @name         GPWS sounds, GeoFS. 
// @namespace    geofs.gpws.jafar
// @version      4.0
// @description  Hear a warning sounds, it helps you to fly carefully.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    const ICON_URL = "https://cdn-icons-png.flaticon.com/512/2800/2800000.png";

    const WATER_PLANES = ["Canadair CL-415", "DHC-6 Twin Otter", "Cessna 172 (Floats)", "Icon A5"];

    const AUDIO = {
        stall: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/airbus-stall-warning.mp3"),
        pull: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/terrain-terrain-pull-up.mp3"),
        sink: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/sink-rate.mp3"),
        gear: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/too-low-gear.mp3"),
        overspeed: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/overspeed.mp3"),
        bank: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/bank-angle.mp3")
    };

    const CALLOUTS = {
        1000: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/1000.mp3"),
        500: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/500.mp3"),
        400: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/400.mp3"),
        300: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/300.mp3"),
        200: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/200.mp3"),
        100: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/100.mp3"),
        50: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/50.mp3"),
        40: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/40.mp3"),
        30: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/30.mp3"),
        20: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/20.mp3"),
        10: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/10.mp3")
    };

    let soundsEnabled = false;
    let lastAltitude = 99999;
    let activeWarning = null;

    // Barcha ovozlarni to'xtatish funksiyasi
    function stopAllSounds() {
        Object.values(AUDIO).forEach(a => { a.pause(); a.currentTime = 0; });
        Object.values(CALLOUTS).forEach(a => { a.pause(); a.currentTime = 0; });
        activeWarning = null;
    }

    // ================= UI SETUP =================
    function createUI() {
        const bottomBar = document.querySelector(".geofs-ui-bottom");
        if (!bottomBar || document.getElementById("gpws-bottom-icon")) return;

        const uiBtn = document.createElement("div");
        uiBtn.id = "gpws-bottom-icon";
        uiBtn.style = "display:inline-block; vertical-align:middle; margin-left:15px; cursor:pointer; padding: 5px; border-radius: 5px; transition:0.3s; background: rgba(255,255,255,0.1);";
        uiBtn.innerHTML = `<img src="${ICON_URL}" width="20" height="20" style="vertical-align:middle; filter: grayscale(1);"> <span id="gpws-txt" style="color:#aaa; font-size:11px; font-weight:bold; font-family:sans-serif; margin-left:5px;">GPWS OFF</span>`;
        
        bottomBar.appendChild(uiBtn);

        uiBtn.onclick = () => {
            soundsEnabled = !soundsEnabled;
            
            if (soundsEnabled) {
                uiBtn.style.background = "rgba(0, 255, 0, 0.2)";
                uiBtn.querySelector("img").style.filter = "none";
                document.getElementById("gpws-txt").innerText = "GPWS ON";
                document.getElementById("gpws-txt").style.color = "#00ff00";

                // MUHIM: Brauzerda barcha ovozlarni aktivlashtirish (Warm-up)
                const allAudio = [...Object.values(AUDIO), ...Object.values(CALLOUTS)];
                allAudio.forEach(a => {
                    let p = a.play();
                    if (p !== undefined) p.then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
                });
            } else {
                uiBtn.style.background = "rgba(255, 255, 255, 0.1)";
                uiBtn.querySelector("img").style.filter = "grayscale(1)";
                document.getElementById("gpws-txt").innerText = "GPWS OFF";
                document.getElementById("gpws-txt").style.color = "#aaa";
                stopAllSounds(); // O'chirilganda darhol jimjitlik
            }
        };
    }

    // ================= LOGIC =================
    function playAlert(type) {
        if (!soundsEnabled) return;
        // Agar Stall bo'lsa, u boshqa barcha ogohlantirishlarni bosib tushadi
        if (activeWarning === 'stall' && type !== 'stall') return;
        
        if (activeWarning && activeWarning !== type && !AUDIO[activeWarning].paused) return;
        
        activeWarning = type;
        if (AUDIO[type].paused) AUDIO[type].play().catch(()=>{});
    }

    function stopAlert(type) {
        if (AUDIO[type] && !AUDIO[type].paused) {
            AUDIO[type].pause();
            AUDIO[type].currentTime = 0;
            if (activeWarning === type) activeWarning = null;
        }
    }

    function mainLoop() {
        if (!window.geofs?.animation?.values || !window.geofs?.aircraft?.instance) return;

        let values = window.geofs.animation.values;
        let aircraftName = window.geofs.aircraft.instance.definition.name;
        let alt = Math.round(values.altitude - values.groundElevationFeet);
        let vs = Math.round(values.verticalSpeed);
        let roll = Math.abs(values.roll);
        let gearIsDown = values.gearPosition > 0.5;
        let ground = values.groundContact === 1;
        let stall = window.geofs.aircraft.instance.stalling;

        if (!soundsEnabled) return;

        if (ground) {
            stopAllSounds();
            return;
        }

        // Warnings Priority Logic
        if (stall) {
            playAlert('stall');
        } else {
            stopAlert('stall');
            if (alt < 1000 && vs < -3200) playAlert('pull');
            else {
                stopAlert('pull');
                if (alt < 2500 && vs < -2100) playAlert('sink');
                else stopAlert('sink');
            }
        }

        if (roll > 35) playAlert('bank'); else stopAlert('bank');

        // Smart Gear Logic
        let isWaterPlane = WATER_PLANES.some(name => aircraftName.includes(name));
        if (!isWaterPlane && alt < 500 && alt > 35 && !gearIsDown) playAlert('gear');
        else stopAlert('gear');

        // Callouts (1000...10)
        for (let h in CALLOUTS) {
            let height = parseInt(h);
            if (alt <= height && lastAltitude > height) {
                CALLOUTS[h].play().catch(()=>{});
            }
        }
        lastAltitude = alt;
    }

    // UI-ni doimiy tekshirib turish (agar o'yin UI-ni yangilasa, tugma o'chib ketmasligi uchun)
    setInterval(() => {
        if (window.geofs && window.geofs.animation) {
            createUI();
        }
    }, 2000);

    // Asosiy siklni boshlash
    setInterval(mainLoop, 200);

})();
