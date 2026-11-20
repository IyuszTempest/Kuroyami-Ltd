const fs = require("fs");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

const NAME_MIN = 2;
const NAME_MAX = 25;
const AGE_MIN = 5;
const AGE_MAX = 80;
const AUTO_AGE = 18;
const AUTO_KEYWORDS = ["auto", "otomatis"];


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
    console.error("[daftar] gagal upload gambar:", err.message);
    return null;
  }
}

async function getMedia(conn, jid) {
  try {
    const ppUrl = await conn.profilePictureUrl(jid, "image");
    const media = await tryPrepareMedia(conn, { url: ppUrl });
    if (media) return media;
  } catch {
  }
  return tryPrepareMedia(conn, resolveImage(global.imgall || global.imgmenu));
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

const copyButton = (text, code) => ({
  name: "cta_copy",
  buttonParamsJson: JSON.stringify({ display_text: text, copy_code: code }),
});

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
    console.error("[daftar] kartu gagal, kirim teks biasa:", err.message);
    await conn.sendMessage(
      m.chat,
      { text: body, mentions: [m.sender] },
      { quoted: m },
    );
  }
}

function sanitize(text) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function nameFromProfile(raw, jid) {
  let n = sanitize(raw)
    .replace(/[^\p{L}\p{N} .'_-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  n = Array.from(n).slice(0, NAME_MAX).join("").trim();
  if (Array.from(n).length < NAME_MIN || /^\d+$/.test(n)) {
    n = `User${jid.split("@")[0].slice(-4)}`;
  }
  return n;
}


/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["daftar", "reg"],
  category: "main",
  noPrefix: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    try {
      const pfx = usedPrefix || ".";
      const cmd = command || "daftar";

      if (!global.db?.data) {
        return m.reply("❌ Database bot belum siap. Coba lagi sebentar lagi ya.");
      }
      global.db.data.users ||= {};
      const users = global.db.data.users;
      const user = users[m.sender] || (users[m.sender] = {});

      if (user.registered) {
        const since = user.regTime ? `│ 🕐 Sejak  : ${formatDateTime(user.regTime)}\n` : "";
        const body =
          `╭─〔 ✅ *SUDAH TERDAFTAR* 〕\n` +
          `│ 👤 Nama   : ${user.name}\n` +
          `│ 🎂 Umur   : ${user.age} tahun\n` +
          since +
          `╰──────────────\n\n` +
          `Akunmu sudah aktif, kamu nggak perlu daftar lagi.`;

        return await sendCardSafe(conn, m, {
          body,
          buttons: [
            replyButton("👤 Lihat Profil", `${pfx}profile`),
            replyButton("🏠 Buka Menu", `${pfx}menu`),
          ],
        });
      }

      const completeRegistration = async (name, age, isAuto) => {
        Object.assign(user, {
          name,
          age,
          registered: true,
          regTime: Date.now(),
        });

        const memberNo = Object.values(users).filter((u) => u?.registered).length;

        await conn.sendMessage(m.chat, { react: { text: "🎉", key: m.key } });

        const body =
          `╭─〔 🎉 *PENDAFTARAN BERHASIL* 〕\n` +
          `│ 👤 Nama   : ${user.name}\n` +
          `│ 🎂 Umur   : ${user.age} tahun${isAuto ? " (default)" : ""}\n` +
          `│ 🔢 Member : #${memberNo}\n` +
          `│ ⚙️ Mode   : ${isAuto ? "Otomatis" : "Manual"}\n` +
          `│ 🕐 Waktu  : ${formatDateTime(user.regTime)}\n` +
          `╰──────────────\n\n` +
          (isAuto
            ? `Namamu diambil dari profil WhatsApp dan umur diatur ke ${AUTO_AGE} tahun. `
            : "") +
          `Akunmu sudah aktif dan semua fitur bot bisa kamu pakai. Tekan *Buka Menu* untuk mulai menjelajah!`;

        await sendCardSafe(conn, m, {
          media: await getMedia(conn, m.sender),
          body,
          buttons: [
            replyButton("🏠 Buka Menu", `${pfx}menu`)
          ],
        });
      };

      /* ───── Panduan ───── */
      const showGuide = async (reason) => {
        const body =
          `╭─〔 📝 *PENDAFTARAN* 〕\n` +
          `│ ${reason}\n` +
          `╰──────────────\n\n` +
          `📌 *Daftar manual*\n> \`${pfx}${cmd} Nama.Umur\`\n` +
          `💡Contoh: \`${pfx}${cmd} Natalius.18\`\n\n` +
          `⚡ *Daftar otomatis*\n> \`${pfx}${cmd} auto\`\n` +
          `Pakai nama profil WhatsApp-mu dan umur ${AUTO_AGE} tahun.\n\n` +
          `📋 *Ketentuan daftar manual*\n` +
          `• Nama ${NAME_MIN}–${NAME_MAX} karakter\n` +
          `• Umur ${AGE_MIN}–${AGE_MAX} tahun\n\n` +
          `Pilih salah satu tombol di bawah.`;

        await conn.sendMessage(m.chat, { react: { text: "📝", key: m.key } });
        return sendCardSafe(conn, m, {
          media: await tryPrepareMedia(
            conn,
            resolveImage(global.imgall || global.imgmenu),
          ),
          body,
          buttons: [
            replyButton("⚡ Daftar Otomatis", `${pfx}${cmd} auto`),
            copyButton("📋 Salin Format Manual", `${pfx}${cmd} Nama.Umur`),
          ],
        });
      };

      const input = sanitize(text);
      if (!input) {
        return await showGuide("Daftar dulu biar bisa pakai semua fitur bot.");
      }

      /* ───── Mode otomatis ───── */
      if (AUTO_KEYWORDS.includes(input.toLowerCase())) {
        let rawName = m.pushName;
        if (!rawName) {
          try {
            rawName = await conn.getName?.(m.sender);
          } catch {
            rawName = "";
          }
        }
        return await completeRegistration(
          nameFromProfile(rawName, m.sender),
          AUTO_AGE,
          true,
        );
      }

      /* ───── Mode manual ───── */
      const match = input.match(/^(.*?)(?:\s*[.,|]\s*|\s+)(\d{1,3})$/);
      if (!match) {
        return await showGuide("Format pendaftaran belum tepat.");
      }

      const name = sanitize(match[1]).replace(/[.,|\s]+$/, "");
      const age = parseInt(match[2], 10);

      const fail = async (msg) => {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(msg);
      };

      if (!name) return await fail("> ❌ *Gagal:* Nama tidak boleh kosong!");
      if (name.length < NAME_MIN || name.length > NAME_MAX) {
        return await fail(
          `❌ *Gagal:* Nama harus ${NAME_MIN}–${NAME_MAX} karakter (sekarang ${name.length}).`,
        );
      }
      if (!/^[\p{L}\p{N} .'_-]+$/u.test(name)) {
        return await fail(
          "❌ *Gagal:* Nama hanya boleh berisi huruf, angka, spasi, titik, apostrof, strip, atau garis bawah.",
        );
      }
      if (age < AGE_MIN || age > AGE_MAX) {
        return await fail(
          `❌ *Gagal:* Masukkan umur yang valid (antara ${AGE_MIN} sampai ${AGE_MAX} tahun)!`,
        );
      }

      await completeRegistration(name, age, false);
    } catch (e) {
      console.error("[daftar]", e);
      m.reply(`❌ Terjadi kesalahan saat mendaftar: ${e.message}`);
    }
  },
};
