const fs = require("fs");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

const COOLDOWN_MS = 60 * 1000;
const MIN_LENGTH = 5;
const MAX_LENGTH = 1000;

const cooldowns = new Map();

const TYPES = {
  request: { icon: "💡", label: "REQUEST FITUR", short: "Request Fitur", prefix: "REQ" },
  report: { icon: "⚠️", label: "LAPORAN ERROR", short: "Laporan Error", prefix: "BUG" },
};


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
    console.error("[report] gagal upload gambar:", err.message);
    return null;
  }
}

function toJid(entry) {
  let raw = String(Array.isArray(entry) ? entry[0] : entry || "").trim();
  if (!raw) return null;

  if (raw.includes("@")) {
    const [id, domain] = raw.split("@");
    const cleanId = id.split(":")[0];
    return cleanId ? `${cleanId}@${domain}` : null;
  }

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = "62" + digits.slice(1);
  return `${digits}@s.whatsapp.net`;
}

function getOwnerJids(conn) {
  const raw = global.owner;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const jids = list.map(toJid).filter(Boolean);
  if (!jids.length) {
    const self = toJid(conn.user.id);
    if (self) jids.push(self);
  }
  return [...new Set(jids)];
}

async function verifyJid(conn, jid) {
  if (jid.endsWith("@lid")) return jid;
  try {
    const [res] = (await conn.onWhatsApp(jid)) || [];
    if (res && res.exists === false) {
      console.warn(`[report] ${jid} tidak terdaftar di WhatsApp, cek global.owner`);
      return null;
    }
    if (res?.jid) return res.jid;
  } catch (err) {
    console.warn(`[report] gagal verifikasi ${jid}:`, err.message);
  }
  return jid;
}

function makeTicketId(prefix) {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const time = Date.now().toString(36).slice(-2).toUpperCase();
  return `${prefix}-${rand}${time}`;
}

function nowWIB() {
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date()) + " WIB"
  );
}

function truncate(str, max) {
  str = String(str || "");
  return str.length > max ? str.slice(0, max - 1).trimEnd() + "…" : str;
}

