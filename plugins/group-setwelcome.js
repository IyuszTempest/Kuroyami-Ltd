/**
 * Set Welcome & Goodbye Message 🚪✨
 * Custom pesan sambutan & perpisahan dengan PP Default.
 * Format: Unified Plugin System
 */

module.exports = {
    command: ['setwelcome', 'setbye', 'welcome', 'onwelcome', 'offwelcome'],
    category: 'group',
    admin: true,
    group: true,
    call: async (conn, m, { usedPrefix, command, text }) => {
        let chat = global.db.data.chats[m.chat];
        const cmd = command.toLowerCase();


        // SET PESAN WELCOME
        if (cmd === 'setwelcome') {
            if (!text) return m.reply(`Contoh:\n${usedPrefix + command} Halo @user, selamat datang di @group!`);
            chat.sWelcome = text;
            return m.reply(`✅ Pesan Welcome berhasil diatur!`);
        }

        // SET PESAN GOODBYE
        if (cmd === 'setbye') {
            if (!text) return m.reply(`Contoh:\n${usedPrefix + command} Sayonara @user, titip absen ya!`);
            chat.sBye = text;
            return m.reply(`✅ Pesan Goodbye berhasil diatur!`);
        }

        // CEK STATUS & HELP
        if (cmd === 'welcome') {
            let status = `WELCOME SETTINGS\n`;
            status += `> 📝 *Welcome:* ${chat.sWelcome || 'Default'}\n`;
            status += `> 👋 *Goodbye:* ${chat.sBye || 'Default'}\n\n`;
            status += `COMMAND\n`;
            status += `> ✍️ *${usedPrefix}setwelcome <teks>*\n`;
            status += `> ✍️ *${usedPrefix}setbye <teks>*\n \n`;
            status += `*Note:* gunakan @user untuk tag & @group untuk nama grup`;
            
            return m.reply(status);
        }
    }
};
