const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
} = require("@whiskeysockets/baileys");

const mediaCache = new Map();

module.exports = {
  command: ["swgroup", "swgc", "upswgc"],
  category: "owner",
  noPrefix: true,
  owner: true,

  call: async (
    conn,
    m,
    { args, text, usedPrefix, command, isAdmin, isOwner },
  ) => {
    if (!m.isGroup) return m.reply("❌ Fitur ini hanya bisa dipakai di grup.");
    if (!isAdmin && !isOwner) return m.reply("❌ Fitur khusus owner bot.");

    try {
      const rawArg = args.join(" ");
      const isActionTrigger = rawArg.includes("|");

      if (!isActionTrigger) {
        const quoted = m.quoted ? m.quoted : m;
        const mime = (quoted.msg || quoted).mimetype || "";
        const captionQuoted = quoted.msg?.caption || quoted.caption || "";
        const caption = text || captionQuoted;

        if (!mime && !caption) {
          return m.reply(
            `- example: ${usedPrefix}${command} (reply media atau ketik caption)`,
          );
        }

        let chats = Object.keys(await conn.groupFetchAllParticipating());
        if (chats.length === 0)
          return m.reply("❌ Bot tidak bergabung di grup manapun.");

        let hasMedia = "false";
        if (/image|video|audio/.test(mime)) {
          try {
            const buffer = await quoted.download();
            mediaCache.set(m.sender, { buffer, mime });
            hasMedia = "true";
          } catch (err) {
            console.error("Gagal cache media:", err);
          }
        }

        const encodedCaption = Buffer.from(caption).toString("base64");

        let rows = [
          {
            title: "✨ Kirim ke SEMUA GRUP",
            description: `Kirim status serentak ke ${chats.length} grup`,
            id: `${usedPrefix}${command} all|${encodedCaption}|${hasMedia}`,
          },
        ];

        for (let i = 0; i < Math.min(chats.length, 20); i++) {
          let metadata = await conn
            .groupMetadata(chats[i])
            .catch(() => ({ subject: "Unknown Group" }));
          rows.push({
            title: `📌 ${metadata.subject.substring(0, 24)}`,
            description: `Kirim khusus ke grup ini`,
            id: `${usedPrefix}${command} ${chats[i]}|${encodedCaption}|${hasMedia}`,
          });
        }

        let listMessage = {
          title: "Pilih Target Kirim Status Grup",
          sections: [
            {
              title: "Daftar Opsi Pengiriman",
              highlight_label: "Status 🚀",
              rows: rows,
            },
          ],
        };

        let menuContent = `📸 *Group Status Sender Panel*\n\n`;
        menuContent += `📝 *Caption:* ${caption || "(Tanpa Caption)"}\n`;
        menuContent += `📎 *Media:* ${hasMedia === "true" ? "Berhasil Disimpan" : "Tidak Ada"}\n\n`;
        menuContent += `Silahkan pilih target pengiriman di bawah ini:`;

        const msg = generateWAMessageFromContent(
          m.chat,
          {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadata: {},
                  deviceListMetadataVersion: 2,
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                  header: proto.Message.InteractiveMessage.Header.create({
                    title: `Group Status`,
                    hasMediaAttachment: true,
                    ...(await prepareWAMessageMedia(
                      { image: { url: global.imgmenu || global.imgall } },
                      { upload: conn.waUploadToServer },
                    )),
                  }),
                  body: proto.Message.InteractiveMessage.Body.create({
                    text: menuContent,
                  }),
                  footer: proto.Message.InteractiveMessage.Footer.create({
                    text: global.wm || "Bot Management System",
                  }),
                  nativeFlowMessage:
                    proto.Message.InteractiveMessage.NativeFlowMessage.create({
                      messageVersion: 1,
                      buttons: [
                        {
                          name: "single_select",
                          buttonParamsJson: JSON.stringify(listMessage),
                        },
                      ],
                    }),
                  contextInfo: {
                    mentionedJid: [m.sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                      newsletterJid: global.idch || "",
                      serverMessageId: 143,
                      newsletterName: `${global.namech || "Bot"}`,
                    },
                  },
                }),
              },
            },
          },
          { userJid: conn.user.id, quoted: m },
        );

        return await conn.relayMessage(m.chat, msg.message, {
          messageId: msg.key.id,
          additionalNodes: [
            {
              tag: "biz",
              attrs: {},
              content: [
                {
                  tag: "interactive",
                  attrs: { type: "native_flow", v: "1" },
                  content: [
                    { tag: "native_flow", attrs: { v: "9", name: "mixed" } },
                  ],
                },
              ],
            },
          ],
        });
      }

      const [targetPart, encodedCap, hasMediaStr] = rawArg.split("|");
      const targetType = targetPart.toLowerCase();
      const caption = encodedCap
        ? Buffer.from(encodedCap, "base64").toString("utf8")
        : "";
      const hasMedia = hasMediaStr === "true";

      let targetJids = [];
      if (targetType === "all") {
        let chatsObj = await conn.groupFetchAllParticipating();
        targetJids = Object.keys(chatsObj);
      } else if (targetType.endsWith("@g.us")) {
        targetJids = [targetType];
      } else {
        return m.reply("❌ Target grup tidak valid!");
      }

      let cachedMedia = mediaCache.get(m.sender) || null;
      let buffer = cachedMedia ? cachedMedia.buffer : null;
      let mime = cachedMedia ? cachedMedia.mime : "";

      let successCount = 0;
      await m.reply(
        `⏳ Sedang memproses pengiriman status ke ${targetJids.length} target...`,
      );

      for (let jid of targetJids) {
        try {
          if (/image/.test(mime) && buffer) {
            await conn.sendMessage(jid, {
              groupStatusMessage: {
                image: buffer,
                caption: caption,
              },
            });
          } else if (/video/.test(mime) && buffer) {
            await conn.sendMessage(jid, {
              groupStatusMessage: {
                video: buffer,
                caption: caption,
              },
            });
          } else if (/audio/.test(mime) && buffer) {
            await conn.sendMessage(jid, {
              groupStatusMessage: {
                audio: buffer,
              },
            });
          } else if (caption) {
            await conn.sendMessage(jid, {
              groupStatusMessage: {
                text: caption,
              },
            });
          }
          successCount++;
        } catch (err) {
          console.error(`Gagal kirim ke ${jid}:`, err.message);
        }
      }

      if (mediaCache.has(m.sender)) {
        mediaCache.delete(m.sender);
      }

      await conn.sendMessage(
        m.chat,
        {
          text: `✔️ Berhasil mengirim status grup ke *${successCount}* dari *${targetJids.length}* target!`,
        },
        { quoted: m },
      );
    } catch (e) {
      if (mediaCache.has(m.sender)) mediaCache.delete(m.sender);
      m.reply(String(e));
    }
  },
};
