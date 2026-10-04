/**
 * One-time portrait preprocess.
 *
 *   npm run portrait                 (reads public/about.jpg)
 *   npm run portrait -- path/to.jpg  (any jpg/png/webp)
 *
 * Output (the source file is never modified):
 *   public/portrait/about.cutout.png   RGBA, background removed, light contrast, tight crop
 *   public/portrait/about.cutout.webp  same, smaller, used by the static / reduced-motion fallback
 *
 * Background removal is a deterministic colour-key flood fill tuned for studio
 * portraits (plain light or dark backdrop). It needs no ML model, so there is no
 * extra licence to track. For a busy background, cut the photo out with any tool
 * you like and save it as public/portrait/about.cutout.png; nothing else changes.
 */
import sharp from 'sharp'
import { mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const input = resolve(process.argv[2] ?? 'public/about.jpg')
const outDir = resolve('public/portrait')
if (!existsSync(input)) {
  console.error(`[portrait] not found: ${input}`)
  process.exit(1)
}
mkdirSync(outDir, { recursive: true })

const MAX_SIDE = 1100

const { data, info } = await sharp(input)
  .rotate()
  .flatten({ background: '#ffffff' })
  .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const W = info.width
const H = info.height
const N = W * H
const px = (i) => [data[i * 3] / 255, data[i * 3 + 1] / 255, data[i * 3 + 2] / 255]
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// 1. Estimate the backdrop colour from the image border band (ignores pure white letterboxing).
let br = 0, bgc = 0, bb = 0, bn = 0
const band = Math.round(Math.min(W, H) * 0.12)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (x > band && x < W - band && y > band) continue // top + sides only: the bottom is usually clothing
    const [r, g, b] = px(y * W + x)
    const L = lum(r, g, b)
    if (L > 0.985 || L < 0.35) continue
    br += r; bgc += g; bb += b; bn++
  }
}
const bg = bn ? [br / bn, bgc / bn, bb / bn] : [0.9, 0.9, 0.92]
const bgL = lum(...bg)
console.log(`[portrait] ${W}x${H}, backdrop ≈ rgb(${bg.map((v) => Math.round(v * 255)).join(',')})`)

const dist = (r, g, b) => Math.hypot(r - bg[0], g - bg[1], b - bg[2])
const isBackdrop = (i) => {
  const [r, g, b] = px(i)
  const L = lum(r, g, b)
  const sat = Math.max(r, g, b) - Math.min(r, g, b)
  if (L > 0.97 && sat < 0.05) return true // letterbox / outside a circular crop
  return dist(r, g, b) < 0.11 && sat < 0.12 && Math.abs(L - bgL) < 0.14
}

// 2. Flood fill from every border pixel through backdrop-like pixels (4-connected).
const flooded = new Uint8Array(N)
const stack = new Int32Array(N)
let sp = 0
const seed = (i) => {
  if (!flooded[i] && isBackdrop(i)) { flooded[i] = 1; stack[sp++] = i }
}
for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x) }
for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1) }
while (sp > 0) {
  const i = stack[--sp]
  const x = i % W
  const y = (i / W) | 0
  if (x > 0) seed(i - 1)
  if (x < W - 1) seed(i + 1)
  if (y > 0) seed(i - W)
  if (y < H - 1) seed(i + W)
}

// 3. Soft matte: full alpha inside, colour-distance alpha in a thin band around the
//    subject edge (keeps curly hair fringe semi-transparent instead of jagged).
const alpha = new Float32Array(N)
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t) }
for (let i = 0; i < N; i++) alpha[i] = flooded[i] ? 0 : 1
const R = 3
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x
    let near = false
    for (let dy = -R; dy <= R && !near; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= H) continue
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= W) continue
        if (flooded[yy * W + xx] !== flooded[i]) { near = true; break }
      }
    }
    if (!near) continue
    const [r, g, b] = px(i)
    const soft = smooth(0.05, 0.3, dist(r, g, b))
    alpha[i] = flooded[i] ? soft * 0.85 : Math.max(soft, 0.35)
  }
}

// 4. Despill the backdrop out of semi-transparent edge pixels, write RGBA.
const out = Buffer.alloc(N * 4)
let minX = W, minY = H, maxX = 0, maxY = 0
for (let i = 0; i < N; i++) {
  const a = alpha[i]
  let [r, g, b] = px(i)
  if (a > 0.02 && a < 0.999) {
    r = (r - bg[0] * (1 - a)) / a
    g = (g - bg[1] * (1 - a)) / a
    b = (b - bg[2] * (1 - a)) / a
  }
  out[i * 4] = Math.round(Math.min(1, Math.max(0, r)) * 255)
  out[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255)
  out[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255)
  out[i * 4 + 3] = Math.round(a * 255)
  if (a > 0.06) {
    const x = i % W, y = (i / W) | 0
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
}

const pad = Math.round(Math.max(W, H) * 0.02)
const left = Math.max(0, minX - pad)
const top = Math.max(0, minY - pad)
const width = Math.min(W, maxX + pad) - left
const height = Math.min(H, maxY + pad) - top

// 5. Gentle contrast + clarity on colour only (alpha passes through untouched).
const cut = sharp(out, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left, top, width, height })
  .linear([1.08, 1.08, 1.08, 1], [-8, -8, -8, 0])
  .modulate({ saturation: 1.04 })
  .sharpen({ sigma: 0.6 })

await cut.clone().png({ compressionLevel: 9 }).toFile(resolve(outDir, 'about.cutout.png'))
await cut.clone().webp({ quality: 90, alphaQuality: 90 }).toFile(resolve(outDir, 'about.cutout.webp'))
console.log(`[portrait] wrote public/portrait/about.cutout.{png,webp} (${width}x${height})`)
