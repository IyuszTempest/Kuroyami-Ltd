const axios = require("axios");

module.exports = {
  command: ["pin", "pinterest"],
  category: "downloader",
  noPrefix: true,
  call: async (conn, m, { usedPrefix, command, text }) => {
    if (!text)
      return m.reply(
        `Mau cari gambar apa di Pinterest?\nContoh: *${usedPrefix + command} Iroha*`,
      );

    await conn.sendMessage(m.chat, { react: { text: "🧭", key: m.key } });

    try {
      const apiUrl = `https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(text)}&type=image`;

      const { data: res } = await axios.get(apiUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!res.status || !res.data || res.data.length === 0) {
        return m.reply("Gomen, datanya kosong. Coba keyword lain!");
      }

      const results = res.data.slice(0, 5);

      let caption = `⛩️ *Pinterest Search* ⛩️\n\n`;
      caption += `> ✨ *Query:* ${text}\n`;
      caption += `> 👤 *Request by:* ${m.pushName}\n\n`;
      caption += `_Berikut adalah hasil pencarian gambar Pinterest untukmu!_`;

      await conn.sendMessage(
        m.chat,
        {
          text: caption,
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

      for (let i = 0; i < results.length; i++) {
        const item = results[i];

        await conn.sendMessage(m.chat, {
          image: { url: item.image_url },
        });

        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      await conn.sendMessage(m.chat, { react: { text: "🌸", key: m.key } });
    } catch (e) {
      console.error(e);
      m.reply(`⚠️ Waduh, ada masalah API! Error: ${e.message}`);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    }
  },
};
