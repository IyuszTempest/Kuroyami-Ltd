const { readFileSync, statfsSync } = require('node:fs')
const { performance } = require('node:perf_hooks')
const os = require('node:os')
const https = require('node:https')

function cleanText(input) {
    if (!input || typeof input !== 'string') return 'UNKNOWN'

    let normalized = input.normalize('NFKD')
    normalized = normalized.replace(/[\u0300-\u036f]/g, '')

    let cleaned = ''

    for (let i = 0; i < normalized.length; i++) {
        const code = normalized.codePointAt(i)

        if (code > 0xFFFF) i++

        if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
            cleaned += String.fromCodePoint(code)
        }
    }

    return cleaned.trim().replace(/\s+/g, ' ') || 'UNKNOWN'
}

function escapeHtml(input) {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}

function readFileSafe(path) {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        return null
    }
}

function parseProcMap(raw) {
    const map = {}

    if (!raw) return map

    for (const line of raw.split('\n')) {
        const idx = line.indexOf(':')

        if (idx === -1) continue

        map[line.slice(0, idx).trim()] =
            line.slice(idx + 1).trim()
    }

    return map
}

function getMemInfo() {
    const map = parseProcMap(
        readFileSafe('/proc/meminfo')
    )

    const kb = key =>
        map[key]
            ? parseInt(map[key]) * 1024
            : null

    const total =
        kb('MemTotal') ??
        os.totalmem()

    const free =
        kb('MemFree') ??
        os.freemem()

    const available =
        kb('MemAvailable')

    const buffers =
        kb('Buffers') ?? 0

    const cached =
        kb('Cached') ?? 0

    const swapTotal =
        kb('SwapTotal') ?? 0

    const swapFree =
        kb('SwapFree') ?? 0

    const used =
        total -
        free -
        buffers -
        cached

    return {
        total,
        free,
        available,
        swapTotal,
        swapFree,
        swapUsed: swapTotal - swapFree,
        used: used > 0
            ? used
            : total - free,

        usedPercent:
            ((total - (available ?? free)) / total) * 100
    }
}

function getCpuInfo() {
    const cpus = os.cpus()

    const raw =
        readFileSafe('/proc/cpuinfo')

    const blocks =
        raw
            ? raw.split('\n\n').filter(Boolean)
            : []

    const first =
        blocks.length
            ? parseProcMap(blocks[0])
            : {}

    return {
        model: cleanText(
            cpus.length
                ? cpus[0].model.trim()
                : first['model name'] || 'Unknown CPU'
        ),

        cores:
            cpus.length ||
            parseInt(first['siblings'] || '0'),

        cacheSize:
            first['cache size'] || null,

        loadavg:
            os.loadavg()
    }
}

function getDiskInfo(path) {
    try {
        const stats =
            statfsSync(path)

        const total =
            stats.blocks * stats.bsize

        const free =
            stats.bfree * stats.bsize

        const available =
            stats.bavail * stats.bsize

        const used =
            total - available

        return {
            total,
            free,
            available,
            used,
            usedPercent:
                (used / total) * 100
        }
    } catch {
        return null
    }
}

function getCgroupLimits() {
    const v2mem =
        readFileSafe(
            '/sys/fs/cgroup/memory.max'
        )

    const v1mem =
        readFileSafe(
            '/sys/fs/cgroup/memory/memory.limit_in_bytes'
        )

    const v2cpu =
        readFileSafe(
            '/sys/fs/cgroup/cpu.max'
        )

    const v1cpuQuota =
        readFileSafe(
            '/sys/fs/cgroup/cpu/cpu.cfs_quota_us'
        )

    const v1cpuPeriod =
        readFileSafe(
            '/sys/fs/cgroup/cpu/cpu.cfs_period_us'
        )

    let memLimit = null

    if (
        v2mem &&
        v2mem.trim() !== 'max'
    ) {
        memLimit =
            parseInt(v2mem.trim())
    } else if (v1mem) {
        const val =
            parseInt(v1mem.trim())

        if (
            val <
            Number.MAX_SAFE_INTEGER / 2
        ) {
            memLimit = val
        }
    }

    let cpuLimit = null

    if (
        v2cpu &&
        !v2cpu.trim().startsWith('max')
    ) {
        const [
            quota,
            period
        ] =
            v2cpu
                .trim()
                .split(' ')
                .map(Number)

        if (
            quota > 0 &&
            period > 0
        ) {
            cpuLimit =
                quota / period
        }
    } else if (
        v1cpuQuota &&
        v1cpuPeriod
    ) {
        const quota =
            parseInt(v1cpuQuota.trim())

        const period =
            parseInt(v1cpuPeriod.trim())

        if (
            quota > 0 &&
            period > 0
        ) {
            cpuLimit =
                quota / period
        }
    }

    return {
        memLimit,
        cpuLimit,

        source:
            v2mem !== null
                ? 'cgroup v2'
                : (
                    v1mem !== null
                        ? 'cgroup v1'
                        : 'unavailable'
                )
    }
}

