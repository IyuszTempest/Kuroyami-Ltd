const fetch = require("node-fetch");

module.exports = {
  command: ["lirik"],
  category: "tools",
  noPrefix: true,
  call: async (conn, m, { usedPrefix, command, text }) => {
    if (!text) {
      await conn.sendMessage(m.chat, { react: { text: "❗", key: m.key } });
      return m.reply(
        `Judul lagunya mana?\nContoh: *${command} Kawaikute Gomen*`,
      );
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });

      const res = await fetch(
        `https://api.theresav.biz.id/search/azlyrics?q=${encodeURIComponent(text.trim())}&apikey=${global.thrsavapi}`,
      );

      if (!res.ok)
        throw new Error(`サーバーエラー: ${res.status} ${res.statusText}`);

      const json = await res.json();

      if (!json.status || !json.result) {
        throw new Error("Liriknya ga ketemu.");
      }

      const data = json.result;

      let txt =
        `🎵 *Hasil Pencarian Lirik* 🎵\n\n` +
        `📌 *Judul:* ${data.title || "-"}\n` +
        `👤 *Artis* ${data.artist || "-"}\n\n` +
        `📖 *Lirik:* \n\n${data.lyrics}`;

      await conn.sendMessage(
        m.chat,
        {
          text: txt.trim(),
          contextInfo: {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: global.idch,
              newsletterName: global.namech,
              serverMessageId: 143,
            },
          },
        },
        { quoted: m },
      );

      await conn.sendMessage(m.chat, { react: { text: "✨", key: m.key } });
    } catch (err) {
      console.error("AZLyrics Search Error:", err);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      m.reply(`❌ *Error:* ${err.message || "Erro, coba lagi"}`);
    }
  },
};
