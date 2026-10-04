/**
 * Builds the moon's surface maps for the hero shader.
 *
 *   node scripts/prepare-moon.mjs              2048 x 1024 maps (default)
 *   node scripts/prepare-moon.mjs --size 4096  4096 x 2048 maps
 *
 * The shader renders the moon as a lit sphere, so it needs two seamless
 * equirectangular maps (longitude -180..180 left to right, centred on 0, the
 * near side; latitude +90 at the top):
 *
 *   src/assets/moon/albedo.png   sRGB colour (PNG: lossless, no JPEG blocks)
 *   src/assets/moon/normal.png   tangent-space normals from the elevation, half size
 *                                (x east, y north, z up; 8-bit, 0.5 = flat)
 *   src/assets/moon/reference.png  the near side as seen from Earth, flat-lit
 *                                and ungraded, for the ?debug split view
 *   src/assets/moon/meta.json    source, size, mean near-side albedo
 *
 * Source: NASA SVS CGI Moon Kit (https://svs.gsfc.nasa.gov/4720, public
 * domain, credit "NASA's Scientific Visualization Studio"). Put the files in
 * scripts/source/moon/:
 *
 *   lroc_color_poles_4k.tif  (or _8k / _2k / the full-size tif)  LROC WAC colour
 *   ldem_16_uint.tif         (or ldem_16.tif / ldem_4_uint.tif / ldem_4.tif / ldem_64*)  LOLA elevation
 *
 * Without them this script builds a procedural stand-in from real
 * selenography (maria, ray craters) so the hero still has a moon; rerun it
 * once the NASA files are in place.
 *
 * Why 2048 by default: the moon covers at most ~120 css px (~240 device px at
 * DPR 2) on screen, and only the near half of the map is ever visible, so a
 * 2048 map is already ~4x oversampled. The 4K / 8K sources are downsampled
 * with a Lanczos filter (supersampled, so no aliasing); a bigger texture would
 * only cost VRAM and decode time.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { fbm3, MARIA, RAYED, sel } from './moon-texture.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const at = (...p) => join(root, ...p)
export const MOON_DIR = at('src/assets/moon')
const SOURCE_DIR = at('scripts/source/moon')
const MOON_RADIUS_M = 1737400
/** Slope exaggeration baked into normal.png (8-bit precision for gentle lunar slopes); the shader's `relief` scales on top. */
const BAKED_RELIEF = 3

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lin = (v) => {
  v /= 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const enc = (c) => {
  c = Math.min(1, Math.max(0, c))
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)
}
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// ------------------------------------------------------------ shared shading (mirrors scene.frag)

/** Blackbody colour (Tanner Helland's fit), linear RGB at luminance 1. Mirrored in engine.ts. */
export function kelvinRGB(k) {
  const t = k / 100
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const c = [r, g, b].map((v) => lin(Math.min(255, Math.max(0, v))))
  const l = luma(...c)
  return c.map((v) => v / l)
}

/** The moon's light colour at luminance 1: blackbody, pulled toward the scene's highlight hue, times the tint. */
export function moonColor(m) {
  const k = kelvinRGB(m.kelvin)
  const h = m.sceneHighlight
  const hl = luma(...h) || 1
  const c = k.map((v, i) => (v + (h[i] / hl - v) * m.sceneMatch) * m.tint[i])
  const l = luma(...c) || 1
  return c.map((v) => v / l)
}

/** Soft clamp at 0 with a quadratic knee of half-width t: the soft terminator. */
const softPos = (x, t) => (x >= t ? x : x <= -t ? 0 : ((x + t) * (x + t)) / (4 * t))

/** Rolls display values off toward `ceil` above `knee`, so the brightest rays never clip. */
export const rolloff = (v, knee = 0.72, ceil = 0.97) => (v <= knee ? v : knee + (ceil - knee) * (1 - Math.exp(-(v - knee) / (ceil - knee))))

