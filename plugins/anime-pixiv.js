const { 
    proto, 
    generateWAMessageFromContent, 
    prepareWAMessageMedia 
} = require("@whiskeysockets/baileys");
const axios = require("axios");

module.exports = {
    command: ["pixiv"], 
    category: "anime",
    noPrefix: true,
    call: async (conn, m, { usedPrefix, command, text, args }) => {  
        if (command === 'getpixiv' || (m.message?.interactiveResponseMessage?.nativeFlowResponseMessage)) {
            let imgUrl = "";

            if (m.message?.interactiveResponseMessage?.nativeFlowResponseMessage) {
                let params = JSON.parse(m.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
                imgUrl = params.id.split(" ")[1]; 
            } else {
                imgUrl = args[0];
            }

            if (!imgUrl) return m.reply("❌ Gagal mengambil detail gambar.");
            
            return await conn.sendMessage(m.chat, { 
                image: { url: imgUrl }, 
                caption: "🌸 *Pixiv Image Detail*" 
            }, { quoted: m });
        }

        if (!text) return m.reply(`Mau cari apa di Pixiv?\nContoh: *${usedPrefix}pixiv Furina*`);

        await conn.sendMessage(m.chat, { react: { text: "🎨", key: m.key } });

        try {
            const { data: res } = await axios.get(`https://api.azbry.com/api/search/pixiv?q=${encodeURIComponent(text)}`);

            if (!res.status || !res.result || res.result.length === 0) return m.reply("❌ Hasil tidak ditemukan.");

            const results = res.result.slice(0, 10);
            
            let rows = results.map((item, i) => {
                let imgUrl = item.image;
                if (imgUrl.includes("img=")) imgUrl = decodeURIComponent(imgUrl.split("img=")[1]);
                return {
                    title: (item.title || `Art ${i+1}`).substring(0, 30),
                    description: `Oleh: ${item.userName}`,
                    id: `${usedPrefix}getpixiv ${imgUrl}` 
                };
            });

            const listMessage = {
                title: `Hasil: ${text}`,
                sections: [{ title: "Pilih ilustrasi:", rows: rows }]
            };

            const headerMedia = await prepareWAMessageMedia(
                { image: { url: results[0].image.includes("img=") ? decodeURIComponent(results[0].image.split("img=")[1]) : results[0].image } },
                { upload: conn.waUploadToServer }
            );

            const msg = generateWAMessageFromContent(m.chat, {
                viewOnceMessage: {
                    message: {
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            header: proto.Message.InteractiveMessage.Header.create({ title: "⛩️ Pixiv Search", hasMediaAttachment: true, ...headerMedia }),
                            body: proto.Message.InteractiveMessage.Body.create({ text: `Ditemukan ${results.length} hasil untuk: *${text}*` }),
                            footer: proto.Message.InteractiveMessage.Footer.create({ text: global.wm }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: [{ name: "single_select", buttonParamsJson: JSON.stringify(listMessage) }],
                            }),
                        }),
                    },
                },
            }, { quoted: m });

            await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id, additionalNodes: [{ tag: "biz", attrs: {}, content: [{ tag: "interactive", attrs: { type: "native_flow", v: "1" }, content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }] }] }] });
        } catch (e) {
            m.reply(`⚠️ Error: ${e.message}`);
        }
    },
};