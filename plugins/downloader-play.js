const axios = require("axios");

module.exports = {
  command: ["play"],
  category: "downloader",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    if (!text) {
      return m.reply(
        `> *Format salah!*\n\n> Masukkan judul lagu yang ingin diputar.\n> Contoh: \`${usedPrefix + command} Reply kz\``,
      );
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });

      const query = encodeURIComponent(text.trim());
      const apiResponse = await axios.get(
        `https://api.azbry.com/api/download/ytplay2?q=${query}`,
      );

      const res = apiResponse.data;

      if (!res || !res.status || !res.result) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(
          "> Lagu tidak ditemukan. Coba gunakan judul yang lebih spesifik!",
        );
      }

      const data = res.result;

      let caption = `*「 YOUTUBE PLAYER 」*\n\n`;
      caption += `> 🎵 *Judul:* ${data.title}\n`;
      caption += `> 🎙️ *Channel:* ${data.channel}\n`;
      caption += `> 🔗 *ID:* ${data.videoId}\n\n`;
      caption += `_Tunggu sebentar, sedang mengirim audio-nya untukmu..._`;

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
          audio: { url: data.download },
          mimetype: "audio/mpeg",
          fileName: `${data.title}.mp3`,
          ptt: false,
        },
        { quoted: m },
      );

      await conn.sendMessage(m.chat, { react: { text: "🎶", key: m.key } });
    } catch (e) {
      console.error("YTPlay Error:", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      return m.reply(
        `> Terjadi kesalahan saat memproses permintaan: ${e.message}`,
      );
    }
  },
};
