const fetch = require("node-fetch");
const FormData = require("form-data");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

async function uploadToCDN(buffer, ext = "jpg") {
  const form = new FormData();
  form.append("UPLOADCARE_PUB_KEY", "demopublickey");
  form.append("UPLOADCARE_STORE", "1");
  form.append("file", buffer, { filename: `image_${Date.now()}.${ext}` });

  const res = await fetch("https://upload.uploadcare.com/base/", {
    method: "POST",
    body: form,
    headers: form.getHeaders(),
  });

  const json = await res.json();
  if (!json.file) {
    throw new Error("Gagal mengunggah gambar ke CDN");
  }

  return `https://ucarecdn.com/${json.file}/image.${ext}`;
}

module.exports = {
  command: ["hd"],
  category: "tools",
  noPrefix: true,
  call: async (conn, m, { usedPrefix, command }) => {
    const quoted = m.quoted ? m.quoted : m;
    const msg = quoted.msg || quoted;
    const mime = msg.mimetype || "";

    if (!/image\/(jpe?g|png)/i.test(mime)) {
      await conn.sendMessage(m.chat, { react: { text: "❗", key: m.key } });
      return m.reply(
        `Kirim atau *balas gambar* dengan perintah:\n*${command}*`,
      );
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const mediaType = /image\/(jpe?g|png)/i.test(mime) ? "image" : null;
      if (!mediaType) throw new Error("Tipe media tidak didukung");

      const stream = await downloadContentFromMessage(msg, mediaType);

      let media = Buffer.alloc(0);
      for await (const chunk of stream) {
        media = Buffer.concat([media, chunk]);
      }

      if (!media || media.length === 0)
        throw new Error("Gagal mengunduh media dari pesan.");

      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";

      const imageUrl = await uploadToCDN(media, ext);

      const apiUrl = `https://api.seilveeii.my.id/api/tools/upscale?image=${encodeURIComponent(imageUrl)}`;
      const res = await fetch(apiUrl);
      const json = await res.json();

      if (!json.status || !json.result?.result) {
        throw new Error("Respon API tidak valid atau gagal memproses gambar.");
      }

      const resultImageUrl = json.result.result;
      const resultImageRes = await fetch(resultImageUrl);
      const resultBuffer = await resultImageRes.buffer();

      await conn.sendMessage(
        m.chat,
        {
          image: resultBuffer,
          caption: `*Done*`,
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

      await conn.sendMessage(m.chat, { react: { text: "✨", key: m.key } });
    } catch (err) {
      console.error("Seilveeii HD Error:", err);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      m.reply(
        `❌ *Upscaling gagal:* ${err.message || "Terjadi masalah pada API."}`,
      );
    }
  },
};