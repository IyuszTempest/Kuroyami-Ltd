const axios = require("axios");
const FormData = require("form-data");

module.exports = {
  command: ["tourl", "tolink"],
  category: "tools",
  noPrefix: true,
  call: async (conn, m, { usedPrefix: _p, command }) => {
    try {
      const targetMsg = m.quoted ? m.quoted : m;
      const mime = (targetMsg.msg || targetMsg).mimetype || "";

      if (!mime || !/image|video|audio/.test(mime)) {
        return m.reply(
          `> Kirim atau reply media (gambar/video/audio) dengan caption *${_p + command}*`,
        );
      }

      await conn.sendMessage(m.chat, { react: { text: "📤", key: m.key } });
      await m.reply(
        "> Sedang mengunduh dan mengunggah berkas ke CDN, mohon tunggu sebentar ya...",
      );

      let mediaBuffer;
      try {
        mediaBuffer = await targetMsg.download();
      } catch (downloadError) {
        console.error("Gagal mendownload media:", downloadError);
        return m.reply("> Gagal mendownload media dari server WhatsApp!");
      }

      if (!mediaBuffer) {
        return m.reply("> Gagal memproses berkas media!");
      }

      const MAX_SIZE = 10 * 1024 * 1024;
      if (mediaBuffer.length > MAX_SIZE) {
        return m.reply(
          "> File terlalu besar! Maksimal ukuran file adalah 10MB ya.",
        );
      }

      const extension = mime.split("/")[1]?.replace("jpeg", "jpg") || "bin";
      const fileName = `${Date.now()}.${extension}`;

      const form = new FormData();
      form.append("UPLOADCARE_PUB_KEY", "demopublickey");
      form.append("UPLOADCARE_STORE", "1");
      form.append("file", mediaBuffer, {
        filename: fileName,
        contentType: mime,
      });

      const res = await axios.post("https://upload.uploadcare.com/base/", form, {
        headers: {
          ...form.getHeaders(),
        },
        timeout: 30000,
      });

      if (res.data && res.data.file) {
        const fileUrl = `https://ucarecdn.com/${res.data.file}/${fileName}`;

        let txt = `🌸 *UPLOAD SUCCESS* 🌸\n\n`;
        txt += `🔗 *URL:* ${fileUrl}\n`;
        txt += `📄 *File:* ${fileName}\n`;
        txt += `📏 *Size:* ${(mediaBuffer.length / 1024 / 1024).toFixed(2)} MB`;

        await m.reply(txt);
        await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
      } else {
        throw new Error("Respon server Uploadcare tidak valid.");
      }
    } catch (err) {
      console.error("Error in ToURL:", err);
      m.reply(`⚠️ Gagal mengunggah berkas: ${err.message}`);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    }
  },
};