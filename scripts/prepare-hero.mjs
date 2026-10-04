/**
 * Builds the hero photographs.
 *
 *   npm run hero                         base 1672 px photo only
 *   npm run hero -- path/to/upscaled.png also the 2K / 4K / 8K tiers
 *
 * Run `node scripts/prepare-moon.mjs` first (the moon maps), then this.
 *
 * 1. The moon. The engine renders the moon as a lit sphere (scene.frag) at
 *    heroConfig.moon.pos / radius, behind every cloud. This script:
 *    - removes the photographed moon from the clean plate src/assets/hero.jpg:
 *      its glow is measured ring by ring, sector by sector, and subtracted;
 *      then the disk and its rim are rebuilt by exemplar inpainting
 *      (multi-scale PatchMatch), so the hole is filled with real sky texture,
 *      grain and cloud from around it: no flat patch, ghost, ring or halo.
 *    - writes src/assets/hero-maps/moon-matte.png: photographed cloud in front
 *      of the NEW moon (1 = cloud), out to 3 radii, read off the finished
 *      plate itself, so the fill and the occlusion always agree.
 *    - writes src/hero/tools/out/moon-inpaint-mask.png (the filled region),
 *      in case you prefer to inpaint by hand (Photoshop Content-Aware Fill)
 *      and drop the result back in as src/assets/hero.jpg.
 *    - writes public/hero/night-*.{jpg,webp}: stills with the sphere moon,
 *      its scatter ring and halo composited in, for the loader, the poster
 *      and the no-WebGL fallback.
 *
 * 2. Resolution. Real 8K cannot come from a 1672 px photo. Give this script
 *    an AI-upscaled copy of public/hero/night.original.webp (7680 px wide is
 *    ideal, same 16:9 framing; see src/hero/README.md) and it writes
 *    src/assets/hero-hi/{2k,4k,8k}.{avif,webp} (clean plates too), which the
 *    engine streams in per device after the first frame and crossfades to.
 *    With KTX-Software's `toktx` on PATH it also writes 8k.ktx2 (UASTC +
 *    zstd, mipmapped: a quarter of the GPU memory) and copies three's Basis
 *    transcoder to public/hero/basis/.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { heroConfig } from '../src/hero/config.ts'
import { loadMoonMaps, makeMoonShader, moonColor } from './prepare-moon.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const at = (...p) => join(root, ...p)

const REF = heroConfig.image.ref
/** The photographed moon, in base px. */
const PHOTO_MOON = { cx: 1162, cy: 154, r: 51 }
/** The rendered moon (heroConfig.moon), in base px. */
const MOON = { cx: heroConfig.moon.pos[0], cy: heroConfig.moon.pos[1], r: heroConfig.moon.radius }
/** The old disk and its bright limb, in old-moon radii: replaced unless cloud was in front of it. */
const FILL_REACH = 1.24
/** Out to here (old-moon radii) the clear sky is replaced too: the glow estimate leaves a faint ring there. */
const SKY_REACH = 1.9
/** sRGB luminance (0..255, after the glow removal) above which a pixel in that ring is lit cloud, kept. */
const RING_CLOUD = [46, 66]
/** Sources for the fill stay clear of what is left of the old limb glow. */
const SOURCE_MIN = 1.4
/** sRGB luminance (0..255) below which a pixel by the old moon is cloud in front of it, above which it is moonlight. */
const CLOUD_LUM = [75, 140]
/** Inside the old disk, only the cumulus bank below this line (base px, a soft band) was in front of it. */
const OCCLUDER_TOP = [158, 170]
/** How far around the new moon the matte is written, in its radii (the shader reads it out to 3). */
const MATTE_REACH = 3
/** Departure from the fitted sky (sRGB levels) over which a pixel turns from sky to cloud in the matte. */
const MATTE_DEV = [5, 11]
/** Linear colour of the dark sky far from the moon (measured by measureSkyFloor): the glow removal never goes below it. */
let SKY_FLOOR = [0.0044, 0.0125, 0.024]

const BASE_SRC = at('public/hero/night.original.webp')
const SIZES = { '2k': 2048, '4k': 3840, '8k': 7680 }

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

async function raw(input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

/** Bilinear sample of channel c of an RGB buffer (clamped). */
function bil(img, x, y, c) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const g = (a, b) => img.data[(Math.min(img.h - 1, Math.max(0, b)) * img.w + Math.min(img.w - 1, Math.max(0, a))) * 3 + c]
  return (g(ix, iy) * (1 - fx) + g(ix + 1, iy) * fx) * (1 - fy) + (g(ix, iy + 1) * (1 - fx) + g(ix + 1, iy + 1) * fx) * fy
}

/** Deterministic uniform random numbers. */
function rng(seed) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296
}

/** Mean linear colour of a ring (r in disk radii) over an arc of angles (deg, 0 = +x, 90 = down). */
function ring(img, disk, r, a0, a1, pct = 0.5) {
  const vals = [[], [], []]
  for (let a = a0; a < a1; a += 0.5) {
    const t = (a * Math.PI) / 180
    const x = disk.cx + Math.cos(t) * r * disk.r
    const y = disk.cy + Math.sin(t) * r * disk.r
    if (x < 0 || y < 0 || x >= img.w - 1 || y >= img.h - 1) continue
    for (let c = 0; c < 3; c++) vals[c].push(lin(bil(img, x, y, c)))
  }
  return vals.map((v) => {
    v.sort((p, q) => p - q)
    return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * pct))] : 0
  })
}

// ------------------------------------------------------------ the photographed moon's glow