function getNetworkInfo() {
    const ifaces =
        os.networkInterfaces()

    const list = []

    for (
        const [name, addrs]
        of Object.entries(ifaces)
    ) {
        for (
            const addr
            of (addrs || [])
        ) {
            if (!addr.internal) {
                list.push({
                    name: cleanText(name),
                    address: addr.address,
                    family: addr.family
                })
            }
        }
    }

    return list
}

function timedGet(url) {
    return new Promise(resolve => {

        const start =
            performance.now()

        let bytes = 0

        const req =
            https.get(
                url,
                res => {

                    res.on(
                        'data',
                        chunk => {
                            bytes +=
                                chunk.length
                        }
                    )

                    res.on(
                        'end',
                        () => {

                            const seconds =
                                (
                                    performance.now() -
                                    start
                                ) / 1000

                            resolve({
                                bytes,
                                seconds,

                                mbps:
                                    seconds > 0
                                        ? (
                                            bytes * 8
                                        ) /
                                        (
                                            seconds *
                                            1000000
                                        )
                                        : 0
                            })
                        }
                    )

                    res.on(
                        'error',
                        () => resolve(null)
                    )
                }
            )

        req.on(
            'error',
            () => resolve(null)
        )

        req.setTimeout(
            15000,
            () => {
                req.destroy()
                resolve(null)
            }
        )
    })
}

function timedPost(url, sizeBytes) {
    return new Promise(resolve => {

        const payload =
            Buffer.alloc(
                sizeBytes,
                'a'
            )

        const start =
            performance.now()

        const parsed =
            new URL(url)

        const req =
            https.request(
                {
                    hostname:
                        parsed.hostname,

                    path:
                        parsed.pathname +
                        parsed.search,

                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/octet-stream',

                        'Content-Length':
                            payload.length
                    }
                },

                res => {

                    res.on(
                        'data',
                        () => {}
                    )

                    res.on(
                        'end',
                        () => {

                            const seconds =
                                (
                                    performance.now() -
                                    start
                                ) / 1000

                            resolve({
                                bytes:
                                    payload.length,

                                seconds,

                                mbps:
                                    seconds > 0
                                        ? (
                                            payload.length *
                                            8
                                        ) /
                                        (
                                            seconds *
                                            1000000
                                        )
                                        : 0
                            })
                        }
                    )

                    res.on(
                        'error',
                        () => resolve(null)
                    )
                }
            )

        req.on(
            'error',
            () => resolve(null)
        )

        req.setTimeout(
            15000,
            () => {
                req.destroy()
                resolve(null)
            }
        )

        req.write(payload)
        req.end()
    })
}

async function speedTest() {
    const download =
        await timedGet(
            'https://speed.cloudflare.com/__down?bytes=20000000'
        )

    const upload =
        await timedPost(
            'https://speed.cloudflare.com/__up',
            5000000
        )

    return {
        download,
        upload
    }
}

function formatBytes(bytes) {

    if (
        bytes == null ||
        isNaN(bytes)
    ) {
        return 'n/a'
    }

    const gb =
        bytes / (1024 ** 3)

    if (gb >= 1) {
        return gb.toFixed(1) + ' GB'
    }

    const mb =
        bytes / (1024 ** 2)

    return mb.toFixed(0) + ' MB'
}

