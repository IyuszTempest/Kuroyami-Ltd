const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const MAX_WARN = 3;
const APPEAL_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; 
const REASON_MIN = 10;
const REASON_MAX = 300;
const NOTE_MAX = 200;
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME = /image\/(jpe?g|png|webp)/i;
const DOWNLOAD_ATTEMPTS = 2;

const APPROVE_WORDS = ["setuju", "terima", "approve", "acc"];
const REJECT_WORDS = ["tolak", "reject", "deny"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


/* ───────────────────────── Helper umum ───────────────────────── */
const digitsOf = (jid) =>
  String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

function identitiesOf(p) {
  return [p.id, p.lid, p.phoneNumber, p.jid]
    .filter(Boolean)
    .map(digitsOf)
    .filter(Boolean);
}

function truncate(str, max) {
  const chars = Array.from(String(str || ""));
  return chars.length > max ? chars.slice(0, max - 1).join("").trimEnd() + "…" : chars.join("");
}

function formatDate(ts) {
  return (
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(new Date(ts)) + " WIB"
  );
}

function warnBar(count) {
  const filled = Math.min(Math.max(count, 0), MAX_WARN);
  return `${"🟥".repeat(filled)}${"⬜".repeat(MAX_WARN - filled)} ${filled}/${MAX_WARN}`;
}

function getData() {
  global.db = global.db || { data: {} };
  global.db.data = global.db.data || {};
  global.db.data.users = global.db.data.users || {};
  global.db.data.warnLog = global.db.data.warnLog || {};
  global.db.data.warnAppeals = global.db.data.warnAppeals || {};
  return global.db.data;
}

function uniqueId(prefix, store) {
  let id;
  do {
    id = `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  } while (store[id]);
  return id;
}

const ownsRecord = (rec, senderDigits) =>
  (rec.identities || []).includes(senderDigits);

function decrementCount(users, rec) {
  const ids = [...new Set([rec.targetId, ...(rec.ids || [])].filter(Boolean))];
  const keyOf = (id) => `${id}_${rec.chat}_warn`;
  const current = Math.max(0, ...ids.map((id) => Number(users[keyOf(id)]?.count) || 0));
  const next = Math.max(0, current - 1);
  users[keyOf(rec.targetId)] = users[keyOf(rec.targetId)] || { count: 0 };
  for (const id of ids) {
    if (users[keyOf(id)]) users[keyOf(id)].count = next;
  }
  return next;
}

async function isGroupAdmin(conn, m, ctx) {
  if (typeof ctx.isAdmin === "boolean") return ctx.isAdmin;
  try {
    const meta = await conn.groupMetadata(m.chat);
    const d = digitsOf(m.sender);
    return meta.participants.some((p) => p.admin && identitiesOf(p).includes(d));
  } catch {
    return false;
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
      key: { remoteJid: m.chat, fromMe: !!q.fromMe, id: q.id, participant: q.sender },
      message: { [q.mtype]: q.msg },
    };
  }
  return null;
}

function findImageSource(m) {
  const candidates = m.quoted ? [m, m.quoted] : [m];
  for (const q of candidates) {
    const mime =
      (q.msg || q).mimetype ||
      q.mimetype ||
      q.mediaType ||
      (q.mtype === "imageMessage" ? "image/jpeg" : "");
    if (IMAGE_MIME.test(mime)) return q;
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
          const buf = await downloadMediaMessage(msgObj, "buffer", {}, { reuploadRequest: conn.updateMediaMessage });
          if (buf?.length) return buf;
          errors.push("Baileys mengembalikan data kosong");
        } catch (err) {
          errors.push(describeError(err));
        }
        if (i < DOWNLOAD_ATTEMPTS - 1) await sleep(1500);
      }
    }
  }

  console.error("[banding] semua jalur unduh gagal:", errors);
  throw new Error(`Gagal mengunduh screenshot (${[...new Set(errors)].slice(-2).join(" | ") || "penyebab tidak diketahui"})`);
}

const replyButton = (text, id) => ({
  name: "quick_reply",
  buttonParamsJson: JSON.stringify({ display_text: text, id }),
});

async function sendCard(conn, jid, { media, body, footer, buttons, mentions }) {
  const header = media
    ? proto.Message.InteractiveMessage.Header.create({ title: "", hasMediaAttachment: true, ...media })
    : proto.Message.InteractiveMessage.Header.create({ title: "", hasMediaAttachment: false });

  const contextInfo = { mentionedJid: mentions || [] };
  const msg = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: proto.Message.InteractiveMessage.create({
            header,
            body: proto.Message.InteractiveMessage.Body.create({ text: body }),
            footer: proto.Message.InteractiveMessage.Footer.create({
              text: footer || global.wm || "Powered by Node.js",
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
              messageVersion: 1,
              buttons,
            }),
            contextInfo,
          }),
        },
      },
    },
    { userJid: conn.user.id },
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


function usageText(pfx) {
  return (
    `╭─〔 ⚖️ *BANDING WARNING* 〕\n` +
    `│ Merasa warning-mu tidak adil?\n` +
    `│ Ajukan banding ke admin grup.\n` +
    `╰──────────────\n\n` +
    `📌 *Cara mengajukan*\n` +
    `1. Cek ID warn-mu: \`${pfx}warnku\`\n` +
    `2. Kirim *screenshot bukti* dengan caption:\n` +
    `   \`${pfx}banding W-XXXXXX alasan bandingmu\`\n` +
    `   (atau reply gambar screenshot dengan perintah yang sama)\n\n` +
    `📋 *Ketentuan*\n` +
    `• Wajib melampirkan screenshot\n` +
    `• Alasan banding minimal ${REASON_MIN} karakter\n` +
    `• Maksimal 3 hari setelah warn diberikan\n` +
    `• Satu warn hanya bisa dibanding sekali`
  );
}

async function handleWarnku(conn, m, pfx) {
  const data = getData();
  const d = digitsOf(m.sender);
  const inGroup = String(m.chat).endsWith("@g.us");

  const mine = Object.values(data.warnLog)
    .filter((r) => ownsRecord(r, d) && (!inGroup || r.chat === m.chat))
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);

  if (!mine.length) {
    return m.reply("✅ Kamu tidak punya catatan warning. Pertahankan ya!");
  }

  const ICON = { active: "🟥", removed: "✅", reset: "♻️", archived: "📦" };
  const lines = mine.map((r) => {
    const appeal = r.appealId ? data.warnAppeals[r.appealId] : null;
    return (
      `${ICON[r.status] || "▫️"} \`${r.id}\` — ${truncate(r.reason, 70)}\n` +
      `   ${inGroup ? "" : `${truncate(r.groupName, 25)} • `}${formatDate(r.at)}` +
      (appeal ? ` • banding: ${appeal.status}` : "")
    );
  });

  return m.reply(
    `╭─〔 📜 *WARNING-KU* 〕\n` +
      `│ Daftar peringatan atas namamu.\n` +
      `╰──────────────\n\n` +
      `${lines.join("\n")}\n\n` +
      `🟥 aktif  ✅ dibatalkan  ♻️ direset  📦 diarsipkan\n` +
      `Mau banding? \`${pfx}banding ID alasan\` + screenshot bukti.`,
  );
}

