const axios = require("axios");

module.exports = {
  command: ["ytmp4", "ytv"],
  category: "downloader",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    if (!text) {
      return m.reply(
        `⚠️ *Format salah!*\n\nMasukkan link YouTube yang ingin didownload.\n> Contoh: \`${usedPrefix + command} https://youtu.be/c5AQZFKVngA?si=12teb-PI-eokbKeM\``,
      );
    }

    if (!text.includes("youtu")) {
      return m.reply("> Pastikan link yang kamu masukkan adalah link YouTube!");
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const url = encodeURIComponent(text.trim());
      const apiResponse = await axios.get(
        `https://api.nexray.eu.cc/downloader/ytmp4?url=${url}&resolusi=480`,
      );

      const res = apiResponse.data;

      if (!res || !res.status || !res.result) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(
          "> Gagal memproses video. Mungkin resolusi 480p tidak tersedia untuk video ini.",
        );
      }

      const data = res.result;

      let caption = `*「 YOUTUBE VIDEO DOWNLOADER 」*\n\n`;
      caption += `> 🎬 *Judul:* ${data.title}\n`;
      caption += `> 📐 *Resolusi:* ${data.resolusi}p\n`;
      caption += `> ⏳ *Durasi:* ${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, "0")}\n\n`;
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
          video: { url: data.url },
          mimetype: "video/mp4",
          caption: `${data.title}`,
        },
        { quoted: m },
      );

      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    } catch (e) {
      console.error("YTMP4 Error:", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      return m.reply(`> Terjadi kesalahan saat mengunduh video: ${e.message}`);
    }
  },
};
