const MAX_WARN = 3;
const KICK_DELAY_MS = 800;
const REASON_MIN = 5;
const REASON_MAX = 200;
const APPEAL_DAYS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


/* ───────────────────────── Helper identitas ───────────────────────── */
const digitsOf = (jid) =>
  String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

function normalizeNumber(num) {
  let d = String(num || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

function identitiesOf(p) {
  return [p.id, p.lid, p.phoneNumber, p.jid]
    .filter(Boolean)
    .map(digitsOf)
    .filter(Boolean);
}

function ownerDigits() {
  const raw = global.owner;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((o) => normalizeNumber(Array.isArray(o) ? o[0] : o))
    .filter(Boolean);
}

function collectTargets(m, text) {
  const jids = [];
  const pushAll = (arr) => {
    if (Array.isArray(arr)) jids.push(...arr.filter(Boolean));
  };

  pushAll(m.mentionedJid);
  pushAll(m.msg?.contextInfo?.mentionedJid);
  pushAll(m.message?.extendedTextMessage?.contextInfo?.mentionedJid);
  if (m.quoted?.sender) jids.push(m.quoted.sender);

  const typed = [];
  for (const match of String(text || "").matchAll(/@?(\+?\d[\d -]{5,}\d)/g)) {
    typed.push(normalizeNumber(match[1]));
  }

  return { jids: [...new Set(jids)], typed: [...new Set(typed)] };
}

function extractReason(text) {
  return String(text || "")
    .replace(/@\S+/g, " ")
    .replace(/\+?\d[\d -]{5,}\d/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}


/* ───────────────────────── Helper umum ───────────────────────── */
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

const matchesTarget = (rec, identities) =>
  (rec.identities || []).some((d) => identities.includes(d));

function activeWarns(data, chat, identities) {
  return Object.values(data.warnLog)
    .filter((r) => r.chat === chat && r.status === "active" && matchesTarget(r, identities))
    .sort((a, b) => a.at - b.at);
}

const STATUS_REASON = {
  403: "bot tidak punya izin (pastikan bot admin)",
  404: "tidak ditemukan di grup",
  408: "sudah tidak ada di grup",
  409: "sudah tidak ada di grup",
};

async function kickMember(conn, chat, id) {
  try {
    const res = await conn.groupParticipantsUpdate(chat, [id], "remove");
    const status = String(res?.[0]?.status ?? "200");
    return status === "200" ? null : STATUS_REASON[status] || `kode ${status}`;
  } catch (err) {
    console.error("[warn] gagal mengeluarkan member:", err);
    return err.message;
  }
}

const toJid = (v) => {
  if (!v) return null;
  const s = String(v);
  if (s.includes("@")) return s;
  const d = s.replace(/\D/g, "");
  return d ? `${d}@s.whatsapp.net` : null;
};

async function lidToPN(conn, lid) {
  try {
    const pn = await conn.signalRepository?.lidMapping?.getPNForLID?.(lid);
    return toJid(pn);
  } catch {
    return null;
  }
}

async function sendPM(conn, participant, fallbackId, text) {
  const candidates = [];
  const add = (j) => {
    const jid = toJid(j);
    if (jid && !candidates.includes(jid)) candidates.push(jid);
  };

  add(participant?.phoneNumber);
  add(participant?.jid);

  const lid = [participant?.lid, participant?.id, fallbackId].find((j) =>
    String(j || "").endsWith("@lid"),
  );
  if (lid) add(await lidToPN(conn, lid));

  for (const j of [participant?.id, fallbackId]) {
    if (j && !String(j).endsWith("@lid")) add(j);
  }
  if (lid) add(lid); 
  const errors = [];
  for (const jid of candidates) {
    try {
      if (!jid.endsWith("@lid")) {
        const res = await conn.onWhatsApp?.(jid);
        if (res?.[0]?.exists === false) {
          errors.push(`${jid}: nomor tidak terdaftar di WhatsApp`);
          continue;
        }
      }
      await conn.sendMessage(jid, { text });
      return { ok: true, jid, errors };
    } catch (err) {
      errors.push(`${jid}: ${err.message}`);
    }
  }

  console.error("[warn] PM gagal terkirim. Kandidat:", candidates, "Error:", errors);
  return { ok: false, errors };
}


/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["warn", "unwarn", "delwarn", "cekwarn", "checkwarn", "riwayatwarn"],
  category: "group",
  noPrefix: true,
  group: true,
  admin: true,

  call: async (conn, m, ctx) => {
    const { args, usedPrefix, command, isAdmin, isBotAdmin } = ctx;
    const text = ctx.text ?? (args || []).join(" ");
    const pfx = usedPrefix || ".";
    const cmd = String(command || "").toLowerCase();

    try {
      if (!isAdmin) return m.reply("Fitur ini khusus untuk Admin Grup! ❌");

      const data = getData();
      const users = data.users;

      const isCheck = ["cekwarn", "checkwarn"].includes(cmd);
      const isReset = ["unwarn", "delwarn"].includes(cmd);
      const isHistory = cmd === "riwayatwarn";

      let participants = null;
      let groupName = "Grup WhatsApp";
      try {
        const meta = await conn.groupMetadata(m.chat);
        participants = meta.participants;
        groupName = meta.subject || groupName;
      } catch (err) {
        console.warn("[warn] gagal membaca data grup:", err.message);
      }

      const byDigits = new Map();
      for (const p of participants || []) {
        for (const d of identitiesOf(p)) byDigits.set(d, p);
      }

      const { jids, typed } = collectTargets(m, text);
      let participant = null;

      for (const jid of jids) {
        participant = byDigits.get(digitsOf(jid));
        if (participant) break;
      }
      if (!participant) {
        for (const num of typed) {
          participant = byDigits.get(num);
          if (participant) break;
        }
      }

      const hasInput = jids.length > 0 || typed.length > 0;

      let rawTarget = jids[0] || null;
      if (!participant && (isCheck || isHistory) && !hasInput) {
        participant = byDigits.get(digitsOf(m.sender)) || null;
        rawTarget = m.sender;
      }

      const targetId = participant?.id || (!participants ? rawTarget : null);

      if (!targetId) {
        if (!hasInput) {
          return m.reply(
            `╭─〔 ⚠️ *WARNING MEMBER* 〕\n` +
              `│ Reply pesan target atau tag orangnya.\n` +
              `╰──────────────\n\n` +
              `📌 *Cara pakai*\n` +
              `• \`${pfx}warn @user alasan\` → beri peringatan (alasan wajib)\n` +
              `• \`${pfx}unwarn @user\` → reset peringatan\n` +
              `• \`${pfx}cekwarn @user\` → lihat peringatan aktif\n` +
              `• \`${pfx}riwayatwarn @user\` → riwayat lengkap\n\n` +
              `Contoh: \`${pfx}warn @user kirim link judi di grup\``,
          );
        }
        return m.reply("❌ Orang yang dimaksud tidak ditemukan di grup ini.");
      }

      const digits = digitsOf(targetId);
      const tag = `@${digits}`;
      const identities = [
        ...new Set(
          [
            ...(participant ? identitiesOf(participant) : []),
            digits,
            digitsOf(rawTarget),
          ].filter(Boolean),
        ),
      ];

      const candidateIds = [
        ...new Set(
          [
            targetId,
            rawTarget,
            participant?.id,
            participant?.lid,
            participant?.phoneNumber,
            participant?.jid,
          ].filter(Boolean),
        ),
      ];
      const keyOf = (id) => `${id}_${m.chat}_warn`;
      const mainKey = keyOf(targetId);
      users[mainKey] = users[mainKey] || { count: 0 };

      const readCount = () =>
        Math.max(
          0,
          ...candidateIds.map((id) => Number(users[keyOf(id)]?.count) || 0),
        );
      const writeCount = (n) => {
        users[mainKey].count = n;
        for (const id of candidateIds) {
          if (users[keyOf(id)]) users[keyOf(id)].count = n;
        }
      };

      if (isCheck) {
        const count = readCount();
        const list = activeWarns(data, m.chat, identities);
        const lines = list.map(
          (r, i) => `${i + 1}. \`${r.id}\` — ${truncate(r.reason, 60)} (${formatDate(r.at)})`,
        );
        const legacy =
          count > list.length
            ? `\n_${count - list.length} warning lama tanpa catatan alasan._`
            : "";

        return conn.sendMessage(
          m.chat,
          {
            text:
              `╭─〔 📊 *STATUS WARNING* 〕\n` +
              `│ 👤 Target  : ${tag}\n` +
              `│ ⚠️ Warning : ${warnBar(count)}\n` +
              `╰──────────────` +
              (lines.length ? `\n\n📝 *Peringatan aktif*\n${lines.join("\n")}` : "") +
              legacy,
            mentions: [targetId],
          },
          { quoted: m },
        );
      }

      if (isHistory) {
        const all = Object.values(data.warnLog)
          .filter((r) => r.chat === m.chat && matchesTarget(r, identities))
          .sort((a, b) => b.at - a.at)
          .slice(0, 10);

        const ICON = { active: "🟥", removed: "✅", reset: "♻️", archived: "📦" };
        const lines = all.map((r) => {
          const appeal = r.appealId ? data.warnAppeals[r.appealId] : null;
          return (
            `${ICON[r.status] || "▫️"} \`${r.id}\` — ${truncate(r.reason, 60)}\n` +
            `   ${formatDate(r.at)}` +
            (appeal ? ` • banding: ${appeal.status}` : "")
          );
        });

        return conn.sendMessage(
          m.chat,
          {
            text:
              `╭─〔 📜 *RIWAYAT WARNING* 〕\n` +
              `│ 👤 Target : ${tag}\n` +
              `│ ⚠️ Aktif  : ${warnBar(readCount())}\n` +
              `╰──────────────\n\n` +
              (lines.length ? lines.join("\n") : "Belum ada catatan warning.") +
              `\n\n🟥 aktif  ✅ dibatalkan banding  ♻️ direset  📦 diarsipkan`,
            mentions: [targetId],
          },
          { quoted: m },
        );
      }

      if (isReset) {
        for (const r of activeWarns(data, m.chat, identities)) r.status = "reset";
        writeCount(0);
        return conn.sendMessage(
          m.chat,
          {
            text:
              `╭─〔 ✅ *WARNING DIRESET* 〕\n` +
              `│ 👤 Target  : ${tag}\n` +
              `│ ⚠️ Warning : ${warnBar(0)}\n` +
              `╰──────────────`,
            mentions: [targetId],
          },
          { quoted: m },
        );
      }

      const botDigits = new Set(
        [conn.user?.id, conn.user?.lid].map(digitsOf).filter(Boolean),
      );
      if (botDigits.has(digits)) {
        return m.reply("❌ Bot tidak bisa diberi warning.");
      }
      if (ownerDigits().includes(digits)) {
        return m.reply("❌ Owner bot tidak bisa diberi warning.");
      }
      if (participant?.admin) {
        return m.reply(
          "❌ Admin grup tidak bisa diberi warning (admin juga tidak bisa dikick). Turunkan dulu jabatannya kalau perlu.",
        );
      }

      const reason = extractReason(text);
      if (reason.length < REASON_MIN) {
        return m.reply(
          `❌ *Alasan warning wajib diisi* (minimal ${REASON_MIN} karakter) supaya adil dan bisa dilihat member.\n` +
            `Contoh: \`${pfx}warn @user kirim link judi di grup\``,
        );
      }
      if (reason.length > REASON_MAX) {
        return m.reply(`❌ Alasan terlalu panjang (${reason.length} karakter), maksimal ${REASON_MAX}.`);
      }

      const quotedMatchesTarget =
        m.quoted?.text && identities.includes(digitsOf(m.quoted.sender));
      const evidence = quotedMatchesTarget ? truncate(m.quoted.text, 150) : null;

      const count = readCount() + 1;
      writeCount(count);

      const warnId = uniqueId("W", data.warnLog);
      data.warnLog[warnId] = {
        id: warnId,
        chat: m.chat,
        groupName,
        targetId,
        ids: candidateIds,
        identities,
        reason,
        evidence,
        by: m.sender,
        at: Date.now(),
        status: "active",
      };

      const adminTag = `@${digitsOf(m.sender)}`;
      const evidenceBlock = evidence ? `\n\n💬 *Pesan yang dipermasalahkan*\n> ${evidence}` : "";
      const appealInfo =
        `⚖️ *Merasa tidak adil?*\n` +
        `Ajukan banding maksimal ${APPEAL_DAYS} hari dengan mengirim *screenshot bukti*:\n` +
        `\`${pfx}bandingwarn ${warnId} alasan bandingmu\``;

      if (count < MAX_WARN) {
        const pm = await sendPM(
          conn,
          participant,
          targetId,
          `⚠️ *SURAT PERINGATAN*\n\n` +
            `Halo, kamu mendapat *Warning (${count}/${MAX_WARN})* di grup *${groupName}*.\n\n` +
            `🆔 ID Warn: ${warnId}\n` +
            `📝 Alasan: ${reason}\n\n` +
            `Merasa tidak adil? Kirim screenshot bukti ke bot dengan perintah:\n` +
            `${pfx}bandingwarn ${warnId} alasan bandingmu\n\n` +
            `Harap patuhi aturan grup agar tidak dikeluarkan!`,
        );

        return conn.sendMessage(
          m.chat,
          {
            text:
              `╭─〔 ⚠️ *WARNING MANUAL* 〕\n` +
              `│ 👤 Target  : ${tag}\n` +
              `│ 📊 Status  : ${warnBar(count)}\n` +
              `│ 👮 Oleh    : ${adminTag}\n` +
              `│ 🆔 ID Warn : ${warnId}\n` +
              `╰──────────────\n\n` +
              `📝 *Alasan*\n> ${reason}` +
              evidenceBlock +
              `\n\n📩 Pesan pribadi: ${pm.ok ? "terkirim ✅" : "tidak terkirim (semua info ada di pesan ini)"}\n\n` +
              `${appealInfo}\n\n` +
              `Kalau mencapai ${MAX_WARN} kali, member otomatis dikeluarkan dari grup!`,
            mentions: [targetId, m.sender],
          },
          { quoted: m },
        );
      }

      const history = activeWarns(data, m.chat, identities);
      const historyLines = history.map((r, i) => `${i + 1}. ${truncate(r.reason, 80)}`).join("\n");

      await sendPM(
        conn,
        participant,
        targetId,
        `🚫 *ANDA DI-KICK DARI GRUP*\n\n` +
          `Kamu dikeluarkan dari grup *${groupName}* karena sudah mencapai batas *${MAX_WARN}x peringatan*.\n\n` +
          `📝 Alasan peringatan:\n${historyLines}`,
      );

      await conn.sendMessage(
        m.chat,
        {
          text:
            `╭─〔 🚫 *BATAS WARNING TERCAPAI* 〕\n` +
            `│ 👤 Target  : ${tag}\n` +
            `│ 📊 Status  : ${warnBar(MAX_WARN)}\n` +
            `╰──────────────\n\n` +
            `📝 *Alasan peringatan*\n${historyLines}\n\n` +
            `${tag} akan dikeluarkan dari grup sekarang!`,
          mentions: [targetId],
        },
        { quoted: m },
      );

      if (!isBotAdmin) {
        return m.reply(
          "⚠️ Bot bukan admin, jadi gagal mengeluarkan member tersebut!",
        );
      }

      await sleep(KICK_DELAY_MS);
      const failReason = await kickMember(conn, m.chat, targetId);

      if (failReason) {
        return m.reply(`❌ Gagal mengeluarkan ${tag}: ${failReason}`);
      }

      for (const r of history) r.status = "archived";
      writeCount(0);
    } catch (e) {
      console.error("[warn]", e);
      m.reply(`❌ Terjadi kesalahan: ${e.message}`);
    }
  },
};
