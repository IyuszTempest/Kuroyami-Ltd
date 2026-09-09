const axios = require("axios");

module.exports = {
  command: ["gempa"],
  category: "tools",
  noPrefix: true,
  call: async (conn, m, { command, usedPrefix: _p }) => {
    try {
      await conn.sendMessage(m.chat, { react: { text: "🌋", key: m.key } });

      const { data } = await axios.get("https://api.seilveeii.my.id/api/tools/gempa");

      if (!data || !data.status || !data.result) {
        return m.reply("❌ Gagal mendapatkan data gempa terkini.");
      }

      const res = data.result;

      let caption = `🌐 *INFO GEMPA TERKINI (BMKG)*\n\n`;
      caption += `📅 *Tanggal:* ${res.tanggal || "-"}\n`;
      caption += `⏰ *Jam:* ${res.jam || "-"}\n`;
      caption += `💥 *Magnitudo:* ${res.magnitude || "-"}\n`;
      caption += `🌊 *Kedalaman:* ${res.kedalaman || "-"}\n`;
      caption += `📍 *Wilayah:* ${res.wilayah || "-"}\n`;
      caption += `🗺️ *Koordinat:* ${res.lintang || "-"} - ${res.bujur || "-"}\n`;
      caption += `📢 *Potensi:* ${res.potensi || "-"}\n`;

      if (res.peta) {
        await conn.sendMessage(
          m.chat,
          {
            image: { url: res.peta },
            caption: caption,
          },
          { quoted: m }
        );
      } else {
        await m.reply(caption);
      }

      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    } catch (e) {
      console.error("Error Info Gempa:", e);
      m.reply(`❌ Terjadi kesalahan: ${e.message}`);
    }
  },
};