/** Reads the maps written by this script (linear albedo, unit normals). */
export async function loadMoonMaps() {
  const a = await sharp(join(MOON_DIR, 'albedo.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const n = await sharp(join(MOON_DIR, 'normal.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const meta = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(join(MOON_DIR, 'meta.json'), 'utf8')))
  const w = a.info.width
  const h = a.info.height
  const albedo = new Float32Array(w * h * 3)
  const normal = new Float32Array(w * h * 3)
  for (let i = 0; i < w * h * 3; i++) {
    albedo[i] = lin(a.data[i])
    normal[i] = n.data[i] / 127.5 - 1
  }
  return { w, h, albedo, normal, meta }
}

/** Bilinear equirect sample (wraps in longitude). */
function sampleEq(buf, w, h, u, v, out) {
  const x = u * w - 0.5
  const y = Math.min(h - 1, Math.max(0, v * h - 0.5))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const y1 = Math.min(h - 1, y0 + 1)
  const xa = ((x0 % w) + w) % w
  const xb = (xa + 1) % w
  for (let c = 0; c < 3; c++) {
    const p = (yy, xx) => buf[(yy * w + xx) * 3 + c]
    out[c] = (p(y0, xa) * (1 - fx) + p(y0, xb) * fx) * (1 - fy) + (p(y1, xa) * (1 - fx) + p(y1, xb) * fx) * fy
  }
  return out
}

/**
 * The lit moon, CPU twin of scene.frag's moon(): `qx, qy` are disk coords
 * (x right, y UP, |q| <= 1). Returns display-linear RGB (the value the tone
 * shoulder should land on), before the halo.
 */
export function makeMoonShader(maps, m) {
  const col = moonColor(m)
  const rot = (m.rotation * Math.PI) / 180
  const cr = Math.cos(rot)
  const sr = Math.sin(rot)
  const th = (m.lightAngle * Math.PI) / 180
  const ph = (m.phase * Math.PI) / 180
  const L = [Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th), Math.cos(ph)]
  const LL = 1 - m.limbDarkening
  const T = Math.max(1e-3, m.terminator)
  const inv = 1 / maps.meta.meanAlbedo
  const sat = m.mapSaturation
  const a = [0, 0, 0]
  const t = [0, 0, 0]
  return (qx, qy) => {
    const nz = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy))
    // Screen -> selenographic: the face turned clockwise by `rotation`.
    const sx = cr * qx - sr * qy
    const sy = sr * qx + cr * qy
    const lon = Math.atan2(sx, nz)
    const lat = Math.asin(Math.max(-1, Math.min(1, sy)))
    const u = lon / (2 * Math.PI) + 0.5
    const v = 0.5 - lat / Math.PI
    sampleEq(maps.albedo, maps.w, maps.h, u, v, a)
    sampleEq(maps.normal, maps.w, maps.h, u, v, t)
    // Tangent frame at the point (selenographic), bumped normal, back to the screen frame.
    const el = Math.hypot(nz, sx) || 1
    const east = [nz / el, 0, -sx / el]
    // north = s x east
    const north = [sy * east[2] - nz * east[1], nz * east[0] - sx * east[2], sx * east[1] - sy * east[0]]
    const tx = t[0] * m.relief
    const ty = t[1] * m.relief
    let bx = east[0] * tx + north[0] * ty + sx * t[2]
    let by = east[1] * tx + north[1] * ty + sy * t[2]
    let bz = east[2] * tx + north[2] * ty + nz * t[2]
    const bl = Math.hypot(bx, by, bz) || 1
    bx /= bl
    by /= bl
    bz /= bl
    const vx = cr * bx + sr * by
    const vy = -sr * bx + cr * by
    const mu0 = softPos(vx * L[0] + vy * L[1] + bz * L[2], T)
    const mu0g = qx * L[0] + qy * L[1] + nz * L[2]
    const mu = Math.max(0.02, nz)
    const refl = (1 - LL) * mu0 + (LL * 2 * mu0) / (mu0 + mu + 1e-4)
    const night = 1 - smooth(-T, 2 * T, mu0g)
    const al = luma(...a)
    const out = [0, 0, 0]
    for (let c = 0; c < 3; c++) {
      // The map's own colour, mostly folded into the moonlight's.
      const alb = (al + (a[c] - al) * sat) * inv
      out[c] = alb * (refl + m.earthshine * night) * col[c] * m.brightness
    }
    const lo = luma(...out)
    const k = lo > 0 ? rolloff(lo) / lo : 1
    return [out[0] * k, out[1] * k, out[2] * k]
  }
}

