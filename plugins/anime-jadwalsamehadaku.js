const axios = require("axios");

module.exports = {
  command: ["jadwalanime", "jadwalsamehadaku"],
  category: "anime",
  noPrefix: true,

  call: async (conn, m, { args, usedPrefix, command }) => {
    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const response = await axios.get(
        "https://api.nexray.eu.cc/anime/samehadaku/schedule",
        {
          timeout: 15000,
        },
      );

      if (!response.data || !response.data.status || !response.data.result) {
        return m.reply("Gagal mengambil data jadwal anime dari server.");
      }

      const schedule = response.data.result;
      const inputDay = args[0] ? args[0].toLowerCase().trim() : "";

      const dayMapping = {
        senin: "monday",
        selasa: "tuesday",
        rabu: "wednesday",
        kamis: "thursday",
        jumat: "friday",
        sabtu: "saturday",
        minggu: "sunday",
      };

      const daysIndo = {
        monday: "Senin",
        tuesday: "Selasa",
        wednesday: "Rabu",
        thursday: "Kamis",
        friday: "Jumat",
        saturday: "Sabtu",
        sunday: "Minggu",
      };

      let targetDay = dayMapping[inputDay] || inputDay;

      const validDays = Object.keys(schedule);
      if (!validDays.includes(targetDay)) {
        const daysIndex = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ];
        const todayName = daysIndex[new Date().getDay()];
        targetDay = todayName;
      }

      const animeList = schedule[targetDay] || [];
      const dayNameIndo = daysIndo[targetDay] || targetDay.toUpperCase();

      let txt = `🌸 *JADWAL ANIME SAMEHADAKU* 🌸\n`;
      txt += `📅 Hari: *${dayNameIndo}*\n`;
      txt += `────────────────────\n\n`;

      if (animeList.length === 0) {
        txt += `_Tidak ada jadwal anime rilis pada hari ini._`;
      } else {
        animeList.forEach((anime, index) => {
          txt += `*${index + 1}. ${anime.title}*\n`;
          txt += `   ⭐ Score: *${anime.score || "N/A"}*\n`;
          txt += `   🕒 Jam: *${anime.time} WIB*\n`;
          txt += `   🏷️ Genre: _${anime.genres}_\n`;
          txt += `   🔗 Link: ${anime.url}\n\n`;
        });
      }

      txt += `────────────────────\n`;
      txt += `💡 _Ketik *${usedPrefix}${command} senin/selasa/dst* untuk melihat jadwal hari lain._`;

      await conn.sendMessage(
        m.chat,
        {
          text: txt,
          contextInfo: {
            mentionedJid: [m.sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: global.idch || "",
              serverMessageId: 143,
              newsletterName: `${global.namech || "Kuro Bot"}`,
            },
          },
        },
        { quoted: m },
      );
    } catch (e) {
      console.error("[ANIME SCHEDULE ERROR]", e);
      m.reply(`Terjadi kesalahan saat mengambil jadwal: ${e.message}`);
    }
  },
};
