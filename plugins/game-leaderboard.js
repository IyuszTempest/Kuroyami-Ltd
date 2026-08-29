module.exports = {
  command: ["leaderboard", "lb", "sultan"],
  category: "game",
  noPrefix: true,
  call: async (conn, m, { usedPrefix, command }) => {
    let users = global.db.data.users;

    let sorted = Object.entries(users)
      .map(([jid, user]) => {
        let totalWealth = (user.dana_balance || 0) + (user.money || 0);
        return {
          jid,
          name: user.name || "User Misterius",
          wealth: totalWealth,
        };
      })
      .sort((a, b) => b.wealth - a.wealth); // Urutkan dari yang paling gede

    let top10 = sorted.slice(0, 10);

    if (top10.length === 0)
      return m.reply("❌ Belum ada data sultan di database.");

    let caption = `╭━━〔 🏆 *𝙻𝙴𝙰𝙳𝙴𝚁𝙱𝙾𝙰𝚁𝙳 𝚂𝚄𝙻𝚃𝙰𝙽* 〕━━┓\n`;
    caption += `┃\n`;
    caption += `┃ _Siapa yang paling terkaya di bot ini?_\n`;
    caption += `┃\n`;

    top10.forEach((user, i) => {
      let medal = "";
      if (i === 0) medal = "🥇";
      else if (i === 1) medal = "🥈";
      else if (i === 2) medal = "🥉";
      else medal = "👤";
      let mention = `@${user.jid.split("@")[0]}`;
      caption += `┃ ${medal} *${i + 1}.* ${mention}\n`;
      caption += `┃    └ 💰 *Total:* Rp${user.wealth.toLocaleString()}\n`;
    });

    caption += `┃\n`;
    caption += `┗━━━━━━━━━━━━━━━━━━━━┛\n`;

    let rank = sorted.findIndex((v) => v.jid === m.sender) + 1;
    caption += `\n🎯 *Peringkat Kamu:* #${rank} dari ${sorted.length} User`;

    return conn.sendMessage(
      m.chat,
      {
        text: caption,
        mentions: top10.map((v) => v.jid),
      },
      { quoted: m },
    );
  },
};
