module.exports = {
  command: ["lapor", "report", "request", "req"],
  category: "main",
  noPrefix: false,
  call: async (conn, m, { usedPrefix, command, text }) => {
    const ownerNomor =
      (global.owner && global.owner[0]
        ? global.owner[0]
        : conn.user.id.split(":")[0]) + "@s.whatsapp.net";
    const cmd = command.toLowerCase();

    if (!text) {
      let guide = `*「 REPORT & REQUEST HUB 」*\n\n`;
      guide += `Punya ide fitur keren atau nemu error di bot?\n`;
      guide += `Yuk, kirimkan langsung ke Developer!\n\n`;
      guide += `*📌 Cara Penggunaan:*\n`;
      guide += ` • \`${usedPrefix}req [ide fitur]\`\n`;
      guide += ` • \`${usedPrefix}lapor [detail error]\`\n\n`;
      guide += `*💡 Contoh:*\n`;
      guide += `${usedPrefix}${command} Kuro, fitur downloader tiktok error nih`;

      return m.reply(guide);
    }

    if (text.length < 5)
      return m.reply(
        "> *Gagal:* Pesan terlalu pendek! Tolong berikan detail minimal 5 karakter ya.",
      );
    if (text.length > 1000)
      return m.reply(
        "> *Gagal:* Pesan terlalu panjang! Batas maksimal adalah 1000 karakter.",
      );

    const isRequest = cmd === "request" || cmd === "req";
    const label = isRequest ? "💡 REQUEST FITUR" : "⚠️ LAPORAN ERROR";

    let laporanToOwner = `*「 ${label} 」*\n\n`;
    laporanToOwner += `> 👤 *Dari:* ${m.pushName || "User"}\n`;
    laporanToOwner += `> 📞 *Nomor:* wa.me/${m.sender.split("@")[0]}\n\n`;
    laporanToOwner += `💬 *Isi Pesan:*\n`;
    laporanToOwner += `${text.trim()}`;

    try {
      await conn.sendMessage(
        ownerNomor,
        { text: laporanToOwner },
        { quoted: m },
      );

      await conn.sendMessage(m.chat, { react: { text: "🚀", key: m.key } });

      let successMsg = `*「 PESAN TERKIRIM 」*\n\n`;
      successMsg += `> 🎉 Pesan kamu sudah berhasil mendarat di WhatsApp Developer! Terima kasih banyak atas kontribusinya. Pantau terus *update* perbaikannya di Channel WA kita ya!\n`;

      return m.reply(successMsg);
    } catch (e) {
      console.error("Report System Error:", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      return m.reply(
        "> ❌ *Gagal Mengirim:* Koneksi sistem ke Developer sedang terputus. Coba lagi nanti ya!",
      );
    }
  },
};
