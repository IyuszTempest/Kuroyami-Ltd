const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadMediaMessage,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");

const MAX_VIDEO_SEC = 10;
const MAX_AUDIO_SEC = 10;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const SAVE_TTL_MS = 5 * 60 * 1000;
const AUDIO_MIME = "audio/ogg; codecs=opus";
const TMP_DIR = path.join(__dirname, "../tmp");


/* ───────────────────────── Runtime Patch WAProto ───────────────────────── */
function patchAudioStickerProto() {
  const Msg = proto.Message;
  const Stk = proto.Message?.StickerMessage;
  if (!Msg || !Stk) return false;
  if (Msg.__audioStickerPatched) return true;

  const origStkCreate = Stk.create.bind(Stk);
  Stk.create = (props) => {
    const res = origStkCreate(props);
    if (props?.audioMessage) res.audioMessage = props.audioMessage;
    return res;
  };

  const origStkFromObj = Stk.fromObject.bind(Stk);
  Stk.fromObject = (obj) => {
    const res = origStkFromObj(obj);
    if (obj?.audioMessage) {
      res.audioMessage =
        obj.audioMessage instanceof Msg.AudioMessage
          ? obj.audioMessage
          : Msg.AudioMessage.fromObject(obj.audioMessage);
    }
    return res;
  };

  const origStkEncode = Stk.encode.bind(Stk);
  Stk.encode = (msg, writer) => {
    writer = origStkEncode(msg, writer);
    if (msg?.audioMessage != null) {
      Msg.AudioMessage.encode(msg.audioMessage, writer.uint32(210).fork()).ldelim();
    }
    return writer;
  };

  const origMsgCreate = Msg.create.bind(Msg);
  Msg.create = (props) => {
    const res = origMsgCreate(props);
    if (props?.audioStickerMessage) res.audioStickerMessage = props.audioStickerMessage;
    return res;
  };

  const origMsgFromObj = Msg.fromObject.bind(Msg);
  Msg.fromObject = (obj) => {
    const res = origMsgFromObj(obj);
    if (obj?.audioStickerMessage) {
      const inner = obj.audioStickerMessage.message || obj.audioStickerMessage;
      res.audioStickerMessage = {
        message: inner instanceof Msg ? inner : Msg.fromObject(inner),
      };
    }
    return res;
  };

  const origMsgEncode = Msg.encode.bind(Msg);
  Msg.encode = (msg, writer) => {
    writer = origMsgEncode(msg, writer);
    const inner = msg?.audioStickerMessage?.message;
    if (inner != null) {
      const w = writer.uint32(1074).fork();
      Msg.encode(inner, w.uint32(10).fork()).ldelim();
      w.ldelim();
    }
    return writer;
  };

  Msg.__audioStickerPatched = true;
  console.log("[ssa] WAProto full-patched (134 & 26)");
  return true;
}

patchAudioStickerProto();


/* ───────────────────────── Helper Penyimpanan Video ───────────────────────── */
function getSavedPaths(sender) {
  const safeId = String(sender).replace(/[^a-zA-Z0-9]/g, "_");
  return {
    webp: path.join(TMP_DIR, `ssa_saved_${safeId}.webp`),
  };
}

function hasValidSavedVideo(sender) {
  const files = getSavedPaths(sender);
  if (!fs.existsSync(files.webp)) return null;
  const stat = fs.statSync(files.webp);
  if (Date.now() - stat.mtimeMs > SAVE_TTL_MS) {
    fs.promises.unlink(files.webp).catch(() => {});
    return null;
  }
  return files;
}

function clearSavedVideo(sender) {
  const files = getSavedPaths(sender);
  fs.promises.unlink(files.webp).catch(() => {});
}


