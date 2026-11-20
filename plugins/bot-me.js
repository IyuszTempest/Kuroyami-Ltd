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

async function tryPrepareMedia(conn, image) {
  if (!image) return null;
  try {
    return await prepareWAMessageMedia(
      { image },
      { upload: conn.waUploadToServer },
    );
  } catch (err) {
    console.error("[profile] gagal upload gambar:", err.message);
    return null;
  }
}

function formatRemaining(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  const min = Math.floor(ms / 60000) % 60;
  if (d > 0) return `${d} hari ${h} jam`;
  if (h > 0) return `${h} jam ${min} menit`;
  return `${Math.max(min, 1)} menit`;
}

module.exports = {
  command: ["me", "profile", "profil"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { usedPrefix }) => {
    try {
      const pfx = usedPrefix || ".";
      await conn.sendMessage(m.chat, { react: { text: "👤", key: m.key } });
      
      const who = m.mentionedJid?.[0] || m.quoted?.sender || m.sender;
      const rawId = who.split("@")[0];
      const isLid = who.endsWith("@lid");

      const user = global.db?.data?.users?.[who] || {};
      const userName =
        user.name || (await conn.getName?.(who)) || "Pengguna Baru";

      const hasAge = user.age !== undefined && user.age !== null && user.age !== "";
      const ageText = hasAge ? `${user.age} tahun` : "Belum diatur";

      const registered = user.registered ? "Terdaftar ✓" : "Belum terdaftar";

      let accountText = "Free User 🍃";
      let premiumLeft = "";
      if (user.premium) {
        if (!user.premiumTime) {
          accountText = "Premium 👑";
        } else {
          const left = user.premiumTime - Date.now();
          if (left > 0) {
            accountText = "Premium 👑";
            premiumLeft = formatRemaining(left);
          } else {
            accountText = "Premium berakhir ⚠️";
          }
        }
      }

      // Baris opsional: hanya tampil kalau datanya ada di database
      const extra = [];
      if (user.level !== undefined) extra.push(`│ 🎖️ Level  : ${user.level}`);
      if (user.exp !== undefined) extra.push(`│ ✨ EXP    : ${user.exp}`);
      if (user.limit !== undefined) extra.push(`│ 🎟️ Limit  : ${user.limit}`);

      const body =
        `╭─〔 *PROFIL PENGGUNA* 〕\n` +
        `│ 🟣 Username   : @${m.sender.split("@")[0]}\n` +       
        `│ 👤 Nama   : ${userName}\n` +
        `│ 🎂 Umur   : ${ageText}\n` +
        `│ 📋 Daftar : ${registered}\n` +
        `│ 💎 Akun   : ${accountText}\n` +
        (premiumLeft ? `│ ⏳ Sisa   : ${premiumLeft}\n` : "") +
        (extra.length ? extra.join("\n") + "\n" : "") +
        `╰──────────────\n\n` +
        `_Data diambil langsung dari database bot._`;

      let media = null;
      try {
        const ppUrl = await conn.profilePictureUrl(who, "image");
        media = await tryPrepareMedia(conn, { url: ppUrl });
      } catch {
      }
      if (!media) {
        media = await tryPrepareMedia(
          conn,
          resolveImage(global.imgall || global.imgmenu),
        );
      }

      const header = media
        ? proto.Message.InteractiveMessage.Header.create({
            title: "",
            hasMediaAttachment: true,
            ...media,
          })
        : proto.Message.InteractiveMessage.Header.create({
            title: "",
            hasMediaAttachment: false,
          });
      
      const buttons = [];
      if (!isLid) {
        buttons.push(
          {
            name: "cta_copy",
            buttonParamsJson: JSON.stringify({
              display_text: "📋 Salin Nomor",
              copy_code: rawId,
            }),
          },
          {
            name: "cta_url",
            buttonParamsJson: JSON.stringify({
              display_text: "💬 Chat WhatsApp",
              url: `https://wa.me/${rawId}`,
              merchant_url: `https://wa.me/${rawId}`,
            }),
          },
        );
      }
      buttons.push({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: "🏠 Buka Menu",
          id: `${pfx}menu`,
        }),
      });

      const contextInfo = { mentionedJid: [...new Set([m.sender, who])] };
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
                  text: global.wm || "Sistem Informasi Pengguna",
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

      await conn.sendMessage(m.chat, { react: { text: "✨", key: m.key } });
    } catch (e) {
      console.error("[profile]", e);
      m.reply(`❌ Gagal mengambil profil: ${e.message}`);
    }
  },
};
