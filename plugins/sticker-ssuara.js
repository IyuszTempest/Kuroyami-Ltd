const dns = require("dns");
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { Image } = require("node-webpmux");
const {
  proto,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  downloadMediaMessage,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");

const MAX_STICKER_SEC = 15;
const MAX_SOURCE_SEC = 60; 
const MAX_INPUT_BYTES = 20 * 1024 * 1024; 
const AUDIO_MIME = "audio/ogg; codecs=opus";


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


/* ───────────────────────── Helper Media & FFmpeg ───────────────────────── */
function isVideoMessage(q) {
  const mtype = String(q.mtype || q.type || "");
  const mime = String((q.msg || q).mimetype || q.mimetype || "");
  return mtype === "videoMessage" || mtype === "ptvMessage" || /^video\//i.test(mime);
}

function describeError(err) {
  const detail = err?.cause?.code || err?.cause?.message;
  return `${err?.message || String(err)}${detail ? ` (${detail})` : ""}`;
}

function extractVideoNode(q) {
  const mtype = q.mtype === "ptvMessage" ? "ptvMessage" : "videoMessage";
  const node =
    q.msg && typeof q.msg === "object" && (q.msg.url || q.msg.directPath || q.msg.mediaKey)
      ? q.msg
      : q.message?.[mtype] || q;

  if (!node || (!node.url && !node.directPath && !node.mediaKey)) return null;
  return { mtype, node };
}

async function downloadVideo(conn, m, q) {
  const errors = [];
  const info = extractVideoNode(q);

  if (info && typeof downloadContentFromMessage === "function") {
    try {
      const stream = await downloadContentFromMessage(info.node, "video");
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

  throw new Error(`Gagal mengunduh video (${errors.join(" | ") || "unknown"})`);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg terlalu lama memproses (timeout)"));
    }, 60000);

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

async function videoToAnimatedWebp(inFile, maxSec, packname = "", author = "") {
  const outFile = `${inFile}.webp`;
  try {
    await runFfmpeg([
      "-y",
      "-i", inFile,
      "-vcodec", "libwebp",
      "-vf",
      "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=12",
      "-loop", "0",
      "-ss", "00:00:00",
      "-t", String(maxSec),
      "-q:v", "60",
      "-preset", "default",
      "-an",
      "-fps_mode", "vfr",
      outFile,
    ]);

    let webpBuffer = await fs.promises.readFile(outFile);
    if (!webpBuffer.length) throw new Error("Output stiker WebP kosong.");

    try {
      const img = new Image();
      await img.load(webpBuffer);
      const json = {
        "sticker-pack-id": "https://github.com/iyusztempest/Kuroyami-Ltd",
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        emojis: ["🔊", "🗿"],
      };
      const exifAttr = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41,
        0x54, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
      ]);
      const jsonBuffer = Buffer.from(JSON.stringify(json), "utf8");
      const exif = Buffer.concat([exifAttr, jsonBuffer]);
      exif.writeUIntLE(jsonBuffer.length, 14, 4);
      img.exif = exif;
      webpBuffer = await img.save();
    } catch {}

    return webpBuffer;
  } finally {
    fs.promises.unlink(outFile).catch(() => {});
  }
}

async function extractOpusFromVideo(inFile, maxSec) {
  const outFile = `${inFile}.ogg`;
  try {
    const stderr = await runFfmpeg([
      "-y",
      "-i", inFile,
      "-vn",
      "-ss", "00:00:00",
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
    const q = m.quoted ? m.quoted : m;

    if (!isVideoMessage(q)) {
      return m.reply(
        `Kirim video dengan caption *${pfx}${cmd}* atau reply video dengan *${pfx}${cmd}* (otomatis ambil suara video, maks ${MAX_STICKER_SEC} detik).`,
      );
    }

    const rawSeconds = Number((q.msg || q).seconds) || 0;
    if (rawSeconds > MAX_SOURCE_SEC) {
      return m.reply(`Videonya kepanjangan! Maksimal ${MAX_SOURCE_SEC} detik biar prosesnya cepat. 🗿`);
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tmpVideo = path.join(os.tmpdir(), `ssa-${id}.mp4`);

    try {
      await conn.sendMessage(m.chat, { react: { text: "⏳", key: m.key } });

      const videoBuf = await downloadVideo(conn, m, q);
      if (videoBuf.length > MAX_INPUT_BYTES) {
        return m.reply("❌ Ukuran file video terlalu besar (maksimal 20 MB).");
      }

      await fs.promises.writeFile(tmpVideo, videoBuf);

      let audio;
      try {
        audio = await extractOpusFromVideo(tmpVideo, MAX_STICKER_SEC);
      } catch (err) {
        if (err.message === "NO_AUDIO") {
          await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });
          return m.reply("❌ Video ini tidak memiliki suara/audio.");
        }
        throw err;
      }

      const webp = await videoToAnimatedWebp(
        tmpVideo,
        MAX_STICKER_SEC,
        global.packname,
        global.author,
      );

      await sendSoundSticker(conn, m, webp, audio, arg.includes("direct"));
      await conn.sendMessage(m.chat, { react: { text: "🔊", key: m.key } });
    } catch (e) {
      console.error("[ssa]", e);
      await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } }).catch(() => {});
      if (isOwner) m.reply(`❌ *Sticker Error:* ${describeError(e)}`);
      else m.reply("❌ Gagal membuat stiker bersuara.");
    } finally {
      fs.promises.unlink(tmpVideo).catch(() => {});
    }
  },
};
