module.exports = {
  command: ["warn", "unwarn", "cekwarn"],
  category: "group",
  noPrefix: true,
  group: true,
  admin: true,

  call: async (conn, m, { args, usedPrefix, command, isAdmin, isBotAdmin }) => {
    if (!isAdmin) return m.reply("Fitur ini khusus untuk Admin Grup! ❌");

    global.db = global.db || { data: {} };
    global.db.data.users = global.db.data.users || {};

    let target = m.quoted
      ? m.quoted.sender
      : m.mentionedJid && m.mentionedJid[0]
        ? m.mentionedJid[0]
        : null;

    if (!target && ["checkwarn", "cekwarn"].includes(command)) {
      target = m.sender;
    }

    if (!target || typeof target !== "string") {
      return m.reply(
        `Format salah! Mohon reply pesan target atau tag orangnya.\nContoh: *${usedPrefix}${command} @user*`,
      );
    }

    let userKey = `${target}_${m.chat}_warn`;
    if (!global.db.data.users[userKey])
      global.db.data.users[userKey] = { count: 0 };
    let user = global.db.data.users[userKey];

    const targetNumber = target.split("@")[0];

    let groupMetadata = {};
    try {
      groupMetadata = await conn.groupMetadata(m.chat);
    } catch (e) {
      groupMetadata = { subject: "Grup WhatsApp" };
    }
    const groupName = groupMetadata.subject || "Grup WhatsApp";

    if (["checkwarn", "cekwarn"].includes(command)) {
      return conn.sendMessage(
        m.chat,
        {
          text: `📊 *Status Warning*\n\nTarget: @${targetNumber}\nJumlah Warning: *${user.count} / 3*`,
          mentions: [target],
        },
        { quoted: m },
      );
    }

    if (["unwarn", "delwarn"].includes(command)) {
      user.count = 0;
      return conn.sendMessage(
        m.chat,
        {
          text: `✅ Peringatan untuk @${targetNumber} telah direset menjadi *0*.`,
          mentions: [target],
        },
        { quoted: m },
      );
    }

    user.count += 1;

    if (user.count < 3) {
      try {
        await conn.sendMessage(target, {
          text: `⚠️ *SURAT PERINGATAN (PM)*\n\nHalo @${targetNumber}, kamu baru saja mendapat *Warning (${user.count}/3)* dari admin di grup *${groupName}*.\n\nHarap patuhi aturan grup agar tidak dikeluarkan!`,
          mentions: [target],
        });
      } catch (err) {
        console.log("[WARN PM] Gagal mengirim pesan pribadi ke target.");
      }

      return conn.sendMessage(
        m.chat,
        {
          text: `⚠️ *WARNING MANUAL (${user.count}/3)*\n\n@${targetNumber} mendapat peringatan dari admin (detail dikirim ke chat pribadi).\nJika mencapai 3 kali, bot akan otomatis mengeluarkanmu dari grup!`,
          mentions: [target],
        },
        { quoted: m },
      );
    } else {
      user.count = 0;

      try {
        await conn.sendMessage(target, {
          text: `🚫 *ANDA DI-KICK DARI GRUP*\n\nKamu telah dikeluarkan dari grup *${groupName}* karena sudah mencapai batas *3x peringatan* dari admin.`,
        });
      } catch (err) {
        console.log("[WARN PM] Gagal mengirim pesan kick pribadi ke target.");
      }

      await conn.sendMessage(m.chat, {
        text: `🚫 @${targetNumber} telah mencapai *3x peringatan* dan akan dikeluarkan dari grup sekarang!`,
        mentions: [target],
      });

      if (isBotAdmin) {
        return setTimeout(async () => {
          await conn.groupParticipantsUpdate(m.chat, [target], "remove");
        }, 800);
      } else {
        return m.reply(
          "⚠️ Bot bukan admin, jadi gagal mengeluarkan member tersebut!",
        );
      }
    }
  },
};
