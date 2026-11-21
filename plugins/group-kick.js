const KICK_DELAY_MS = 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


/* ───────────────────────── Helper ───────────────────────── */
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

const STATUS_REASON = {
  403: "bot tidak punya izin (pastikan bot admin)",
  404: "tidak ditemukan di grup",
  408: "sudah tidak ada di grup",
  409: "sudah tidak ada di grup",
};


/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["kick"],
  category: "group",
  admin: true,
  botAdmin: true,
  call: async (conn, m, { text, usedPrefix, command }) => {
    const pfx = usedPrefix || ".";
    const cmd = command || "kick";

    try {
      const { jids, typed } = collectTargets(m, text);

      if (!jids.length && !typed.length) {
        return m.reply(
          `╭─〔 👢 *KICK MEMBER* 〕\n` +
            `│ Tag atau reply orang yang mau dikick.\n` +
            `╰──────────────\n\n` +
            `📌 *Cara pakai*\n` +
            `• \`${pfx}${cmd} @tag\`\n` +
            `• Reply pesan orangnya dengan \`${pfx}${cmd}\`\n` +
            `• Bisa banyak sekaligus: \`${pfx}${cmd} @tag1 @tag2\``,
        );
      }

      await conn.sendMessage(m.chat, { react: { text: "👢", key: m.key } });

      let participants = null;
      try {
        participants = (await conn.groupMetadata(m.chat)).participants;
      } catch (err) {
        console.warn("[kick] gagal membaca data grup:", err.message);
      }

      const byDigits = new Map();
      for (const p of participants || []) {
        for (const d of identitiesOf(p)) byDigits.set(d, p);
      }

      const targets = new Map(); 
      const unresolved = [];

      for (const jid of jids) {
        const p = byDigits.get(digitsOf(jid));
        if (p) targets.set(p.id, { id: p.id, admin: !!p.admin });
        else if (!participants) targets.set(jid, { id: jid, admin: false });
        else unresolved.push(jid);
      }
      for (const num of typed) {
        const p = byDigits.get(num);
        if (p) targets.set(p.id, { id: p.id, admin: !!p.admin });
      }

      console.log(
        "[kick] target:",
        [...targets.keys()],
        "| tidak ditemukan:",
        unresolved,
      );

      const botDigits = new Set(
        [conn.user?.id, conn.user?.lid].map(digitsOf).filter(Boolean),
      );
      const senderDigits = digitsOf(m.sender);
      const owners = new Set(ownerDigits());

      const ok = [];
      const skipped = [];
      const failed = [];
      const mentions = [];

      for (const { id, admin } of targets.values()) {
        const d = digitsOf(id);
        const tag = `@${d}`;
        mentions.push(id);

        if (botDigits.has(d)) {
          skipped.push(`${tag} (itu bot sendiri)`);
          continue;
        }
        if (d === senderDigits) {
          skipped.push(`${tag} (kamu sendiri)`);
          continue;
        }
        if (owners.has(d)) {
          skipped.push(`${tag} (owner bot)`);
          continue;
        }
        if (admin) {
          skipped.push(`${tag} (admin grup, turunkan dulu)`);
          continue;
        }

        try {
          const res = await conn.groupParticipantsUpdate(m.chat, [id], "remove");
          const status = String(res?.[0]?.status ?? "200");
          if (status === "200") ok.push(tag);
          else failed.push(`${tag} (${STATUS_REASON[status] || `kode ${status}`})`);
        } catch (err) {
          console.error(`[kick] gagal mengeluarkan ${id}:`, err);
          failed.push(`${tag} (${err.message})`);
        }
        await sleep(KICK_DELAY_MS);
      }

      for (const jid of unresolved) {
        failed.push(`@${digitsOf(jid)} (tidak ada di grup ini)`);
        mentions.push(jid);
      }
      if (!targets.size && !unresolved.length) {
        failed.push("tidak ada target yang cocok dengan anggota grup");
      }

      const lines = [];
      if (ok.length) lines.push(`│ ✅ Berhasil : ${ok.join(", ")}`);
      if (skipped.length) lines.push(`│ ⏭️ Dilewati : ${skipped.join(", ")}`);
      if (failed.length) lines.push(`│ ❌ Gagal    : ${failed.join(", ")}`);

      const footer = ok.length
        ? `\n\n✨ Member sudah dikeluarkan. Jangan nakal lagi ya!`
        : failed.length
          ? `\n\nCek lagi targetnya, atau pastikan bot masih admin.`
          : "";

      await conn.sendMessage(m.chat, { react: { text: ok.length ? "✅" : "⚠️", key: m.key } });
      await conn.sendMessage(
        m.chat,
        {
          text: `╭─〔 👢 *KICK MEMBER* 〕\n${lines.join("\n")}\n╰──────────────${footer}`,
          mentions,
        },
        { quoted: m },
      );
    } catch (e) {
      console.error("[kick]", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } }).catch(() => {});
      m.reply(`❌ Gagal kick member: ${e.message}`);
    }
  },
};