function sanitize(text) {
  return String(text || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const copyButton = (text, code) => ({
  name: "cta_copy",
  buttonParamsJson: JSON.stringify({ display_text: text, copy_code: code }),
});

const urlButton = (text, url) => ({
  name: "cta_url",
  buttonParamsJson: JSON.stringify({
    display_text: text,
    url,
    merchant_url: url,
  }),
});

const replyButton = (text, id) => ({
  name: "quick_reply",
  buttonParamsJson: JSON.stringify({ display_text: text, id }),
});

async function sendCard(conn, jid, { media, body, footer, buttons, mentions }, quoted) {
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

  const contextInfo = { mentionedJid: mentions || [] };
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
    jid,
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
    { userJid: conn.user.id, ...(quoted ? { quoted } : {}) },
  );

  await conn.relayMessage(jid, msg.message, {
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
}


/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["lapor", "report", "request", "req"],
  category: "main",
  noPrefix: false,
  call: async (conn, m, { usedPrefix, command, text }) => {
    const pfx = usedPrefix || ".";
    const cmd = String(command || "").toLowerCase();
    const type = ["request", "req"].includes(cmd) ? TYPES.request : TYPES.report;

    try {
      const message = sanitize(text);

      if (!message) {
        const guide =
          `╭─〔 📮 *REPORT & REQUEST* 〕\n` +
          `│ Punya ide fitur atau nemu error?\n` +
          `│ Kirim langsung ke developer.\n` +
          `╰──────────────\n\n` +
          `📌 *Cara pakai*\n` +
          `• \`${pfx}req [ide fitur]\`\n` +
          `• \`${pfx}lapor [detail error]\`\n\n` +
          `💡 *Biar laporanmu cepat ditangani*\n` +
          `• Sebutkan command yang bermasalah\n` +
          `• Jelaskan apa yang terjadi\n` +
          `• Sertakan pesan error kalau ada\n\n` +
          `Tekan tombol di bawah untuk menyalin template, lalu isi dan kirim.`;

        return await sendCard(
          conn,
          m.chat,
          {
            media: await getMedia(conn),
            body: guide,
            buttons: [
              copyButton(
                "📋 Template Request",
                `${pfx}req Fitur: \nDeskripsi: \nManfaat: `,
              ),
              copyButton(
                "📋 Template Laporan",
                `${pfx}lapor Command: \nMasalah: \nPesan error: `,
              ),
            ],
            mentions: [m.sender],
          },
          m,
        );
      }

      if (message.length < MIN_LENGTH) {
        return m.reply(
          `⚠️ Pesan terlalu pendek. Tulis minimal ${MIN_LENGTH} karakter ya.`,
        );
      }
      if (message.length > MAX_LENGTH) {
        return m.reply(
          `⚠️ Pesan terlalu panjang (${message.length} karakter). Batas maksimal ${MAX_LENGTH} karakter.`,
        );
      }

      const last = cooldowns.get(m.sender) || 0;
      const wait = COOLDOWN_MS - (Date.now() - last);
      if (wait > 0) {
        return m.reply(
          `> ⏳ Tunggu *${Math.ceil(wait / 1000)} detik* lagi sebelum mengirim pesan berikutnya.`,
        );
      }

      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const ticketId = makeTicketId(type.prefix);
      const senderId = m.sender.split("@")[0];
      const isLid = m.sender.endsWith("@lid");
      const senderName = m.pushName || "Pengguna";

      let origin = "Chat pribadi";
      if (m.isGroup || String(m.chat).endsWith("@g.us")) {
        try {
          const meta = await conn.groupMetadata(m.chat);
          origin = `Grup: ${truncate(meta.subject, 30)}`;
        } catch {
          origin = "Grup";
        }
      }

      const quotedText = m.quoted?.text ? truncate(sanitize(m.quoted.text), 200) : "";
      const quotedBlock = quotedText ? `\n\n↩️ *Pesan yang di-reply*\n> ${quotedText}` : "";

      const ownerText =
        `╭─〔 ${type.icon} *${type.label}* 〕\n` +
        `│ 🎫 Tiket : ${ticketId}\n` +
        `│ 👤 Dari  : ${truncate(senderName, 25)} (@${senderId})\n` +
        `│ 📍 Asal  : ${origin}\n` +
        `│ 🕐 Waktu : ${nowWIB()}\n` +
        `╰──────────────\n\n` +
        `💬 *Isi Pesan*\n${message}${quotedBlock}`;

      const actionButtons = [copyButton("📋 Salin ID Tiket", ticketId)];
      if (!isLid) {
        actionButtons.unshift(urlButton("💬 Balas Pelapor", `https://wa.me/${senderId}`));
      }

      const owners = getOwnerJids(conn);
      console.log(`[report] ${ticketId} → target owner: ${owners.join(", ")}`);

      let delivered = 0;
      for (const rawJid of owners) {
        const jid = await verifyJid(conn, rawJid);
        if (!jid) continue;

        try {
          await conn.sendMessage(jid, { text: ownerText, mentions: [m.sender] });
          delivered++;
          console.log(`[report] ${ticketId} terkirim ke ${jid}`);
        } catch (err) {
          console.error(`[report] gagal kirim teks ke ${jid}:`, err);
          continue;
        }

        try {
          await sendCard(conn, jid, {
            body: `🎫 *${ticketId}*\nGunakan tombol di bawah untuk membalas pelapor atau menyalin ID tiket.`,
            footer: type.short,
            buttons: actionButtons,
            mentions: [m.sender],
          });
        } catch (err) {
          console.warn(`[report] kartu aksi ke ${jid} gagal (tidak kritis):`, err.message);
        }
      }

      if (!delivered) {
        await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
        return m.reply(
          "❌ *Gagal mengirim.* Pesan belum bisa sampai ke developer, coba lagi sebentar lagi ya.",
        );
      }

      cooldowns.set(m.sender, Date.now());
      if (cooldowns.size > 500) {
        const cutoff = Date.now() - COOLDOWN_MS;
        for (const [k, t] of cooldowns) if (t < cutoff) cooldowns.delete(k);
      }

      await conn.sendMessage(m.chat, { react: { text: "🚀", key: m.key } });

      const confirm =
        `╭─〔 ✅ *PESAN TERKIRIM* 〕\n` +
        `│ 🎫 Tiket : ${ticketId}\n` +
        `│ 📂 Jenis : ${type.short}\n` +
        `│ 🕐 Waktu : ${nowWIB()}\n` +
        `╰──────────────\n\n` +
        `📝 *Ringkasan*\n> ${truncate(message, 150)}\n\n` +
        `Terima kasih, pesanmu sudah sampai ke developer. Simpan ID tiket kalau mau menanyakan perkembangannya.`;

      await sendCard(
        conn,
        m.chat,
        {
          media: await getMedia(conn),
          body: confirm,
          buttons: [
            copyButton("📋 Salin ID Tiket", ticketId),
            replyButton("🏠 Buka Menu", `${pfx}menu`),
          ],
          mentions: [m.sender],
        },
        m,
      );
    } catch (e) {
      console.error("[report]", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } }).catch(() => {});
      m.reply(`❌ Terjadi kesalahan: ${e.message}`);
    }
  },
};
