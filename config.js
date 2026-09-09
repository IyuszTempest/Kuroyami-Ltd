const fs = require("fs");
const chalk = require("chalk");
const axios = require("axios");
const moment = require("moment-timezone");

// --- [ Settings Info Owner & Bot ] ---
global.owner = ["6282255810534"];
global.lidowner = "181067281604634@lid";
global.lidbot = "233891604521119@lid";
global.targetjid = "6282255810534@s.whatsapp.net";
global.nameowner = "IyuszTempest";
global.aliasowner = "Iyus";
global.namebot = "kuroyami Ltd.";
global.numberowner = "6282255810534";
global.wait = "Wait...";
global.eror = "Error!";
global.packname = "Kuroyami Ltd.";
global.author = "By IyzTempest";
global.waifufav = "Euphylia Magenta";
global.titleowner = "Information Systems Student";
global.orgowner = "日本人";

// --- [ APIKEY ] ---
global.aihubmixkey = "sk-tLKaFOT7s2seqsqAA680F16aD15d4aD58eD1D4960bA8D232";
global.sskey = "9f51ff"; // https://api.screenshotmachine.com
global.thrsavapi = "tcGGa"; // https://api.theresav.biz.id

// --- [ Settings Newsletter & Channel ] ---
global.idch = "120363260084721539@newsletter"; // ID Saluran kamu
global.namech = "✨ kuroyami Ltd."; // Nama Saluran kamu

// --- [ Settings Tampilan & Media ] ---
global.wm = "© Kuroyami Ltd. by IyuszTempest";
global.imgall =
  "https://i.pinimg.com/1200x/0e/d8/98/0ed898f1ddea467ba875517873c2aaa9.jpg";
global.imgmenu =
  "https://i.pinimg.com/1200x/41/79/ce/4179cee3eff1c950dab4dc590d5a8988.jpg";
global.imgreply =
  "https://i.pinimg.com/1200x/29/40/c4/2940c4ad3b07dcbb9adeb491d91f4fb2.jpg";
global.imgpagi =
  "https://i.pinimg.com/736x/4e/85/b8/4e85b8660c54563b9b0ecfc591e227da.jpg";
global.imgsiang =
  "https://i.pinimg.com/736x/4a/e2/7e/4ae27e7ec97408a09fc0e894955321e9.jpg";
global.imgmalam =
  "https://cdn.phototourl.com/free/2026-08-19-14e008f8-339f-4111-a1d1-6faac6b1b060.jpg";
global.imgwel =
  "https://i.pinimg.com/736x/c4/a2/5e/c4a25ea5872c2bdc145695115167e3be.jpg";
global.imgbye =
  "https://i.pinimg.com/736x/99/0e/45/990e45ddcccd1a9dde1573efa24f61d0.jpg";
global.qris = "https://u.pone.rs/rjxjtvdl.jpg";

global.social = {
  linkedin: "https://linkedin.com/in/nataliusaja", // Sesuaikan linkmu
  instagram: "https://instagram.com/natariusu.jp",
  youtube: "https://youtube.com/@iyusztempest",
  website: "https://iyusztempest.my.id",
  github: "https://github.com/iyusztempest",
};

//===== Jangan Diubah ======
global.fkontak = {
  key: {
    participants: "0@s.whatsapp.net",
    remoteJid: "status@broadcast",
    fromMe: false,
    id: "Halo",
  },
  message: {
    contactMessage: {
      vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${global.nameowner};Bot;;;\nFN:${global.nameowner}\nitem1.TEL;waid=${global.numberowner}:${global.numberowner}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`,
    },
  },
  participant: "0@s.whatsapp.net",
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright(`Update ${__filename}`));
  delete require.cache[file];
  require(file);
});
