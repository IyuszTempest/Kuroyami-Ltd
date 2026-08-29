const axios = require("axios");

module.exports = {
  command: ["playvid"],
  category: "downloader",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    if (!text) {
      return m.reply(
        `⚠️ *Format salah!*\n\nMasukkan judul video yang ingin dicari & diunduh.\n> Contoh: \`${usedPrefix + command} Reply kz\``,
      );
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });

      const query = encodeURIComponent(text.trim());
      const apiResponse = await axios.get(
        `https://api.nexray.eu.cc/downloader/ytplayvid?q=${query}`,
      );

      const res = apiResponse.data;

      if (!res || !res.status || !res.result) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(
          "> ❌ Video tidak ditemukan. Coba gunakan judul yang lebih spesifik!",
        );
      }

      const data = res.result;

      let caption = `*「 YOUTUBE PLAYER VIDEO 」*\n\n`;
      caption += `> 🎬 *Judul:* ${data.title}\n`;
      caption += `> 🎙️ *Channel:* ${data.channel}\n`;
      caption += `> ⏱️ *Durasi:* ${data.duration}\n`;
      caption += `> 👁️ *Views:* ${data.views}\n`;
      caption += `> 🗓️ *Upload:* ${data.upload_at}\n\n`;
      caption += `_Tunggu sebentar, sedang menyiapkan videonya untukmu..._`;

      await conn.sendMessage(
        m.chat,
        {
          image: { url: data.thumbnail },
          caption: caption,
          contextInfo: {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: global.idch,
              serverMessageId: 143,
              newsletterName: global.namech,
            },
          },
        },
        { quoted: m },
      );

      await conn.sendMessage(
        m.chat,
        {
          video: { url: data.download_url },
          mimetype: "video/mp4",
          caption: `> ✅ *Video Berhasil Diunduh:* ${data.title}`,
        },
        { quoted: m },
      );

      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    } catch (e) {
      console.error("YTPlayVid Error:", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      return m.reply(
        `> Terjadi kesalahan saat memproses permintaan: ${e.message}`,
      );
    }
  },
};
