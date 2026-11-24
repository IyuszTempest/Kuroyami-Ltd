const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { Image } = require('node-webpmux')

function detectAnimated(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false
    const hex0_4 = buffer.subarray(0, 4).toString('hex')
    const hex4_8 = buffer.subarray(4, 8).toString('hex')
    const ascii0_4 = buffer.subarray(0, 4).toString('ascii')

    // MP4 / MOV (ftyp)
    if (hex4_8 === '66747970' || hex0_4 === '00000018' || hex0_4 === '00000020') return true
    // WebM / MKV (EBML)
    if (hex0_4 === '1a45dfa3') return true
    // GIF87a / GIF89a
    if (ascii0_4 === 'GIF8') return true

    return false
}

function createSticker(buffer, isVideo = false, packname = '', author = '') {
    return new Promise((resolve, reject) => {
        const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const tmpDir = path.join(__dirname, '../tmp')
        const tmpIn = path.join(tmpDir, `${uid}.${isVideo ? 'mp4' : 'bin'}`)
        const tmpOut = path.join(tmpDir, `${uid}.webp`)

        const cleanup = () => {
            try { if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn) } catch {}
            try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut) } catch {}
        }

        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true })
        }

        fs.writeFileSync(tmpIn, buffer)

        const args = isVideo
            ? [
                '-y', '-i', tmpIn,
                '-vcodec', 'libwebp',
                '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15",
                '-loop', '0',
                '-ss', '00:00:00',
                '-t', '00:00:06',
                '-preset', 'default',
                '-an',
                '-fps_mode', 'vfr',
                tmpOut
            ]
            : [
                '-y', '-i', tmpIn,
                '-vcodec', 'libwebp',
                '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
                '-q:v', '80',
                '-preset', 'default',
                tmpOut
            ]

        const ffmpeg = spawn('ffmpeg', args, { windowsHide: true })
        let stderr = ''

        ffmpeg.stderr.on('data', (chunk) => {
            stderr += chunk.toString()
        })

        ffmpeg.on('close', async (code) => {
            try {
                if (code !== 0 || !fs.existsSync(tmpOut)) {
                    const detail = stderr.split('\n').map(s => s.trim()).filter(Boolean).slice(-3).join(' | ')
                    cleanup()
                    return reject(new Error(`FFmpeg gagal (${code}): ${detail || 'output WebP tidak terbentuk'}`))
                }

                let webpBuffer = fs.readFileSync(tmpOut)

                try {
                    const img = new Image()
                    await img.load(webpBuffer)
                    const json = {
                        'sticker-pack-id': 'https://github.com/YusTempest/Euphy-Bot',
                        'sticker-pack-name': packname,
                        'sticker-pack-publisher': author,
                        'emojis': ['🌸', '🗿']
                    }
                    const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x54, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
                    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
                    const exif = Buffer.concat([exifAttr, jsonBuffer])
                    exif.writeUIntLE(jsonBuffer.length, 14, 4)
                    img.exif = exif
                    webpBuffer = await img.save()
                } catch {}

                cleanup()
                resolve(webpBuffer)
            } catch (err) {
                cleanup()
                reject(err)
            }
        })

        ffmpeg.on('error', (err) => {
            cleanup()
            reject(err)
        })
    })
}

module.exports = {
    async sticker(img, url, packname, author) {
        let buffer = img
        if (!Buffer.isBuffer(buffer) && url) {
            const res = await fetch(url)
            if (!res.ok) throw new Error(`Gagal mengunduh URL media (HTTP ${res.status})`)
            buffer = Buffer.from(await res.arrayBuffer())
        }

        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
            throw new Error('Media input kosong atau bukan Buffer yang valid!')
        }

        const isVideo = detectAnimated(buffer)
        return await createSticker(buffer, isVideo, packname, author)
    }
}
