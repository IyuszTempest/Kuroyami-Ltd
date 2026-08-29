module.exports = {
  command: ["daftar", "reg"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    let user =
      global.db.data.users[m.sender] || (global.db.data.users[m.sender] = {});

    if (user.registered) {
      return m.reply(
        `> ⚠️ Kamu sudah terdaftar di dalam sistem sebagai *${user.name}*!`,
      );
    }

    if (!text || !text.includes(".")) {
      let guide = `*「 REGISTRATION HUB 」*\n\n`;
      guide += `Format pendaftaran kamu belum tepat.\n\n`;
      guide += `*📌 Cara Penggunaan:*\n`;
      guide += `> \`${usedPrefix + command} Nama.Umur\`\n\n`;
      guide += `*💡 Contoh:*\n`;
      guide += `> \`${usedPrefix + command} Natalius.18\``;

      return m.reply(guide);
    }

    let [name, age] = text.split(".");
    let parseAge = parseInt(age);

    if (!name || !name.trim())
      return m.reply(`> *Gagal:* Nama tidak boleh kosong! 👤`);
    if (isNaN(parseAge) || parseAge > 80 || parseAge < 5)
      return m.reply(
        `> *Gagal:* Masukkan umur yang valid (antara 5 sampai 80 tahun)! 🔢`,
      );

    Object.assign(user, {
      name: name.trim(),
      age: parseAge,
      registered: true,
      regTime: +new Date(),
    });

    let caption = `*「 REGISTRATION SUCCESS 」*\n\n`;
    caption += `✨ Selamat, akun kamu berhasil didaftarkan!\n\n`;
    caption += `> 👤 *Nama:* ${user.name}\n`;
    caption += `> 🔢 *Umur:* ${user.age} Tahun\n\n`;
    caption += `_Sekarang kamu sudah bisa mengakses semua fitur bot. Ketik_ *${usedPrefix}menu* _untuk mulai menjelajah!_`;

    await conn.sendMessage(m.chat, { react: { text: "🎉", key: m.key } });

    await m.reply(caption);
  },
};
