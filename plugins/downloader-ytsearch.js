const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");
const yts = require("yt-search");

function getYouTubeId(url) {
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

module.exports = {
  command: ["ytsearch", "yts", "ytinfo"],
  category: "downloader",
  noPrefix: true,
  call: async (conn, m, { text, command, usedPrefix: _p }) => {
    try {
      if (!text) {
        return m.reply(
          `⚠️ *Format salah!*\n\nMau cari apa?\n> Contoh: \`${_p + command} Renai Circulation\``,
        );
      }

      const cleanText = text.trim();
      const ytId = getYouTubeId(cleanText);
      const isUrl =
        cleanText.includes("youtube.com") || cleanText.includes("youtu.be");

      if (command === "ytinfo" || ytId || isUrl) {
        await conn.sendMessage(m.chat, { react: { text: "⚡", key: m.key } });

        const videoUrl = ytId
          ? `https://www.youtube.com/watch?v=${ytId}`
          : cleanText;

        const searchResult = await yts(ytId || videoUrl).catch(() => null);
        let video =
          searchResult && searchResult.videos ? searchResult.videos[0] : null;

        if (!video) {
          return m.reply(
            "Gagal mendapatkan info video. Pastikan link atau kata kunci benar.",
          );
        }

        const topVideoThumb = video.thumbnail || global.imgall;

        detailContent += `> 🎥 *Judul:* ${video.title}\n`;
        detailContent += `> 👤 *Channel:* ${video.author?.name || "Unknown"}\n`;
        detailContent += `> ⏱️ *Durasi:* ${video.timestamp || "N/A"}\n`;
        detailContent += `> 🔗 *Link:* ${video.url || videoUrl}\n\n`;
        detailContent += `_Silakan pilih format unduhan di bawah:_`;

        let mediaThumb;
        try {
          mediaThumb = await prepareWAMessageMedia(
            { image: { url: topVideoThumb } },
            { upload: conn.waUploadToServer },
          );
        } catch (_) {
          mediaThumb = await prepareWAMessageMedia(
            { image: { url: global.imgall } },
            { upload: conn.waUploadToServer },
          );
        }

        const buttons = [
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: "🎵 Download MP3",
              id: `${_p}ytmp3 ${video.url || videoUrl}`,
            }),
          },
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: "🎬 Download MP4",
              id: `${_p}ytmp4 ${video.url || videoUrl}`,
            }),
          },
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: "Tonton di YouTube",
              url: video.url || videoUrl,
            }),
          },
        ];

        const infoMsg = generateWAMessageFromContent(
          m.chat,
          {
            viewOnceMessage: {
              message: {
                interactiveMessage: proto.Message.InteractiveMessage.create({
                  header: proto.Message.InteractiveMessage.Header.create({
                    title: "YouTube Downloader",
                    hasMediaAttachment: true,
                    ...mediaThumb,
                  }),
                  body: proto.Message.InteractiveMessage.Body.create({
                    text: detailContent,
                  }),
                  footer: proto.Message.InteractiveMessage.Footer.create({
                    text: global.wm || "Sistem Musik",
                  }),
                  nativeFlowMessage:
                    proto.Message.InteractiveMessage.NativeFlowMessage.create({
                      messageVersion: 1,
                      buttons: buttons,
                    }),
                }),
              },
            },
          },
          { userJid: conn.user.id, quoted: m },
        );

        await conn.relayMessage(m.chat, infoMsg.message, {
          messageId: infoMsg.key.id,
        });
        return;
      }

      await conn.sendMessage(m.chat, { react: { text: "🔍", key: m.key } });

      const searchResults = await yts(cleanText);
      const videos = searchResults.videos
        ? searchResults.videos.slice(0, 10)
        : [];

      if (videos.length === 0) {
        return m.reply("Gak nemu video yang cocok. Coba kata kunci lain!");
      }

      let rows = [];
      videos.forEach((video, idx) => {
        rows.push({
          header: "",
          title: `${idx + 1}. ${video.title.slice(0, 30)}`,
          description: `Durasi: ${video.timestamp} | Ch: ${video.author.name}`,
          id: `${_p}ytinfo ${video.url}`,
        });
      });

      let listMessage = {
        title: "Buka Daftar Video 🎵",
        sections: [
          {
            title: "Hasil Pencarian YouTube",
            highlight_label: "Top Results",
            rows: rows,
          },
        ],
      };

      let searchContent = `> ✨ *Query:* ${cleanText}\n`;
      searchContent += `> 🏮 *Hasil:* ${videos.length} Video Teratas\n\n`;
      searchContent += `_Silakan klik tombol di bawah untuk memilih lagu, bot akan mengirimkan detail info dan audionya!_`;

      let headerMedia;
      try {
        const topVideoThumb =
          videos[0].thumbnail || videos[0].image || global.imgall;
        headerMedia = await prepareWAMessageMedia(
          { image: { url: topVideoThumb } },
          { upload: conn.waUploadToServer },
        );
      } catch (_) {
        headerMedia = await prepareWAMessageMedia(
          { image: { url: global.imgall } },
          { upload: conn.waUploadToServer },
        );
      }

      const msg = generateWAMessageFromContent(
        m.chat,
        {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
              },
              interactiveMessage: proto.Message.InteractiveMessage.create({
                header: proto.Message.InteractiveMessage.Header.create({
                  title: "Youtube Search",
                  hasMediaAttachment: true,
                  ...headerMedia,
                }),
                body: proto.Message.InteractiveMessage.Body.create({
                  text: searchContent,
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: global.wm || "Sistem Musik",
                }),
                nativeFlowMessage:
                  proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    messageVersion: 1,
                    buttons: [
                      {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify(listMessage),
                      },
                    ],
                  }),
                contextInfo: {
                  mentionedJid: [m.sender],
                  forwardingScore: 999,
                  isForwarded: true,
                  forwardedNewsletterMessageInfo: {
                    newsletterJid: global.idch,
                    serverMessageId: 143,
                    newsletterName: `${global.namech}`,
                  },
                },
              }),
            },
          },
        },
        { userJid: conn.user.id, quoted: m },
      );

      await conn.relayMessage(m.chat, msg.message, {
        messageId: msg.key.id,
        additionalNodes: [
          {
            tag: "biz",
            attrs: {},
            content: [
              {
                tag: "interactive",
                attrs: { type: "native_flow", v: "1" },
                content: [
                  { tag: "native_flow", attrs: { v: "9", name: "mixed" } },
                ],
              },
            ],
          },
        ],
      });

      await conn.sendMessage(m.chat, { react: { text: "🎶", key: m.key } });
    } catch (e) {
      console.error("YT Search Error:", e);
      m.reply(`Error YT Search: ${e.message}`);
    }
  },
};
