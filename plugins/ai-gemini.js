const axios = require("axios");

module.exports = {
  command: ["gemini", "ai"],
  category: "ai",
  noPrefix: false,
  call: async (conn, m, { text, usedPrefix: _p, command }) => {
    if (!text) {
      return m.reply(
        `> ⚠️ Masukkan pertanyaan/prompt!\n\n*Contoh:* ${_p}${command} Halo, siapa kamu?`
      );
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "🧠", key: m.key } });

      const apiUrl = `https://api.seilveeii.my.id/api/ai/gemini?prompt=${encodeURIComponent(text)}`;
      const { data } = await axios.get(apiUrl);

      if (!data || !data.status || !data.result?.response) {
        throw new Error("Respon API tidak valid atau gagal.");
      }

      await m.reply(data.result.response);
    } catch (e) {
      console.error(e);
      m.reply(`> ❌ Gagal mendapatkan respon dari AI: ${e.message}`);
    }
  },
};
