const fs = require("fs");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

const CONFIRM_WINDOW_MS = 2 * 60 * 1000;
const CONFIRM_KEYWORDS = ["confirm", "konfirmasi", "ya", "yes"];
const CANCEL_KEYWORDS = ["batal", "cancel", "tidak", "no"];
const pending = new Map();


/* ───────────────────────── Helper ───────────────────────── */
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

async function getMedia(conn) {
  const image = resolveImage(global.imgall || global.imgmenu);
  if (!image) return null;
  try {
    return await prepareWAMessageMedia(
      { image },
      { upload: conn.waUploadToServer },
    );
  } catch (err) {
    console.error("[unreg] gagal upload gambar:", err.message);
    return null;
  }
}

function formatDateTime(ts) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date(ts)) + " WIB"
  );
}

function formatDuration(ms) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor(ms / 3600000) % 24;
  const min = Math.floor(ms / 60000) % 60;
  if (d > 0) return `${d} hari ${h} jam`;
  if (h > 0) return `${h} jam ${min} menit`;
  return `${Math.max(min, 1)} menit`;
}

const replyButton = (text, id) => ({
  name: "quick_reply",
  buttonParamsJson: JSON.stringify({ display_text: text, id }),
});

async function sendCardSafe(conn, m, { media, body, footer, buttons }) {
  try {
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
              body: proto.Message.InteractiveMessage.Body.create({ text: body }),
              footer: proto.Message.InteractiveMessage.Footer.create({
                text: footer || global.wm || "Powered by Node.js",
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
              content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("[unreg] kartu gagal, kirim teks biasa:", err.message);
    await conn.sendMessage(
      m.chat,
      { text: body, mentions: [m.sender] },
      { quoted: m },
    );
  }
}


/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["unreg", "unregister"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    try {
      const pfx = usedPrefix || ".";
      const cmd = command || "unreg";

      if (!global.db?.data) {
        return m.reply("❌ Database bot belum siap. Coba lagi sebentar lagi ya.");
      }
      const user = global.db.data.users?.[m.sender];

      if (!user?.registered) {
        pending.delete(m.sender);
        const body =
          `╭─〔 ℹ️ *BELUM TERDAFTAR* 〕\n` +
          `│ Akunmu belum terdaftar,\n` +
          `│ jadi tidak ada yang perlu dihapus.\n` +
          `╰──────────────\n\n` +
          `Mau daftar sekarang? Tekan tombol di bawah.`;

        return await sendCardSafe(conn, m, {
          body,
          buttons: [replyButton("📝 Daftar Sekarang", `${pfx}daftar`)],
        });
      }

      const input = String(text || "").trim().toLowerCase();

      if (CANCEL_KEYWORDS.includes(input)) {
        pending.delete(m.sender);
        await conn.sendMessage(m.chat, { react: { text: "👌", key: m.key } });
        return m.reply("👌 Oke, penghapusan pendaftaran dibatalkan. Akunmu tetap aman.");
      }

      if (CONFIRM_KEYWORDS.includes(input)) {
        const expiry = pending.get(m.sender);
        if (expiry && expiry >= Date.now()) {
          pending.delete(m.sender);

          const oldName = user.name;
          const oldAge = user.age;
          const lived = user.regTime ? formatDuration(Date.now() - user.regTime) : null;

          user.registered = false;
          delete user.name;
          delete user.age;
          delete user.regTime;

          await conn.sendMessage(m.chat, { react: { text: "🗑️", key: m.key } });

          const body =
            `╭─〔 🗑️ *PENDAFTARAN DIHAPUS* 〕\n` +
            `│ 👤 Nama   : ${oldName}\n` +
            `│ 🎂 Umur   : ${oldAge} tahun\n` +
            (lived ? `│ ⏳ Aktif  : ${lived}\n` : "") +
            `╰──────────────\n\n` +
            `Data pendaftaranmu sudah dihapus. Data lain seperti status premium tidak ikut terhapus.\n` +
            `Kamu bisa daftar lagi kapan saja.`;

          return await sendCardSafe(conn, m, {
            body,
            buttons: [
              replyButton("📝 Daftar Lagi", `${pfx}daftar`),
              replyButton("⚡ Daftar Otomatis", `${pfx}daftar auto`),
            ],
          });
        }
        pending.delete(m.sender);
      }

      pending.set(m.sender, Date.now() + CONFIRM_WINDOW_MS);
      if (pending.size > 500) {
        const now = Date.now();
        for (const [k, t] of pending) if (t < now) pending.delete(k);
      }

      await conn.sendMessage(m.chat, { react: { text: "❓", key: m.key } });

      const body =
        `╭─〔 ⚠️ *HAPUS PENDAFTARAN?* 〕\n` +
        `│ 👤 Nama   : ${user.name}\n` +
        `│ 🎂 Umur   : ${user.age} tahun\n` +
        (user.regTime ? `│ 🕐 Sejak  : ${formatDateTime(user.regTime)}\n` : "") +
        `╰──────────────\n\n` +
        `Setelah dihapus, kamu tidak bisa memakai fitur yang butuh pendaftaran sampai daftar lagi.\n\n` +
        `Permintaan ini berlaku *${CONFIRM_WINDOW_MS / 60000} menit*.`;

      await sendCardSafe(conn, m, {
        media: await getMedia(conn),
        body,
        buttons: [
          replyButton("✅ Ya, Hapus", `${pfx}${cmd} confirm`),
          replyButton("❌ Batal", `${pfx}${cmd} batal`),
        ],
      });
    } catch (e) {
      console.error("[unreg]", e);
      m.reply(`❌ Terjadi kesalahan: ${e.message}`);
    }
  },
};