// ------------------------------------------------------------ procedural stand-in

function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Craters per scale: [3D cell size, probability per cell, min angular radius, max]. Each crater's reach (3.2 radii) fits in its cell. */
const CRATER_SCALES = [
  [0.25, 0.37, 0.03, 0.075],
  [0.1, 0.5, 0.011, 0.03],
  [0.036, 0.43, 0.0035, 0.011],
  [0.012, 0.1, 0.0016, 0.0035],
]

function mareField(nx, ny, nz) {
  let keep = 1
  let f = 0
  let ma = 0
  for (const M of MARIA) {
    const d = Math.hypot(nx - M.c[0], ny - M.c[1], nz - M.c[2]) / (M.r * 1.08)
    if (d > 2.6) continue
    const w = Math.exp(-d * d * 1.1)
    keep *= 1 - w
    f += w
    ma += M.alb * w
  }
  return { f: 1 - keep, alb: f > 0 ? ma / f : 0.45 }
}
const shoreNoise = (nx, ny, nz) =>
  (fbm3(nx * 3.5 + 3.1, ny * 3.5, nz * 3.5, 3) - 0.5) * 0.3 + (fbm3(nx * 13, ny * 13 + 2.2, nz * 13, 3) - 0.5) * 0.24 + (fbm3(nx * 40, ny * 40, nz * 40 + 1.7, 2) - 0.5) * 0.1
const mareCover = (nx, ny, nz, f) => smooth(0.5, 0.7, f + shoreNoise(nx, ny, nz))

