module.exports = {
  command: ["add"],
  category: "group",
  admin: true,
  botAdmin: true,
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    if (!text)
      return m.reply(
        `Masukkan nomor yang mau ditambah!\nContoh: *${usedPrefix + command} 628xxx*`,
      );

    let users = text.replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    try {
      await conn.sendMessage(m.chat, { react: { text: "➕", key: m.key } });

      const response = await conn.groupParticipantsUpdate(
        m.chat,
        [users],
        "add",
      );

      if (response[0].status === "403") {
        return m.reply("Nomor tersebut diprivasi. gak bisa add langsung!");
      }

      m.reply("✨ Sukses menambahkan member baru ke grup!");
    } catch (e) {
      console.error(e);
      m.reply("Gagal menambah member. Pastikan nomornya benar dan aktif!");
    }
  },
};
