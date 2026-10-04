/**
 * A photographic full moon, generated rather than borrowed, so it carries no
 * AI-image artefacts and no licence. The near side is laid out from real
 * selenography (maria, the bright ray craters) on an orthographic sphere, then
 * lit like a moon one day from full: Lommel-Seeliger with the sun 6 degrees off
 * the line of sight, so the western limb rolls off and crater relief shows
 * only where the light grazes.
 *
 * Output values are linear albedo x shading (roughly 0.35 .. 1.0). The disk
 * fills `DISK` of the texture; pixels outside repeat the limb outward so
 * filtering never pulls in black.
 */

const DEG = Math.PI / 180

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 3D value noise on the sphere (seam-free, no projection distortion)
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
function vnoise3(x, y, z) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const uz = fz * fz * (3 - 2 * fz)
  const l = (a, b, t) => a + (b - a) * t
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
    l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz,
  )
}
export function fbm3(x, y, z, oct, f0 = 1) {
  let a = 0.5
  let f = f0
  let s = 0
  let n = 0
  for (let i = 0; i < oct; i++) {
    s += a * vnoise3(x * f + i * 17.1, y * f + i * 5.3, z * f + i * 9.7)
    n += a
    a *= 0.5
    f *= 2.03
  }
  return s / n
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Unit vector for selenographic latitude / longitude (east = +x, north = +y, toward Earth = +z). */
export function sel(lat, lon) {
  const p = lat * DEG
  const l = lon * DEG
  return [Math.cos(p) * Math.sin(l), Math.sin(p), Math.cos(p) * Math.cos(l)]
}

// ---- maria: [lat, lon, angular radius deg, albedo, tint r, g, b]
export const MARIA = [
  [34, -19, 15.5, 0.45, 1.0, 1.0, 1.0], // Imbrium
  [30, -34, 10, 0.45, 1.0, 1.0, 1.0],
  [20, -28, 8, 0.45, 1.0, 1.0, 1.0],
  [28, 18.5, 9.5, 0.47, 1.02, 1.0, 0.97], // Serenitatis
  [18, 25, 6, 0.44, 0.98, 0.99, 1.03],
  [8.5, 31, 12, 0.4, 0.97, 0.99, 1.04], // Tranquillitatis
  [2, 23, 7, 0.41, 0.97, 0.99, 1.04],
  [14, 37, 6.5, 0.42, 0.97, 0.99, 1.04],
  [-2, 42, 6, 0.43, 0.98, 0.99, 1.03],
  [-8, 33, 5, 0.44, 1.0, 1.0, 1.0],
  [17, 59, 9, 0.4, 1.0, 1.0, 1.0], // Crisium
  [-7, 52, 9.5, 0.46, 1.0, 1.0, 1.0], // Fecunditatis
  [0, 48, 5, 0.46, 1.0, 1.0, 1.0],
  [-15, 49, 5.5, 0.47, 1.0, 1.0, 1.0],
  [-15, 35, 5.5, 0.46, 1.0, 1.0, 1.0], // Nectaris
  [-21, -17, 10.5, 0.47, 1.0, 1.0, 1.0], // Nubium
  [-10, -23, 6, 0.47, 1.0, 1.0, 1.0], // Cognitum
  [-5, -31, 6, 0.46, 1.0, 1.0, 1.0],
  [-24, -39, 6, 0.45, 1.0, 1.0, 1.0], // Humorum
  [-17, -31, 5, 0.47, 1.0, 1.0, 1.0],
  [7, -31, 8, 0.46, 1.0, 1.0, 1.0], // Insularum
  [5, -12, 4.5, 0.48, 1.0, 1.0, 1.0],
  [8, -19, 5, 0.47, 1.0, 1.0, 1.0],
  [25, -55, 14, 0.43, 0.98, 0.99, 1.03], // Procellarum
  [10, -58, 13, 0.43, 0.98, 0.99, 1.03],
  [-2, -53, 11, 0.44, 0.98, 0.99, 1.03],
  [36, -47, 10, 0.44, 0.98, 0.99, 1.03],
  [-10, -45, 8, 0.45, 0.98, 0.99, 1.03],
  [17, -44, 9, 0.44, 0.98, 0.99, 1.03],
  [42, -62, 8, 0.44, 0.98, 0.99, 1.03],
  [0, -40, 7, 0.45, 0.98, 0.99, 1.03],
  [-15, -45, 5, 0.46, 1.0, 1.0, 1.0],
  [55, -42, 4.0, 0.52, 1.0, 1.0, 1.0], // Frigoris
  [57, -33, 3.6, 0.52, 1.0, 1.0, 1.0],
  [58, -24, 4.4, 0.52, 1.0, 1.0, 1.0],
  [56, -14, 3.4, 0.53, 1.0, 1.0, 1.0],
  [57, -5, 3.9, 0.52, 1.0, 1.0, 1.0],
  [59, 5, 3.3, 0.53, 1.0, 1.0, 1.0],
  [57, 14, 3.8, 0.53, 1.0, 1.0, 1.0],
  [55, 24, 3.0, 0.54, 1.0, 1.0, 1.0],
  [53, -52, 3.2, 0.52, 1.0, 1.0, 1.0],
  [14, 5, 3.6, 0.47, 1.0, 1.0, 1.0], // Vaporum
  [17, 9, 3.2, 0.47, 1.0, 1.0, 1.0],
  [2, 1, 2.2, 0.48, 1.0, 1.0, 1.0], // Sinus Medii
  [4, -5, 2.4, 0.48, 1.0, 1.0, 1.0],
  [11, -8, 4, 0.47, 1.0, 1.0, 1.0], // Sinus Aestuum
  [45, -31, 4, 0.46, 1.0, 1.0, 1.0], // Sinus Iridum
  [38, 29, 5, 0.5, 1.0, 1.0, 1.0], // Lacus Somniorum
  [1, 65, 2.6, 0.45, 1.0, 1.0, 1.0], // Spumans
  [7, 69, 2.6, 0.45, 1.0, 1.0, 1.0], // Undarum
  [-1, 86, 4, 0.47, 1.0, 1.0, 1.0], // Smythii
  [13, 86, 3.5, 0.47, 1.0, 1.0, 1.0], // Marginis
  [57, 81, 3.4, 0.47, 1.0, 1.0, 1.0], // Humboldtianum
  [-5, -68, 2.4, 0.36, 1.0, 1.0, 1.0], // Grimaldi
  [51.6, -9.4, 1.5, 0.38, 1.0, 1.0, 1.0], // Plato
].map(([lat, lon, r, alb, tr, tg, tb]) => ({ c: sel(lat, lon), r: r * DEG, alb, tint: [tr, tg, tb] }))

// ---- bright young craters and their ray systems: [lat, lon, radius deg, brightness, ray count, ray length rad]
export const RAYED = [
  [-43.3, -11.2, 0.75, 0.5, 24, 0.8], // Tycho
  [9.6, -20.1, 0.85, 0.24, 14, 0.32], // Copernicus
  [8.1, -38, 0.5, 0.22, 10, 0.2], // Kepler
  [23.7, -47.4, 0.45, 0.4, 7, 0.12], // Aristarchus
  [16.1, 46.8, 0.4, 0.26, 7, 0.22], // Proclus
  [-32.5, 54.2, 0.4, 0.22, 6, 0.14], // Stevinus
  [-8.9, 61.1, 0.7, 0.12, 4, 0.08], // Langrenus
  [73, -10, 0.5, 0.2, 8, 0.25], // Anaxagoras
  [16.3, 16, 0.35, 0.2, 4, 0.08], // Menelaus
  [-0.4, 32.7, 0.25, 0.26, 4, 0.06], // Censorinus
  [-24.5, -63.9, 0.3, 0.22, 6, 0.12], // Byrgius A
  [8, -77, 0.35, 0.2, 6, 0.16], // Olbers A
  [61.8, 50.3, 0.35, 0.18, 5, 0.1], // Thales
  [-21, 6, 0.3, 0.14, 4, 0.08], // Werner-ish highland spot
]

export function buildMoonTexture(size = 768, DISK = 0.47) {
  const rand = mulberry32(0x5eed1e)
  const N = size * size
  const albedo = new Float32Array(N * 3)
  const height = new Float32Array(N)
  const half = size / 2
  const Rpx = size * DISK

  // Disk coordinates of a texture pixel (clamped to the limb outside the disk).
  const nrm = new Float32Array(N * 3)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let dx = (x + 0.5 - half) / Rpx
      let dy = -(y + 0.5 - half) / Rpx
      const r = Math.hypot(dx, dy)
      if (r > 0.9995) {
        dx *= 0.9995 / r
        dy *= 0.9995 / r
      }
      const i = (y * size + x) * 3
      nrm[i] = dx
      nrm[i + 1] = dy
      nrm[i + 2] = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy))
    }

  // Maria as a metaball field: soft gaussian basins summed, then cut by a
  // noisy threshold, so neighbouring basins merge into one organic shoreline.
  const mareField = (nx, ny, nz) => {
    // Probabilistic union: overlapping basins merge, an isolated one keeps its own size.
    let keep = 1
    let f = 0
    let ma = 0
    const t = [0, 0, 0]
    for (const M of MARIA) {
      const d = Math.hypot(nx - M.c[0], ny - M.c[1], nz - M.c[2]) / (M.r * 1.08)
      if (d > 2.6) continue
      const w = Math.exp(-d * d * 1.1)
      keep *= 1 - w
      f += w
      ma += M.alb * w
      t[0] += M.tint[0] * w
      t[1] += M.tint[1] * w
      t[2] += M.tint[2] * w
    }
    return { f: 1 - keep, alb: f > 0 ? ma / f : 0.45, tint: f > 0 ? [t[0] / f, t[1] / f, t[2] / f] : [1, 1, 1] }
  }
  const shoreNoise = (nx, ny, nz) =>
    (fbm3(nx * 3.5 + 3.1, ny * 3.5, nz * 3.5, 3) - 0.5) * 0.3 + (fbm3(nx * 13, ny * 13 + 2.2, nz * 13, 3) - 0.5) * 0.24 + (fbm3(nx * 40, ny * 40, nz * 40 + 1.7, 2) - 0.5) * 0.1
  const mareCover = (nx, ny, nz, f) => smooth(0.55, 0.64, f + shoreNoise(nx, ny, nz))
  const mareAt = (n) => mareCover(n[0], n[1], n[2], mareField(n[0], n[1], n[2]).f)

  // ---- base albedo: mottled highlands, maria of lava flows of different ages
  for (let p = 0; p < N; p++) {
    const i = p * 3
    const nx = nrm[i]
    const ny = nrm[i + 1]
    const nz = nrm[i + 2]
    const mott = fbm3(nx * 3, ny * 3, nz * 3, 5)
    const blot = fbm3(nx * 8 + 11, ny * 8, nz * 8, 4)
    const fine = fbm3(nx * 40, ny * 40, nz * 40, 3)
    // The southern uplands are brighter and rougher than the north.
    let hl = 0.7 + (mott - 0.5) * 0.26 + (blot - 0.5) * 0.2 + (fine - 0.5) * 0.08 + 0.04 * smooth(0.0, -0.7, ny)
    const M = mareField(nx, ny, nz)
    const cover = mareCover(nx, ny, nz, M.f)
    // Darker mare margins and a lighter, younger centre where the basin is deep.
    const flow = fbm3(nx * 6 + 7.7, ny * 6, nz * 6, 4)
    const depthTone = smooth(0.7, 0.98, M.f)
    const alb = M.alb * 0.66 + (flow - 0.5) * 0.16 + (blot - 0.5) * 0.06 + (fine - 0.5) * 0.03 + 0.03 * depthTone
    // A few percent of the highland tone survives at the shore (ejecta mixed in).
    const m = cover * (0.9 + 0.1 * smooth(0.62, 0.95, M.f + shoreNoise(nx, ny, nz)))
    albedo[i] = hl + (alb * M.tint[0] - hl) * m
    albedo[i + 1] = hl + (alb * M.tint[1] - hl) * m
    albedo[i + 2] = hl + (alb * M.tint[2] - hl) * m
  }

  // ---- craters, rasterised over their own bounding boxes
  const toPx = (c) => [half + c[0] * Rpx, half - c[1] * Rpx]
  function crater(c, rho, fresh, depth) {
    if (c[2] < -0.05) return
    const [cx, cy] = toPx(c)
    const ext = rho * 3.2 * Rpx + 2
    const x0 = Math.max(0, Math.floor(cx - ext))
    const x1 = Math.min(size - 1, Math.ceil(cx + ext))
    const y0 = Math.max(0, Math.floor(cy - ext))
    const y1 = Math.min(size - 1, Math.ceil(cy + ext))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const p = y * size + x
        const i = p * 3
        const d = Math.hypot(nrm[i] - c[0], nrm[i + 1] - c[1], nrm[i + 2] - c[2]) / rho
        if (d > 3.2) continue
        // Profile: bowl, raised rim, ejecta apron.
        let h
        if (d < 1) h = -depth * (1 - d * d) + depth * 0.25 * smooth(0.6, 1, d)
        else h = depth * 0.25 * Math.exp(-(d - 1) * 3.2)
        height[p] += h
        // Albedo at high sun: fresh craters wear bright ejecta, old ones a faint ring.
        // A fresh crater is a bright spot with a soft apron; an old one barely a stain.
        const rim = Math.exp(-((d - 1) * (d - 1)) / 0.05)
        const spot = Math.exp(-(d * d) / 1.4)
        const floor = smooth(1, 0.6, d)
        const dA = fresh * 0.22 * spot + (1 - fresh) * (0.012 * rim - 0.018 * floor)
        albedo[i] += dA
        albedo[i + 1] += dA
        albedo[i + 2] += dA
      }
  }

  const randomOnFace = () => {
    // Uniform on the sphere, kept to the visible hemisphere (plus a sliver past the limb).
    for (;;) {
      const z = rand() * 2 - 1
      const t = rand() * Math.PI * 2
      const s = Math.sqrt(1 - z * z)
      const v = [s * Math.cos(t), s * Math.sin(t), z]
      // Swap so z (toward Earth) is the free axis.
      const n = [v[0], v[2], v[1]]
      if (n[2] > -0.05) return n
    }
  }
  const sizes = [
    [70, 0.03, 0.075],
    [650, 0.011, 0.03],
    [4200, 0.0035, 0.011],
    [9000, 0.0016, 0.0035],
  ]
  for (const [count, r0, r1] of sizes)
    for (let k = 0; k < count; k++) {
      const c = randomOnFace()
      // Maria are young: few craters landed on them.
      if (mareAt(c) > 0.5 && rand() < 0.8) continue
      const rho = r0 * Math.pow(r1 / r0, rand())
      const fresh = rand() < 0.14 ? 0.3 + 0.7 * rand() : 0
      crater(c, rho, fresh, rho * (0.12 + 0.08 * rand()))
    }

  // ---- ray systems: long thin streaks along great circles
  for (const [lat, lon, rdeg, bright, rays, len] of RAYED) {
    const c = sel(lat, lon)
    const rho = rdeg * DEG
    crater(c, rho, 1, rho * 0.2)
    // Tangent frame at the crater.
    const up = Math.abs(c[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]
    const e1 = norm(cross(up, c))
    const e2 = cross(c, e1)
    const streaks = []
    for (let k = 0; k < rays; k++)
      streaks.push({ a: rand() * Math.PI * 2, w: 0.1 + rand() * 0.18, l: len * (0.35 + rand() * 0.9), s: 0.4 + rand() * 0.6 })
    const reach = len * 1.3
    const [cx, cy] = toPx(c)
    const ext = reach * Rpx + 2
    const x0 = Math.max(0, Math.floor(cx - ext))
    const x1 = Math.min(size - 1, Math.ceil(cx + ext))
    const y0 = Math.max(0, Math.floor(cy - ext))
    const y1 = Math.min(size - 1, Math.ceil(cy + ext))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = (y * size + x) * 3
        const n = [nrm[i], nrm[i + 1], nrm[i + 2]]
        const d = Math.hypot(n[0] - c[0], n[1] - c[1], n[2] - c[2])
        if (d > reach || d < 1e-5) continue
        const a = Math.atan2(dot(n, e2), dot(n, e1))
        let ray = 0
        for (const s of streaks) {
          let da = Math.abs(a - s.a)
          da = Math.min(da, Math.PI * 2 - da)
          // Streaks widen a little and fray with distance.
          const w = s.w * (0.7 + 0.6 * (d / s.l))
          ray += s.s * Math.exp(-(da * da) / (w * w)) * Math.exp(-d / s.l)
        }
        // Rays fray into streamers and start a little way out; a dark collar of impact melt hugs the crater.
        const fray = Math.max(0, fbm3(n[0] * 45, n[1] * 45, n[2] * 45, 3) * 1.6 - 0.45)
        const dd = d / rho
        const collar = Math.exp(-((dd - 1.9) * (dd - 1.9)) / 0.5)
        const fade = smooth(reach, reach * 0.6, d)
        const dA = fade * bright * (ray * 1.3 * fray * smooth(rho * 3, rho * 14, d) + 0.35 * smooth(1.15, 0.4, dd) + 0.12 * Math.exp(-dd / 6)) - 0.05 * collar * bright * 4
        albedo[i] += dA
        albedo[i + 1] += dA
        albedo[i + 2] += dA * 1.01
      }
  }

  // ---- shading: Lommel-Seeliger, sun 6 degrees east of the line of sight
  const alpha = 6 * DEG
  const sun = [Math.sin(alpha), 0.02, Math.cos(alpha)]
  const out = new Float32Array(N * 3)
  const k = 0.45 * Rpx // height units (disk radii) -> slope per pixel
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const p = y * size + x
      const i = p * 3
      const hx = (height[y * size + Math.min(size - 1, x + 1)] - height[y * size + Math.max(0, x - 1)]) * 0.5 * k
      const hy = (height[Math.max(0, y - 1) * size + x] - height[Math.min(size - 1, y + 1) * size + x]) * 0.5 * k
      const n = norm([nrm[i] - hx, nrm[i + 1] - hy, nrm[i + 2] + 1e-4])
      const mu0 = Math.max(0, dot(n, sun))
      const mu = Math.max(0.02, n[2])
      // Lommel-Seeliger keeps the full moon flat almost to the limb (no Lambert falloff).
      const shade = (2 * mu0) / (mu0 + mu)
      for (let ch = 0; ch < 3; ch++) out[i + ch] = Math.max(0, albedo[i + ch] * shade)
    }

  // Regolith grain, finer than any feature.
  for (let p = 0; p < N; p++) {
    const g = 1 + (rand() - 0.5) * 0.035
    out[p * 3] *= g
    out[p * 3 + 1] *= g
    out[p * 3 + 2] *= g
  }
  return { data: out, size, disk: DISK }
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