function formatUptime(seconds) {

    const d =
        Math.floor(
            seconds / 86400
        )

    const h =
        Math.floor(
            (seconds % 86400) / 3600
        )

    const m =
        Math.floor(
            (seconds % 3600) / 60
        )

    return `${d}d ${h}h ${m}m`
}

async function collectAll() {

    const mem =
        getMemInfo()

    const cpu =
        getCpuInfo()

    const disk =
        getDiskInfo('/')

    const cgroup =
        getCgroupLimits()

    const net =
        getNetworkInfo()

    const speed =
        await speedTest()

    return {
        hostname:
            cleanText(os.hostname()),

        platform:
            cleanText(os.platform()),

        release:
            cleanText(os.release()),

        arch:
            cleanText(os.arch()),

        uptime:
            os.uptime(),

        mem,
        cpu,
        disk,
        cgroup,
        net,
        speed
    }
}

function getStatus(value) {
    if (value < 50) return 'GOOD'
    if (value < 80) return 'NORMAL'
    return 'HIGH'
}

function createHtmlPayload(data, latency) {

    const memPercent =
        Number(
            data.mem.usedPercent
        ).toFixed(1)

    const diskPercent =
        data.disk
            ? Number(
                data.disk.usedPercent
            ).toFixed(1)
            : 'n/a'

    const load =
        data.cpu.loadavg
            .map(v => v.toFixed(2))
            .join(' / ')

    const download =
        data.speed.download
            ? data.speed.download.mbps.toFixed(2)
            : 'n/a'

    const upload =
        data.speed.upload
            ? data.speed.upload.mbps.toFixed(2)
            : 'n/a'

    const networkRows =
        data.net.length
            ? data.net
                .slice(0, 4)
                .map(n => {

                    let maskedIp =
                        n.address

                    if (
                        n.family === 'IPv4' ||
                        n.family === 4
                    ) {
                        const parts =
                            n.address.split('.')

                        maskedIp =
                            parts.length === 4
                                ? `${parts[0]}.${parts[1]}.x.x`
                                : 'x.x.x.x'
                    }

                    if (
                        n.family === 'IPv6' ||
                        n.family === 6
                    ) {
                        const parts =
                            n.address.split(':')

                        maskedIp =
                            parts.length > 2
                                ? `${parts[0]}:${parts[1]}:xxxx::xxxx`
                                : 'xxxx::xxxx'
                    }

                    return `
                        <div class="row">
                            <span>${escapeHtml(n.name)}</span>
                            <strong>${escapeHtml(maskedIp)}</strong>
                        </div>
                    `
                })
                .join('')
            : `
                <div class="empty">
                    No external interface detected
                </div>
            `

    const cgroupText =
        data.cgroup.memLimit
            ? `${data.cgroup.source} · ${formatBytes(data.cgroup.memLimit)} RAM`
            : 'No official memory limit detected'

    return `
<style>

* {
    box-sizing: border-box;
    -webkit-tap-highlight-color: transparent;
}

body {
    margin: 0;
    padding: 12px;
    background: transparent;
    font-family: Arial, Helvetica, sans-serif;
    color: #000000;
}

.ping-wrap {
    width: 100%;
    max-width: 520px;
    margin: auto;
}

.ping-card {
    background: #ffffff;
    border: 4px solid #000000;
    border-radius: 24px;
    padding: 16px;
    box-shadow: 9px 9px 0 #000000;
}

/* HEADER */

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 15px;
}

.brand {
    display: inline-block;
    background: #000000;
    color: #ffffff;
    border: 3px solid #000000;
    padding: 7px 11px;
    font-size: 13px;
    font-weight: 1000;
    letter-spacing: 1px;
    box-shadow: 4px 4px 0 #888888;
}

.dots {
    display: flex;
    gap: 5px;
}

.dot {
    width: 11px;
    height: 11px;
    border: 2px solid #000000;
    background: #000000;
}

/* HERO */

.hero {
    background: #f4f4f4;
    border: 4px solid #000000;
    border-radius: 18px;
    padding: 17px;
    box-shadow: 6px 6px 0 #000000;
    margin-bottom: 18px;
}

.hero-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
}

.hero-label {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #555555;
}

.hero-title {
    margin-top: 5px;
    font-size: 24px;
    font-weight: 1000;
    word-break: break-word;
    color: #000000;
}

.latency {
    background: #000000;
    color: #ffffff;
    border: 3px solid #000000;
    padding: 7px 9px;
    font-family: monospace;
    font-size: 13px;
    font-weight: 900;
    box-shadow: 3px 3px 0 #888888;
    white-space: nowrap;
}

.subtitle {
    margin-top: 10px;
    font-family: monospace;
    font-size: 11px;
    color: #555555;
}

/* STATUS */

.status {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-bottom: 18px;
}

.stat {
    background: #ffffff;
    border: 3px solid #000000;
    border-radius: 14px;
    padding: 13px;
    box-shadow: 4px 4px 0 #000000;
}

.stat.orange {
    background: #e5e5e5;
}

.stat-label {
    font-size: 9px;
    font-family: monospace;
    font-weight: 900;
    color: #666666;
    letter-spacing: .5px;
}

.stat-value {
    margin-top: 5px;
    font-size: 21px;
    font-weight: 1000;
    color: #000000;
}

.stat-small {
    margin-top: 3px;
    font-size: 10px;
    font-family: monospace;
    color: #555555;
}

/* SECTION */

.section {
    background: #ffffff;
    border: 4px solid #000000;
    border-radius: 18px;
    padding: 15px;
    box-shadow: 6px 6px 0 #000000;
    margin-bottom: 18px;
}

.section.peach {
    background: #f4f4f4;
}

.section-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid #000000;
    padding-bottom: 10px;
    margin-bottom: 12px;
}

.section-title span:first-child {
    font-size: 16px;
    font-weight: 1000;
    color: #000000;
}

.badge {
    background: #000000;
    color: #ffffff;
    border: 2px solid #000000;
    padding: 4px 7px;
    font-family: monospace;
    font-size: 8px;
    font-weight: 900;
}

/* ROW */

.row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 7px 0;
    font-size: 11px;
    font-family: monospace;
    border-bottom: 1px dashed #cccccc;
}

.row:last-child {
    border-bottom: 0;
}

.row span {
    color: #555555;
}

.row strong {
    color: #000000;
    text-align: right;
    word-break: break-word;
}

/* PROGRESS */

.progress-wrap {
    margin-top: 12px;
}

.progress-info {
    display: flex;
    justify-content: space-between;
    font-family: monospace;
    font-size: 9px;
    font-weight: 900;
    margin-bottom: 5px;
    color: #000000;
}

.progress {
    width: 100%;
    height: 13px;
    background: #ffffff;
    border: 3px solid #000000;
    border-radius: 8px;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    width: ${Math.min(
        Math.max(
            Number(memPercent) || 0,
            0
        ),
        100
    )}%;
    background: #000000;
}

/* TWO COLUMN */

.grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
}

.mini {
    background: #ffffff;
    border: 3px solid #000000;
    border-radius: 14px;
    padding: 12px;
    box-shadow: 4px 4px 0 #000000;
}

.mini-label {
    font-family: monospace;
    font-size: 9px;
    font-weight: 900;
    color: #666666;
}

.mini-value {
    margin-top: 6px;
    font-size: 17px;
    font-weight: 1000;
    color: #000000;
}

.mini-sub {
    margin-top: 4px;
    font-size: 9px;
    color: #555555;
    font-family: monospace;
}

/* FOOTER */

.footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    font-family: monospace;
    font-size: 8px;
    font-weight: 900;
    color: #666666;
}

.footer-tag {
    background: #000000;
    color: #ffffff;
    padding: 5px 7px;
}

/* MOBILE */

@media (max-width: 380px) {

    .ping-card {
        padding: 12px;
        box-shadow: 7px 7px 0 #000000;
    }

    .hero-title {
        font-size: 20px;
    }

    .grid {
        grid-template-columns: 1fr;
    }

    .status {
        gap: 8px;
    }

    .stat-value {
        font-size: 18px;
    }
}

</style>

<div class="ping-wrap">

<div class="ping-card">

    <div class="header">

        <div class="brand">
            SYSTEM / PING
        </div>

        <div class="dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>

    </div>

    <!-- HERO -->

    <div class="hero">

        <div class="hero-top">

            <div>

                <div class="hero-label">
                    SERVER ONLINE
                </div>

                <div class="hero-title">
                    ${escapeHtml(data.hostname)}
                </div>

            </div>

            <div class="latency">
                ${escapeHtml(latency)} ms
            </div>

        </div>

        <div class="subtitle">
            ${escapeHtml(data.platform)}
            /
            ${escapeHtml(data.release)}
            /
            ${escapeHtml(data.arch)}
        </div>

    </div>

    <!-- QUICK STATUS -->

    <div class="status">

        <div class="stat">

            <div class="stat-label">
                CPU CORES
            </div>

            <div class="stat-value">
                ${escapeHtml(data.cpu.cores)}
            </div>

            <div class="stat-small">
                load ${escapeHtml(data.cpu.loadavg[0].toFixed(2))}
            </div>

        </div>

        <div class="stat orange">

            <div class="stat-label">
                MEMORY
            </div>

            <div class="stat-value">
                ${escapeHtml(formatBytes(data.mem.total))}
            </div>

            <div class="stat-small">
                ${escapeHtml(memPercent)}% used
            </div>

        </div>

        <div class="stat orange">

            <div class="stat-label">
                DOWNLOAD
            </div>

            <div class="stat-value">
                ${escapeHtml(download)}
            </div>

            <div class="stat-small">
                Mbps
            </div>

        </div>

        <div class="stat">

            <div class="stat-label">
                UPLOAD
            </div>

            <div class="stat-value">
                ${escapeHtml(upload)}
            </div>

            <div class="stat-small">
                Mbps
            </div>

        </div>

    </div>

    <!-- PROCESSOR -->

    <div class="section">

        <div class="section-title">

            <span>
                Processor
            </span>

            <span class="badge">
                CPU
            </span>

        </div>

        <div class="row">
            <span>Model</span>
            <strong>
                ${escapeHtml(
                    data.cpu.model.length > 42
                        ? data.cpu.model.slice(0, 42) + '...'
                        : data.cpu.model
                )}
            </strong>
        </div>

        <div class="row">
            <span>Cores / Threads</span>
            <strong>
                ${escapeHtml(data.cpu.cores)}
            </strong>
        </div>

        <div class="row">
            <span>Cache</span>
            <strong>
                ${escapeHtml(
                    data.cpu.cacheSize || 'n/a'
                )}
            </strong>
        </div>

        <div class="row">
            <span>Load Average</span>
            <strong>
                ${escapeHtml(load)}
            </strong>
        </div>

    </div>

    <!-- MEMORY -->

    <div class="section peach">

        <div class="section-title">

            <span>
                Memory
            </span>

            <span class="badge">
                RAM
            </span>

        </div>

        <div class="row">
            <span>Total</span>
            <strong>
                ${escapeHtml(
                    formatBytes(data.mem.total)
                )}
            </strong>
        </div>

        <div class="row">
            <span>Used</span>
            <strong>
                ${escapeHtml(
                    formatBytes(data.mem.used)
                )}
            </strong>
        </div>

        <div class="row">
            <span>Available</span>
            <strong>
                ${escapeHtml(
                    formatBytes(
                        data.mem.available ??
                        data.mem.free
                    )
                )}
            </strong>
        </div>

        <div class="row">
            <span>Swap</span>
            <strong>
                ${escapeHtml(
                    formatBytes(data.mem.swapUsed)
                )}
                /
                ${escapeHtml(
                    formatBytes(data.mem.swapTotal)
                )}
            </strong>
        </div>

        <div class="progress-wrap">

            <div class="progress-info">
                <span>MEMORY USAGE</span>
                <span>${escapeHtml(memPercent)}%</span>
            </div>

            <div class="progress">

                <div
                    class="progress-bar"
                ></div>

            </div>

        </div>

    </div>

    <!-- DISK + SPEED -->

    <div class="grid">

        <div class="mini">

            <div class="mini-label">
                DISK
            </div>

            <div class="mini-value">
                ${escapeHtml(
                    data.disk
                        ? formatBytes(data.disk.total)
                        : 'n/a'
                )}
            </div>

            <div class="mini-sub">
                ${escapeHtml(
                    data.disk
                        ? diskPercent + '% used'
                        : 'unavailable'
                )}
            </div>

        </div>

        <div class="mini">

            <div class="mini-label">
                UPTIME
            </div>

            <div class="mini-value">
                ${escapeHtml(
                    formatUptime(data.uptime)
                )}
            </div>

            <div class="mini-sub">
                system runtime
            </div>

        </div>

        <div class="mini">

            <div class="mini-label">
                DOWNLOAD
            </div>

            <div class="mini-value">
                ${escapeHtml(download)}
                Mbps
            </div>

            <div class="mini-sub">
                Cloudflare test
            </div>

        </div>

        <div class="mini">

            <div class="mini-label">
                UPLOAD
            </div>

            <div class="mini-value">
                ${escapeHtml(upload)}
                Mbps
            </div>

            <div class="mini-sub">
                Cloudflare test
            </div>

        </div>

    </div>

    <br>

    <!-- NETWORK -->

    <div class="section">

        <div class="section-title">

            <span>
                Network
            </span>

            <span class="badge">
                INTERFACES
            </span>

        </div>

        ${networkRows}

    </div>

    <!-- ENVIRONMENT -->

    <div class="section peach">

        <div class="section-title">

            <span>
                Environment
            </span>

            <span class="badge">
                CGROUP
            </span>

        </div>

        <div class="row">
            <span>Platform</span>
            <strong>
                ${escapeHtml(data.platform)}
            </strong>
        </div>

        <div class="row">
            <span>Architecture</span>
            <strong>
                ${escapeHtml(data.arch)}
            </strong>
        </div>

        <div class="row">
            <span>Container</span>
            <strong>
                ${escapeHtml(cgroupText)}
            </strong>
        </div>

        <div class="row">
            <span>CPU Limit</span>
            <strong>
                ${escapeHtml(
                    data.cgroup.cpuLimit
                        ? data.cgroup.cpuLimit.toFixed(2) + ' CPU'
                        : 'n/a'
                )}
            </strong>
        </div>

    </div>

    <!-- FOOTER -->

    <div class="footer">

        <span class="footer-tag">
            NEO SYSTEM PROBE
        </span>

        <span>
            ${escapeHtml(
                new Date()
                    .toISOString()
                    .slice(0, 19)
                    .replace('T', ' ')
            )}
        </span>

    </div>

</div>

</div>
`
}

