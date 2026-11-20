module.exports = {
    command: ['del'],
    category: 'tools',
    noPrefix: true, 
    call: async (conn, m, { isBotAdmin, isAdmin }) => {
        if (!m.quoted) return m.reply('Reply pesan yang mau kamu hapus!');

        try {
            const key = {
                remoteJid: m.chat,
                fromMe: m.quoted.fromMe,
                id: m.quoted.id,
                participant: m.quoted.sender
            };

            if (!m.quoted.fromMe && !isBotAdmin) {
                return m.reply('Aku gak bisa hapus pesan orang lain kalau bukan admin grup!');
            }

            await conn.sendMessage(m.chat, { delete: key });

            await conn.sendMessage(m.chat, { react: { text: '🗑️', key: m.key } });

        } catch (e) {
            console.error(e);
            m.reply('Gagal menghapus pesan. Sepertinya aku gak punya izin atau pesannya sudah hilang.');
        }
    }
};
      