/**
 * The photographed moon's glow above the dark sky, per channel, as a function
 * of distance from its centre (in old-moon radii) and direction: the photo's
 * glow is lopsided (brighter to the right). Measured in 30 degree sectors from
 * the left limb over the top to the right limb (below the moon is cloud); the
 * lower half blends the two side sectors. Low percentile per ring (sky is the
 * darkest thing there; under-subtracting is safer than a dark ring), forced
 * non-increasing outward, each sector's own floor removed.
 */
function measurePhotoGlow(img) {
  const disk = { cx: PHOTO_MOON.cx, cy: PHOTO_MOON.cy, r: PHOTO_MOON.r }
  const step = 0.05
  const max = 4.5
  const A0 = 165 // first sector centre (deg; 180 = left, 270 = up, 360 = right)
  const A1 = 375
  const AS = 15
  const sectors = []
  for (let a = A0; a <= A1; a += AS) {
    const prof = []
    // Rings that leave the top of the photo have no samples: they repeat the last measured one.
    for (let d = 1; d <= max + 1e-6; d += step) {
      const c = ring(img, disk, d, a - 15, a + 15, 0.15)
      prof.push(c.some((x) => x > 0) || !prof.length ? c : prof[prof.length - 1].slice())
    }
    for (let i = 1; i < prof.length; i++) for (let c = 0; c < 3; c++) prof[i][c] = Math.min(prof[i][c], prof[i - 1][c])
    const floor = prof[prof.length - 1]
    sectors.push(prof.map((v) => v.map((x, c) => Math.max(0, x - floor[c]))))
  }
  const sample = (k, d, c) => {
    const f = (Math.min(max, Math.max(1, d)) - 1) / step
    const i = Math.min(sectors[k].length - 1, Math.floor(f))
    const t = f - i
    return sectors[k][i][c] * (1 - t) + sectors[k][Math.min(sectors[k].length - 1, i + 1)][c] * t
  }
  return {
    max,
    /** d in old-moon radii, ang in degrees (atan2 of y down, x right). */
    at(d, ang, c) {
      if (d >= max) return 0
      let a = ((ang % 360) + 360) % 360
      if (a < 90) a += 360 // 0..90 (lower right) continues the right-hand sectors
      let v
      if (a <= A0) {
        const t = (A0 - a) / (A0 - (A1 - 360))
        v = sample(0, d, c) * (1 - t) + sample(sectors.length - 1, d, c) * t
      } else if (a >= A1) {
        const t = (a - A1) / (A0 + 360 - A1)
        v = sample(sectors.length - 1, d, c) * (1 - t) + sample(0, d, c) * t
      } else {
        const f = (a - A0) / AS
        const k = Math.floor(f)
        const t = f - k
        v = sample(k, d, c) * (1 - t) + sample(Math.min(sectors.length - 1, k + 1), d, c) * t
      }
      return v * (1 - smooth(max * 0.6, max, d))
    },
  }
}

/**
 * The clear sky beyond the photographed moon's glow (upper sectors, 4.2 radii
 * out, low percentile so stars and cloud do not count), slightly lowered: the
 * floor only catches an overshooting glow estimate, it must never tint the sky.
 */
function measureSkyFloor(img) {
  const c = ring(img, { cx: PHOTO_MOON.cx, cy: PHOTO_MOON.cy, r: PHOTO_MOON.r }, 4.2, 190, 350, 0.3)
  return c.map((v) => v * 0.85)
}

/** Separable box blur of a single-channel buffer, radius r px (edge-normalised). */
function boxBlur(a, w, h, r) {
  const tmp = new Float32Array(a.length)
  const out = new Float32Array(a.length)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0
      let n = 0
      for (let q = Math.max(0, x - r); q <= Math.min(w - 1, x + r); q++) (acc += a[y * w + q]), n++
      tmp[y * w + x] = acc / n
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0
      let n = 0
      for (let q = Math.max(0, y - r); q <= Math.min(h - 1, y + r); q++) (acc += tmp[q * w + x]), n++
      out[y * w + x] = acc / n
    }
  return out
}

/**
 * Robust planar fit of the sky colour, per channel (c = a + bx + cy) over
 * points [x, y, index into v (RGB)]: fitted twice, dropping > 2.5 sigma
 * outliers (stray stars, thin haze) the second time. A plane, because the fit
 * has no data over the hole and anything curved would bulge there.
 */
function fitSky(v, pts) {
  const basis = (x, y) => [1, x, y]
  const solve = (use, c) => {
    const n = 3
    const A = Array.from({ length: n }, () => new Float64Array(n + 1))
    for (const [x, y, j] of use) {
      const b = basis(x, y)
      for (let r = 0; r < n; r++) {
        for (let q = 0; q < n; q++) A[r][q] += b[r] * b[q]
        A[r][n] += b[r] * v[j * 3 + c]
      }
    }
    for (let r = 0; r < n; r++) A[r][r] += 1e-9
    for (let i = 0; i < n; i++) {
      let p = i
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r
      ;[A[i], A[p]] = [A[p], A[i]]
      for (let r = 0; r < n; r++)
        if (r !== i) {
          const f = A[r][i] / A[i][i]
          for (let q = i; q <= n; q++) A[r][q] -= f * A[i][q]
        }
    }
    return A.map((row, i) => row[n] / row[i])
  }
  const evalC = (co, x, y) => basis(x, y).reduce((a, b, i) => a + b * co[i], 0)
  const coef = [0, 1, 2].map((c) => {
    const co = solve(pts, c)
    const r = pts.map(([x, y, j]) => v[j * 3 + c] - evalC(co, x, y))
    const sd = Math.sqrt(r.reduce((a, b) => a + b * b, 0) / Math.max(1, r.length))
    return solve(pts.filter((_, i) => Math.abs(r[i]) < 2.5 * sd), c)
  })
  return (x, y) => coef.map((co) => Math.max(0, evalC(co, x, y)))
}

