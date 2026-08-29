const axios = require("axios");

module.exports = {
  command: ["ytshorts"],
  category: "downloader",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    if (!text) {
      return m.reply(
        `⚠️ *Format salah!*\n\nMasukkan link YouTube Shorts yang ingin didownload.\n> Contoh: \`${usedPrefix + command} https://youtube.com/shorts/Nc90tDf0YQQ\``,
      );
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const url = encodeURIComponent(text.trim());
      const apiResponse = await axios.get(
        `https://api.nexray.eu.cc/downloader/v1/ytmp4?url=${url}&resolusi=480`,
      );

      const res = apiResponse.data;

      if (!res || !res.status || !res.result) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply("> Gagal memproses video Shorts ini.");
      }

      const data = res.result;

      await conn.sendMessage(
        m.chat,
        {
          video: { url: data.url },
          mimetype: "video/mp4",
          caption: `${data.title}`,
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

      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    } catch (e) {
      console.error("YTShorts Error:", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      return m.reply(`> Terjadi kesalahan: ${e.message}`);
    }
  },
};
