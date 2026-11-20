const fs = require("fs");
const axios = require("axios");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

const KITSU_API = "https://kitsu.io/api/edge";
const KITSU_HEADERS = {
  Accept: "application/vnd.api+json",
  "Content-Type": "application/vnd.api+json",
};

const BODY_LIMIT = 1000;

const STATUS_ID = {
  finished: "Selesai tayang",
  current: "Sedang tayang",
  upcoming: "Akan tayang",
  tba: "Belum diumumkan",
  unreleased: "Belum rilis",
};

/* ───────────────────────── Helper umum ───────────────────────── */
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
    console.error("[anime] gagal upload gambar:", err.message);
    return null;
  }
}

async function getMedia(conn, posterUrl) {
  let media = null;
  if (posterUrl) media = await tryPrepareMedia(conn, { url: posterUrl });
  if (!media) {
    media = await tryPrepareMedia(
      conn,
      resolveImage(global.imgall || global.imgmenu),
    );
  }
  return media;
}

function formatDate(d) {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

function truncate(str, max) {
  str = String(str || "");
  return str.length > max ? str.slice(0, max - 1).trimEnd() + "…" : str;
}

const sameText = (a, b) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();


/* ───────────────────────── Terjemahan ───────────────────────── */
const translateCache = new Map();

function splitChunks(text, max = 900) {
  if (!text) return [];

  const paragraphs = text.split(/\n+/);
  const chunks = [];
  let cur = "";

  for (const para of paragraphs) {
    const sentences = para.split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      if (!s) continue;
      if (cur && (cur + " " + s).length > max) {
        chunks.push(cur.trim());
        cur = s;
      } else {
        cur = cur ? `${cur} ${s}` : s;
      }
    }
    if (cur) {
      chunks.push(cur.trim());
      cur = "";
    }
  }

  return chunks.flatMap((c) =>
    c.length > max ? c.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) : [c],
  );
}

async function translateChunk(text, targetLang = "id") {
  if (!text || !text.trim()) return "";

  const cacheKey = `${targetLang}:${text}`;
  if (translateCache.has(cacheKey)) {
    return translateCache.get(cacheKey);
  }

  const params = new URLSearchParams({
    client: "gtx",
    sl: "auto",
    tl: targetLang,
    dt: "t",
    q: text,
  });

  const res = await axios.post(
    "https://translate.googleapis.com/translate_a/single",
    params.toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      timeout: 15000,
    },
  );

  const translated = (res.data?.[0] || [])
    .map((p) => (Array.isArray(p) ? p[0] : ""))
    .join("");

  if (translated) {
    translateCache.set(cacheKey, translated);
    return translated;
  }

  return text;
}

function cleanSynopsis(text) {
  let t = String(text || "")
    .replace(/\r/g, "")
    .replace(/\((?:Source|Written)[^)]*\)/gi, "")
    .replace(/\[Written by[^\]]*\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length > 3000) t = t.slice(0, 3000).trimEnd() + "…";
  return t;
}

async function translateToId(text) {
  if (!text || typeof text !== "string" || !text.trim()) return text || "";
  try {
    const chunks = splitChunks(text);
    const results = [];
    for (const chunk of chunks) {
      const translated = await translateChunk(chunk, "id");
      results.push(translated);
    }
    return results.join("\n");
  } catch (err) {
    console.error("[Translate Error]:", err.message);
    return text;
  }
}


/* ───────────────────────── Kitsu API ───────────────────────── */
async function kitsuSearch(query) {
  try {
    const res = await axios.get(`${KITSU_API}/anime`, {
      headers: KITSU_HEADERS,
      params: { "filter[text]": query, "page[limit]": 10 },
      timeout: 15000,
    });
    return res.data.data;
  } catch (err) {
    console.error("[anime] Kitsu search error:", err.message);
    return null;
  }
}

