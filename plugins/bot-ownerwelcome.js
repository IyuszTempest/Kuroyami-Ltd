module.exports = {
  before: async function (m, { conn }) {
    if (!m.isGroup) return;
    if (m.fromMe) return;

    const ownerNumber = global.lidowner;

    if (m.sender !== ownerNumber) return;

    let user = global.db.data.users[m.sender] || {};
    let now = +new Date();

    if (user.ownerWelcome && now - user.ownerWelcome < 3600000) return; //milidetik

    user.ownerWelcome = now;
    global.db.data.users[m.sender] = user;

    await conn.sendMessage(
      m.chat,
      {
        text: `wah, ada. @${ownerNumber.split("@")[0]} ayangkuh 🥰`,
        mentions: [ownerNumber],
        contextInfo: {
          isForwarded: true,
          forwardedNewsletterMessageInfo: {
            newsletterJid: idch,
            newsletterName: namech,
            serverMessageId: 143,
          },
        },
      },
      { quoted: m },
    );
  },
};
