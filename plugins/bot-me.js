const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

module.exports = {
  command: ["me", "profile", "profil"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { usedPrefix: _p }) => {
    try {
      await conn.sendMessage(m.chat, { react: { text: "👤", key: m.key } });

      let who =
        m.mentionedJid && m.mentionedJid[0]
          ? m.mentionedJid[0]
          : m.quoted
            ? m.quoted.sender
            : m.sender;

      let user = global.db?.data?.users?.[who] || {};
      let userName = user.name || conn.getName(who) || "Pengguna Baru";
      let userAge = user.age || "Tidak diset";

      let isRegistered = user.registered ? "Terdaftar ✓" : "Belum Terdaftar ❌";
      let isPremium = user.premium ? "Premium 👑" : "Free User 🍃";

      let premiumInfo = "";
      if (user.premium && user.premiumTime) {
        let timeLeft = user.premiumTime - Date.now();
        if (timeLeft > 0) {
          let days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
          let hours = Math.floor(
            (timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
          );
          premiumInfo = `\n> ⏳ *Sisa Premium:* ${days} hari ${hours} jam`;
        } else {
          isPremium = "Expired ⚠️";
        }
      }

      let imageUrl =
        global.imgall ||
        "https://placehold.co/600x600/9b005a/ffffff?text=User+Profile";

      let media;
      try {
        media = await prepareWAMessageMedia(
          { image: { url: imageUrl } },
          { upload: conn.waUploadToServer },
        );
      } catch (mediaError) {
        console.error("Gagal memuat global.imgall:", mediaError);
        media = await prepareWAMessageMedia(
          {
            image: {
              url: "https://placehold.co/600x600/111111/ffffff?text=Profile+Card",
            },
          },
          { upload: conn.waUploadToServer },
        );
      }

      let cap = `*「 USER PROFILE INFO 」*\n\n`;
      cap += `> 👤 *Nama:* ${userName}\n`;
      cap += `> 🔢 *Umur:* ${userAge} ${userAge !== "Tidak diset" ? "Tahun" : ""}\n`;
      cap += `> 📱 *Nomor:* @${who.split("@")[0]}\n`;
      cap += `> 📋 *Status Daftar:* ${isRegistered}\n`;
      cap += `> 💎 *Status Akun:* ${isPremium}${premiumInfo}\n`;
      cap += `> 📌 *Tipe:* ${who.endsWith("@lid") ? "Active (LID) ✓" : "Standard 📱"}\n\n`;
      cap += `_Informasi akun terhubung langsung dengan sistem basis data._`;

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
                  title: "",
                  hasMediaAttachment: true,
                  ...media,
                }),
                body: proto.Message.InteractiveMessage.Body.create({
                  text: cap,
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: global.wm || "Sistem Informasi Pengguna",
                }),
                nativeFlowMessage:
                  proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    messageVersion: 1,
                    buttons: [
                      {
                        name: "cta_copy",
                        buttonParamsJson: JSON.stringify({
                          display_text: "Salin Nomor 📱",
                          copy_code: who.split("@")[0],
                        }),
                      },
                      {
                        name: "cta_url",
                        buttonParamsJson: JSON.stringify({
                          display_text: "Chat WhatsApp",
                          url: `https://wa.me/${who.split("@")[0]}`,
                        }),
                      },
                    ],
                  }),
                contextInfo: {
                  mentionedJid: [m.sender, who],
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

      await conn.sendMessage(m.chat, { react: { text: "✨", key: m.key } });
    } catch (e) {
      console.error("Eror pada command Profile:", e);
      m.reply(`> ❌ Waduh, gagal mengambil profil: ${e.message}`);
    }
  },
};
