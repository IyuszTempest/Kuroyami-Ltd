/**
 * Plugin: Local Plugin Searcher (SC Finder) v1.0 🔍
 * Fitur: Mencari nama file plugin, command terdaftar, atau kategori di dalam Source Code secara lokal.
 * Tanpa API luar, sangat cepat, dan informatif.
 */

/* STREAMING_CHUNK:Initializing dependencies and settings... */
const fs = require('fs');
const path = require('path');

module.exports = {
  command: ['splugins', 'splugin',  'plugin', 'cariplugin', 'plugins'],
  category: 'owner',
  owner: true, // Biasanya pencarian struktur file plugin dibatasi hanya untuk Owner / Dev
  noPrefix: false,

  call: async (conn, m, { text, usedPrefix, command }) => {
    /* STREAMING_CHUNK:Validating user input query... */
    if (!text) {
      return m.reply(`*Contoh Penggunaan:*\n${usedPrefix + command} layla\n\n_Ketik kata kunci nama file, command, atau kategori plugin yang ingin dicari!_`);
    }

    const query = text.toLowerCase().trim();
    const results = [];

    /* STREAMING_CHUNK:Scanning memory global plugins... */
    if (global.plugins && typeof global.plugins === 'object') {
      for (let filename in global.plugins) {
        const plugin = global.plugins[filename];
        if (!plugin) continue;

        // Mendapatkan nama file saja tanpa path lengkap jika ada
        const shortFileName = path.basename(filename);
        
        // Ekstraksi daftar command dari plugin
        let commands = [];
        if (Array.isArray(plugin.command)) {
          commands = plugin.command.filter(c => typeof c === 'string');
        } else if (typeof plugin.command === 'string') {
          commands = [plugin.command];
        }

        const category = (plugin.category || 'unclassified').toLowerCase();
        const description = plugin.help || plugin.description || '';

        // Deteksi kecocokan (Kriteria: Nama File, Nama Command, Kategori, atau Deskripsi/Help)
        const matchFileName = shortFileName.toLowerCase().includes(query) || filename.toLowerCase().includes(query);
        const matchCommand = commands.some(cmd => cmd.toLowerCase().includes(query));
        const matchCategory = category.includes(query);

        if (matchFileName || matchCommand || matchCategory) {
          results.push({
            filepath: filename,
            filename: shortFileName,
            commands: commands,
            category: plugin.category || 'No Category',
            ownerOnly: !!(plugin.owner || plugin.rowner),
            adminOnly: !!plugin.admin,
            disabled: !!plugin.disabled
          });
        }
      }
    }

    /* STREAMING_CHUNK:Formatting result output response... */
    if (results.length === 0) {
      return m.reply(`❌ Tidak ditemukan plugin, file, atau command yang cocok dengan kata kunci: *"${text}"*`);
    }

    let responseText = `🔍 *LOCAL PLUGIN SEARCH RESULTS*\n`;
    responseText += `*Kata Kunci:* _${text}_\n`;
    responseText += `*Ditemukan:* ${results.length} item\n`;
    responseText += `─────────────────────\n\n`;

    results.forEach((res, index) => {
      responseText += `*${index + 1}. ${res.filename}*\n`;
      responseText += `📁 *Path:* \`${res.filepath}\`\n`;
      
      if (res.commands.length > 0) {
        responseText += `📌 *Commands:* ${res.commands.map(cmd => `.${cmd}`).join(', ')}\n`;
      } else {
        responseText += `📌 *Commands:* (Tidak ada command pemicu / No Command)\n`;
      }
      
      responseText += `🏷️ *Kategori:* ${res.category}\n`;
      
      // Menambahkan badge status plugin jika ada pembatasan khusus
      const statusBadges = [];
      if (res.ownerOnly) statusBadges.push('👑 Owner-Only');
      if (res.adminOnly) statusBadges.push('🛡️ Admin-Only');
      if (res.disabled) statusBadges.push('🚫 Nonaktif');
      
      if (statusBadges.length > 0) {
        responseText += `⚙️ *Status:* [ ${statusBadges.join(' | ')} ]\n`;
      }
      
      responseText += `\n`;
    });

    responseText += `─────────────────────\n`;
    responseText += `_Sistem Pencarian Internal Source Code Bot_ 🚀`;

    /* STREAMING_CHUNK:Sending response back to user... */
    return conn.sendMessage(m.chat, { text: responseText.trim() }, { quoted: m });
  }
};