// ------------------------------------------------------------ exemplar inpainting

/**
 * Harmonic (Laplace) fill of `hole` from its boundary, coarse to fine: only
 * the starting guess for the coarsest PatchMatch level.
 */
function harmonicFill(v, hole, w, h) {
  if (w > 24 && h > 24) {
    const cw = Math.ceil(w / 2)
    const ch = Math.ceil(h / 2)
    const cv = new Float32Array(cw * ch * 3)
    const chole = new Uint8Array(cw * ch)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        let n = 0
        let unknown = 0
        const acc = [0, 0, 0]
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const j = Math.min(h - 1, 2 * y + dy) * w + Math.min(w - 1, 2 * x + dx)
            if (hole[j]) {
              unknown++
              continue
            }
            for (let c = 0; c < 3; c++) acc[c] += v[j * 3 + c]
            n++
          }
        const j = y * cw + x
        chole[j] = unknown === 4 ? 1 : 0
        for (let c = 0; c < 3; c++) cv[j * 3 + c] = n ? acc[c] / n : 0
      }
    harmonicFill(cv, chole, cw, ch)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = y * w + x
        if (!hole[j]) continue
        const k = Math.min(ch - 1, y >> 1) * cw + Math.min(cw - 1, x >> 1)
        for (let c = 0; c < 3; c++) v[j * 3 + c] = cv[k * 3 + c]
      }
  }
  const idx = []
  for (let j = 0; j < w * h; j++) if (hole[j]) idx.push(j)
  const iters = w > 24 && h > 24 ? 60 : 400
  for (let it = 0; it < iters; it++)
    for (const j of idx) {
      const x = j % w
      const l = x > 0 ? j - 1 : j
      const r = x < w - 1 ? j + 1 : j
      const u = j >= w ? j - w : j
      const d = j < (h - 1) * w ? j + w : j
      for (let c = 0; c < 3; c++) v[j * 3 + c] = 0.25 * (v[l * 3 + c] + v[r * 3 + c] + v[u * 3 + c] + v[d * 3 + c])
    }
}

/**
 * Exemplar-based image completion (Wexler et al. 2007, with Barnes et al.'s
 * PatchMatch for the nearest-neighbour search). Every patch that touches the
 * hole is matched to a fully known patch elsewhere in the window; each hole
 * pixel becomes the weighted vote of the matches covering it; repeated coarse
 * to fine, so large structure (cloud edges, the sky gradient) settles first
 * and real texture (grain, stars, cloud detail) is copied in last.
 *
 * `img` linear RGB (w*h*3), `hole` 1 = unknown, `src` 1 = may be copied from.
 * Fills `img` in place.
 */
