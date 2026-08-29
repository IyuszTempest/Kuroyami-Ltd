const axios = require("axios");

module.exports = {
  command: ["jadwalanichin", "jadwaldonghua"],
  category: "anime",
  noPrefix: true,

  call: async (conn, m, { args, usedPrefix, command }) => {
    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const response = await axios.get(
        "https://api.nexray.eu.cc/anime/anichin/schedule",
        {
          timeout: 15000,
        },
      );

      if (!response.data || !response.data.status || !response.data.result) {
        return m.reply("❌ Gagal mengambil data jadwal Anichin dari server.");
      }

      const scheduleData = response.data.result;
      const inputDay = args[0] ? args[0].toLowerCase().trim() : "";

      const dayMapping = {
        senin: "monday",
        selasa: "tuesday",
        rabu: "wednesday",
        kamis: "thursday",
        jumat: "friday",
        sabtu: "saturday",
        minggu: "sunday",
        monday: "monday",
        tuesday: "tuesday",
        wednesday: "wednesday",
        thursday: "thursday",
        friday: "friday",
        saturday: "saturday",
        sunday: "sunday",
      };

      const daysIndo = {
        Monday: "Senin",
        Tuesday: "Selasa",
        Wednesday: "Rabu",
        Thursday: "Kamis",
        Friday: "Jumat",
        Saturday: "Sabtu",
        Sunday: "Minggu",
      };

      let targetDayEng = dayMapping[inputDay];
      if (!targetDayEng) {
        const daysIndex = [
          "sunday",
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
        ];
        targetDayEng = daysIndex[new Date().getDay()];
      }

      const foundDaySchedule = scheduleData.find(
        (item) => item.day.toLowerCase() === targetDayEng,
      );
      const animeList = foundDaySchedule ? foundDaySchedule.list : [];
      const dayNameIndo = foundDaySchedule
        ? daysIndo[foundDaySchedule.day] || foundDaySchedule.day
        : targetDayEng;

      let txt = `⚔️ *JADWAL DONGHUA ANICHIN* ⚔️\n`;
      txt += `📅 Hari: *${dayNameIndo}*\n`;
      txt += `📊 Total Rilis: *${foundDaySchedule ? foundDaySchedule.totalCount : 0} Series*\n`;
      txt += `──────────────────\n\n`;

      if (animeList.length === 0) {
        txt += `_Tidak ada jadwal Donghua rilis pada hari ini._`;
      } else {
        animeList.forEach((anime, index) => {
          txt += `*${index + 1}. ${anime.title}*\n`;
          txt += `   📺 Episode: *${anime.nextEpisode || "??"}*\n`;
          txt += `   🕒 Rilis: *${anime.releaseTime}*\n`;
          txt += `   🔗 Link: ${anime.url}\n\n`;
        });
      }

      txt += `──────────────────\n`;
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
      console.error("[ANICHIN SCHEDULE ERROR]", e);
      m.reply(
        `❌ Terjadi kesalahan saat mengambil jadwal Anichin: ${e.message}`,
      );
    }
  },
};
