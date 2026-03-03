# ✈️ SkyGuard GPWS for GeoFS

![GeoFS Addon](https://img.shields.io/badge/GeoFS-Addon-blue?style=for-the-badge)
[![Version](https://img.shields.io/badge/Version-4.0-green?style=for-the-badge)](https://github.com/Jafar20130315/GPWSsounds_geofs/blob/main/gpwssounds_release.user.js)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Tampermonkey-orange?style=for-the-badge)

A professional-grade **Ground Proximity Warning System (GPWS)** for GeoFS. This script provides high-fidelity voice callouts and safety alerts to enhance your flight simulation experience.

---

## 🌟 Key Features

* **🎙️ Full Altitude Callouts:** Precise voice announcements at 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, and 10 feet.
* **⚠️ Critical Safety Alerts:**
    * `SINK RATE`: High vertical speed warning.
    * `PULL UP`: Immediate terrain conflict warning.
    * `TOO LOW, GEAR`: Landing gear configuration alert.
    * `BANK ANGLE`: Excessive roll angle protection.
    * `STALL`: High angle of attack warning (Airbus style).
* **🌊 Smart Amphibian Logic:** Automatically disables Gear alerts for water-landing aircraft (e.g., Twin Otter, Canadair).
* **🔘 Seamless UI Integration:** A clean ON/OFF toggle integrated directly into the GeoFS bottom bar.

---

## 🚀 Installation

### Prerequisites
1.  Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser.

### Setup Steps
1.  Click on the `gpwssounds_release.user.js` file in this repository.
2.  Click the **Raw** button.
3.  Tampermonkey will automatically detect the script; click **Install**.
4.  Refresh GeoFS and look for the aircraft icon in the bottom menu.

---

## 🛠️ How to Use
1.  Once in-game, click the **GPWS icon** in the bottom bar.
2.  The indicator will turn **Green (GPWS ON)**.
3.  The system will perform a silent "audio warm-up" on the first click to bypass browser autoplay restrictions.
4.  Fly safely! The system will handle the rest.



---

## 📦 Warning Thresholds

| Alert | Condition |
| :--- | :--- |
| **PULL UP** | Altitude < 1000ft & VS < -3200 fpm |
| **SINK RATE** | Altitude < 2500ft & VS < -2100 fpm |
| **TOO LOW GEAR** | Altitude < 500ft & Gear Retracted (Land planes only) |
| **BANK ANGLE** | Roll Angle > 35° |

---

---
**Created by Jafar20130315**