function inpaint(img, hole, src, w, h, holeRadius, maxLevels = 7) {
  const P = 3 // patch radius (7 x 7)
  const levels = Math.max(1, Math.min(maxLevels, Math.floor(Math.log2(Math.max(8, holeRadius) / 5)) + 1))
  // ---- pyramid (mask-aware: a coarse pixel is unknown if any child is)
  const pyr = [{ img, hole, src, w, h }]
  for (let l = 1; l < levels; l++) {
    const f = pyr[l - 1]
    const cw = Math.ceil(f.w / 2)
    const ch = Math.ceil(f.h / 2)
    const ci = new Float32Array(cw * ch * 3)
    const chole = new Uint8Array(cw * ch)
    const csrc = new Uint8Array(cw * ch)
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        let n = 0
        let anyHole = 0
        let allSrc = 1
        const acc = [0, 0, 0]
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const j = Math.min(f.h - 1, 2 * y + dy) * f.w + Math.min(f.w - 1, 2 * x + dx)
            if (f.hole[j]) anyHole = 1
            else {
              for (let c = 0; c < 3; c++) acc[c] += f.img[j * 3 + c]
              n++
            }
            if (!f.src[j]) allSrc = 0
          }
        const j = y * cw + x
        chole[j] = anyHole
        csrc[j] = allSrc
        for (let c = 0; c < 3; c++) ci[j * 3 + c] = n ? acc[c] / n : 0
      }
    pyr.push({ img: ci, hole: chole, src: csrc, w: cw, h: ch })
  }

  const rand = rng(0x9e3779b9)
  let nnf = null // per target pixel: source centre index
  for (let l = levels - 1; l >= 0; l--) {
    const L = pyr[l]
    const { w: W, h: H, img: I } = L
    // Valid source centres: the whole 7 x 7 patch is inside the window and copyable.
    const ok = new Uint8Array(W * H)
    const valid = []
    for (let y = P; y < H - P; y++)
      for (let x = P; x < W - P; x++) {
        let good = 1
        for (let dy = -P; dy <= P && good; dy++) for (let dx = -P; dx <= P; dx++) if (!L.src[(y + dy) * W + x + dx]) (good = 0), dx = P + 1
        if (good) {
          ok[y * W + x] = 1
          valid.push(y * W + x)
        }
      }
    if (!valid.length) throw new Error('inpaint: no source patches; widen the window')
    // Targets: every pixel whose patch touches the hole.
    const near = new Uint8Array(W * H)
    for (let j = 0; j < W * H; j++) {
      if (!L.hole[j]) continue
      const x = j % W
      const y = (j - x) / W
      for (let dy = -P; dy <= P; dy++)
        for (let dx = -P; dx <= P; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) near[yy * W + xx] = 1
        }
    }
    const targets = []
    for (let j = 0; j < W * H; j++) if (near[j]) targets.push(j)

    // ---- initial guess: harmonic at the coarsest level, else upsample the coarser NNF and vote
    const f = new Int32Array(W * H).fill(-1)
    const dist = new Float32Array(W * H)
    const randomValid = () => valid[(rand() * valid.length) | 0]
    if (l === levels - 1) {
      harmonicFill(I, L.hole, W, H)
      for (const j of targets) f[j] = randomValid()
    } else {
      const C = pyr[l + 1]
      for (const j of targets) {
        const x = j % W
        const y = (j - x) / W
        const cj = Math.min(C.h - 1, y >> 1) * C.w + Math.min(C.w - 1, x >> 1)
        const cs = nnf[cj]
        if (cs >= 0) {
          const sx = (cs % C.w) * 2 + (x & 1)
          const sy = Math.floor(cs / C.w) * 2 + (y & 1)
          const s = sy * W + sx
          f[j] = sx < W && sy < H && ok[s] ? s : randomValid()
        } else f[j] = randomValid()
      }
    }

    const D = (t, s) => {
      const tx = t % W
      const ty = (t - tx) / W
      const sx = s % W
      const sy = (s - sx) / W
      let d = 0
      let n = 0
      for (let dy = -P; dy <= P; dy++) {
        const yy = ty + dy
        if (yy < 0 || yy >= H) continue
        for (let dx = -P; dx <= P; dx++) {
          const xx = tx + dx
          if (xx < 0 || xx >= W) continue
          const a = (yy * W + xx) * 3
          const b = ((sy + dy) * W + sx + dx) * 3
          const e0 = I[a] - I[b]
          const e1 = I[a + 1] - I[b + 1]
          const e2 = I[a + 2] - I[b + 2]
          d += e0 * e0 + e1 * e1 + e2 * e2
          n++
        }
      }
      return d / n
    }

    const vote = () => {
      // Similarity weights: sigma from the median match distance.
      const ds = targets.map((j) => dist[j]).sort((a, b) => a - b)
      // Sharp: the best matches dominate, so copied texture stays crisp instead of averaging to a smooth patch.
      const sig2 = Math.max(1e-12, ds[ds.length >> 2] * 0.5)
      const acc = new Float32Array(W * H * 4)
      for (const t of targets) {
        const s = f[t]
        const wt = Math.exp(-dist[t] / sig2)
        const tx = t % W
        const ty = (t - tx) / W
        const sx = s % W
        const sy = (s - sx) / W
        for (let dy = -P; dy <= P; dy++) {
          const yy = ty + dy
          if (yy < 0 || yy >= H) continue
          for (let dx = -P; dx <= P; dx++) {
            const xx = tx + dx
            if (xx < 0 || xx >= W) continue
            const q = yy * W + xx
            if (!L.hole[q]) continue
            const b = ((sy + dy) * W + sx + dx) * 3
            acc[q * 4] += I[b] * wt
            acc[q * 4 + 1] += I[b + 1] * wt
            acc[q * 4 + 2] += I[b + 2] * wt
            acc[q * 4 + 3] += wt
          }
        }
      }
      for (let q = 0; q < W * H; q++) {
        if (!L.hole[q] || acc[q * 4 + 3] <= 0) continue
        for (let c = 0; c < 3; c++) I[q * 3 + c] = acc[q * 4 + c] / acc[q * 4 + 3]
      }
    }

    // Seed the finer level's hole from the upsampled matches before refining.
    for (const j of targets) dist[j] = D(j, f[j])
    if (l < levels - 1) vote()

    // EM rounds: many where the structure settles (coarse), few where only texture is refined (fine).
    const emIters = l === levels - 1 ? 8 : l === 0 ? (W * H > 4e6 ? 1 : 2) : 4
    const reach = Math.max(W, H)
    for (let it = 0; it < emIters; it++) {
      for (const j of targets) dist[j] = D(j, f[j])
      for (let pm = 0; pm < 4; pm++) {
        const fwd = pm % 2 === 0
        const step = fwd ? 1 : -1
        for (let k = 0; k < targets.length; k++) {
          const t = targets[fwd ? k : targets.length - 1 - k]
          const tx = t % W
          const ty = (t - tx) / W
          let best = f[t]
          let bd = dist[t]
          // Propagation: a neighbour's match, shifted by one.
          for (const [nx, ny] of [
            [tx - step, ty],
            [tx, ty - step],
          ]) {
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
            const nb = f[ny * W + nx]
            if (nb < 0) continue
            const c = nb + step * (nx === tx ? W : 1)
            const cx = c % W
            if (c < 0 || c >= W * H || !ok[c] || Math.abs(cx - (nb % W)) > 1) continue
            const d = D(t, c)
            if (d < bd) (bd = d), (best = c)
          }
          // Random search in shrinking windows around the current best.
          for (let r = reach; r >= 1; r >>= 1) {
            const bx = best % W
            const by = (best - bx) / W
            const cx = Math.round(bx + (rand() * 2 - 1) * r)
            const cy = Math.round(by + (rand() * 2 - 1) * r)
            if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue
            const c = cy * W + cx
            if (!ok[c]) continue
            const d = D(t, c)
            if (d < bd) (bd = d), (best = c)
          }
          f[t] = best
          dist[t] = bd
        }
      }
      vote()
    }
    nnf = f
  }
}

// ------------------------------------------------------------ the clean plate

