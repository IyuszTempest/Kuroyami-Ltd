const fs = require("fs");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

function resolveImage(src) {
  if (Array.isArray(src)) src = src[Math.floor(Math.random() * src.length)];
  if (!src) return null;
  if (Buffer.isBuffer(src)) return src;
  if (typeof src === "string") {
    if (/^https?:\/\//i.test(src)) return { url: src };
    if (fs.existsSync(src)) return fs.readFileSync(src);
  }
  return null;
}

function cleanNumber(raw) {
  const first = Array.isArray(raw) ? raw[0] : raw;
  return String(first || "").replace(/@.*$/, "").replace(/\D/g, "");
}

const SOCIALS = [
  { key: "github", label: "GitHub", icon: "💻" },
  { key: "instagram", label: "Instagram", icon: "📸" },
  { key: "website", label: "Website", icon: "🌐" },
  { key: "youtube", label: "YouTube", icon: "▶️" },
  { key: "tiktok", label: "TikTok", icon: "🎵" },
  { key: "linkedin", label: "LinkedIn", icon: "💼" },
];

module.exports = {
  command: ["owner", "creator", "developer"],
  category: "main",
  noPrefix: true,
  call: async (conn, m) => {
    try {
      await conn.sendMessage(m.chat, { react: { text: "👑", key: m.key } });

      const ownerNumber = cleanNumber(global.owner);
      if (!ownerNumber) {
        return m.reply("❌ Nomor owner belum diatur di konfigurasi bot.");
      }

      const ownerName = global.nameowner || "Owner";
      const org = global.orgowner || "";
      const title = global.titleowner || "Developer";
      const social = global.social || {};
      const activeSocials = SOCIALS.filter((s) => social[s.key]);

      const body =
        `╭─〔 *${ownerName.toUpperCase()}* 〕\n` +
        `│ 👑 ${title}\n` +
        (org ? `│ 🏢 ${org}\n` : "") +
        `│ 📱 +${ownerNumber}\n` +
        `╰──────────────\n\n` +
        `Tekan tombol di bawah untuk menghubungi owner. Mohon jangan spam ya!`;

      const buttons = [
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: "💬 Chat Owner",
            url: `https://wa.me/${ownerNumber}`,
            merchant_url: `https://wa.me/${ownerNumber}`,
          }),
        },
        {
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: "📋 Salin Nomor",
            copy_code: `+${ownerNumber}`,
          }),
        },
        ...activeSocials.slice(0, 3).map((s) => ({
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: `${s.icon} ${s.label}`,
            url: social[s.key],
            merchant_url: social[s.key],
          }),
        })),
      ];

      let header = proto.Message.InteractiveMessage.Header.create({
        title: "",
        hasMediaAttachment: false,
      });

      const image = resolveImage(global.imgall);
      if (image) {
        try {
          const media = await prepareWAMessageMedia(
            { image },
            { upload: conn.waUploadToServer },
          );
          header = proto.Message.InteractiveMessage.Header.create({
            title: "",
            hasMediaAttachment: true,
            ...media,
          });
        } catch (err) {
          console.error("[owner] gagal upload gambar:", err);
        }
      } else {
        console.warn(
          "[owner] global.imgowner / global.imgmenu kosong atau tidak valid, dikirim tanpa gambar",
        );
      }

      const contextInfo = { mentionedJid: [m.sender] };
      if (global.idch) {
        Object.assign(contextInfo, {
          forwardingScore: 999,
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: global.idch,
            serverMessageId: 143,
            newsletterName: global.namech || "Kuroyami",
          },
        });
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
                header,
                body: proto.Message.InteractiveMessage.Body.create({
                  text: body,
                }),
                footer: proto.Message.InteractiveMessage.Footer.create({
                  text: global.wm || "Powered by Node.js",
                }),
                nativeFlowMessage:
                  proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    messageVersion: 1,
                    buttons,
                  }),
                contextInfo,
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

      const vcard = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${ownerName}`,
        org && `ORG:${org}`,
        `TITLE:${title}`,
        `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}`,
        ...activeSocials.map((s) => `URL;type=${s.label}:${social[s.key]}`),
        "END:VCARD",
      ]
        .filter(Boolean)
        .join("\n");

      await conn.sendMessage(
        m.chat,
        {
          contacts: {
            displayName: ownerName,
            contacts: [{ vcard }],
          },
        },
        { quoted: m },
      );
    } catch (e) {
      console.error("[owner]", e);
      m.reply(`❌ Gagal menampilkan info owner: ${e.message}`);
    }
  },
};