async function handleBanding(conn, m, text, pfx) {
  const data = getData();
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return m.reply(usageText(pfx));

  const warnId = parts[0].toUpperCase();
  const reason = parts.slice(1).join(" ").trim();
  const rec = data.warnLog[warnId];

  if (!rec) {
    return m.reply(`❌ ID warn \`${warnId}\` tidak ditemukan. Cek ID yang benar dengan \`${pfx}warnku\`.`);
  }

  const senderDigits = digitsOf(m.sender);
  if (!ownsRecord(rec, senderDigits)) {
    return m.reply(
      "❌ Warn ini bukan atas namamu, jadi kamu tidak bisa mengajukan banding.\n" +
        "💡 Kalau ini memang warn-mu dan kamu mengajukan lewat chat pribadi, coba ajukan dari dalam grupnya.",
    );
  }

  if (rec.status !== "active") {
    const label = { removed: "sudah dibatalkan", reset: "sudah direset admin", archived: "sudah diarsipkan karena kamu dikeluarkan dari grup" }[rec.status] || rec.status;
    return m.reply(`ℹ️ Warn \`${warnId}\` ${label}, jadi tidak perlu banding.`);
  }

  if (rec.appealId) {
    const prev = data.warnAppeals[rec.appealId];
    return m.reply(`ℹ️ Warn ini sudah pernah dibanding (\`${rec.appealId}\`, status: ${prev?.status || "-"}). Satu warn hanya bisa dibanding sekali.`);
  }

  if (Date.now() - rec.at > APPEAL_WINDOW_MS) {
    return m.reply("⏳ Batas waktu banding (3 hari sejak warn diberikan) sudah lewat.");
  }

  if (reason.length < REASON_MIN) {
    return m.reply(`❌ Alasan banding wajib diisi (minimal ${REASON_MIN} karakter).\nContoh: \`${pfx}banding ${warnId} pesan saya disalahartikan, ini buktinya\``);
  }
  if (reason.length > REASON_MAX) {
    return m.reply(`❌ Alasan banding terlalu panjang (${reason.length} karakter), maksimal ${REASON_MAX}.`);
  }

  const source = findImageSource(m);
  if (!source) {
    return m.reply(
      "❌ *Wajib melampirkan screenshot bukti.*\n" +
        `Kirim gambar dengan caption \`${pfx}banding ${warnId} alasanmu\`, atau reply gambar screenshot dengan perintah yang sama.`,
    );
  }

  await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

  let buffer;
  try {
    buffer = await downloadImage(conn, m, source);
  } catch (err) {
    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    return m.reply(`❌ ${err.message}\n💡 Coba kirim ulang screenshotnya.`);
  }
  if (buffer.length > MAX_BYTES) {
    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    return m.reply("❌ Ukuran screenshot terlalu besar (maksimal 10 MB).");
  }

  const appealId = uniqueId("B", data.warnAppeals);
  data.warnAppeals[appealId] = {
    id: appealId,
    warnId,
    chat: rec.chat,
    originChat: m.chat,
    targetId: rec.targetId,
    sender: m.sender,
    reason,
    at: Date.now(),
    status: "menunggu",
  };
  rec.appealId = appealId;

  const caption =
    `╭─〔 📨 *PENGAJUAN BANDING* 〕\n` +
    `│ 🆔 Banding : ${appealId}\n` +
    `│ 🎫 Warn    : ${warnId}\n` +
    `│ 👤 Pemohon : @${digitsOf(rec.targetId)}\n` +
    `│ 👮 Pemberi : @${digitsOf(rec.by)}\n` +
    `│ 🕐 Diajukan : ${formatDate(Date.now())}\n` +
    `╰──────────────\n\n` +
    `📝 *Alasan warn*\n> ${rec.reason}\n` +
    (rec.evidence ? `\n💬 *Pesan yang dipermasalahkan*\n> ${rec.evidence}\n` : "") +
    `\n⚖️ *Alasan banding*\n> ${reason}\n\n` +
    `📎 Screenshot bukti ada pada gambar di atas.\n` +
    `Admin, mohon tinjau lalu putuskan dengan tombol di bawah, atau ketik:\n` +
    `\`${pfx}putusbanding ${appealId} setuju\`\n` +
    `\`${pfx}putusbanding ${appealId} tolak alasan penolakan\``;

  const mentions = [rec.targetId, rec.by];

  try {
    let media = null;
    try {
      media = await prepareWAMessageMedia({ image: buffer }, { upload: conn.waUploadToServer });
    } catch (err) {
      console.error("[banding] gagal upload screenshot untuk kartu:", err.message);
    }

    try {
      if (!media) throw new Error("tidak ada media untuk kartu");
      await sendCard(conn, rec.chat, {
        media,
        body: caption,
        footer: `Banding ${appealId}`,
        buttons: [
          replyButton("✅ Setujui", `${pfx}putusbanding ${appealId} setuju`),
          replyButton("❌ Tolak", `${pfx}putusbanding ${appealId} tolak`),
        ],
        mentions,
      });
    } catch (cardErr) {
      console.warn("[banding] kartu gagal, kirim gambar biasa:", cardErr.message);
      await conn.sendMessage(rec.chat, { image: buffer, caption, mentions });
    }
  } catch (err) {
    delete data.warnAppeals[appealId];
    delete rec.appealId;
    console.error("[banding] gagal mengirim ke grup:", err);
    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
    return m.reply(`❌ Banding gagal diteruskan ke grup ${rec.groupName ? `*${rec.groupName}*` : ""}: ${err.message}\n💡 Pastikan bot masih ada di grup tersebut, lalu coba lagi.`);
  }

  await conn.sendMessage(m.chat, { react: { text: "📨", key: m.key } });
  return m.reply(
    `╭─〔 ✅ *BANDING TERKIRIM* 〕\n` +
      `│ 🆔 Banding : ${appealId}\n` +
      `│ 🎫 Warn    : ${warnId}\n` +
      `│ 📍 Grup    : ${truncate(rec.groupName || "-", 30)}\n` +
      `╰──────────────\n\n` +
      `Banding dan screenshot-mu sudah diteruskan ke admin grup. Keputusannya akan diumumkan di grup tersebut${String(m.chat).endsWith("@g.us") ? "" : " dan di chat ini"}.`,
  );
}