/**
 * Removes the photographed moon from `img` (any resolution of the base
 * framing), in place: subtracts its glow, then inpaints the disk and its limb.
 * With `ref` (the finished base clean plate), a larger copy takes its fill
 * from it instead (upsampled, with grain matched to its own sky), so every
 * tier has the very same seamless sky. Returns the fill mask over the work window.
 */
function cleanPlate(img, glow, ref = null) {
  const s = img.w / REF[0]
  const cx = PHOTO_MOON.cx * s
  const cy = PHOTO_MOON.cy * s
  const R = PHOTO_MOON.r * s

  // Work window: the old glow's reach (and enough source sky around the hole).
  const gr = R * glow.max
  const x0 = Math.max(0, Math.floor(cx - gr))
  const y0 = Math.max(0, Math.floor(cy - gr))
  const bw = Math.min(img.w, Math.ceil(cx + gr)) - x0
  const bh = Math.min(img.h, Math.ceil(cy + gr)) - y0

  // ---- 1. the old glow, everywhere it reaches
  const v = new Float32Array(bw * bh * 3)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 3
      const ddx = x0 + x + 0.5 - cx
      const ddy = y0 + y + 0.5 - cy
      const d = Math.hypot(ddx, ddy) / R
      const ang = (Math.atan2(ddy, ddx) * 180) / Math.PI
      for (let c = 0; c < 3; c++) {
        const o = lin(img.data[i + c])
        const g = glow.at(d, ang, c)
        // Never below the dark sky far from the moon: no black holes where the glow estimate overshoots.
        v[(y * bw + x) * 3 + c] = Math.max(o - g, Math.min(o, SKY_FLOOR[c]))
      }
    }

  // ---- 2. what to replace: every pixel the old moon lit (its disk and its bright
  // limb). The cumulus silhouettes that crossed in front of the old disk are
  // real cloud with real edges: they stay, and become the new moon's silver lining.
  const blurR = Math.max(1, Math.round(2.5 * s))
  const Lsrgb = new Float32Array(bw * bh)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 3
      Lsrgb[y * bw + x] = luma(img.data[i], img.data[i + 1], img.data[i + 2])
    }
  const Lb = boxBlur(Lsrgb, bw, bh, blurR)
  // The same after the glow removal (sRGB scale), for the clear-sky ring around the limb.
  const Lv = new Float32Array(bw * bh)
  for (let j = 0; j < bw * bh; j++) Lv[j] = enc(luma(v[j * 3], v[j * 3 + 1], v[j * 3 + 2]))
  const Lvb = boxBlur(Lv, bw, bh, blurR)
  const k = new Float32Array(bw * bh) // 1 = replace
  const hole = new Uint8Array(bw * bh)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const j = y * bw + x
      const d = Math.hypot(x0 + x + 0.5 - cx, y0 + y + 0.5 - cy) / R
      if (d >= SKY_REACH) continue
      // The disk and its limb: dark against the moonlight = cloud in front. Inside the disk only the cumulus band low on it counts.
      const dark = 1 - smooth(CLOUD_LUM[0], CLOUD_LUM[1], Lb[j])
      const keep = d < 1 ? dark * smooth(OCCLUDER_TOP[0] * s, OCCLUDER_TOP[1] * s, y0 + y + 0.5) : dark
      const kDisk = (1 - keep) * (1 - smooth(FILL_REACH - 0.14, FILL_REACH, d))
      // The ring beyond: clear sky only (lit cloud keeps its own pixels).
      const kRing = d >= 1 ? (1 - smooth(RING_CLOUD[0], RING_CLOUD[1], Lvb[j])) * (1 - smooth(SKY_REACH - 0.35, SKY_REACH, d)) : 0
      k[j] = Math.max(kDisk, kRing)
      hole[j] = k[j] > 0.02 ? 1 : 0
    }

  if (ref) {
    fillFromRef(img, v, k, { x0, y0, bw, bh, s, cx, cy, R }, ref)
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const i = ((y0 + y) * img.w + x0 + x) * 3
        for (let c = 0; c < 3; c++) img.data[i + c] = enc(v[(y * bw + x) * 3 + c])
      }
    return { hole: k, x0, y0, bw, bh, skyModel: null }
  }

  // ---- 3. the sky behind it: a smooth model fitted to the clear sky around
  // (robust plane per channel), so the fill has exactly the brightness and
  // hue of the sky it continues.
  const L = new Float32Array(bw * bh)
  for (let j = 0; j < bw * bh; j++) L[j] = luma(v[j * 3], v[j * 3 + 1], v[j * 3 + 2])
  const Lsm = boxBlur(L, bw, bh, blurR)
  const skyL = luma(...SKY_FLOOR)
  const isSky = new Uint8Array(bw * bh)
  for (let j = 0; j < bw * bh; j++) isSky[j] = !hole[j] && Lsm[j] < skyL * 2.4 ? 1 : 0
  const fitPts = []
  const stride = Math.max(1, Math.round(s))
  for (let y = 0; y < bh; y += stride)
    for (let x = 0; x < bw; x += stride) {
      const j = y * bw + x
      const d = Math.hypot(x0 + x + 0.5 - cx, y0 + y + 0.5 - cy) / R
      if (isSky[j] && d > SKY_REACH && d < 4.2) fitPts.push([(x0 + x + 0.5 - cx) / R, (y0 + y + 0.5 - cy) / R, j])
    }
  const model = fitSky(v, fitPts)
  const base = new Float32Array(bw * bh * 3)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const m = model((x0 + x + 0.5 - cx) / R, (y0 + y + 0.5 - cy) / R)
      for (let c = 0; c < 3; c++) base[(y * bw + x) * 3 + c] = m[c]
    }

  // ---- 4. a seamless edge: the residual to the real sky on the hole's border
  // is carried in harmonically (Poisson blending with the model as the guide).
  // Border pixels that are cloud contribute nothing, so no cloud brightness bleeds in.
  const res = new Float32Array(bw * bh * 3)
  for (let j = 0; j < bw * bh; j++) if (!hole[j] && isSky[j]) for (let c = 0; c < 3; c++) res[j * 3 + c] = v[j * 3 + c] - base[j * 3 + c]
  harmonicFill(res, hole, bw, bh)

  // ---- 5. texture: the sky's own grain, copied patch by patch from the clear
  // sky (PatchMatch on the high-pass), so the fill is never glassy.
  const hp = new Float32Array(bw * bh * 3)
  for (let c = 0; c < 3; c++) {
    const ch = new Float32Array(bw * bh)
    for (let j = 0; j < bw * bh; j++) ch[j] = v[j * 3 + c]
    const b = boxBlur(boxBlur(ch, bw, bh, blurR), bw, bh, blurR)
    for (let j = 0; j < bw * bh; j++) hp[j * 3 + c] = hole[j] ? 0 : v[j * 3 + c] - b[j]
  }
  const src = new Uint8Array(bw * bh)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const j = y * bw + x
      const d = Math.hypot(x0 + x + 0.5 - cx, y0 + y + 0.5 - cy) / R
      src[j] = isSky[j] && d > SOURCE_MIN ? 1 : 0
    }
  inpaint(hp, hole, src, bw, bh, R * SKY_REACH, 2) // grain has no coarse structure: two levels

  for (let j = 0; j < bw * bh; j++) {
    if (k[j] <= 0) continue
    for (let c = 0; c < 3; c++) {
      const fill = Math.max(0, base[j * 3 + c] + res[j * 3 + c] + hp[j * 3 + c])
      v[j * 3 + c] = v[j * 3 + c] * (1 - k[j]) + fill * k[j]
    }
  }

  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 3
      for (let c = 0; c < 3; c++) img.data[i + c] = enc(v[(y * bw + x) * 3 + c])
    }
  const skyModel = (px, py) => model((px - cx) / R, (py - cy) / R)
  return { hole: k, x0, y0, bw, bh, skyModel }
}