/* ───────────────────────── Helper Media & FFmpeg ───────────────────────── */
function getMediaKind(q) {
  const mtype = String(q.mtype || q.type || "");
  const mime = String((q.msg || q).mimetype || q.mimetype || "");
  if (mtype === "videoMessage" || mtype === "ptvMessage" || /^video\//i.test(mime)) return "video";
  if (mtype === "audioMessage" || /^audio\//i.test(mime)) return "audio";
  return null;
}

function describeError(err) {
  const detail = err?.cause?.code || err?.cause?.message;
  return `${err?.message || String(err)}${detail ? ` (${detail})` : ""}`;
}

function extractMediaNode(q, kind) {
  const defaultType = kind === "video" ? "videoMessage" : "audioMessage";
  const mtype = q.mtype || q.type || defaultType;
  const node =
    q.msg && typeof q.msg === "object" && (q.msg.url || q.msg.directPath || q.msg.mediaKey)
      ? q.msg
      : q.message?.[mtype] || q;

  if (!node || (!node.url && !node.directPath && !node.mediaKey)) return null;
  return { mtype, node };
}

async function downloadBuffer(conn, m, q, kind) {
  const errors = [];
  const info = extractMediaNode(q, kind);

  if (info && typeof downloadContentFromMessage === "function") {
    try {
      const stream = await downloadContentFromMessage(info.node, kind);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      if (buf.length > 0) return buf;
      errors.push("stream 0 byte");
    } catch (err) {
      errors.push(`stream: ${describeError(err)}`);
    }
  }

  if (info && typeof downloadMediaMessage === "function") {
    const msgObj = q.fakeObj?.message
      ? q.fakeObj
      : {
          key: { remoteJid: m.chat, fromMe: !!q.fromMe, id: q.id, participant: q.sender },
          message: { [info.mtype]: info.node },
        };
    try {
      const buf = await downloadMediaMessage(
        msgObj,
        "buffer",
        {},
        { reuploadRequest: conn.updateMediaMessage },
      );
      if (Buffer.isBuffer(buf) && buf.length > 0) return buf;
      errors.push("downloadMediaMessage kosong");
    } catch (err) {
      errors.push(`mediaMsg: ${describeError(err)}`);
    }
  }

  if (typeof q.download === "function") {
    try {
      const buf = await q.download();
      if (Buffer.isBuffer(buf) && buf.length > 0) return buf;
      errors.push("q.download() kosong");
    } catch (err) {
      errors.push(`q.download: ${describeError(err)}`);
    }
  }

  throw new Error(`Gagal mengunduh ${kind} (${errors.join(" | ") || "unknown"})`);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timeout"));
    }, 45000);

    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stderr);
      if (/does not contain any stream|matches no streams|no audio/i.test(stderr)) {
        return reject(new Error("NO_AUDIO"));
      }
      reject(new Error(`ffmpeg gagal (${code}): ${stderr.split("\n").slice(-3).join(" ").trim()}`));
    });
  });
}

async function convertToOpus(buffer, maxSec) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inFile = path.join(os.tmpdir(), `ssa-${id}.in`);
  const outFile = path.join(os.tmpdir(), `ssa-${id}.ogg`);

  await fs.promises.writeFile(inFile, buffer);
  try {
    const stderr = await runFfmpeg([
      "-y", "-i", inFile,
      "-vn",
      "-t", String(maxSec),
      "-c:a", "libopus",
      "-b:a", "48k",
      "-ac", "1",
      "-ar", "48000",
      "-f", "ogg",
      outFile,
    ]);

    const out = await fs.promises.readFile(outFile);
    if (!out.length) throw new Error("NO_AUDIO");

    let seconds = maxSec;
    const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    if (times.length) {
      const [, h, mi, s] = times[times.length - 1];
      seconds = Math.max(1, Math.ceil(Number(h) * 3600 + Number(mi) * 60 + parseFloat(s)));
    }
    return { buffer: out, seconds: Math.min(seconds, maxSec) };
  } finally {
    fs.promises.unlink(inFile).catch(() => {});
    fs.promises.unlink(outFile).catch(() => {});
  }
}

async function sendSoundSticker(conn, m, webp, audio, directMode = false) {
  const opts = { upload: conn.waUploadToServer };
  const stickerMedia = await prepareWAMessageMedia(
    { sticker: webp, isAnimated: webp.includes("ANIM") },
    opts,
  );
  const soundMedia = await prepareWAMessageMedia(
    { audio: audio.buffer, mimetype: AUDIO_MIME, ptt: false, seconds: audio.seconds },
    opts,
  );

  stickerMedia.stickerMessage.audioMessage = soundMedia.audioMessage;

  const rawPayload = directMode
    ? { stickerMessage: stickerMedia.stickerMessage }
    : { audioStickerMessage: { message: { stickerMessage: stickerMedia.stickerMessage } } };

  const content = proto.Message.fromObject(rawPayload);
  const msg = generateWAMessageFromContent(m.chat, content, { userJid: conn.user.id });

  await conn.relayMessage(m.chat, msg.message, {
    messageId: msg.key.id,
  });
}

