// ==UserScript==
// @name         GPWS sounds, GeoFS.
// @namespace    geofs.gpws.jafar
// @version      4.6
// @description  Full GPWS & Alerts Pack. Optimized for stability and Replay mode.
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    // O'yin yuklanishini kutish funksiyasi (Ko'k ekran bo'lmasligi uchun)
    function startScript() {
        if (window.geofs && window.geofs.animation && window.geofs.animation.values) {
            console.log("GPWS: GeoFS detected, initializing...");
            initGPWS();
        } else {
            setTimeout(startScript, 1000); // 1 sekund kutib qayta tekshirish
        }
    }

    function initGPWS() {
        const ICON_URL = "https://cdn-icons-png.flaticon.com/512/2800/2800000.png";
        const WATER_PLANES = ["Canadair CL-415", "DHC-6 Twin Otter", "Cessna 172 (Floats)", "Icon A5"];
        
        let soundsEnabled = false;
        let lastAltitude = 99999;

        const AUDIO = {
            stall: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/airbus-stall-warning.mp3"),
            pull: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/terrain-terrain-pull-up.mp3"),
            sink: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/sink-rate.mp3"),
            gear: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/too-low-gear.mp3"),
            flaps: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/too-low-flaps.mp3"),
            terrain: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/too-low-terrain.mp3"),
            bank: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/bank-angle.mp3"),
            overspeed: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/overspeed.mp3"),
            glideslope: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/glideslope.mp3")
        };

        const CALLOUTS = {
            2500: new Audio("https://raw.githubusercontent.com/avramovic/geofs-alerts/master/audio/2500.mp3"),
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

        function stopAll() {
            [...Object.values(AUDIO), ...Object.values(CALLOUTS)].forEach(a => { 
                a.pause(); 
                a.currentTime = 0; 
            });
        }

        function toggleGPWS() {
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
        }

        // Klaviatura [Q] boshqaruvi
        document.addEventListener('keydown', function(e) {
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
            if (e.key.toLowerCase() === 'q') { toggleGPWS(); }
        });

        function injectButton() {
            const bottomBar = document.querySelector(".geofs-ui-bottom");
            if (!bottomBar) return;

            // Repliy rejimini aniqlash va tugmani surish
            const isReplay = document.querySelector(".geofs-replay-container") || document.body.innerText.includes("EXIT PLAYER");
            let btn = document.getElementById("gpws-stable-btn");

            if (!btn) {
                btn = document.createElement("div");
                btn.id = "gpws-stable-btn";
                btn.onclick = (e) => { e.stopPropagation(); toggleGPWS(); };
                bottomBar.appendChild(btn);
            }

            btn.style = `
                display: inline-block; vertical-align: middle;
                margin-left: ${isReplay ? '40px' : '10px'}; 
                cursor: pointer; padding: 5px 8px; border-radius: 4px;
                background: ${soundsEnabled ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 255, 255, 0.1)'};
                transition: 0.2s; z-index: 10000;
            `;
            
            btn.innerHTML = `
                <img src="${ICON_URL}" width="20" height="20" style="vertical-align:middle; filter:${soundsEnabled ? 'none' : 'grayscale(1)'};"> 
                <span style="color:${soundsEnabled ? '#00ff00' : '#aaa'}; font-size:11px; font-family:sans-serif; font-weight:bold; margin-left:5px;">
                    GPWS ${soundsEnabled ? 'ON' : 'OFF'} [Q]
                </span>
            `;
        }

        // UI barqarorligi uchun kuzatuvchi
        const observer = new MutationObserver(() => injectButton());
        observer.observe(document.body, { childList: true, subtree: true });

        function mainLoop() {
            try {
                const isReplay = document.querySelector(".geofs-replay-container") || document.body.innerText.includes("EXIT PLAYER");
                if (!window.geofs?.animation?.values || !soundsEnabled || isReplay) return;

                const v = window.geofs.animation.values;
                const aircraft = window.geofs.aircraft.instance;
                const alt = Math.round(v.altitude - v.groundElevationFeet);
                const vs = Math.round(v.verticalSpeed);
                const roll = Math.abs(v.roll);
                const gearIsDown = v.gearPosition > 0.5;
                const ground = v.groundContact === 1;

                if (ground) { stopAll(); return; }

                // 1. STALL & OVERSPEED
                if (aircraft.stalling) {
                    if (AUDIO.stall.paused) AUDIO.stall.play();
                } else {
                    AUDIO.stall.pause(); AUDIO.stall.currentTime = 0;
                }

                if (v.kias > (aircraft.definition.vne || 400)) {
                    if (AUDIO.overspeed.paused) AUDIO.overspeed.play();
                } else {
                    AUDIO.overspeed.pause(); AUDIO.overspeed.currentTime = 0;
                }

                // 2. TERRAIN
                if (alt < 1000 && vs < -3000) {
                    if (AUDIO.pull.paused) AUDIO.pull.play();
                } else {
                    AUDIO.pull.pause(); AUDIO.pull.currentTime = 0;
                    if (alt < 2500 && vs < -2000) {
                        if (AUDIO.sink.paused) AUDIO.sink.play();
                    } else {
                        AUDIO.sink.pause(); AUDIO.sink.currentTime = 0;
                    }
                }

                // 3. GEAR
                const aircraftName = aircraft.definition.name || "";
                const isWater = WATER_PLANES.some(n => aircraftName.includes(n));
                if (!isWater && alt < 500 && alt > 30 && !gearIsDown) {
                    if (AUDIO.gear.paused) AUDIO.gear.play();
                } else {
                    AUDIO.gear.pause(); AUDIO.gear.currentTime = 0;
                }

                // 4. BANK ANGLE
                if (roll > 35) {
                    if (AUDIO.bank.paused) AUDIO.bank.play();
                } else {
                    AUDIO.bank.pause(); AUDIO.bank.currentTime = 0;
                }

                // 5. CALLOUTS
                for (let h in CALLOUTS) {
                    let h_val = parseInt(h);
                    if (alt <= h_val && lastAltitude > h_val) {
                        CALLOUTS[h].play().catch(() => {});
                    }
                }
                lastAltitude = alt;
            } catch (err) {
                // Xatolik bo'lsa o'yinni to'xtatib qo'ymaslik uchun
                console.warn("GPWS Loop Error: ", err);
            }
        }

        setInterval(mainLoop, 250);
        setInterval(injectButton, 2000);
    }

    // Skriptni xavfsiz ishga tushirish
    startScript();

})();
