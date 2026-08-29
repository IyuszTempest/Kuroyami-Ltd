const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

module.exports = {
  command: ["menu", "help", "?"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { usedPrefix: _p }) => {
    try {
      await conn.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

      let name = `@${m.sender.split`@`[0]}`;
      let uptime = clockString(process.uptime() * 1000);

      const allTags = {
        main: "🏠 Main Menu",
        anime: "🌸 Anime & Manga",
        ai: "🧠 Artificial Intelligence",
        downloader: "📥 Media Downloader",
        economic: "💵 Global Economy",
        group: "👥 Group Manager",
        game: "🎮 Gaming Area",
        tools: "🛠️ Utility Tools",
        owner: "👑 Developer Only",
      };

      let rows = [];
      for (let tag in allTags) {
        rows.push({
          header: "",
          title: allTags[tag],
          description: `Lihat daftar perintah untuk kategori ini`,
          id: `${_p}allmenu ${tag}`,
        });
      }

      let listMessage = {
        title: "✨ Daftar Menu",
        sections: [
          {
            title: "KATEGORI PERINTAH",
            rows: rows,
          },
        ],
      };

      let menuContent = `*Kuroyami Menu*\n\n`;
      menuContent += `> 👋🏻 *Halo, ${name}!*\n`;
      menuContent += `> ⏱️ *Uptime:* ${uptime}\n`;
      menuContent += `> 🤖 *Bot:* Kuroyami Ltd.\n`;
      menuContent += `> ⚙️ *Sistem:* WhatsApp Bot\n\n`;
      menuContent += `Silakan klik tombol *Daftar Menu* di bawah untuk menjelajahi fitur yang tersedia.`;

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
                  title: ``,
                  hasMediaAttachment: true,
                  ...(await prepareWAMessageMedia(
                    { image: { url: global.imgmenu } },
                    { upload: conn.waUploadToServer },
                  )),
                }),
                body: proto.Message.InteractiveMessage.Body.create({
                  text: menuContent,
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: global.wm || "Powered by Node.js",
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
    } catch (e) {
      console.error(e);
      m.reply(`> ❌ Gagal memuat menu: ${e.message}`);
    }
  },
};

function clockString(ms) {
  if (isNaN(ms)) ms = 0;
  let h = Math.floor(ms / 3600000);
  let m = Math.floor(ms / 60000) % 60;
  let s = Math.floor(ms / 1000) % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}
