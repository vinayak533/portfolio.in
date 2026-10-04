import sharp from 'sharp'
import { buildMoonTexture } from './moon-texture.mjs'
const m = buildMoonTexture(768)
const enc = (c) => { c = Math.max(0, c); return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055 }
const sh = (v, k = 0.65) => v <= k ? v : k + (1 - k) * (1 - Math.exp(-(v - k) / (1 - k)))
const buf = Buffer.alloc(m.size * m.size * 3)
const half = m.size / 2, R = m.size * m.disk
for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) {
  const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / R
  const a = Math.min(1, Math.max(0, (1 - r) * R + 0.5))
  for (let c = 0; c < 3; c++) { const i = (y * m.size + x) * 3 + c; const sky = [0.004, 0.006, 0.012][c]; buf[i] = Math.round(enc(sh(m.data[i] * 1.05 * [0.95, 0.97, 1][c]) * a + sky * (1 - a)) * 255) }
}
await sharp(buf, { raw: { width: m.size, height: m.size, channels: 3 } }).png().toFile(process.argv[2] + '/moon-prev.png')
await sharp(buf, { raw: { width: m.size, height: m.size, channels: 3 } }).resize(220).png().toFile(process.argv[2] + '/moon-small.png')