function proceduralMaps(W, H) {
  const albedo = new Float32Array(W * H * 3)
  const height = new Float32Array(W * H)
  const mareCache = new Map()
  const mareAtCentre = (key, c) => {
    let v = mareCache.get(key)
    if (v === undefined) {
      v = mareCover(c[0], c[1], c[2], mareField(c[0], c[1], c[2]).f)
      mareCache.set(key, v)
    }
    return v
  }
  const rays = RAYED.map(([lat, lon, rdeg, bright, count, len], k) => {
    const c = sel(lat, lon)
    const up = Math.abs(c[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]
    const e1 = norm(cross(up, c))
    const e2 = cross(c, e1)
    const streaks = []
    for (let i = 0; i < count; i++) {
      const h = (j) => hash3(k * 131 + i, j, 77)
      streaks.push({ a: h(1) * Math.PI * 2, w: 0.1 + h(2) * 0.18, l: len * (0.35 + h(3) * 0.9), s: 0.4 + h(4) * 0.6 })
    }
    return { c, rho: rdeg * (Math.PI / 180), bright, len, e1, e2, streaks }
  })

  for (let y = 0; y < H; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / H) * Math.PI
    const cl = Math.cos(lat)
    const sl = Math.sin(lat)
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 2 * Math.PI - Math.PI
      const nx = cl * Math.sin(lon)
      const ny = sl
      const nz = cl * Math.cos(lon)
      const p = y * W + x

      // Highlands: mottled, the southern uplands a little brighter.
      const mott = fbm3(nx * 3, ny * 3, nz * 3, 5)
      const blot = fbm3(nx * 8 + 11, ny * 8, nz * 8, 4)
      const fine = fbm3(nx * 40, ny * 40, nz * 40, 3)
      const hl = 0.66 + (mott - 0.5) * 0.3 + (blot - 0.5) * 0.24 + (fine - 0.5) * 0.08 + 0.04 * smooth(0, -0.7, ny)
      // Maria: lava plains, darker at the margins, a little lower than the highlands.
      const M = mareField(nx, ny, nz)
      const cover = mareCover(nx, ny, nz, M.f)
      const flow = fbm3(nx * 6 + 7.7, ny * 6, nz * 6, 4)
      const mare = M.alb * 0.66 + (flow - 0.5) * 0.16 + (blot - 0.5) * 0.06 + (fine - 0.5) * 0.03 + 0.03 * smooth(0.7, 0.98, M.f)
      // Patchy maria: younger and older flows, lighter toward the shore.
      const patch = fbm3(nx * 14 + 2.3, ny * 14, nz * 14, 3)
      let alb = hl + (mare + (patch - 0.5) * 0.12 - hl) * cover * 0.9
      let hgt = (mott - 0.5) * 2600 + (blot - 0.5) * 900 - 1800 * cover

      // Craters on four scales from a 3D cell lattice (seamless on the sphere).
      for (let s = 0; s < CRATER_SCALES.length; s++) {
        const [cell, prob, r0, r1] = CRATER_SCALES[s]
        const gx = Math.floor(nx / cell)
        const gy = Math.floor(ny / cell)
        const gz = Math.floor(nz / cell)
        for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const cx = gx + dx
              const cy = gy + dy
              const cz = gz + dz
              const h0 = hash3(cx, cy, cz + s * 7919)
              if (h0 > prob) continue
              let c = [(cx + hash3(cx, cy, cz + s * 7919 + 1)) * cell, (cy + hash3(cx, cy, cz + s * 7919 + 2)) * cell, (cz + hash3(cx, cy, cz + s * 7919 + 3)) * cell]
              const cl2 = Math.hypot(c[0], c[1], c[2])
              if (cl2 < 1e-6) continue
              c = [c[0] / cl2, c[1] / cl2, c[2] / cl2]
              const rho = r0 * Math.pow(r1 / r0, hash3(cx, cy, cz + s * 7919 + 4))
              const d = Math.hypot(nx - c[0], ny - c[1], nz - c[2]) / rho
              if (d > 3.2) continue
              // Maria are young: few craters landed on them.
              if (hash3(cx, cy, cz + s * 7919 + 5) < 0.8 && mareAtCentre(`${s}:${cx},${cy},${cz}`, c) > 0.5) continue
              const fresh = hash3(cx, cy, cz + s * 7919 + 6) < 0.14 ? 0.3 + 0.7 * hash3(cx, cy, cz + s * 7919 + 7) : 0
              const depth = Math.min(rho * MOON_RADIUS_M * 0.35, 4500)
              // Bowl, raised rim, ejecta apron.
              hgt += d < 1 ? -depth * (1 - d * d) + depth * 0.25 * smooth(0.6, 1, d) : depth * 0.25 * Math.exp(-(d - 1) * 3.2)
              const rim = Math.exp(-((d - 1) * (d - 1)) / 0.05)
              const spot = Math.exp(-(d * d) / 1.4)
              const floor = smooth(1, 0.6, d)
              alb += fresh * 0.1 * spot + (1 - fresh) * (0.01 * rim - 0.015 * floor)
            }
      }

      // Ray systems: long thin streaks along great circles from the young craters.
      for (const R of rays) {
        const d = Math.hypot(nx - R.c[0], ny - R.c[1], nz - R.c[2])
        const reach = R.len * 1.3
        if (d > reach) continue
        const dd = d / R.rho
        if (dd < 1.2) {
          const depth = Math.min(R.rho * MOON_RADIUS_M * 0.3, 4000)
          hgt += dd < 1 ? -depth * (1 - dd * dd) : depth * 0.25 * Math.exp(-(dd - 1) * 3.2)
        }
        const n = [nx, ny, nz]
        const a = Math.atan2(dot(n, R.e2), dot(n, R.e1))
        let ray = 0
        for (const s of R.streaks) {
          let da = Math.abs(a - s.a)
          da = Math.min(da, Math.PI * 2 - da)
          const w = s.w * (0.7 + 0.6 * (d / s.l))
          ray += s.s * Math.exp(-(da * da) / (w * w)) * Math.exp(-d / s.l)
        }
        const fray = Math.max(0, fbm3(nx * 45, ny * 45, nz * 45, 3) * 1.6 - 0.45)
        const collar = Math.exp(-((dd - 1.9) * (dd - 1.9)) / 0.5)
        const fade = smooth(reach, reach * 0.6, d)
        alb += fade * R.bright * (ray * 1.3 * fray * smooth(R.rho * 3, R.rho * 14, d) + 0.35 * smooth(1.15, 0.4, dd) + 0.12 * Math.exp(-dd / 6)) - 0.05 * collar * R.bright * 4
      }

      // Regolith grain, finer than any feature.
      alb *= 1 + (hash3(x, y, 991) - 0.5) * 0.03
      // A faint warm / cool split between highlands and maria (the real moon's colour, much exaggerated in LROC composites).
      const warm = 1 - cover
      albedo[p * 3] = Math.max(0, alb * (0.985 + 0.03 * warm))
      albedo[p * 3 + 1] = Math.max(0, alb)
      albedo[p * 3 + 2] = Math.max(0, alb * (1.015 - 0.03 * warm))
      height[p] = hgt
    }
  }
  return { albedo, height }
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

