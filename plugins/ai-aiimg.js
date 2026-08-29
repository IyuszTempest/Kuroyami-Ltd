const axios = require("axios");

module.exports = {
  command: ["aiimg", "txt2img"],
  category: "ai",
  noPrefix: true,
  call: async (conn, m, { usedPrefix, command, text }) => {
    if (!text)
      return m.reply(
        `Mau buat gambar apa?\nContoh: *${usedPrefix + command} a beautiful anime girl in a garden*`,
      );

    await conn.sendMessage(m.chat, { react: { text: "🎨", key: m.key } });

    try {
      const apiUrl = `https://api.azbry.com/api/ai/imagegen?prompt=${encodeURIComponent(text)}`;

      const { data: res } = await axios.get(apiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.status || !res.result || !res.result.url) {
        return m.reply("❌ Gagal generate gambar. Coba prompt lain!");
      }

      const imageUrl = res.result.url;

      let caption = `🎨 *AI Image Generator*\n\n`;
      caption += `> 📝 *Prompt:* ${text}\n`;
      caption += `> 👤 *Request by:* ${m.pushName}\n\n`;
      caption += `_Tadaa! Gambar sudah jadi!_`;

      await conn.sendMessage(
        m.chat,
        {
          image: { url: imageUrl },
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

      await conn.sendMessage(m.chat, { react: { text: "🌸", key: m.key } });
    } catch (e) {
      console.error(e);
      m.reply(
        `⚠️ Waduh, ada masalah saat generate gambar! Error: ${e.message}`,
      );
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    }
  },
};
