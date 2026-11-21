const fs = require("fs");
const axios = require("axios");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME = /image\/(jpe?g|png|webp)/i;
const REMOVE_KEYWORDS = ["hapus", "remove", "reset", "delete"];
const DOWNLOAD_ATTEMPTS = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function tryPrepareMedia(conn, image) {
  if (!image) return null;
  try {
    return await prepareWAMessageMedia(
      { image },
      { upload: conn.waUploadToServer },
    );
  } catch (err) {
    console.error("[setppbot] gagal upload gambar:", err.message);
    return null;
  }
}

function botJid(conn) {
  return `${String(conn.user.id).split(":")[0].split("@")[0]}@s.whatsapp.net`;
}

function formatSize(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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

async function toSquare(buffer) {
  let sharp;
  try {
    sharp = require("sharp");
  } catch {
    return { buffer, squared: false };
  }
  try {
    const out = await sharp(buffer)
      .rotate()
      .resize(640, 640, { fit: "cover", position: "centre" })
      .jpeg({ quality: 90 })
      .toBuffer();
    return { buffer: out, squared: true };
  } catch (err) {
    console.warn("[setppbot] sharp gagal, pakai gambar asli:", err.message);
    return { buffer, squared: false };
  }
}

function describeError(err) {
  const cause = err?.cause;
  const detail = cause?.code || cause?.message;
  return `${err?.message || String(err)}${detail ? ` (${detail})` : ""}`;
}

function buildMessageObject(m, q) {
  if (q.fakeObj?.message) return q.fakeObj;
  if (q === m && m.message) return { key: m.key, message: m.message };
  if (q.msg && q.mtype) {
    return {
      key: {
        remoteJid: m.chat,
        fromMe: !!q.fromMe,
        id: q.id,
        participant: q.sender,
      },
      message: { [q.mtype]: q.msg },
    };
  }
  return null;
}

async function downloadImage(conn, m, q) {
  const errors = [];

  if (typeof q.download === "function") {
    for (let i = 0; i < DOWNLOAD_ATTEMPTS; i++) {
      try {
        const buf = await q.download();
        if (buf?.length) return buf;
        errors.push("fungsi unduh bot mengembalikan data kosong");
      } catch (err) {
        errors.push(describeError(err));
      }
      if (i < DOWNLOAD_ATTEMPTS - 1) await sleep(1500);
    }
  }

  if (typeof downloadMediaMessage === "function") {
    const msgObj = buildMessageObject(m, q);
    if (msgObj) {
      for (let i = 0; i < DOWNLOAD_ATTEMPTS; i++) {
        try {
          const buf = await downloadMediaMessage(
            msgObj,
            "buffer",
            {},
            { reuploadRequest: conn.updateMediaMessage },
          );
          if (buf?.length) return buf;
          errors.push("Baileys mengembalikan data kosong");
        } catch (err) {
          errors.push(describeError(err));
        }
        if (i < DOWNLOAD_ATTEMPTS - 1) await sleep(1500);
      }
    }
  }

  console.error("[setppbot] semua jalur unduh gagal:", errors);
  const reasons =
    [...new Set(errors)].slice(-2).join(" | ") || "penyebab tidak diketahui";
  throw new Error(
    `Gagal mengunduh gambar (${reasons}).\n` +
      `💡 Ini biasanya masalah koneksi bot ke server media WhatsApp, atau gambarnya sudah kedaluwarsa.\n` +
      `Coba kirim ulang gambarnya, atau pakai link: \`.setppbot https://...\``,
  );
}

async function getImageBuffer(conn, m, text) {
  const q = m.quoted || m;
  const mime =
    (q.msg || q).mimetype ||
    q.mimetype ||
    q.mediaType ||
    (q.mtype === "imageMessage" ? "image/jpeg" : "");

  if (IMAGE_MIME.test(mime)) {
    return await downloadImage(conn, m, q);
  }

  const url = (String(text || "").match(/https?:\/\/\S+/i) || [])[0];
  if (url) {
    let res;
    try {
      res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
      });
    } catch (err) {
      throw new Error(`Gagal membuka link (${describeError(err)})`);
    }
    const type = String(res.headers["content-type"] || "");
    if (!IMAGE_MIME.test(type)) {
      throw new Error("Link tersebut bukan gambar (JPG, PNG, atau WEBP)");
    }
    return Buffer.from(res.data);
  }

  return null;
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
              body: proto.Message.InteractiveMessage.Body.create({
                text: body,
              }),
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
              content: [
                { tag: "native_flow", attrs: { v: "9", name: "mixed" } },
              ],
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error("[setppbot] kartu gagal, kirim teks biasa:", err.message);
    await conn.sendMessage(
      m.chat,
      { text: body, mentions: [m.sender] },
      { quoted: m },
    );
  }
}

