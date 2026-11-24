const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const axios = require("axios");

const API_URL = "https://api.nexray.eu.cc/downloader/tiktok";
const TT_REGEX = /https?:\/\/(?:www\.|m\.|vt\.|vm\.)?tiktok\.com\/[^\s]+/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractTiktokUrl(input) {
  if (!input) return null;
  const match = String(input).match(TT_REGEX);
  return match ? match[0] : null;
}

function sanitizeFilename(name) {
  return String(name || "tiktok_audio")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function fetchBuffer(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 45000,
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: "https://www.tiktok.com/",
      },
    });
    const buf = Buffer.from(res.data);
    if (buf.length > 0) return buf;
  } catch {}
  return null;
}

async function fetchFirstValidBuffer(urls) {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  for (const url of uniqueUrls) {
    const buf = await fetchBuffer(url);
    if (buf) return { buffer: buf, url };
  }
  return { buffer: null, url: uniqueUrls[0] || null };
}

module.exports = {
  command: ["tt", "tiktok", "ttdl", "ttmp3", "ttaudio"],
  category: "downloader",
  noPrefix: true,
  
  call: async (conn, m, { usedPrefix, command, text, isOwner }) => {
    const pfx = usedPrefix || ".";
    const cmd = (command || "tt").toLowerCase();

    const rawInput = (text || "").trim() || m.quoted?.text || m.quoted?.caption || "";
    const ttUrl = extractTiktokUrl(rawInput);

    if (!ttUrl) {
      return m.reply(
        `Masukkan link TikTok atau reply pesan berisi link.\n\n` +
          `Contoh:\n` +
          `• \`${pfx}${cmd} https://www.tiktok.com/@kuze_masacika/video/7710857878323596565\`\n` +
          `• \`${pfx}ttmp3 <link>\` (khusus ambil audio/sound)`,
      );
    }

    const audioOnly =
      cmd === "ttmp3" ||
      cmd === "ttaudio" ||
      /\b(mp3|audio|sound|musik)\b/i.test(text || "");

    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const { data } = await axios.get(API_URL, {
        params: { url: ttUrl },
        timeout: 25000,
      });

      if (!data?.status || !data?.result) {
        throw new Error(data?.message || "Video TikTok tidak ditemukan atau bersifat privat.");
      }

      const res = data.result;
      const authorName = res.author?.nickname || res.author?.fullname || "-";
      const authorUser = res.author?.fullname ? `@${res.author.fullname}` : "";
      const stats = res.stats || {};
      const music = res.music_info || {};

      /* ───── Khusus Audio / Sound (`ttmp3` atau `tt <link> mp3`) ───── */
      if (audioOnly) {
        if (!music.url) {
          throw new Error("URL audio tidak tersedia pada video TikTok ini.");
        }

        const audioBuf = await fetchBuffer(music.url);
        const fileName = `${sanitizeFilename(music.title || authorName)}.mp3`;

        await conn.sendMessage(
          m.chat,
          {
            audio: audioBuf || { url: music.url },
            mimetype: "audio/mpeg",
            fileName,
            ptt: false,
          },
          { quoted: m },
        );

        await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
        return;
      }

      const caption =
        `🎵 *TikTok Downloader*\n\n` +
        `👤 *Author:* ${authorName} ${authorUser ? `(${authorUser})` : ""}\n` +
        `⏱️ *Durasi:* ${res.duration || "-"}\n` +
        `📊 *Statistik:* 👁️ ${stats.views || 0} | ❤️ ${stats.likes || 0} | 💬 ${stats.comment || 0} | 🔁 ${stats.share || 0}\n` +
        `🎶 *Sound:* ${music.title || "-"}\n\n` +
        `📝 *Caption:*\n${res.title || "-"}`;

      /* ───── Penanganan Slide Foto (Jika Postingan Berupa Gambar) ───── */
      const slideImages = Array.isArray(res.images)
        ? res.images
        : Array.isArray(res.data)
          ? res.data
          : null;

      if (slideImages && slideImages.length > 0) {
        for (let i = 0; i < slideImages.length; i++) {
          const imgUrl = typeof slideImages[i] === "string" ? slideImages[i] : slideImages[i]?.url;
          const imgBuf = await fetchBuffer(imgUrl);
          await conn.sendMessage(
            m.chat,
            {
              image: imgBuf || { url: imgUrl },
              caption: i === 0 ? caption : "",
            },
            { quoted: i === 0 ? m : undefined },
          );
          if (i < slideImages.length - 1) await sleep(600);
        }

        await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
        return;
      }

      /* ───── Penanganan Video (HD -> Selected -> Data -> SD -> WM) ───── */
      const videoCandidates = [
        res.alternatives?.hd,
        res.alternatives?.selected,
        typeof res.data === "string" ? res.data : null,
        res.alternatives?.sd,
        res.alternatives?.wm,
      ];

      const { buffer: videoBuf, url: fallbackUrl } = await fetchFirstValidBuffer(videoCandidates);
      if (!videoBuf && !fallbackUrl) {
        throw new Error("Link unduhan video tidak ditemukan dalam respons API.");
      }

      await conn.sendMessage(
        m.chat,
        {
          video: videoBuf || { url: fallbackUrl },
          mimetype: "video/mp4",
          caption,
        },
        { quoted: m },
      );

      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[tiktok]", err);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } }).catch(() => {});
      const errMsg = err?.response?.data?.message || err?.message || "Terjadi kesalahan pada API.";
      if (isOwner) {
        m.reply(`❌ *TikTok Error:* ${errMsg}`);
      } else {
        m.reply("❌ Gagal mengunduh video TikTok. Pastikan link valid dan akun tidak privat.");
      }
    }
  },
};
