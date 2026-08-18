// Génère les icônes PWA (PNG) sans dépendance : cœur dégradé or→rose sur fond #110F0E.
// Lancé automatiquement avant le build (npm run prebuild). Sortie : public/icon-*.png, apple-touch-icon.png
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BG = [0x11, 0x0f, 0x0e]
const C1 = [0xe8, 0xc9, 0xa0], C2 = [0xd4, 0xa5, 0x74], C3 = [0xc2, 0x78, 0x8e]
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const grad = (t) => (t < 0.55 ? lerp(C1, C2, t / 0.55) : lerp(C2, C3, (t - 0.55) / 0.45))

// Cœur implicite (x² + y² − 1)³ − x²·y³ ≤ 0, dans la boîte x∈[-1.15,1.15], y∈[-1.05,1.25]
const inHeart = (x, y) => { const q = x * x + y * y - 1; return q * q * q - x * x * y * y * y <= 0 }
const BOX = { x0: -1.15, x1: 1.15, y0: -1.05, y1: 1.25 }
const W = BOX.x1 - BOX.x0, H = BOX.y1 - BOX.y0, CY = (BOX.y0 + BOX.y1) / 2

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(size, pixels /* RGBA */) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function render(size, padRatio, { rounded }) {
  const px = Buffer.alloc(size * size * 4)
  const pad = size * padRatio, scale = (size - 2 * pad) / Math.max(W, H)
  const cx = size / 2, cy = size / 2 - CY * scale
  const r = size * 0.22, SS = 3 // supersampling
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cover = 0, alpha = 0
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS
      // coin arrondi
      let inRect = true
      if (rounded) {
        const dx = Math.max(r - fx, 0, fx - (size - r)), dy = Math.max(r - fy, 0, fy - (size - r))
        inRect = dx * dx + dy * dy <= r * r
      }
      if (!inRect) continue
      alpha++
      if (inHeart((fx - cx) / scale, -(fy - cy) / scale)) cover++
    }
    const a = alpha / (SS * SS), h = cover / (SS * SS)
    const g = grad((x + y) / (2 * size))
    const o = (y * size + x) * 4
    for (let i = 0; i < 3; i++) px[o + i] = Math.round(BG[i] * (1 - h) + g[i] * h)
    px[o + 3] = Math.round(255 * a)
  }
  return png(size, px)
}

mkdirSync('public', { recursive: true })
writeFileSync('public/icon-512.png', render(512, 0.17, { rounded: true }))
writeFileSync('public/icon-192.png', render(192, 0.17, { rounded: true }))
writeFileSync('public/apple-touch-icon.png', render(180, 0.17, { rounded: false }))
writeFileSync('public/icon-maskable-512.png', render(512, 0.28, { rounded: false }))
console.log('icons générées dans public/')
