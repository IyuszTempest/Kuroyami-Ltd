const axios = require("axios");
const { sticker } = require("../lib/sticker");

module.exports = {
  command: ["brat"],
  category: "tools",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    if (!text)
      return m.reply(
        `Ketik teksnya! Contoh: *${usedPrefix + command} Euphylia Magenta*`,
      );

    try {
      await conn.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

      const apiUrl = `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(text)}`;

      const response = await axios.get(apiUrl, { responseType: "arraybuffer" });
      const buffer = Buffer.from(response.data, "utf-8");

      let stiker = await sticker(buffer, false, packname, author);

      if (stiker) {
        await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m });
      } else {
        await conn.sendMessage(
          m.chat,
          { image: buffer, caption: "Gagal jadi stiker, kirim gambar aja ya!" },
          { quoted: m },
        );
      }
    } catch (e) {
      console.error(e);
      m.reply(`> Maaf, sistem sedang gangguan: ${e.message}`);
    }
  },
};