async function kitsuDetail(id) {
  try {
    const res = await axios.get(`${KITSU_API}/anime/${id}`, {
      headers: KITSU_HEADERS,
      params: { include: "categories" },
      timeout: 15000,
    });
    const genres = (res.data.included || [])
      .filter((i) => i.type === "categories")
      .map((i) => i.attributes?.title)
      .filter(Boolean)
      .slice(0, 5);
    return { anime: res.data.data, genres };
  } catch (err) {
    console.error("[anime] Kitsu detail error:", err.message);
    return null;
  }
}


/* ───────────────────────── Kirim kartu interaktif ───────────────────────── */
async function sendCard(conn, m, { media, body, footer, buttons }) {
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
}

const urlButton = (text, url) => ({
  name: "cta_url",
  buttonParamsJson: JSON.stringify({
    display_text: text,
    url,
    merchant_url: url,
  }),
});


/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["anime", "kitsuinfo"],
  category: "anime",
  noPrefix: true,
  call: async (conn, m, { text, command, usedPrefix }) => {
    try {
      const pfx = usedPrefix || ".";
      const query = (text || "").trim();

      if (!query) {
        return m.reply(
          `Mau cari anime apa hari ini?\nContoh: *${pfx}${command || "anime"} Cyberpunk Edgerunners*`,
        );
      }

      if (/^\d+$/.test(query)) {
        await conn.sendMessage(m.chat, { react: { text: "⚡", key: m.key } });

        const detail = await kitsuDetail(query);
        if (!detail) {
          return m.reply(
            "Gagal mengambil detail anime. Mungkin ID-nya salah atau server Kitsu sedang sibuk.",
          );
        }

        const { anime, genres } = detail;
        const attr = anime.attributes;
        const titles = attr.titles || {};

        const mainTitle =
          attr.canonicalTitle || titles.en_jp || titles.en || "Tanpa judul";

        const rawSynopsis = cleanSynopsis(attr.synopsis);
        const englishTitle = titles.en || attr.canonicalTitle;

        const [idTitleTranslated, synopsisId] = await Promise.all([
          titles.id ? Promise.resolve(titles.id) : translateToId(englishTitle),
          rawSynopsis ? translateToId(rawSynopsis) : Promise.resolve(null),
        ]);

        const titleLines = [];
        if (
          idTitleTranslated &&
          !sameText(idTitleTranslated, mainTitle) &&
          !sameText(idTitleTranslated, titles.en)
        ) {
          titleLines.push(`🇮🇩 ${idTitleTranslated}`);
        }
        const romaji = titles.en_jp;
        if (titles.ja_jp) {
          titleLines.push(
            `🇯🇵 ${titles.ja_jp}${romaji && !sameText(romaji, mainTitle) ? ` (${romaji})` : ""}`,
          );
        } else if (romaji && !sameText(romaji, mainTitle)) {
          titleLines.push(`🇯🇵 ${romaji}`);
        }
        if (titles.en && !sameText(titles.en, mainTitle)) {
          titleLines.push(`🇬🇧 ${titles.en}`);
        }

        const rating = attr.averageRating
          ? `⭐ ${Math.round(parseFloat(attr.averageRating))}%${attr.ratingRank ? `  (#${attr.ratingRank})` : ""}`
          : "Belum ada";
        const status = STATUS_ID[attr.status] || attr.status || "N/A";
        const eps = attr.episodeCount
          ? `${attr.episodeCount}${attr.episodeLength ? ` × ${attr.episodeLength} mnt` : ""}`
          : "?";
        const start = formatDate(attr.startDate);
        const end = formatDate(attr.endDate);
        const release = start ? (end && end !== start ? `${start} – ${end}` : start) : "N/A";

        const info = [
          `│ ⭐ Rating  : ${rating}`,
          `│ 🎞️ Tipe    : ${attr.subtype ? attr.subtype.toUpperCase() : "N/A"}${attr.ageRating ? `  •  ${attr.ageRating}` : ""}`,
          `│ 📅 Status  : ${status}`,
          `│ 🔢 Episode : ${eps}`,
          `│ 📆 Rilis   : ${release}`,
          genres.length ? `│ 🏷️ Genre   : ${genres.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n");

        const head =
          `📌 *${mainTitle}*\n` +
          (titleLines.length ? `${titleLines.join("\n")}\n` : "") +
          `\n╭─〔 INFO 〕\n${info}\n╰──────────────\n\n`;

        let synopsisText = "";
        let synopsisNote = "";
        if (rawSynopsis) {
          if (synopsisId) {
            synopsisText = synopsisId;
            synopsisNote = "_Diterjemahkan otomatis ke Bahasa Indonesia_";
          } else {
            synopsisText = rawSynopsis;
            synopsisNote = "_Terjemahan gagal, ditampilkan versi asli_";
          }
        }

        let body;
        let followUp = null;
        if (!synopsisText) {
          body = `${head}📝 *Sinopsis*\nBelum ada sinopsis.`;
        } else {
          const inline = `${head}📝 *Sinopsis*\n${synopsisText}\n\n${synopsisNote}`;
          if (inline.length <= BODY_LIMIT) {
            body = inline;
          } else {
            body = `${head}📝 *Sinopsis lengkap dikirim di pesan berikutnya* 👇`;
            followUp =
              `📝 *SINOPSIS — ${mainTitle}*\n\n${synopsisText}\n\n${synopsisNote}`;
          }
        }

        const buttons = [urlButton("🔗 Buka di Kitsu", `https://kitsu.io/anime/${attr.slug}`)];
        if (attr.youtubeVideoId) {
          buttons.push(
            urlButton("▶️ Tonton Trailer", `https://youtu.be/${attr.youtubeVideoId}`),
          );
        }

        const media = await getMedia(
          conn,
          attr.posterImage?.large ||
            attr.posterImage?.original ||
            attr.posterImage?.medium,
        );

        await sendCard(conn, m, { media, body, footer: global.wm, buttons });

        if (followUp) {
          await conn.sendMessage(m.chat, { text: followUp }, { quoted: m });
        }

        return await conn.sendMessage(m.chat, {
          react: { text: "✨", key: m.key },
        });
      }

      await conn.sendMessage(m.chat, { react: { text: "🤔", key: m.key } });

      const results = await kitsuSearch(query);
      if (!results || results.length === 0) {
        return m.reply(
          "Aku gak menemukan anime itu di Kitsu. Coba cek lagi ejaannya ya!",
        );
      }

      const rows = results.map((anime, idx) => {
        const a = anime.attributes;
        const title =
          a.canonicalTitle || a.titles?.en_jp || a.titles?.en || "Tanpa judul";
        const parts = [
          a.subtype ? a.subtype.toUpperCase() : "N/A",
          a.averageRating
            ? `⭐ ${Math.round(parseFloat(a.averageRating))}%`
            : "⭐ N/A",
          a.episodeCount ? `${a.episodeCount} eps` : "? eps",
        ];
        if (a.startDate) parts.push(a.startDate.slice(0, 4));

        return {
          header: "",
          title: `${idx + 1}. ${truncate(title, 30)}`,
          description: parts.join("  •  "),
          id: `${pfx}kitsuinfo ${anime.id}`,
        };
      });

      const listMessage = {
        title: "Pilih Anime",
        sections: [
          {
            title: "Hasil Pencarian Kitsu",
            highlight_label: "Top Matches",
            rows,
          },
        ],
      };

      const body =
        `╭─〔 *PENCARIAN ANIME* 〕\n` +
        `│ 🔎 Kata kunci : ${truncate(query, 40)}\n` +
        `│ 🏮 Hasil      : ${results.length} anime\n` +
        `╰──────────────\n\n` +
        `Halo @${m.sender.split("@")[0]}! Tekan tombol *Pilih Anime* di bawah untuk melihat info lengkapnya.`;

      const media = await getMedia(
        conn,
        results[0].attributes.posterImage?.large ||
          results[0].attributes.posterImage?.medium,
      );

      await sendCard(conn, m, {
        media,
        body,
        footer: global.wm,
        buttons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify(listMessage),
          },
        ],
      });
    } catch (e) {
      console.error("[anime]", e);
      m.reply(`Error Kitsu Info: ${e.message}`);
    }
  },
};
