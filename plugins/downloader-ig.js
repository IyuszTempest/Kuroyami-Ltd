const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const axios = require("axios");

const API_URL = "https://api.nexray.eu.cc/downloader/v1/instagram";
const IG_REGEX = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv|stories)\/[^\s]+/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractInstagramUrl(input) {
  if (!input) return null;
  const match = String(input).match(IG_REGEX);
  return match ? match[0] : null;
}

async function fetchMediaBuffer(url) {
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    const buf = Buffer.from(res.data);
    if (buf.length > 0) return buf;
  } catch {}
  return null;
}

module.exports = {
  command: ["ig", "igdl", "instagram", "reels"],
  category: "downloader",
  noPrefix: true,

  call: async (conn, m, { usedPrefix, command, text, isOwner }) => {
    const pfx = usedPrefix || ".";
    const cmd = command || "ig";

    const rawInput = (text || "").trim() || m.quoted?.text || m.quoted?.caption || "";
    const igUrl = extractInstagramUrl(rawInput);

    if (!igUrl) {
      return m.reply(
        `Masukkan link Instagram (Reels / Post / Carousel) atau reply pesan berisi link.\n\n` +
          `Contoh:\n` +
          `\`${pfx}${cmd} https://www.instagram.com/reel/DgH5ECDK0hC/\``,
      );
    }

    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const { data } = await axios.get(API_URL, {
        params: { url: igUrl },
        timeout: 20000,
      });

      if (!data?.status || !Array.isArray(data?.result) || data.result.length === 0) {
        throw new Error(data?.message || "Media tidak ditemukan atau akun bersifat privat.");
      }

      const items = data.result;
      const total = items.length;

      for (let i = 0; i < total; i++) {
        const item = items[i];
        const isVideo = item.type === "video";
        const caption =
          i === 0
            ? `✅ *Instagram Downloader*\n📦 Total media: *${total}* (${items.filter((x) => x.type === "video").length} video, ${items.filter((x) => x.type === "image").length} foto)`
            : "";

        const buffer = await fetchMediaBuffer(item.url);
        const mediaSource = buffer || { url: item.url };

        if (isVideo) {
          await conn.sendMessage(
            m.chat,
            {
              video: mediaSource,
              mimetype: "video/mp4",
              caption,
            },
            { quoted: i === 0 ? m : undefined },
          );
        } else {
          await conn.sendMessage(
            m.chat,
            {
              image: mediaSource,
              caption,
            },
            { quoted: i === 0 ? m : undefined },
          );
        }

        if (total > 1 && i < total - 1) {
          await sleep(700);
        }
      }

      await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
    } catch (err) {
      console.error("[igdl]", err);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } }).catch(() => {});
      const errMsg = err?.response?.data?.message || err?.message || "Terjadi kesalahan pada server API.";
      if (isOwner) {
        m.reply(`❌ *IG Downloader Error:* ${errMsg}`);
      } else {
        m.reply("❌ Gagal mengunduh media Instagram. Pastikan link valid dan akun tidak privat.");
      }
    }
  },
};