async function handleDecision(conn, m, ctx, text, pfx) {
  const data = getData();
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);

  const appealId = (parts[0] || "").toUpperCase();
  const word = (parts[1] || "").toLowerCase();
  const note = truncate(parts.slice(2).join(" ").trim(), NOTE_MAX);

  const approve = APPROVE_WORDS.includes(word);
  const reject = REJECT_WORDS.includes(word);

  if (!appealId || (!approve && !reject)) {
    return m.reply(`📌 Format: \`${pfx}putusbanding B-XXXXXX setuju\` atau \`${pfx}putusbanding B-XXXXXX tolak alasan penolakan\``);
  }

  const appeal = data.warnAppeals[appealId];
  if (!appeal) return m.reply(`❌ Banding \`${appealId}\` tidak ditemukan.`);

  if (m.chat !== appeal.chat) {
    return m.reply("❌ Banding ini harus diputuskan di grup tempat warn diberikan.");
  }
  if (!(await isGroupAdmin(conn, m, ctx))) {
    return m.reply("❌ Hanya admin grup yang bisa memutuskan banding.");
  }
  if (digitsOf(m.sender) === digitsOf(appeal.targetId)) {
    return m.reply("❌ Kamu tidak bisa memutuskan bandingmu sendiri.");
  }
  if (appeal.status !== "menunggu") {
    return m.reply(`ℹ️ Banding \`${appealId}\` sudah diputuskan (${appeal.status}${appeal.handledBy ? ` oleh @${digitsOf(appeal.handledBy)}` : ""}).`);
  }

  const rec = data.warnLog[appeal.warnId];
  if (!rec) return m.reply("❌ Data warn untuk banding ini tidak ditemukan.");

  appeal.status = approve ? "disetujui" : "ditolak";
  appeal.handledBy = m.sender;
  appeal.handledAt = Date.now();
  appeal.note = note || null;

  let text_;
  if (approve) {
    rec.status = "removed";
    const next = decrementCount(data.users, rec);
    text_ =
      `╭─〔 ✅ *BANDING DISETUJUI* 〕\n` +
      `│ 🆔 Banding : ${appealId}\n` +
      `│ 🎫 Warn    : ${appeal.warnId} (dibatalkan)\n` +
      `│ 👤 Pemohon : @${digitsOf(appeal.targetId)}\n` +
      `│ ⚠️ Warning : ${warnBar(next)}\n` +
      `│ 👮 Diputuskan : @${digitsOf(m.sender)}\n` +
      `╰──────────────\n\n` +
      (note ? `📝 *Catatan admin*\n> ${note}\n\n` : "") +
      `Warning tersebut sudah dibatalkan dan hitungan warning dikurangi satu.`;
  } else {
    text_ =
      `╭─〔 ❌ *BANDING DITOLAK* 〕\n` +
      `│ 🆔 Banding : ${appealId}\n` +
      `│ 🎫 Warn    : ${appeal.warnId} (tetap berlaku)\n` +
      `│ 👤 Pemohon : @${digitsOf(appeal.targetId)}\n` +
      `│ 👮 Diputuskan : @${digitsOf(m.sender)}\n` +
      `╰──────────────\n\n` +
      `📝 *Catatan admin*\n> ${note || "(tanpa catatan)"}\n\n` +
      `Warning tetap berlaku. Satu warn hanya bisa dibanding sekali.`;
  }

  await conn.sendMessage(
    m.chat,
    { text: text_, mentions: [appeal.targetId, m.sender] },
    { quoted: m },
  );

  if (appeal.originChat && appeal.originChat !== m.chat) {
    conn
      .sendMessage(appeal.originChat, {
        text: `${approve ? "✅" : "❌"} *Banding ${appealId} ${appeal.status}.*${note ? `\n📝 Catatan admin: ${note}` : ""}`,
      })
      .catch(() => {});
  }
}


/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["bandingwarn", "putusbanding", "warnku"],
  category: "group",
  noPrefix: true,

  call: async (conn, m, ctx) => {
    const { args, usedPrefix, command } = ctx;
    const text = ctx.text ?? (args || []).join(" ");
    const pfx = usedPrefix || ".";
    const cmd = String(command || "").toLowerCase();

    try {
      getData();
      if (cmd === "warnku") return await handleWarnku(conn, m, pfx);
      if (cmd === "putusbanding") return await handleDecision(conn, m, ctx, text, pfx);
      return await handleBanding(conn, m, text, pfx);
    } catch (e) {
      console.error("[banding]", e);
      m.reply(`❌ Terjadi kesalahan: ${e.message}`);
    }
  },
};