/**
 * A larger tier's fill: the base clean plate, upsampled (bilinear in linear
 * light) under the replace mask `k`, plus fine grain with the standard
 * deviation of this tier's own clear sky (robust, from its high-pass), so the
 * fill neither looks glassy nor grainier than the sky around it.
 */
function fillFromRef(img, v, k, win, ref) {
  const { x0, y0, bw, bh, s, cx, cy, R } = win
  const at = (x, y, c) => lin(bil(ref, x, y, c))
  const hp = [[], [], []]
  for (let y = 1; y < bh - 1; y += 2)
    for (let x = 1; x < bw - 1; x += 2) {
      const d = Math.hypot(x0 + x + 0.5 - cx, y0 + y + 0.5 - cy) / R
      if (d < SKY_REACH + 0.2 || d > 3.5 || y0 + y > cy) continue
      const j = y * bw + x
      for (let c = 0; c < 3; c++) {
        const m = (v[(j - 1) * 3 + c] + v[(j + 1) * 3 + c] + v[(j - bw) * 3 + c] + v[(j + bw) * 3 + c]) / 4
        hp[c].push(Math.abs(v[j * 3 + c] - m))
      }
    }
  const std = hp.map((a) => (a.sort((p, q) => p - q), 1.4826 * (a[a.length >> 1] ?? 0) * 0.8))
  let seed = 0x51ed
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const u = (seed + 0.5) / 4294967296
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return Math.sqrt(-2 * Math.log(u)) * Math.cos((2 * Math.PI * (seed + 0.5)) / 4294967296)
  }
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const j = y * bw + x
      if (k[j] <= 0) continue
      const sx = (x0 + x + 0.5) / s - 0.5
      const sy = (y0 + y + 0.5) / s - 0.5
      const n = rnd()
      for (let c = 0; c < 3; c++) {
        const fill = Math.max(0, at(sx, sy, c) + n * std[c])
        v[j * 3 + c] = v[j * 3 + c] * (1 - k[j]) + fill * k[j]
      }
    }
}

/**
 * Photographed cloud in front of the new moon, read off the finished plate.
 * Near the moon the cumulus bodies are backlit and nearly as dark as the sky,
 * so brightness alone cannot find them; their departure from the fitted sky
 * model can (the sky's grain is a few levels, a cloud body ten or more). A
 * 3 x 3 minimum first, so stars never punch holes in the disk; a soft ramp, so
 * thin haze lets the moon through in part; then everything the open sky cannot
 * reach without crossing cloud is cloud too (the dark core of a cumulus whose
 * lit rim alone stands out). Full image size, zero beyond MATTE_REACH radii.
 */
