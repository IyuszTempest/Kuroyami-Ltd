const axios = require("axios");

module.exports = {
  command: ["ytmp3"],
  category: "downloader",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    if (!text) {
      return m.reply(
        `⚠️ *Format salah!*\n\nMasukkan link YouTube yang ingin diubah ke Audio.\n> Contoh: \`${usedPrefix + command} https://youtu.be/Ka3kgJJb0Bk?si=959a0Fw2ob0bIwfi\``,
      );
    }

    if (!text.includes("youtu")) {
      return m.reply("> Pastikan link yang kamu masukkan adalah link YouTube!");
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const url = encodeURIComponent(text.trim());
      const apiResponse = await axios.get(
        `https://api.nexray.eu.cc/downloader/ytmp3?url=${url}`,
      );

      const res = apiResponse.data;

      if (!res || !res.status || !res.result) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(
          "> Gagal memproses audio. Mungkin link tersebut tidak valid.",
        );
      }

      const data = res.result;

      let caption = `*「 YOUTUBE TO MP3 」*\n\n`;
      caption += `> 🎵 *Judul:* ${data.title}\n`;
      caption += `> ⏱️ *Durasi:* ${Math.floor(data.duration / 60)}:${(data.duration % 60).toString().padStart(2, "0")}\n\n`;
      caption += `_Tunggu sebentar, sedang menyiapkan audionya..._`;

      await conn.sendMessage(
        m.chat,
        {
          text: caption,
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
          audio: { url: data.url },
          mimetype: "audio/mpeg",
          ptt: false,
        },
        { quoted: m },
      );

      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    } catch (e) {
      console.error("YTMP3 Error:", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      return m.reply(`> ❌ Terjadi kesalahan: ${e.message}`);
    }
  },
};
