const axios = require("axios");

module.exports = {
  command: ["loli"],
  category: "anime",
  noPrefix: true,

  call: async (conn, m, { usedPrefix, command }) => {
    try {
      await conn.sendMessage(m.chat, { react: { text: "🌸", key: m.key } });

      const response = await axios.get("https://api.nexray.eu.cc/random/loli", {
        responseType: "arraybuffer",
        timeout: 15000,
      });

      const buffer = Buffer.from(response.data);

      let caption = `🌸 *Random Loli* 🌸\n\n`;

      await conn.sendMessage(
        m.chat,
        {
          image: buffer,
          caption: caption,
          contextInfo: {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: global.idch || "",
              serverMessageId: 143,
              newsletterName: `${global.namech || "Kuro Bot"}`,
            },
          },
        },
        { quoted: m },
      );
    } catch (e) {
      console.error("[RANDOM LOLI ERROR]", e);
      m.reply(`❌ Terjadi kesalahan saat mengambil gambar: ${e.message}`);
    }
  },
};
