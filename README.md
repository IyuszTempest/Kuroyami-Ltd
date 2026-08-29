<div align="center">

#  Bot WhatsApp Kuroyami
<img src="https://i.pinimg.com/736x/34/55/ec/3455ece72ad14953441997a2f7374399.jpg" width="280" style="border-radius: 50%; box-shadow: 0 0 20px rgba(255, 0, 255, 0.5);" alt="Waifu">

**Modern WhatsApp Bot Engine with Hybrid AI & High-Efficiency Tools**

[![Node.js](https://img.shields.io/badge/Node.js-24+-indigo?style=for-the-badge&logo=nodedotjs)](https://nodejs.org)
[![Library](https://img.shields.io/badge/Library-neodevxsadmd/baileys-indigo?style=for-the-badge&logo=whatsapp)](#)
<img src="https://img.shields.io/badge/Dev-IyuszTempest-indigo.svg?style=for-the-badge" alt="Developer">
<img src="https://img.shields.io/badge/license-MIT-indigo.svg?style=for-the-badge" alt="License MIT">

</div>

---

## 🟣 Overview
**Kuroyami Ltd** adalah bot WhatsApp berbasis Node.js yang dikembangkan dari **Base EUPHY-MD** yang dikembangkan oleh saya sendiri **IyuszTempest*. Script ini menggunakan plugins type cjs dan fokus pada efisiensi penggunaan sumber daya (RAM Monitoring) dan integrasi **Dual-ID System (JID & LID)**.

## 🪻 Fitur Unggulan

* 🔄 **Auto-Reload Plugins:** Sistem deteksi file otomatis (`fs.watch`) yang memungkinkan update fitur tanpa perlu restart bot.
* 🎞️ **Optimized Sticker:** Mesin pengolah stiker video dengan *Hard Compression* (< 1MB) untuk menjamin stabilitas pengiriman.
* 📂 **REST API:** 95% Fitur terintegrasi langsung dengan REST API.
* 🛡️ **Dual-ID Support:** Deteksi Owner otomatis untuk sistem WhatsApp terbaru yang menggunakan format **LID**.
* 👑 **Group Managemen:** Ada fitur manajemen grup menggunakan button yang bisa digunakan oleh admin.


## 🚨 Requirements & Installation

> [!NOTE]
> - Proyek ini sekarang dioptimasi untuk dijalankan pada **Environment Laptop/PC** untuk performa FFmpeg yang maksimal.
> - Gunakan **npm install --legacy-peer-deps --production** untuk menginstall modul jika gagal menginstall.
> - Gunakan **node index.js** jika npm start gagal

## ⚙️ Prasyarat Sistem
- **Node.js:** Pastikan sudah terinstall mnimal **Node.js 20** untuk menjalankan script.
- **FFmpeg:** Terinstall secara global (untuk proses stiker & converter).
- **RAM:** Minimal 1 GB (Disarankan, meskipun bot berjalan stabil di resource rendah).
- **CPU:** Minimal 70% (Disarankan 100%).
- **Storage:** Minimal 1 GB.
