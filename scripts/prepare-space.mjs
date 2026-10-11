/**
 * Builds the hero's deep-space backdrop from a reference image.
 *
 *   npm run space                         (reads scripts/source/space-reference.jpg)
 *   npm run space -- path/to/image.jpg
 *
 * The reference is a small (phone-wallpaper sized) photo, so it is split in two:
 *
 *   public/hero/space-nebula.webp   the gas and dust alone: every star taken out
 *                                   (median background), softened. Upscaling a
 *                                   soft wash costs nothing visible.
 *   src/hero/robot/stars.json       every star found in the photo: position (source
 *                                   px), size, brightness, colour, and whether it
 *                                   carries diffraction spikes. src/hero/robot/space.ts
 *                                   redraws them crisp at the screen's own resolution,
 *                                   so the field stays sharp on any display.
 */
import sharp from 'sharp'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const input = resolve(process.argv[2] ?? 'scripts/source/space-reference.jpg')
if (!existsSync(input)) {
  console.error(`[space] not found: ${input}`)
  process.exit(1)
}

const src = sharp(input).removeAlpha().toColourspace('srgb')
const { width: W, height: H } = await src.metadata()

// Background: a wide median wipes out stars (and their spikes) but keeps the nebula's structure.
const fine = await src.clone().median(11).blur(1.4).raw().toBuffer()
const orig = await src.clone().raw().toBuffer()
// The few big bright cores outlive that median: where a much wider one is clearly darker,
// that compact spot is a star, so the wide median fills it (feathered).
const wide = await src.clone().median(31).blur(2).raw().toBuffer()
const L = (b, i) => 0.2126 * b[i * 3] + 0.7152 * b[i * 3 + 1] + 0.0722 * b[i * 3 + 2]
const spot = Buffer.alloc(W * H)
for (let i = 0; i < W * H; i++) {
  const d = L(fine, i) - L(wide, i)
  spot[i] = Math.round(255 * Math.min(1, Math.max(0, (d - 8) / 18)))
}
const mask = await sharp(spot, { raw: { width: W, height: H, channels: 1 } }).dilate(4).blur(3).toColourspace('b-w').raw().toBuffer()
const bg = Buffer.alloc(W * H * 3)
for (let i = 0; i < W * H; i++) {
  const k = mask[i] / 255
  for (let c = 0; c < 3; c++) bg[i * 3 + c] = Math.round(fine[i * 3 + c] * (1 - k) + wide[i * 3 + c] * k)
}

await sharp(bg, { raw: { width: W, height: H, channels: 3 } })
  .webp({ quality: 84, smartSubsample: true })
  .toFile(resolve('public/hero/space-nebula.webp'))

// Residual (stars only) as luminance.
const lum = new Float32Array(W * H)
for (let i = 0; i < W * H; i++) {
  const r = Math.max(0, orig[i * 3] - bg[i * 3])
  const g = Math.max(0, orig[i * 3 + 1] - bg[i * 3 + 1])
  const b = Math.max(0, orig[i * 3 + 2] - bg[i * 3 + 2])
  lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const THRESHOLD = 22
const stars = []
for (let y = 2; y < H - 2; y++) {
  for (let x = 2; x < W - 2; x++) {
    const v = lum[y * W + x]
    if (v < THRESHOLD) continue
    // A local maximum over 5x5 (ties broken by scan order, so a flat top counts once).
    let peak = true
    for (let dy = -2; dy <= 2 && peak; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue
        const n = lum[(y + dy) * W + x + dx]
        if (n > v || (n === v && (dy < 0 || (dy === 0 && dx < 0)))) {
          peak = false
          break
        }
      }
    }
    if (!peak) continue
    // Flux over 7x7 and the light-weighted centre and colour.
    let flux = 0
    let cx = 0
    let cy = 0
    let cr = 0
    let cg = 0
    let cb = 0
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
        const j = yy * W + xx
        const w = lum[j]
        flux += w
        cx += w * xx
        cy += w * yy
        cr += w * orig[j * 3]
        cg += w * orig[j * 3 + 1]
        cb += w * orig[j * 3 + 2]
      }
    }
    if (flux <= 0) continue
    // Gaussian-equivalent radius from flux / peak.
    const sigma = Math.sqrt(flux / (2 * Math.PI * v))
    // Colour: normalised so the brightest channel is 255 (brightness is carried separately).
    const m = Math.max(cr, cg, cb) || 1
    const hex = [cr, cg, cb].map((c) => Math.round((c / m) * 255).toString(16).padStart(2, '0')).join('')
    stars.push({ x: cx / flux + 0.5, y: cy / flux + 0.5, sigma, peak: Math.min(1, v / 255), flux, hex })
  }
}

// Diffraction spikes: the reference's few sparkle stars, picked by eye (source px, ray length);
// each snaps to the detected star nearest it. Redrawn as four long diagonal rays and four short
// ones on the axes, as photographed.
const SPARKLES = [
  [630, 265, 28],
  [503, 183, 16],
  [365, 650, 22],
  [497, 830, 12],
  [625, 1238, 11],
  [240, 1135, 10],
]
const spiked = new Map()
for (const [x, y, len] of SPARKLES) {
  let best = null
  let bestD = 64
  for (const s of stars) {
    const d = (s.x - x) ** 2 + (s.y - y) ** 2
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  if (best) spiked.set(best, len)
}

const short = (hex) => [0, 2, 4].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) / 17).toString(16)).join('')

const out = {
  w: W,
  h: H,
  // [x, y, radius (px, source), brightness 0..1, colour (3-digit hex), spike length (px, source; 0 = none)]
  // Whole pixels and 4-bit colour: below anything visible at the sizes the field is drawn, and half the bytes.
  stars: stars.map((s) => [Math.round(s.x), Math.round(s.y), +Math.min(4, Math.max(0.35, s.sigma)).toFixed(1), +s.peak.toFixed(2), short(s.hex), spiked.get(s) ?? 0]),
}
writeFileSync(resolve('src/hero/robot/stars.json'), JSON.stringify(out))
console.log(`[space] ${W}x${H}: nebula -> public/hero/space-nebula.webp, ${stars.length} stars (${spiked.size} spiked) -> src/hero/robot/stars.json`)
console.log('[space] spiked:', [...spiked.keys()].map((s) => `${s.x.toFixed(0)},${s.y.toFixed(0)}`).join('  '))
