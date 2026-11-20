const CATEGORIES = {
  main: { icon: "🏠", label: "Main Menu" },
  anime: { icon: "🌸", label: "Anime & Gambar" },
  ai: { icon: "🧠", label: "AI Menu" },
  downloader: { icon: "📥", label: "Media Downloader" },
  economic: { icon: "💵", label: "Info Pasar Global" },
  group: { icon: "👥", label: "Group Manager" },
  sticker: { icon: "🖼️", label: "Buat Stiker" },
  tools: { icon: "🛠️", label: "Utility Tools" },
  owner: { icon: "👑", label: "Developer Only" },
};

module.exports = {
  command: ["allmenu"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix }) => {
    try {
      const pfx = usedPrefix || ".";
      const tag = (text || "").toLowerCase().trim();

      if (!tag) {
        return m.reply(
          `Ketik *${pfx}menu* lalu pilih kategori dari tombol *Daftar Menu*.`,
        );
      }

      const plugins = global.plugins || {};
      const found = new Set();

      for (const key in plugins) {
        const p = plugins[key];
        if (!p || p.disabled || !p.command) continue;
        const cats = Array.isArray(p.category) ? p.category : [p.category];
        if (!cats.includes(tag)) continue;
        const cmds = Array.isArray(p.command) ? p.command : [p.command];
        for (const cmd of cmds) found.add(String(cmd));
      }

      if (found.size === 0) {
        return m.reply(
          `⚠️ Kategori *${tag.toUpperCase()}* kosong atau tidak ditemukan.`,
        );
      }

      const list = [...found].sort((a, b) => a.localeCompare(b));
      const meta = CATEGORIES[tag] || { icon: "📂", label: tag.toUpperCase() };

      const lines = list.map((cmd, i) => {
        const branch = i === list.length - 1 ? "└" : "├";
        return `${branch} ${pfx}${cmd}`;
      });

      const caption =
        `${meta.icon} *${meta.label.toUpperCase()}*\n` +
        `_${list.length} perintah tersedia_\n\n` +
        `${lines.join("\n")}\n\n` +
        `> Gunakan fitur dengan bijak ya!`;

      const contextInfo = { mentionedJid: [m.sender] };
      if (global.idch) {
        Object.assign(contextInfo, {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: global.idch,
            newsletterName: global.namech || "Kuroyami",
            serverMessageId: 143,
          },
        });
      }

      const payload = global.imgmenuall
        ? { image: { url: global.imgmenuall }, caption, contextInfo }
        : { text: caption, contextInfo };

      try {
        await conn.sendMessage(m.chat, payload, { quoted: m });
      } catch (err) {
        console.error("[allmenu] kirim gambar gagal:", err.message);
        await conn.sendMessage(
          m.chat,
          { text: caption, contextInfo },
          { quoted: m },
        );
      }
    } catch (e) {
      console.error("[allmenu]", e);
      m.reply("❌ Oops! Terjadi kesalahan saat memuat daftar perintah.");
    }
  },
};
