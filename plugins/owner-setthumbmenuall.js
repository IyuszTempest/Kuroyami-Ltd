const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

async function uploadToCDN(buffer) {
    try {
        const form = new FormData();
        form.append('file', buffer, 'thumbnail.jpg');
        const { data } = await axios.post('https://cdn.nekohime.site/upload', form, {
            headers: form.getHeaders()
        });
        return data?.files?.[0]?.url || data?.files?.[0] || null;
    } catch {
        return null;
    }
}

module.exports = {
    command: ['setthumbmenu'],
    category: 'owner',
    owner: true,
    noPrefix: true,
    call: async (conn, m, { usedPrefix, command }) => {
        let q = m.quoted ? m.quoted : m;
        let mime = (q.msg || q).mimetype || '';

        // Validasi input gambar
        if (!mime.startsWith('image/')) {
            return m.reply(`Reply atau kirim gambar untuk dijadikan thumbnail bot.`);
        }

        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        try {
            let img = await q.download();
            if (!img) throw 'Gagal mengunduh gambar.';

            fs.writeFileSync('./thumbnail.jpg', img);

            let url = await uploadToCDN(img);
            if (!url) throw 'Gagal mendapatkan URL gambar dari CDN.';

            let configPath = './config.js';
            if (fs.existsSync(configPath)) {
                let configContent = fs.readFileSync(configPath, 'utf-8');
                
                const regex = /global\.imgmenuall\s*=\s*['"][^'"]*['"]/g;
                if (regex.test(configContent)) {
                    const newConfig = configContent.replace(regex, `global.imgmenuall = '${url}'`);
                    fs.writeFileSync(configPath, newConfig);
                } else {
                    fs.appendFileSync(configPath, `\nglobal.imgmenuall = '${url}'`);
                }
            }

            await conn.sendMessage(m.chat, {
                image: img,
                caption: `✅ *Thumbnail Menu Berhasil Diperbarui*\n\n🖼️ *URL Baru:* ${url}\n\n_Catatan: Jika belum berubah, silakan restart bot di panel._`
            }, { quoted: m });

            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

        } catch (e) {
            console.error(e);
            m.reply(`❌ Terjadi kesalahan: ${e}`);
        }
    }
};
