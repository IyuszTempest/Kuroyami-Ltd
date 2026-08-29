module.exports = {
    command: ['s', 'stiker', 'sticker'],
    category: 'tools',
    noPrefix: true, 
    call: async (conn, m, { isOwner }) => {
        let q = m.quoted ? m.quoted : m
        let mime = (q.msg || q).mimetype || ''

        if (/image|video/.test(mime)) {
            await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } })

            try {
                if (/video/.test(mime)) {
                    let duration = (q.msg || q).seconds
                    if (duration > 10) return m.reply('Durasinya kepanjangan! Maksimal 7-9 detik aja biar filenya enteng. 🗿')
                }

                let media = await q.download()
                if (!media || !Buffer.isBuffer(media)) return m.reply('Gagal mendownload media, coba lagi! ❌')

                let stiker = await require('../lib/sticker').sticker(media, false, global.packname, global.author)

                if (Buffer.isBuffer(stiker)) {
                    return await conn.sendMessage(m.chat, { 
                        sticker: stiker 
                    }, { quoted: m })
                } else {
                    throw new Error("Hasil konversi bukan Buffer valid.")
                }

            } catch (e) {
                console.error(e)
                if (isOwner) m.reply(`❌ *Sticker Error:* ${e.message}`) 
            }
        } else {
            return m.reply(`Kirim atau reply foto/video dengan caption *s*`)
        }
    }
}
