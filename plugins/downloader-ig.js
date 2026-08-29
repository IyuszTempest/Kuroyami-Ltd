const axios = require("axios");

module.exports = {
  command: ["ig", "instagram", "igdl"],
  category: "downloader",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    if (!text) {
      let guide = `*「 INSTAGRAM DOWNLOADER 」*\n\n`;
      guide += `Download Reels atau Postingan Instagram dengan mudah!\n\n`;
      guide += `*📌 Cara Penggunaan:*\n`;
      guide += `> \`${usedPrefix + command} [Link Instagram]\`\n\n`;
      guide += `*💡 Contoh:*\n`;
      guide += `> \`${usedPrefix + command} https://www.instagram.com/p/DbLWTF8EuSr/\``;

      return m.reply(guide);
    }

    if (!text.includes("instagram.com")) {
      return m.reply(
        "> Link yang kamu masukkan bukan tautan Instagram yang valid!",
      );
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const encodedUrl = encodeURIComponent(text.trim());
      const apiResponse = await axios.get(
        `https://api.siputzx.my.id/api/d/savefrom?url=${encodedUrl}`,
      );

      const resData = apiResponse.data;

      if (
        !resData ||
        !resData.status ||
        !resData.data ||
        resData.data.length === 0
      ) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(
          "> Gagal mengambil media dari link tersebut. Pastikan postingannya tidak diprivasi!",
        );
      }

      let mediaList = resData.data[0].data;
      if (!mediaList || mediaList.length === 0) {
        return m.reply("> Tidak ada media yang ditemukan pada tautan ini.");
      }

      await conn.sendMessage(m.chat, { react: { text: "🚀", key: m.key } });

      let firstMeta = mediaList[0].meta || {};
      let captionText = ``;

      if (firstMeta.title) {
        captionText += `📝 *Caption:* ${firstMeta.title.substring(0, 200)}${firstMeta.title.length > 200 ? "..." : ""}\n`;
      }
      if (firstMeta.username) {
        captionText += `👤 *Uploader:* @${firstMeta.username}\n`;
      }

      let videoItems = [];
      let imageItems = [];

      for (let item of mediaList) {
        if (item.url && Array.isArray(item.url) && item.url.length > 0) {
          let fileUrl = item.url[0].url;
          let isVideo = item.url[0].type === "mp4" || fileUrl.includes(".mp4");

          if (isVideo) {
            videoItems.push(fileUrl);
          } else {
            imageItems.push(fileUrl);
          }
        }
      }

      for (let vidUrl of videoItems) {
        await conn.sendMessage(
          m.chat,
          {
            video: { url: vidUrl },
            caption: captionText,
            contextInfo: {
              mentionedJid: [m.sender],
              forwardingScore: 999,
              isForwarded: true,
              forwardedNewsletterMessageInfo: {
                newsletterJid: global.idch,
                serverMessageId: 143,
                newsletterName: global.namech,
              },
            },
          },
          { quoted: m },
        );
      }

      if (imageItems.length > 0) {
        for (let i = 0; i < imageItems.length; i++) {
          let imgUrl = imageItems[i];
          let imgCaption = i === 0 ? captionText : "";

          await conn.sendMessage(
            m.chat,
            {
              image: { url: imgUrl },
              caption: imgCaption,
              contextInfo: {
                mentionedJid: [m.sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                  newsletterJid: global.idch,
                  serverMessageId: 143,
                  newsletterName: global.namech,
                },
              },
            },
            { quoted: m },
          );
        }
      }
    } catch (e) {
      console.error("IG Downloader Error:", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
      return m.reply(
        `> ❌ Terjadi kesalahan pada sistem downloader: ${e.message}`,
      );
    }
  },
};
