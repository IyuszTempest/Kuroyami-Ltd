const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

const badWordsList = [
  "anjing",
  "njing",
  "bangsat",
  "bgst",
  "kontol",
  "kntl",
  "memek",
  "mmk",
  "ngentot",
  "ngewe",
  "babi",
  "asu",
  "jablay",
  "lonte",
  "perek",
  "pantek",
  "peler",
  "pler",
  "pepek",
  "tolol",
  "goblok",
  "gblk",
  "bajingan",
  "bajngn",
  "bacot",
  "bacotnya",
  "bodoh",
  "gacor",
  "maxwin",
  "zeus",
  "judi",
  "vcs",
  "bokep",
];

function isContainBadWord(text) {
  const lowerText = text.toLowerCase();
  for (const word of badWordsList) {
    const escapedWord = word
      .replace(/a/gi, "[a4@]")
      .replace(/i/gi, "[i1!]")
      .replace(/e/gi, "[e3]")
      .replace(/o/gi, "[o0]")
      .replace(/s/gi, "[s5$]")
      .replace(/g/gi, "[g9]");

    const regex = new RegExp(`\\b${escapedWord}\\b`, "i");
    if (regex.test(lowerText) || lowerText.includes(word)) {
      return word;
    }
  }
  return false;
}

module.exports = {
  command: [
    "grupset",
    "grupmenu",
    "antilink",
    "antitagsw",
    "badword",
    "open",
    "close",
    "buka",
    "tutup",
  ],
  category: "group",
  noPrefix: true,
  group: true,
  admin: true,

  // ==========================================
  // MIDDLEWARE / BEFORE HANDLER (Security & Protections)
  // ==========================================
  before: async (m, { conn, isAdmin, isBotAdmin }) => {
    if (!m.isGroup || m.fromMe) return false;

    global.db = global.db || { data: {} };
    global.db.data.chats = global.db.data.chats || {};
    global.db.data.users = global.db.data.users || {};

    let chat = global.db.data.chats[m.chat];
    if (!chat)
      chat = global.db.data.chats[m.chat] = {
        antilink: false,
        antitagsw: false,
        badword: false,
      };

    const text = (m.text || m.caption || m.body || m.msg?.text || "").trim();

    // 1. BADWORD FILTER CHECK
    if (chat.badword && text && !isAdmin) {
      const detectedWord = isContainBadWord(text);
      if (detectedWord && isBotAdmin) {
        try {
          await conn.sendMessage(m.chat, { delete: m.key });
          await conn.sendMessage(m.chat, {
            text: `⚠️ *Pesan Dihapus*\n\n@${m.sender.split("@")[0]}, dilarang menggunakan kata kasar atau promosi terlarang (*${detectedWord}*) di grup ini!`,
            mentions: [m.sender],
          });
          return true;
        } catch (err) {
          console.log("[BADWORD] Gagal menghapus pesan.");
        }
      }
    }

    // 2. ANTILINK CHECK
    if (chat.antilink && text) {
      const groupLink = /chat.whatsapp.com\/(?:invite\/)?([0-9A-Za-z]{20,24})/i;
      const containsLink = groupLink.test(text);

      if (containsLink && !isAdmin && isBotAdmin) {
        await conn.sendMessage(m.chat, { react: { text: "🗿", key: m.key } });

        const userKey = `${m.sender}_${m.chat}`;
        if (!global.db.data.users[userKey])
          global.db.data.users[userKey] = { warning: 0 };
        let user = global.db.data.users[userKey];

        user.warning += 1;
        await conn.sendMessage(m.chat, { delete: m.key });

        if (user.warning < 2) {
          return conn.sendMessage(
            m.chat,
            {
              text: `*⚠️ PERINGATAN ANTILINK (1/2) ⚠️*\n\n@${m.sender.split("@")[0]}, jangan kirim link grup lain! Satu kali lagi kamu akan di-kick otomatis.`,
              mentions: [m.sender],
            },
            { quoted: m },
          );
        } else {
          await conn.sendMessage(m.chat, {
            text: `*🚫 PELANGGARAN KEDUA 🚫*\n\nMaaf @${m.sender.split("@")[0]}, kamu dikeluarkan dari grup.`,
            mentions: [m.sender],
          });
          user.warning = 0;
          return setTimeout(async () => {
            await conn.groupParticipantsUpdate(m.chat, [m.sender], "remove");
          }, 800);
        }
      }
    }

    // 3. ANTITAGSW CHECK (Updated with Warning System)
    if (chat.antitagsw) {
      const isTaggingInStatus =
        m.mtype === "groupStatusMentionMessage" ||
        (m.quoted && m.quoted.mtype === "groupStatusMentionMessage") ||
        (m.message && m.message.groupStatusMentionMessage) ||
        (m.message &&
          m.message.protocolMessage &&
          m.message.protocolMessage.type === 25);

      if (isTaggingInStatus && !isAdmin && isBotAdmin) {
        await conn.sendMessage(m.chat, { delete: m.key });

        const userKey = `${m.sender}_${m.chat}_sw`; // Gunakan key unik buat warning status
        if (!global.db.data.users[userKey])
          global.db.data.users[userKey] = { warning: 0 };
        let user = global.db.data.users[userKey];

        user.warning += 1;

        if (user.warning < 2) {
          return conn.sendMessage(
            m.chat,
            {
              text: `*⚠️ PERINGATAN ANTITAG SW (1/2) ⚠️*\n\n@${m.sender.split("@")[0]}, jangan menandai grup di status WhatsApp! Satu kali lagi kamu akan di-kick otomatis.`,
              mentions: [m.sender],
            },
            { quoted: m },
          );
        } else {
          user.warning = 0;
          await conn.sendMessage(m.chat, {
            text: `*🚫 PELANGGARAN KEDUA 🚫*\n\nMaaf @${m.sender.split("@")[0]}, kamu dikeluarkan dari grup karena masih menandai grup di status.`,
            mentions: [m.sender],
          });
          return setTimeout(async () => {
            await conn.groupParticipantsUpdate(m.chat, [m.sender], "remove");
          }, 800);
        }
      }
    }
  },

  // ==========================================
  // MAIN CALL HANDLER (Interactive List Button Panel)
  // ==========================================
  call: async (conn, m, { args, usedPrefix, command }) => {
    try {
      global.db.data.chats = global.db.data.chats || {};
      if (!global.db.data.chats[m.chat]) {
        global.db.data.chats[m.chat] = {
          antilink: false,
          antitagsw: false,
          badword: false,
        };
      }
      let chat = global.db.data.chats[m.chat];

      if (args[0]) {
        const param = args[0].toLowerCase();
        if (["on", "off"].includes(param)) {
          const status = param === "on";
          if (command === "antilink") chat.antilink = status;
          if (command === "antitagsw") chat.antitagsw = status;
          if (command === "badword") chat.badword = status;
          return m.reply(
            `✅ *${command.toUpperCase()}* berhasil diubah menjadi: *${param.toUpperCase()}*`,
          );
        }
      }

      if (command === "open" || command === "buka") {
        await conn.groupSettingUpdate(m.chat, "not_announcement");
        return m.reply("✅ *Grup berhasil dibuka!*");
      }
      if (command === "close" || command === "tutup") {
        await conn.groupSettingUpdate(m.chat, "announcement");
        return m.reply("🔒 *Grup berhasil ditutup!*");
      }

      let name = `@${m.sender.split("@")[0]}`;
      let antilinkStatus = chat.antilink ? "🟢 Aktif" : "🔴 Nonaktif";
      let antitagStatus = chat.antitagsw ? "🟢 Aktif" : "🔴 Nonaktif";
      let badwordStatus = chat.badword ? "🟢 Aktif" : "🔴 Nonaktif";

      const listMessage = {
        title: "Group Management Control Panel",
        sections: [
          {
            title: "🛡️ Proteksi & Keamanan",
            highlight_label: "Moderation 🔥",
            rows: [
              {
                title: "Antilink ON",
                description: "Aktifkan filter link grup lain",
                id: `${usedPrefix}antilink on`,
              },
              {
                title: "Antilink OFF",
                description: "Matikan filter link grup lain",
                id: `${usedPrefix}antilink off`,
              },
              {
                title: "Anti Tag SW ON",
                description: "Aktifkan pencegah tag status WA",
                id: `${usedPrefix}antitagsw on`,
              },
              {
                title: "Anti Tag SW OFF",
                description: "Matikan pencegah tag status WA",
                id: `${usedPrefix}antitagsw off`,
              },
              {
                title: "Badword ON",
                description: "Aktifkan sensor kata kasar & slot/judi",
                id: `${usedPrefix}badword on`,
              },
              {
                title: "Badword OFF",
                description: "Matikan sensor kata kasar & slot/judi",
                id: `${usedPrefix}badword off`,
              },
            ],
          },
          {
            title: "⚙️ Pengaturan Akses Grup",
            rows: [
              {
                title: "Buka Grup",
                description: "Buka akses chat untuk member",
                id: `${usedPrefix}open`,
              },
              {
                title: "Tutup Grup",
                description: "Kunci grup (hanya admin)",
                id: `${usedPrefix}close`,
              },
            ],
          },
        ],
      };

      let menuContent = `👤 *User:* ${name}\n`;
      menuContent += `🛡️ *Antilink:* ${antilinkStatus}\n`;
      menuContent += `📌 *Anti Tag SW:* ${antitagStatus}\n`;
      menuContent += `🤬 *Badword Filter:* ${badwordStatus}\n\n`;
      menuContent += `Silahkan pilih opsi konfigurasi grup di bawah ini:`;

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
                  title: global.namebot || "WhatsApp Group Control",
                  hasMediaAttachment: true,
                  ...(await prepareWAMessageMedia(
                    { image: { url: global.imgall } },
                    { upload: conn.waUploadToServer },
                  )),
                }),
                body: proto.Message.InteractiveMessage.Body.create({
                  text: menuContent,
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: global.wm || "Bot Management System",
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
                    newsletterJid: global.idch || "",
                    serverMessageId: 143,
                    newsletterName: `${global.namech || "Bot"} - Online`,
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
      m.reply(`Error Handler: ${e.message}`);
    }
  },
};
