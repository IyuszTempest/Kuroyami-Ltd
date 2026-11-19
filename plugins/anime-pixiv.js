const axios = require("axios");

module.exports = {
  command: ["pixiv"],
  category: "anime",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix: _p, command }) => {
    try {
      await conn.sendMessage(m.chat, { react: { text: "🎨", key: m.key } });

      let query = text ? encodeURIComponent(text) : "random";
      let apiUrl = `https://api.seilveeii.my.id/api/tools/pixiv-random?count=1`;

      const { data } = await axios.get(apiUrl);

      if (!data || !data.status || !data.result?.results?.length) {
        throw new Error("Artwork gak ditemukan, Senpai! Coba keyword lain.");
      }

      let item = data.result.results[0];

      let imageUrl = item.image;
      if (imageUrl.includes("/file/")) {
        imageUrl = "https://api.seilveeii.my.id/file/" + imageUrl.split("/file/").pop();
      }

      let tags = item.tags && item.tags.length > 0 
        ? item.tags.map((t) => `#${t.replace(/\s+/g, "_")}`).join(" ") 
        : "-";

      let caption = `*🎨 Pixiv Illustration*\n\n`;
      caption += `> 📌 *Judul:* ${item.title || "Untitled"}\n`;
      caption += `> 👤 *Artist:* ${item.author || "Unknown"} (${item.authorUrl || "-"})\n`;
      caption += `> 📐 *Resolusi:* ${item.width} x ${item.height}\n`;
      caption += `> 🤖 *AI Generated:* ${item.aiGenerated ? "Ya" : "Bukan"}\n`;
      caption += `> 🏷️ *Tags:* ${tags}\n`;
      caption += `> 🔗 *Pixiv:* ${item.url || "-"}\n\n`;
      caption += `_Nih artwork-nya, Senpai! Moga lu suka!_ ✨`;

      await conn.sendMessage(
        m.chat,
        {
          image: { url: imageUrl },
          caption: caption,
        },
        { quoted: m }
      );
    } catch (e) {
      console.error(e);
      m.reply(`> ❌ Gagal ngambil artwork Pixiv: ${e.message}`);
    }
  },
};
