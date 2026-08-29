const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const { Image } = require('node-webpmux')

function createSticker(buffer, isVideo = false, packname = '', author = '') {
    return new Promise(async (resolve, reject) => {
        let tmpIn = path.join(__dirname, `../tmp/${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`)
        let tmpOut = path.join(__dirname, `../tmp/${Date.now()}.webp`)

        if (!fs.existsSync(path.dirname(tmpIn))) {
            fs.mkdirSync(path.dirname(tmpIn), { recursive: true })
        }

        fs.writeFileSync(tmpIn, buffer)

        let args = []
        if (isVideo) {
            args = [
                '-y', '-i', tmpIn,
                '-vcodec', 'libwebp',
                '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,fps=15",
                '-loop', '0',
                '-ss', '00:00:00',
                '-t', '00:00:06', 
                '-preset', 'default',
                '-an',
                '-vsync', '0',
                tmpOut
            ]
        } else {
            args = [
                '-y', '-i', tmpIn,
                '-vcodec', 'libwebp',
                '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
                '-q:v', '80',
                '-preset', 'default',
                tmpOut
            ]
        }

        let ffmpeg = spawn('ffmpeg', args)
        
        ffmpeg.on('close', async () => {
            try {
                if (!fs.existsSync(tmpOut)) {
                    return reject(new Error('FFmpeg gagal memproses media menjadi WebP.'))
                }

                let webpBuffer = fs.readFileSync(tmpOut)

                try {
                    const img = new Image()
                    await img.load(webpBuffer)
                    const json = { 
                        "sticker-pack-id": "https://github.com/YusTempest/Euphy-Bot", 
                        "sticker-pack-name": packname, 
                        "sticker-pack-publisher": author, 
                        "emojis": ["🌸", "🗿"] 
                    }
                    const exifAttr = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x54, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
                    const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
                    const exif = Buffer.concat([exifAttr, jsonBuffer])
                    exif.writeUIntLE(jsonBuffer.length, 14, 4)
                    img.exif = exif
                    webpBuffer = await img.save()
                } catch (e) {
                }

                if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn)
                if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut)

                resolve(webpBuffer)
            } catch (err) {
                reject(err)
            }
        })

        ffmpeg.on('error', (err) => {
            if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn)
            if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut)
            reject(err)
        })
    })
}

module.exports = {
    async sticker(img, url, packname, author) {
        let buffer = img
        if (!Buffer.isBuffer(buffer) && url) {
            let res = await fetch(url)
            buffer = Buffer.from(await res.arrayBuffer())
        }

        if (!Buffer.isBuffer(buffer)) {
            throw new Error("Media input bukan Buffer yang valid!")
        }
        let isVideo = buffer.slice(4, 8).toString('hex') === '66747970' || buffer.slice(0, 4).toString('hex') === '00000018'

        return await createSticker(buffer, isVideo, packname, author)
    }
}
