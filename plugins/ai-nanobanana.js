const axios = require("axios");
const FormData = require("form-data");

module.exports = {
  command: ["nanobanana"],
  category: "ai",
  noPrefix: true,
  call: async (conn, m, { usedPrefix, command, text }) => {
    const quoted = m.quoted ? m.quoted : m;
    const mime = (quoted.msg || quoted).mimetype || "";

    if (!/image/.test(mime)) {
      return m.reply(
        `❌ Silakan reply atau kirim gambar sambil mengetik perintah!\n\nContoh: *${usedPrefix + command} hitamkan karakter ini*`
      );
    }

    if (!text) {
      return m.reply(
        `❌ Masukkan prompt instruksi editnya!\n\nContoh: *${usedPrefix + command} ubah rambutnya jadi warna pink*`
      );
    }

    await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

    try {
      const buffer = await quoted.download();

      const form = new FormData();
      form.append("files[]", buffer, { filename: "image.jpg", contentType: "image/jpeg" });

      const uploadRes = await axios.post("https://uguu.se/upload.php", form, {
        headers: {
          ...form.getHeaders(),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
        timeout: 30000
      });

      if (!uploadRes.data || !uploadRes.data.success || !uploadRes.data.files[0]?.url) {
        return m.reply("❌ Gagal mengunggah gambar ke server temporary.");
      }

      const imageUrl = uploadRes.data.files[0].url;

      await m.reply("⏳ Sedang memproses gambar dengan AI, mohon tunggu sebentar...");

      const apiUrl = `https://axlyapi.qzz.io/ai/nanobanana?url=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(text)}`;

      const { data: res } = await axios.get(apiUrl, {
        timeout: 120000
      });

      const editedImageUrl = res.result?.url || res.url || res.result;

      if (!editedImageUrl) {
        return m.reply("❌ Gagal memproses gambar oleh AI. Coba prompt lain!");
      }

      let caption = `🍌 *AI Image Editor (Nano Banana)* 🍌\n\n`;
      caption += `> 📝 *Prompt:* ${text}\n`;
      caption += `> 👤 *Request by:* ${m.pushName}\n\n`;
      caption += `_Tadaa! Gambar berhasil diedit!_ ✨`;

      await conn.sendMessage(
        m.chat,
        {
          image: { url: editedImageUrl },
          caption: caption,
        },
        { quoted: m },
      );

      await conn.sendMessage(m.chat, { react: { text: "🌸", key: m.key } });

    } catch (e) {
      console.error("[AI EDIT ERROR]", e);
      m.reply(`⚠️ Waduh, proses AI terlalu lama atau ada masalah! Error: ${e.message}`);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    }
  },
};