module.exports = {

    command: [
        'ping',
        'sysinfo',
        'systeminfo'
    ],

    category: 'main',

    noPrefix: true,

    register: true,

    call: async (conn, m) => {

        const start =
            performance.now()

        try {
            await conn.sendMessage(
                m.chat,
                {
                    react: {
                        text: '⏳',
                        key: m.key
                    }
                }
            )
        } catch {}

        try {

            /*
             * Kumpulkan system information
             */
            const data =
                await collectAll()

            /*
             * Hitung latency keseluruhan
             */
            const latency =
                (
                    performance.now() -
                    start
                ).toFixed(0)

            /*
             * Generate HTML secara dinamis
             */
            const htmlPayload =
                createHtmlPayload(
                    data,
                    latency
                )

            /*
             * Kirim sebagai WhatsApp HTML rich response
             */
            await conn.relayMessage(
                m.chat,
                {

                    messageContextInfo: {

                        deviceListMetadata: {},

                        deviceListMetadataVersion: 2,

                        botMetadata: {

                            messageDisclaimerText: "",

                            botResponseId:
                                "4db57b2c-8393-484d-8b9a-8e6d1a14b349",

                            verificationMetadata: {

                                proofs: [
                                    {
                                        version: 1,
                                        useCase: 1,

                                        signature:
                                            "TklYRUwuTWVzc2FnZUJ1aWxkZXJWNC43LVZlcmlmaWNhdGlvblNpZ25hdHVyZS5NZXRhZGF0YeN55YRyad2+ZA==",

                                        certificateChain: [
                                            "TklYRUwuTWVzc2FnZUJ1aWxkZXJWNC43LUNlcnRpZmljYXRlQ2hhaW4uTWV0YWRhdGEOvtJr968bbpKdZreOTwkk9aPN++XPE60RfuzNLkXXc7LE8BOkJOWRpo2oNXaRJ3uCNJ43HY3A+oetnvHSfcxWqmvvTSrBOI5V1NOD6RMsZ/st1XVPUx83AGps1l5jYBOYzqMNy6un2tToJ2Bt9bXRo29tWLZTu8m7TNY/hISwVpVc5tjSet5U7btPN+dMIx2UvykB1jcbWGsdklheeuz8RXSStNXzeaGvsf1lpZ/ugLE4b2BdmlRNKrY6zLE4qFtRYQoS7axOyQX+4QUyN2m9bfm7urQmn+QRSXJwMO7X5kAJJLbkVGJFt9Pm9VXPwQVrK2aaqiXlpusj+7DfDw00OULmYMmZDTqXM0nUVLxj13z0LhMQoQhhNG8utdUn4uKOFceliTZ/xiP+A54GnX9620641bqw3ctfh9NNXPsTEK8hAUD7FDqUhVntHmoEYYEHq8X1tHHZYP49/f2iezTiE8AUaoZo42/jIWQIKohOGNUib2hEqMkW8NsR8vPihvNuqPc0zKZcl6359YFQdjiiW8kCRD/rsDOr9v1eYLFZKYloFyzFqEgj+jcG/V47elOjShJ5CCPwatXwP6HIloVwtgygFsnOFmCg6Ojoivfoz8Nw1qxFwg5OU2cq/1WbWNELKnaFg4eUWCAIJ/3ZIJsEPkgemZxGhE+hdiNn9dkQYBJs1kx2BxdIkJmQ9vJSKkrMz6lTxZM3IJ9mhmKS6zYdU1ppeAao0/ayte997DQParb/AHLN79g0iW1ad0z8ir5jAl0q3a+UZPTSa4YiSqC2PZ/gfxG5wvL2mKmeKowG0RXjmEp5iNxrni+T/HRLZOoH7y0DQ24nMCPg"
                                        ]
                                    }
                                ]

                            }

                        }

                    },

                    botForwardedMessage: {

                        message: {

                            richResponseMessage: {

                                messageType: 1,

                                submessages: [
                                    {
                                        messageType: 2,
                                        messageText:
                                            `System Ping — ${latency}ms`
                                    }
                                ],

                                unifiedResponse: {

                                    data:
                                        Buffer
                                            .from(
                                                JSON.stringify({

                                                    response_id:
                                                        "4db57b2c-8393-484d-8b9a-8e6d1a14b349",

                                                    sections: [

                                                        {
                                                            view_model: {

                                                                primitive: {

                                                                    __typename:
                                                                        "GenAIaeacdsnwHtmlPrimitive",

                                                                    payload:
                                                                        htmlPayload,

                                                                    trusted_sources: [
                                                                        "hirara.dev"
                                                                    ]

                                                                },

                                                                __typename:
                                                                    "GenAISingleLayoutViewModel"

                                                            }

                                                        }

                                                    ]

                                                })
                                            )
                                            .toString('base64')

                                },

                                contextInfo: {

                                    forwardingScore: 1,

                                    isForwarded: true,

                                    forwardedAiBotMessageInfo: {

                                        botJid:
                                            "867051314767696@bot"

                                    },

                                    forwardOrigin: 4

                                }

                            }

                        }

                    }

                },

                {}
            )

            try {
                await conn.sendMessage(
                    m.chat,
                    {
                        react: {
                            text: '✅',
                            key: m.key
                        }
                    }
                )
            } catch {}

        } catch (e) {

            console.error(
                '[PING] Gagal:',
                e
            )

            global.reportError?.(
                e,
                'plugin:ping'
            )

            try {
                await conn.sendMessage(
                    m.chat,
                    {
                        react: {
                            text: '❌',
                            key: m.key
                        }
                    }
                )
            } catch {}

            await m.reply(
                `⚠️ Gagal membuat system ping.\n${e.message || e}`
            )
        }
    }
}
