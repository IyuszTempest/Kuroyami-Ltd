const axios = require("axios");
const moment = require("moment-timezone");

const TRIGGER_REGEX = /kuro/i;

global._kuroHistory = global._kuroHistory ?? new Map();

function normalizeJid(jid) {
  if (!jid || typeof jid !== "string") return "";
  const [user, domain] = jid.split("@");
  if (!domain) return jid;
  const cleanUser = user.split(":")[0];
  return `${cleanUser}@${domain}`;
}

function initUserSession(sender) {
  let user = global.db?.data?.users?.[sender];
  if (!user) {
    if (global.db?.data?.users) {
      global.db.data.users[sender] = {
        name: "User",
        registered: false,
        premium: false,
        premiumTime: 0,
        afk: -1,
        afkReason: "",
        kuro: {
          session: [],
          lastUsed: 0,
        },
      };
      user = global.db.data.users[sender];
    } else {
      user = { kuro: { session: [], lastUsed: 0 } };
    }
  }

  if (!user.kuro) {
    user.kuro = { session: [], lastUsed: 0 };
  }

  return user;
}

function getQuotedInfo(m, conn) {
  if (!m.quoted) return null;
  const text =
    m.quoted.text ||
    m.quoted.caption ||
    m.quoted.conversation ||
    (m.quoted.msg && m.quoted.msg.text) ||
    "";
  const sender = m.quoted.sender ? normalizeJid(m.quoted.sender) : "";

  let senderName = "User";
  if (sender) {
    const botJid = normalizeJid(conn.user?.id || conn.user?.jid);
    if (sender === botJid) {
      senderName = "Kamu (kuro)";
    } else {
      const u = global.db?.data?.users?.[sender];
      senderName = u?.name || "User";
    }
  }

  return { text, sender, senderName };
}

async function getAIResponse(chatId, query, sender, conn, m) {
  const now = moment().tz("Asia/Jakarta");
  const timeContext = `${now.format("dddd, D MMMM YYYY, HH.mm")} WIB`;
  
  const systemPrompt = `[ROLE]: kuro, asisten/teman imut, manja, ceria.
[PANDUAN BICARA]: Panggil "aku" & "kamu". Gunakan Bahasa Indonesia santai (sih, kok, ya, dong, hehe, duh) + sedikit emoji gen z. Singkat, padat, alami. TANPA MARKDOWN (*, _, \`). Balas singkat. Kamu bukan AI milik orang lain, kamu adalah Kuro, dan owner kamu adalah Natalius.
[WAKTU]: ${timeContext}`;

  let userQuery = query.replace(/kuro/gi, "").trim();

  const quotedInfo = getQuotedInfo(m, conn);
  if (quotedInfo && quotedInfo.text) {
    userQuery += `\n[KONTEKS REPLY dari ${quotedInfo.senderName}]: "${quotedInfo.text}"`;
  }

  let q = (m.msg || m).mimetype
    ? m
    : m.quoted && (m.quoted.msg || m.quoted).mimetype
      ? m.quoted
      : null;
  if (q) {
    let mime = (q.msg || q).mimetype || "";
    let mediaType = mime.split("/")[0];
    let mediaCaption = q.text || q.caption || q.conversation || "";
    userQuery += `\n[INFO MEDIA]: User melampirkan media jenis "${mediaType}" ${mediaCaption ? `dengan caption: "${mediaCaption}"` : ""}.`;
  }

  const fullMessageParam = `${systemPrompt}\n\nPesan User: ${userQuery}`;

  try {
    const response = await axios.get("https://api.seilveeii.my.id/api/ai/openai", {
      params: {
        message: fullMessageParam,
      },
      timeout: 20000,
    });

    if (response.data && response.data.status && response.data.result?.result) {
      let responseText = response.data.result.result;
      responseText = responseText.replace(/[\*_`~]/g, "").trim();

      if (!global._kuroHistory.has(chatId)) {
        global._kuroHistory.set(chatId, []);
      }
      const history = global._kuroHistory.get(chatId);
      history.push(
        { role: "user", content: query },
        { role: "assistant", content: responseText }
      );
      if (history.length > 14) history.splice(0, 2);

      return responseText;
    } else {
      return "Duh, sepertinya otak Kuro lagi sedikit nge-blank nih... Coba panggil aku lagi ya! 💦";
    }
  } catch (error) {
    console.error(
      "Gagal mendapatkan respons dari Seilveeii API:",
      error?.response?.data || error
    );
    return "Aduh, koneksi Kuro ke server lagi agak pusing sekarang... Kirim pesan lagi nanti ya, 😵‍💫";
  }
}

module.exports = {
  command: ["resetkuro"],
  category: "ai",
  noPrefix: true,
  register: true,

  call: async (conn, m) => {
    global._kuroHistory.delete(m.sender);
    return m.reply(
      "Memori obrolan kita berdua sudah direset ya! Yuk mari mulai chat baru lagi ✨",
    );
  },

  handleMessage: async (conn, m) => {
    if (!m || !m.chat) return;

    const botJid = normalizeJid(conn.user?.id || conn.user?.jid);
    const senderJid = normalizeJid(m.sender);

    if (senderJid === botJid || m.fromMe) return;

    const text = (
      m.text ||
      m.caption ||
      m.body ||
      (m.msg && typeof m.msg === "object" && (m.msg.text || m.msg.caption)) ||
      ""
    ).trim();
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || "";

    if (!text && !mime) return;

    if (/^[°•π÷×¶∆£¢€¥®™✓_=|~!?@#$%^&.\-+*\/]/.test(text)) return;
    if (/^resetkuro$/i.test(text)) return;

    const user = initUserSession(m.sender);
    const isGroup = m.chat.endsWith("@g.us");
    const isReplyToBot = m.quoted && normalizeJid(m.quoted.sender) === botJid;

    const normalizedMentions = m.mentionedJid
      ? m.mentionedJid.map((jid) => normalizeJid(jid))
      : [];
    const isMention = normalizedMentions.includes(botJid);

    const hasTrigger = TRIGGER_REGEX.test(text);

    let shouldRespond = false;
    if (isGroup) {
      shouldRespond = hasTrigger || isMention || isReplyToBot;
    } else {
      shouldRespond = true;
    }

    if (!shouldRespond) return;

    try {
      await conn.sendPresenceUpdate("composing", m.chat);

      const response = await getAIResponse(m.chat, text, m.sender, conn, m);

      if (response) {
        user.kuro.lastUsed = Date.now();
        user.kuro.session.push({ role: "user", text });
        user.kuro.session.push({ role: "assistant", text: response });
        if (user.kuro.session.length > 20) user.kuro.session.splice(0, 2);

        await conn.sendMessage(m.chat, { text: response.trim() }, { quoted: m });
      }
    } catch (e) {
      console.error("[Error Inside kuro AI HandleMessage]:", e);
    }
  },
};