function moonMatte(img, skyModel) {
  const s = img.w / REF[0]
  const cx = MOON.cx * s
  const cy = MOON.cy * s
  const R = MOON.r * s
  const reach = R * MATTE_REACH
  const x0 = Math.max(0, Math.floor(cx - reach - 4))
  const y0 = Math.max(0, Math.floor(cy - reach - 4))
  const x1 = Math.min(img.w, Math.ceil(cx + reach + 4))
  const y1 = Math.min(img.h, Math.ceil(cy + reach + 4))
  const bw = x1 - x0
  const bh = y1 - y0
  const rad = Math.max(1, Math.round(s))
  // Departure from the sky, in sRGB levels (luminance, plus a little of the chroma: clouds are greyer than the navy).
  const dev = new Float32Array(bw * bh)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = ((y0 + y) * img.w + x0 + x) * 3
      const m = skyModel(x0 + x + 0.5, y0 + y + 0.5).map(enc)
      const p = [img.data[i], img.data[i + 1], img.data[i + 2]]
      const dl = luma(...p) - luma(...m)
      const chroma = Math.abs(p[2] - p[0] - (m[2] - m[0]))
      dev[y * bw + x] = Math.max(Math.abs(dl), chroma * 0.6)
    }
  const erode = new Float32Array(bw * bh)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      let mn = Infinity
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++) mn = Math.min(mn, dev[Math.min(bh - 1, Math.max(0, y + dy)) * bw + Math.min(bw - 1, Math.max(0, x + dx))])
      erode[y * bw + x] = mn
    }
  const B = boxBlur(boxBlur(erode, bw, bh, rad), bw, bh, rad)
  const soft = new Float32Array(bw * bh)
  for (let j = 0; j < bw * bh; j++) soft[j] = smooth(MATTE_DEV[0], MATTE_DEV[1], B[j])
  // The open sky: flood from the window's top edge through clear pixels.
  const open = new Uint8Array(bw * bh)
  const stack = []
  for (let x = 0; x < bw; x++) stack.push(x)
  while (stack.length) {
    const j = stack.pop()
    if (open[j] || soft[j] >= 0.5) continue
    open[j] = 1
    const x = j % bw
    if (x > 0) stack.push(j - 1)
    if (x < bw - 1) stack.push(j + 1)
    if (j >= bw) stack.push(j - bw)
    if (j < (bh - 1) * bw) stack.push(j + bw)
  }
  const enclosed = new Float32Array(bw * bh)
  for (let j = 0; j < bw * bh; j++) enclosed[j] = open[j] ? 0 : 1
  const encS = boxBlur(enclosed, bw, bh, rad)
  const out = new Float32Array(img.w * img.h)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const d = Math.hypot(x0 + x + 0.5 - cx, y0 + y + 0.5 - cy)
      if (d > reach) continue
      const j = y * bw + x
      out[(y0 + y) * img.w + x0 + x] = Math.max(soft[j], encS[j]) * (1 - smooth(reach * 0.9, reach, d))
    }
  return out
}

// ------------------------------------------------------------ composite (stills)

/** Composites the sphere moon, its scatter ring and halo into a clean plate, behind the matte (mirrors scene.frag, without the wisps). */
function composeMoon(img, matte, shade) {
  const m = heroConfig.moon
  const s = img.w / REF[0]
  const cx = MOON.cx * s
  const cy = MOON.cy * s
  const R = MOON.r * s
  const hue = moonColor(m)
  // The halo's colour: the sky behind the moon (a wide average), mixed with the moon's own.
  const skyAvg = [0, 0, 0]
  let n = 0
  for (let y = Math.max(0, Math.round(cy - 3 * R)); y < Math.min(img.h, cy + 3 * R); y += 2)
    for (let x = Math.max(0, Math.round(cx - 3 * R)); x < Math.min(img.w, cx + 3 * R); x += 2) {
      const i = (y * img.w + x) * 3
      for (let c = 0; c < 3; c++) skyAvg[c] += lin(img.data[i + c])
      n++
    }
  const sl = luma(...skyAvg) || 1
  let ht = hue.map((v, c) => v + (skyAvg[c] / sl - v) * m.halo.skyColor)
  const htl = luma(...ht) || 1
  ht = ht.map((v) => v / htl)
  const glow = m.glow * (1 + m.flare)
  const fw = Math.max(0.5, m.feather) * 0.5
  const ymax = Math.min(img.h, Math.ceil(cy + R * 14))
  for (let iy = 0; iy < ymax; iy++)
    for (let ix = 0; ix < img.w; ix++) {
      const px = ix + 0.5
      const py = iy + 0.5
      const d = Math.hypot(px - cx, py - cy)
      const i = (iy * img.w + ix) * 3
      const occ = matte[iy * img.w + ix]
      const hd = Math.max(0, d / R - 1)
      // The halo lives in the sky: fade it out above the island.
      const skyK = 1 - smooth(270 * s, 340 * s, py)
      const disk = 1 - smooth(R - fw, R + fw, d)
      const halo = (m.halo.amp[0] * Math.exp(-hd / m.halo.scale[0]) + m.halo.amp[1] * Math.exp(-hd / m.halo.scale[1])) * skyK
      const ringA = m.scatter.amount * Math.exp(-hd / m.scatter.width) * (1 - disk)
      const hk = glow * (1 - m.halo.occlusion * occ) * (1 - disk * (1 - occ))
      let face = null
      if (disk > 0) {
        // 4 x 4 supersampled: the GPU filters the maps through their mipmaps, a point sample would alias.
        face = [0, 0, 0]
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) {
            const f = shade((px - 0.375 + sx * 0.25 - cx) / R, -(py - 0.375 + sy * 0.25 - cy) / R)
            for (let c = 0; c < 3; c++) face[c] += f[c] / 16
          }
      }
      for (let c = 0; c < 3; c++) {
        let back = lin(img.data[i + c]) + (ht[c] * halo + hue[c] * ringA) * hk
        if (face) back = back * (1 - disk * (1 - occ)) + face[c] * disk * (1 - occ)
        img.data[i + c] = enc(back)
      }
    }
  return img
}

const toSharp = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 3 } })

function hasCommand(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' })
  return r.status === 0
}