/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["setppbot", "setbotpp", "ubahppbot", "gantippbot"],
  category: "owner",
  owner: true,
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    const pfx = usedPrefix || ".";
    const cmd = command || "setppbot";
    const input = String(text || "")
      .trim()
      .toLowerCase();
    const jid = botJid(conn);

    try {
      if (REMOVE_KEYWORDS.includes(input)) {
        await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
        await conn.removeProfilePicture(jid);
        await conn.sendMessage(m.chat, { react: { text: "🗑️", key: m.key } });

        return await sendCardSafe(conn, m, {
          body:
            `╭─〔 🗑️ *FOTO PROFIL BOT DIHAPUS* 〕\n` +
            `│ 🕐 Waktu : ${formatDateTime(Date.now())}\n` +
            `╰──────────────\n\n` +
            `Foto profil bot sudah dihapus. Kirim gambar dengan *${pfx}${cmd}* untuk memasang yang baru.`,
          buttons: [replyButton("🏠 Buka Menu", `${pfx}menu`)],
        });
      }

      let source;
      try {
        await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
        source = await getImageBuffer(conn, m, text);
      } catch (err) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(`❌ *Gagal mengambil gambar:* ${err.message}`);
      }

      if (!source) {
        const body =
          `╭─〔 🖼️ *UBAH FOTO PROFIL BOT* 〕\n` +
          `│ Khusus owner bot.\n` +
          `╰──────────────\n\n` +
          `📌 *Cara pakai*\n` +
          `• Kirim gambar dengan caption \`${pfx}${cmd}\`\n` +
          `• Atau reply gambar dengan \`${pfx}${cmd}\`\n` +
          `• Atau pakai link: \`${pfx}${cmd} https://...\`\n\n` +
          `🗑️ *Hapus foto*\n> \`${pfx}${cmd} hapus\`\n\n` +
          `📋 *Ketentuan*\n` +
          `• Format JPG, PNG, atau WEBP\n` +
          `• Maksimal ${formatSize(MAX_BYTES)}\n` +
          `• Gambar dipotong jadi persegi di tengah`;

        await conn.sendMessage(m.chat, { react: { text: "🖼️", key: m.key } });
        return await sendCardSafe(conn, m, {
          media: await tryPrepareMedia(
            conn,
            resolveImage(global.imgall || global.imgmenu),
          ),
          body,
          buttons: [replyButton("🗑️ Hapus Foto Bot", `${pfx}${cmd} hapus`)],
        });
      }

      if (source.length > MAX_BYTES) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(
          `❌ *Gagal:* Ukuran gambar ${formatSize(source.length)}, maksimal ${formatSize(MAX_BYTES)}.`,
        );
      }

      const { buffer, squared } = await toSquare(source);

      try {
        await conn.updateProfilePicture(jid, buffer);
      } catch (err) {
        console.error("[setppbot] updateProfilePicture gagal:", err);
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        const needLib = /sharp|jimp/i.test(String(err?.message));
        return m.reply(
          `❌ *Gagal mengganti foto:* ${describeError(err)}` +
            (needLib
              ? `\n💡 Baileys butuh library pengolah gambar. Jalankan: \`npm i sharp\``
              : ""),
        );
      }

      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });

      const body =
        `╭─〔 🖼️ *PP BOT DIPERBARUI* 〕\n` +
        `│ 📐 Ukuran : ${squared ? "640×640 (persegi)" : "asli (tanpa pemotongan)"}\n` +
        `│ 📦 Berat  : ${formatSize(buffer.length)}\n` +
        `│ 🕐 Waktu  : ${formatDateTime(Date.now())}\n` +
        `╰──────────────\n\n` +
        `Foto profil bot sudah berganti. Perubahan bisa butuh beberapa detik untuk muncul di semua perangkat.` +
        (squared
          ? ""
          : `\n\n_Tips: pasang_ \`sharp\` _(npm i sharp) supaya gambar otomatis dipotong persegi._`);

      await sendCardSafe(conn, m, {
        media: await tryPrepareMedia(conn, buffer),
        body,
        buttons: [
          replyButton("🗑️ Hapus Foto", `${pfx}${cmd} hapus`),
          replyButton("🏠 Buka Menu", `${pfx}menu`),
        ],
      });
    } catch (e) {
      console.error("[setppbot]", e);
      await conn
        .sendMessage(m.chat, { react: { text: "❌", key: m.key } })
        .catch(() => {});
      m.reply(`❌ Terjadi kesalahan: ${describeError(e)}`);
    }
  },
};
