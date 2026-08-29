/**
 * All Menu / Category Sub-Menu Handler Plugin (Fixed to show all command aliases)
 * Compatible with Euphy-Bot V3.3 Handler Structure
 */

module.exports = {
  command: ["allmenu"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix }) => {
    try {
      let tag = text ? text.toLowerCase().trim() : "";
      if (!tag) return;

      const categoryNames = {
        main: "Main Menu",
        anime: "Anime & Manga",
        ai: "Artificial Intelligence",
        downloader: "Media Downloader",
        economic: "Global Economy",
        group: "Group Manager",
        game: "Gaming Area",
        tools: "Utility Tools",
        owner: "Developer Only",
      };

      let pfx = usedPrefix || ".";
      const plugins = global.plugins || {};

      let categoryCommands = [];

      // Loop semua plugin untuk ambil semua alias command di kategori tersebut
      for (let pluginName in plugins) {
        let p = plugins[pluginName];
        if (p && p.category === tag && !p.disabled && p.command) {
          // Cek apakah command berbentuk array atau string tunggal
          let cmds = Array.isArray(p.command) ? p.command : [p.command];
          for (let cmd of cmds) {
            categoryCommands.push(` • ${pfx}${cmd}`);
          }
        }
      }

      // Hilangkan duplikat command jika ada yang sama
      categoryCommands = [...new Set(categoryCommands)].join("\n");

      if (!categoryCommands) {
        return m.reply(
          `> ⚠️ Kategori *${tag.toUpperCase()}* masih kosong atau tidak ditemukan.`,
        );
      }

      const title = categoryNames[tag] || tag.toUpperCase();

      // Teks Menu
      let txt = `*「 ${title.toUpperCase()} 」*\n\n`;
      txt += `${categoryCommands}\n\n`;
      txt += `> *Note:* _Gunakan fitur dengan bijak ya!_`;

      await conn.sendMessage(
        m.chat,
        {
          image: { url: global.imgall },
          caption: txt,
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
    } catch (e) {
      console.error("Error in Sub-Menu Handler:", e);
      m.reply("> ❌ Oops! Terjadi kesalahan saat memuat daftar perintah.");
    }
  },
};
