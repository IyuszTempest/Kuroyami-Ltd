const fs = require("fs");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

const SECTIONS = [
  {
    title: "FITUR UTAMA",
    items: {
      main: ["🏠", "Main Menu", "Info bot dan perintah dasar"],
      ai: ["🧠", "AI Menu", "Chat AI dan fitur pintar"],
      tools: ["🛠️", "Utility Tools", "Alat bantu sehari-hari"],
      sticker: ["🖼️", "Buat Stiker", "Ubah gambar jadi stiker"],
    },
  },
  {
    title: "MEDIA & HIBURAN",
    items: {
      anime: ["🌸", "Anime & Gambar", "Gambar dan info anime"],
      downloader: ["📥", "Media Downloader", "Unduh video, musik, dan file"],
    },
  },
  {
    title: "INFO & KELOLA",
    items: {
      economic: ["💵", "Info Pasar Global", "Kurs, saham, dan kripto"],
      group: ["👥", "Group Manager", "Kelola dan atur grup"],
    },
  },
  {
    title: "DEVELOPER",
    items: {
      owner: ["👑", "Developer Only", "Khusus owner bot"],
    },
  },
];

function formatUptime(ms) {
  if (!Number.isFinite(ms)) ms = 0;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  const min = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const clock = [h, min, s].map((v) => String(v).padStart(2, "0")).join(":");
  return d > 0 ? `${d}h ${clock}` : clock;
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Jakarta",
    }).format(new Date()),
  );
  if (hour >= 4 && hour < 11) return "Selamat pagi";
  if (hour >= 11 && hour < 15) return "Selamat siang";
  if (hour >= 15 && hour < 18) return "Selamat sore";
  return "Selamat malam";
}

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

function countByCategory() {
  const result = {};
  const plugins = global.plugins || {};
  for (const key in plugins) {
    const p = plugins[key];
    if (!p || p.disabled || !p.command) continue;
    const cats = Array.isArray(p.category) ? p.category : [p.category];
    const cmds = Array.isArray(p.command) ? p.command : [p.command];
    for (const c of cats) {
      if (c) result[c] = (result[c] || 0) + cmds.length;
    }
  }
  return result;
}

module.exports = {
  command: ["menu", "help", "?"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { usedPrefix }) => {
    try {
      const pfx = usedPrefix || ".";
      await conn.sendMessage(m.chat, { react: { text: "✨", key: m.key } });

      const name = `@${m.sender.split("@")[0]}`;
      const uptime = formatUptime(process.uptime() * 1000);
      const counts = countByCategory();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);

      const sections = SECTIONS.map(({ title, items }) => ({
        title,
        rows: Object.entries(items)
          .filter(([tag]) => tag === "main" || counts[tag])
          .map(([tag, [icon, label, desc]]) => ({
            header: "",
            title: `${icon}  ${label}`,
            description: `${counts[tag] || 0} perintah  •  ${desc}`,
            id: `${pfx}allmenu ${tag}`,
          })),
      })).filter((s) => s.rows.length > 0);

      const listMessage = { title: "Pilih Kategori", sections };

      const body =
        `╭─〔 *${global.namebot}* 〕\n` +
        `│ ${greeting()}, ${name} 👋\n` +
        `│\n` +
        `│ ⏱️ Uptime : ${uptime}\n` +
        `│ 📦 Fitur  : ${total} perintah\n` +
        `│ 🤖 Bot    : ${global.namebot}\n` +
        `╰──────────────\n\n` +
        `Tekan tombol *Pilih Kategori* di bawah untuk melihat daftar perintah.`;

      let header = proto.Message.InteractiveMessage.Header.create({
        title: "",
        hasMediaAttachment: false,
      });

      const image = resolveImage(global.imgmenu);
      if (!image) {
        console.warn(
          "[menu] global.imgmenu kosong atau tidak valid, menu dikirim tanpa gambar",
        );
      } else {
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
          console.error("[menu] gagal upload gambar:", err);
        }
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
                    buttons: [
                      {
                        name: "single_select",
                        buttonParamsJson: JSON.stringify(listMessage),
                      },
                    ],
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
    } catch (e) {
      console.error("[menu]", e);
      m.reply(`❌ Gagal memuat menu: ${e.message}`);
    }
  },
};
