module.exports = {
  command: ["simulate"],
  tags: ["owner"],
  owner: true,
  group: true,

  call: async (conn, m, { usedPrefix, command, args, text }) => {
    let event = (args[0] || "").toLowerCase();

    if (!event) {
      return m.reply(
        `
Contoh:
${usedPrefix + command} welcome @user
${usedPrefix + command} bye @user
`.trim(),
      );
    }

    // =========================
    // 👤 MENTION
    // =========================

    let mentions = text.replace(args[0], "").trim();

    let who = mentions ? conn.parseMention(mentions) : [];

    let participant = who.length ? who[0] : m.sender;

    // =========================
    // 🎭 ACTION
    // =========================

    let action = "";

    switch (event) {
      case "welcome":
      case "add":
      case "invite":
        action = "add";
        break;

      case "bye":
      case "remove":
      case "kick":
      case "leave":
        action = "remove";
        break;

      default:
        return m.reply(
          `
Event tidak valid

Pilihan:
• welcome
• bye
`.trim(),
        );
    }

    // =========================
    // 📢 INFO
    // =========================

    await m.reply(
      `
🎭 Simulating ${event}...
`.trim(),
    );

    // =========================
    // 🚀 EMIT MANUAL EVENT
    // =========================

    conn.ev.emit("group-participants.update", {
      id: m.chat,
      participants: [participant],
      action,
    });
  },
};