// ------------------------------------------------------------ NASA sources

function findSource(patterns) {
  if (!existsSync(SOURCE_DIR)) return null
  const files = readdirSync(SOURCE_DIR)
  for (const p of patterns) {
    const hit = files.find((f) => p.test(f))
    if (hit) return join(SOURCE_DIR, hit)
  }
  return null
}

/** LROC colour -> linear albedo at W x H (Lanczos downsample of the 4K-8K map). */
async function nasaAlbedo(file, W, H) {
  const { data, info } = await sharp(file, { limitInputPixels: false, unlimited: true })
    .toColourspace('srgb')
    .removeAlpha()
    .resize(W, H, { kernel: 'lanczos3', fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ch = info.channels
  const albedo = new Float32Array(W * H * 3)
  for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) albedo[p * 3 + c] = lin(data[p * ch + Math.min(c, ch - 1)])
  return albedo
}

/** LOLA elevation -> metres above 1737.4 km at W x H. `_uint` files are half-metres above 1727.4 km; float files are km above 1737.4 km. */
async function nasaHeight(file, W, H) {
  const isUint = /_uint/i.test(file)
  const { data, info } = await sharp(file, { limitInputPixels: false, unlimited: true })
    .extractChannel(0)
    .resize(W, H, { kernel: 'cubic', fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const n = W * H
  const bpp = data.length / n
  const height = new Float32Array(n)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  for (let p = 0; p < n; p++) {
    if (bpp === 4) height[p] = view.getFloat32(p * 4, true) * 1000
    else if (bpp === 2) height[p] = view.getUint16(p * 2, true) * 0.5 - 10000
    else throw new Error(`unexpected elevation sample size (${bpp} bytes) in ${file}`)
  }
  if (!isUint && bpp === 2) console.warn('[moon] 16-bit elevation without _uint in its name: assuming half-metres above 1727.4 km')
  return height
}

// ------------------------------------------------------------ outputs

function normalsFrom(height, W, H) {
  const out = Buffer.alloc(W * H * 3)
  const dLon = (2 * Math.PI) / W
  const dLat = Math.PI / H
  for (let y = 0; y < H; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / H) * Math.PI
    // Near the poles a pixel is tiny east-west: floor it so the slope stays finite.
    const ex = MOON_RADIUS_M * Math.max(Math.cos(lat), 0.02) * dLon * 2
    const ny = MOON_RADIUS_M * dLat * 2
    const yu = Math.max(0, y - 1)
    const yd = Math.min(H - 1, y + 1)
    for (let x = 0; x < W; x++) {
      const xl = (x - 1 + W) % W
      const xr = (x + 1) % W
      const dhx = (height[y * W + xr] - height[y * W + xl]) / ex
      const dhy = (height[yu * W + x] - height[yd * W + x]) / ny // north is up (y decreasing)
      let nx = -dhx * BAKED_RELIEF
      let nyy = -dhy * BAKED_RELIEF
      let nz = 1
      const l = Math.hypot(nx, nyy, nz)
      nx /= l
      nyy /= l
      nz /= l
      const i = (y * W + x) * 3
      out[i] = Math.round((nx * 0.5 + 0.5) * 255)
      out[i + 1] = Math.round((nyy * 0.5 + 0.5) * 255)
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)
    }
  }
  return out
}

/** Mean albedo of the near side as seen from Earth (projected-area weighted), linear luminance. */
function nearSideMean(albedo, W, H) {
  let s = 0
  let n = 0
  for (let y = 0; y < H; y++) {
    const lat = Math.PI / 2 - ((y + 0.5) / H) * Math.PI
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * 2 * Math.PI - Math.PI
      const w = Math.cos(lat) * Math.cos(lat) * Math.cos(lon) // area on the sphere x foreshortening
      if (w <= 0) continue
      const i = (y * W + x) * 3
      s += luma(albedo[i], albedo[i + 1], albedo[i + 2]) * w
      n += w
    }
  }
  return s / n
}