/* ───────────────────────── Command ───────────────────────── */
module.exports = {
  command: ["stikersuara", "ssa"],
  category: "sticker",
  noPrefix: true,
  call: async (conn, m, { usedPrefix, command, text, isOwner }) => {
    const pfx = usedPrefix || "";
    const cmd = command || "ssa";
    const arg = (text || "").trim().toLowerCase();

    if (/^(batal|cancel|hapus|reset|del)$/i.test(arg)) {
      const saved = hasValidSavedVideo(m.sender);
      if (!saved) {
        return m.reply("ℹ️ Tidak ada video tersimpan yang perlu dibatalkan.");
      }
      clearSavedVideo(m.sender);
      await conn.sendMessage(m.chat, { react: { text: "🗑️", key: m.key } }).catch(() => {});
      return m.reply("✅ Proses stiker bersuara dibatalkan, video tersimpan sudah dihapus.");
    }

    const q = m.quoted ? m.quoted : m;
    const kind = getMediaKind(q);

    if (!kind) {
      const saved = hasValidSavedVideo(m.sender);
      return m.reply(
        `╭─〔 🔊 *STIKER BERSUARA* 〕\n` +
          `│ 1. Reply *video* dengan \`${pfx}${cmd}\` untuk menyimpan video\n` +
          `│ 2. Reply *audio / VN* dengan \`${pfx}${cmd}\` untuk menggabungkannya\n` +
          `│ 3. Ketik \`${pfx}${cmd} batal\` untuk membatalkan video tersimpan\n` +
          `╰──────────────\n` +
          `Status video tersimpan: ${saved ? "✅ Ada (aktif 5 menit)" : "❌ Belum ada"}`,
      );
    }

    try {
      if (kind === "video") {
        const seconds = Number((q.msg || q).seconds) || 0;
        if (seconds > MAX_VIDEO_SEC) {
          return m.reply(`Durasinya kepanjangan! Maksimal ${MAX_VIDEO_SEC} detik aja biar enteng. 🗿`);
        }

        await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
        const videoBuf = await downloadBuffer(conn, m, q, "video");
        if (videoBuf.length > MAX_INPUT_BYTES) {
          return m.reply("❌ Ukuran video terlalu besar (maksimal 15 MB).");
        }

        const stickerLib = require("../lib/sticker");
        const webp = await stickerLib.sticker(videoBuf, false, global.packname, global.author);
        if (!Buffer.isBuffer(webp)) throw new Error("Gagal mengubah video menjadi WebP.");

        if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
        const files = getSavedPaths(m.sender);
        await fs.promises.writeFile(files.webp, webp);

        await conn.sendMessage(m.chat, { react: { text: "💾", key: m.key } });
        return m.reply(
          `✅ *Video berhasil disimpan!*\n` +
            `• Reply *voice note atau audio* dengan \`${pfx}${cmd}\` untuk menjadikannya stiker.\n` +
            `• Ketik \`${pfx}${cmd} batal\` kalau tidak jadi.`,
        );
      }

      if (kind === "audio") {
        const saved = hasValidSavedVideo(m.sender);
        if (!saved) {
          return m.reply(
            `❌ Belum ada video yang tersimpan.\nReply *video* dulu dengan \`${pfx}${cmd}\`.`,
          );
        }

        await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });
        const audioBuf = await downloadBuffer(conn, m, q, "audio");
        if (audioBuf.length > MAX_INPUT_BYTES) {
          return m.reply("❌ Ukuran audio terlalu besar (maksimal 15 MB).");
        }

        const audio = await convertToOpus(audioBuf, MAX_AUDIO_SEC);
        const webp = await fs.promises.readFile(saved.webp);

        await sendSoundSticker(conn, m, webp, audio, arg.includes("direct"));
        clearSavedVideo(m.sender);

        await conn.sendMessage(m.chat, { react: { text: "🔊", key: m.key } });
      }
    } catch (e) {
      console.error("[ssa]", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } }).catch(() => {});
      if (isOwner) m.reply(`❌ *Sticker Error:* ${describeError(e)}`);
      else m.reply("❌ Gagal memproses stiker bersuara.");
    }
  },
};