async function main() {
  const maps = await loadMoonMaps().catch(() => {
    throw new Error('moon maps missing: run `node scripts/prepare-moon.mjs` first')
  })
  const shade = makeMoonShader(maps, heroConfig.moon)
  console.log(`moon   ${maps.meta.source}; rendered at (${MOON.cx}, ${MOON.cy}) r ${MOON.r} px`)

  // ---- base photo: clean plate, matte, stills
  const base = await raw(BASE_SRC)
  if (base.w !== REF[0] || base.h !== REF[1]) throw new Error(`expected ${REF.join('x')} base, got ${base.w}x${base.h}`)
  SKY_FLOOR = measureSkyFloor(base)
  const glow = measurePhotoGlow(base)
  const t0 = Date.now()
  const plate = cleanPlate(base, glow)
  const baseClean = { data: Buffer.from(base.data), w: base.w, h: base.h }
  console.log(`plate  glow removed, ${Math.round(plate.hole.reduce((a, b) => a + b, 0))} px inpainted (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  await toSharp(base).jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(at('src/assets/hero.jpg'))
  const matte = moonMatte(base, plate.skyModel)
  const mm = Buffer.alloc(base.w * base.h)
  for (let j = 0; j < mm.length; j++) mm[j] = Math.round(Math.min(1, Math.max(0, matte[j])) * 255)
  await sharp(mm, { raw: { width: base.w, height: base.h, channels: 1 } }).png({ compressionLevel: 9 }).toFile(at('src/assets/hero-maps/moon-matte.png'))
  const hm = Buffer.alloc(base.w * base.h)
  for (let y = 0; y < plate.bh; y++)
    for (let x = 0; x < plate.bw; x++) hm[(plate.y0 + y) * base.w + plate.x0 + x] = Math.round(plate.hole[y * plate.bw + x] * 255)
  mkdirSync(at('src/hero/tools/out'), { recursive: true })
  await sharp(hm, { raw: { width: base.w, height: base.h, channels: 1 } }).png({ compressionLevel: 9 }).toFile(at('src/hero/tools/out/moon-inpaint-mask.png'))
  const still = composeMoon({ data: Buffer.from(base.data), w: base.w, h: base.h }, matte, shade)
  await toSharp(still).jpeg({ quality: 90, mozjpeg: true }).toFile(at('public/hero/night-1672.jpg'))
  await toSharp(still).webp({ quality: 88 }).toFile(at('public/hero/night-1672.webp'))
  await toSharp(still).resize(960).webp({ quality: 85 }).toFile(at('public/hero/night-960.webp'))
  console.log('base   src/assets/hero.jpg (clean plate), hero-maps/moon-matte.png, tools/out/moon-inpaint-mask.png, public/hero/night-1672.{jpg,webp}, night-960.webp')

  // ---- high resolution tiers
  let hiSrc = process.argv[2]
  if (!hiSrc) {
    const dir = at('scripts/source')
    const found = existsSync(dir) && readdirSync(dir).find((n) => /^hero-upscaled\.(png|jpe?g|webp|tiff?)$/i.test(n))
    if (found) hiSrc = join(dir, found)
  }
  if (!hiSrc) {
    console.log('hi-res skipped: pass an upscaled photo (or put it at scripts/source/hero-upscaled.png); see src/hero/README.md')
    return
  }
  const meta = await sharp(hiSrc).metadata()
  if (Math.abs(meta.width / meta.height - REF[0] / REF[1]) > 0.01) throw new Error(`upscaled photo is ${meta.width}x${meta.height}; it must keep the ${REF.join('x')} framing`)
  const outDir = at('src/assets/hero-hi')
  mkdirSync(outDir, { recursive: true })
  const toktx = hasCommand('toktx')
  for (const [name, width] of Object.entries(SIZES)) {
    const height = Math.round((width * REF[1]) / REF[0])
    const { data, info } = await sharp(hiSrc, { limitInputPixels: false })
      .removeAlpha()
      .resize(width, height, { kernel: 'lanczos3', fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const img = { data, w: info.width, h: info.height }
    const t1 = Date.now()
    cleanPlate(img, glow, baseClean)
    const file = (ext) => join(outDir, `${name}.${ext}`)
    await toSharp(img).avif({ quality: 64, effort: 4, chromaSubsampling: '4:4:4' }).toFile(file('avif'))
    await toSharp(img).webp({ quality: 90, effort: 5 }).toFile(file('webp'))
    let ktx = ''
    if (name === '8k' && toktx) {
      const png = file('tmp.png')
      await toSharp(img).png({ compressionLevel: 1 }).toFile(png)
      const r = spawnSync('toktx', ['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--assign_oetf', 'srgb', '--target_type', 'RGB', file('ktx2'), png], { stdio: 'inherit' })
      rmSync(png, { force: true })
      ktx = r.status === 0 ? ', ktx2' : ' (toktx failed: no ktx2)'
    }
    console.log(`${name.padEnd(6)} ${width}x${height} -> src/assets/hero-hi/${name}.{avif,webp${ktx}} (${((Date.now() - t1) / 1000).toFixed(1)} s)${meta.width < width ? `  (source is only ${meta.width} wide: resampled up)` : ''}`)
  }
  if (!toktx) console.log('ktx2   skipped: install KTX-Software (toktx) for an 8k.ktx2 with a quarter of the GPU memory; see src/hero/README.md')
  // The Basis transcoder the engine's KTX2Loader needs, only when a .ktx2 tier exists.
  if (readdirSync(outDir).some((f) => f.endsWith('.ktx2'))) {
    const from = at('node_modules/three/examples/jsm/libs/basis')
    const to = at('public/hero/basis')
    mkdirSync(to, { recursive: true })
    for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) copyFileSync(join(from, f), join(to, f))
    console.log('basis  public/hero/basis/ (KTX2 transcoder)')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