async function main() {
  const arg = process.argv.indexOf('--size')
  const W = arg > 0 ? Math.max(512, Number(process.argv[arg + 1]) | 0) : 2048
  const H = W / 2
  mkdirSync(MOON_DIR, { recursive: true })

  const colorSrc = findSource([/^lroc_color_poles_8k\./i, /^lroc_color_poles_4k\./i, /^lroc_color_poles\.tif/i, /^lroc_color.*\.(tiff?|png|jpe?g|exr)$/i])
  const heightSrc = findSource([/^ldem_16_uint\.tif/i, /^ldem_16\.tif/i, /^ldem_64_uint\.tif/i, /^ldem_64\.tif/i, /^ldem_4_uint\.tif/i, /^ldem_4\.tif/i])

  let albedo
  let height
  let source
  if (colorSrc && heightSrc) {
    console.log(`[moon] NASA CGI Moon Kit: ${colorSrc} + ${heightSrc} -> ${W}x${H}`)
    albedo = await nasaAlbedo(colorSrc, W, H)
    height = await nasaHeight(heightSrc, W, H)
    source = 'NASA SVS CGI Moon Kit (LROC WAC colour, LOLA elevation)'
  } else {
    if (colorSrc || heightSrc) console.warn(`[moon] need BOTH a colour map and an elevation map in ${SOURCE_DIR}; found only ${colorSrc ?? heightSrc}`)
    console.log(`[moon] no NASA maps in ${SOURCE_DIR}: building the procedural stand-in at ${W}x${H} (about a minute)`)
    ;({ albedo, height } = proceduralMaps(W, H))
    source = 'procedural stand-in (scripts/prepare-moon.mjs); drop the NASA CGI Moon Kit files into scripts/source/moon/ and rerun'
  }

  const enc8 = Buffer.alloc(W * H * 3)
  for (let i = 0; i < W * H * 3; i++) enc8[i] = enc(albedo[i])
  await sharp(enc8, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9 }).toFile(join(MOON_DIR, 'albedo.png'))
  // Normals at half the size: relief only shows near the terminator, and it keeps the download small.
  await sharp(normalsFrom(height, W, H), { raw: { width: W, height: H, channels: 3 } })
    .resize(W / 2, H / 2, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(join(MOON_DIR, 'normal.png'))
  const meanAlbedo = nearSideMean(albedo, W, H)
  const meta = { source, width: W, height: H, meanAlbedo: +meanAlbedo.toFixed(5), bakedRelief: BAKED_RELIEF }
  writeFileSync(join(MOON_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')

  // The near side, orthographic and flat-lit (albedo only), for the ?debug split view.
  const S = 512
  const ref = Buffer.alloc(S * S * 3)
  const tmp = [0, 0, 0]
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const qx = ((x + 0.5) / S) * 2 - 1
      const qy = 1 - ((y + 0.5) / S) * 2
      const r = Math.hypot(qx, qy)
      const i = (y * S + x) * 3
      const cov = Math.min(1, Math.max(0, (1 - r) * (S / 2) + 0.5))
      if (cov <= 0) continue
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r * r)))
      const u = Math.atan2(qx, nz) / (2 * Math.PI) + 0.5
      const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, qy))) / Math.PI
      sampleEq(albedo, W, H, u, v, tmp)
      for (let c = 0; c < 3; c++) ref[i + c] = enc(Math.min(1, (tmp[c] / meanAlbedo) * 0.55) * cov)
    }
  await sharp(ref, { raw: { width: S, height: S, channels: 3 } }).png({ compressionLevel: 9 }).toFile(join(MOON_DIR, 'reference.png'))
  console.log(`[moon] wrote src/assets/moon/{albedo,normal,reference}.png + meta.json (near-side mean albedo ${meta.meanAlbedo})`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
