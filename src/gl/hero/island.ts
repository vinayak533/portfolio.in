import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Procedural floating island (all geometry generated here, no assets).
 * Local frame: the plateau top sits at y = 0, broken rock hangs below it.
 * Rock is a displaced, flat-shaded grid (rugged facets, blocky fracture lines,
 * vertical ridges, a jagged underside) coloured per vertex; the top is a soft
 * mound that the instanced grass grows on.
 */

export function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ------------------------------------------------------------------ noise

function hash3(x: number, y: number, z: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683) + Math.imul(seed, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const fade = (t: number) => t * t * (3 - 2 * t)

/** Smooth 3D value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const w = fade(z - zi)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}

export function fbm3(x: number, y: number, z: number, seed = 0, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += noise3(x, y, z, seed + o * 17) * amp
    norm += amp
    x *= 2.03
    y *= 2.03
    z *= 2.03
    amp *= 0.5
  }
  return sum / norm
}

// ------------------------------------------------------------------ shape

const lin = (hex: string) => new Color(hex)

export const RADIUS = 3.3
const SEG = 128

/** Plateau outline radius at angle a: a lumpy, irregular disc. */
export const outline = (a: number) =>
  RADIUS * (1 + 0.08 * Math.sin(3 * a + 1.3) + 0.06 * Math.sin(5 * a + 0.4) + 0.035 * Math.sin(9 * a + 2.1) + 0.02 * Math.sin(17 * a + 0.7))

/** Plateau height: a soft mound with gentle undulation. */
export function topHeight(x: number, z: number) {
  const r = Math.hypot(x, z) / RADIUS
  return 0.24 * (1 - r * r) + 0.05 * Math.sin(x * 2.1 + 0.4) * Math.cos(z * 1.7) + 0.03 * Math.sin(x * 4.3 - z * 3.1)
}

/** Cliff profile below the turf lip: [radius factor, depth]. Steep and blocky up top, ragged below. */
const PROFILE: [number, number][] = [
  [1.035, -0.12],
  [1.02, -0.38],
  [0.99, -0.72],
  [0.955, -1.08],
  [0.9, -1.46],
  [0.83, -1.86],
  [0.74, -2.26],
  [0.63, -2.66],
  [0.51, -3.04],
  [0.39, -3.4],
  [0.27, -3.74],
  [0.16, -4.04],
  [0.07, -4.3],
]

export function islandGeometry(seed = 3) {
  const rand = mulberry32(seed)
  const topRings = 18
  const rings = topRings + PROFILE.length
  const pos = new Float32Array((1 + rings * SEG + 1) * 3)
  const col = new Float32Array(pos.length)

  const soil = lin('#0e140b')
  const soilLit = lin('#1c2612')
  const moss = lin('#1e2716')
  const rock = lin('#5e5a52')
  const rockLight = lin('#8c867b')
  const rockDeep = lin('#24252a')

  // Fracture blocks: the cliff breaks into a dozen slabs with sharp-ish seams.
  const BLOCKS = 13
  const blockOff = Array.from({ length: BLOCKS }, () => rand())
  const blockAt = (a: number) => {
    const s = ((a / (Math.PI * 2)) * BLOCKS + BLOCKS) % BLOCKS
    const i = Math.floor(s)
    const f = s - i
    const k = fade(Math.max(0, (f - 0.78) / 0.22))
    return blockOff[i] + (blockOff[(i + 1) % BLOCKS] - blockOff[i]) * k
  }

  let v = 0
  const put = (x: number, y: number, z: number, c: Color) => {
    pos.set([x, y, z], v * 3)
    col.set([c.r, c.g, c.b], v * 3)
    v++
  }
  const tmp = new Color()

  // Centre vertex.
  put(0, topHeight(0, 0), 0, soil)

  // Plateau rings (centre -> rim).
  for (let k = 1; k <= topRings; k++) {
    const f = k / topRings
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2
      const r = outline(a) * f * (k === topRings ? 1 : 1 + (rand() - 0.5) * 0.03)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const n = fbm3(x * 0.9, 0, z * 0.9, 5, 3)
      const y = topHeight(x, z) + (n - 0.5) * 0.08 - (k === topRings ? 0.03 : 0)
      put(x, y, z, tmp.copy(soil).lerp(soilLit, n))
    }
  }

  // Cliff rings.
  PROFILE.forEach(([pf, py], j) => {
    const depth = j / (PROFILE.length - 1)
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const ridges = fbm3(ca * 4.2, py * 0.45, sa * 4.2, 11, 4)
      const block = blockAt(a)
      const strata = Math.sin(py * 6.2 + ridges * 4) * 0.025
      const r =
        outline(a) * pf * (1 + (ridges - 0.5) * (0.22 + depth * 0.25) + (block - 0.5) * 0.14 * (0.4 + depth)) + strata + (rand() - 0.5) * 0.05
      // Ragged underside: the deeper rings hang in uneven teeth. Same noise per
      // angle, growing with depth, so rings never fold over each other.
      const teeth = -Math.max(0, fbm3(ca * 2.4, 3.1, sa * 2.4, 23, 3) - 0.38) * 2.2 * depth * depth
      const y = py + (rand() - 0.5) * 0.16 + teeth - (block - 0.5) * 0.2 * depth
      // Colour: moss under the lip, charcoal stone, lighter on protruding slabs, darker deep down.
      const relief = Math.max(0, ridges - 0.45) * 2
      tmp.copy(rock).lerp(rockLight, relief * 0.6 + (block - 0.5) * 0.25).lerp(rockDeep, depth * 0.7)
      if (j < 2) tmp.lerp(moss, (1 - j / 2) * (0.6 + 0.4 * fbm3(ca * 6, py, sa * 6, 31, 2)))
      if (j === 0) tmp.lerp(soil, 0.7)
      put(ca * r, y, sa * r, tmp)
    }
  })

  // Tip.
  put(0.15, -4.75, -0.1, rockDeep)

  const index: number[] = []
  const ring = (k: number, s: number) => 1 + k * SEG + (s % SEG)
  for (let s = 0; s < SEG; s++) index.push(0, ring(0, s + 1), ring(0, s))
  for (let k = 0; k < rings - 1; k++) {
    for (let s = 0; s < SEG; s++) {
      const a = ring(k, s)
      const b = ring(k, s + 1)
      const c = ring(k + 1, s)
      const d = ring(k + 1, s + 1)
      index.push(a, b, c, b, d, c)
    }
  }
  const tip = v - 1
  for (let s = 0; s < SEG; s++) index.push(ring(rings - 1, s), ring(rings - 1, s + 1), tip)

  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** Paint a whole geometry one colour (for merged parts). */
function painted(g: BufferGeometry, c: Color) {
  const geo = g.index ? g.toNonIndexed() : g
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3)
  geo.setAttribute('color', new BufferAttribute(arr, 3))
  geo.deleteAttribute('uv')
  return geo
}

/** Rotate (Y, then X, then Z), scale, then move a geometry in place. */
function placed(g: BufferGeometry, p: Vector3, rot = new Vector3(), scale = new Vector3(1, 1, 1)) {
  const q = new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), rot.y)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), rot.x))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rot.z))
  return g.applyMatrix4(new Matrix4().compose(p, q, scale))
}

/** A chunk of broken, mossy rock: flat-ish top, jagged underside. */
export function rockChunk(radius: number, seed: number) {
  const g = new IcosahedronGeometry(radius, 3)
  const p = g.attributes.position
  const col = new Float32Array(p.count * 3)
  const mossTop = lin('#24301a')
  const stone = lin('#2b2a26')
  const deep = lin('#111214')
  const tmp = new Color()
  const v = new Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const n = fbm3(v.x * 3 / radius, v.y * 3 / radius, v.z * 3 / radius, seed, 3)
    v.multiplyScalar(1 + (n - 0.5) * 0.55)
    if (v.y > 0) v.y *= 0.5
    else v.y *= 1.9 + (n - 0.5) * 0.9
    p.setXYZ(i, v.x, v.y, v.z)
    const up = v.y > -radius * 0.08
    tmp.copy(stone).lerp(deep, Math.min(1, -v.y / (radius * 1.6)))
    if (up) tmp.copy(mossTop).lerp(stone, n * 0.4)
    col.set([tmp.r, tmp.g, tmp.b], i * 3)
  }
  g.setAttribute('color', new BufferAttribute(col, 3))
  g.deleteAttribute('uv')
  g.computeVertexNormals()
  return g
}

/** Roots and vines hanging from the cliff, plus a few clinging stones, merged into one mesh. */
export function hangingGeometry(seed = 8) {
  const rand = mulberry32(seed)
  const parts: BufferGeometry[] = []
  const root = lin('#1a1810')
  const leaf = lin('#1d2a12')
  const stone = lin('#26251f')

  for (let i = 0; i < 16; i++) {
    // Mostly on the camera-facing left flank, a few elsewhere.
    const a = i < 11 ? Math.PI * (0.48 + rand() * 0.55) : rand() * Math.PI * 2
    const j = Math.floor(1 + rand() * 3)
    const [pf, py] = PROFILE[j]
    const r = outline(a) * pf * 0.98
    const start = new Vector3(Math.cos(a) * r, py + 0.05, Math.sin(a) * r)
    const out = new Vector3(Math.cos(a), 0, Math.sin(a))
    const len = 0.35 + rand() * 0.8
    const pts: Vector3[] = []
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      pts.push(
        start
          .clone()
          .addScaledVector(out, Math.sin(t * 1.6) * 0.18 + t * 0.06)
          .add(new Vector3(Math.sin(t * 5 + i) * 0.04, -t * len, Math.cos(t * 4 + i) * 0.04)),
      )
    }
    const curve = new CatmullRomCurve3(pts)
    parts.push(painted(new TubeGeometry(curve, 16, 0.007 + rand() * 0.012, 4, false), root))
    // A few leaves on the longer vines.
    const leaves = len > 0.6 ? 2 + Math.floor(rand() * 3) : 0
    for (let k = 0; k < leaves; k++) {
      const p = curve.getPoint(0.3 + rand() * 0.65)
      const l = painted(new IcosahedronGeometry(0.03 + rand() * 0.02, 0), leaf)
      placed(l, p, new Vector3(rand() * 3, rand() * 3, rand() * 3), new Vector3(1, 0.25, 1.6))
      parts.push(l)
    }
  }

  // Stones about to come loose from the underside.
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2
    const [pf, py] = PROFILE[6 + Math.floor(rand() * 5)]
    const r = outline(a) * pf * 0.95
    const b = painted(new IcosahedronGeometry(0.1 + rand() * 0.12, 1), stone)
    placed(b, new Vector3(Math.cos(a) * r, py - 0.15, Math.sin(a) * r), new Vector3(rand(), rand() * 3, rand()), new Vector3(1, 1.4, 1))
    parts.push(b)
  }
  return mergeGeometries(parts, false)!
}

// ------------------------------------------------------------------ grass

/**
 * Instance data for the grass: aRoot = (x, y, z, rim 0..1), aParams =
 * (height, width, facing yaw, seed). Dense, clumped, longer and drooping at the
 * rim, and kept clear of the seated figure's body.
 */
export function grassInstances(count: number, clear: { x: number; z: number; r: number }) {
  const rand = mulberry32(5)
  const root = new Float32Array(count * 4)
  const params = new Float32Array(count * 4)
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 4) {
    const a = rand() * Math.PI * 2
    const edge = outline(a)
    const f = Math.sqrt(rand()) * 1.0
    const r = edge * f * 0.995
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const dc = Math.hypot(x - clear.x, z - clear.z)
    if (dc < clear.r) continue
    const clump = fbm3(x * 1.3, 0, z * 1.3, 41, 3)
    const rim = Math.max(0, Math.min(1, (f - 0.9) / 0.1))
    // Sparse bald patches are rejected rather than shortened, so the cover stays natural.
    if (clump < 0.3 && rand() < 0.5) continue
    const h = (0.22 + rand() * 0.22) * (0.62 + clump * 0.85) * (1 + rim * 0.15) * (dc < 0.55 ? 0.85 : 1)
    const w = 0.02 + rand() * 0.02
    root.set([x, topHeight(x, z) - 0.035 - rim * 0.05, z, rim], placed * 4)
    params.set([h, w, rand() * Math.PI * 2, rand()], placed * 4)
    placed++
  }
  return { root: root.subarray(0, placed * 4), params: params.subarray(0, placed * 4), count: placed }
}

/** Blade template: (side -1..1, t 0..1) per vertex, `segments` rows plus a tip. */
export function bladeGeometry(segments: number) {
  const pos: number[] = []
  const index: number[] = []
  for (let i = 0; i < segments; i++) {
    const t = i / segments
    pos.push(-1, t, 0, 1, t, 0)
  }
  pos.push(0, 1, 0)
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const last = (segments - 1) * 2
  index.push(last, last + 1, segments * 2)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(index)
  return g
}

// ------------------------------------------------------------------ figure

/** A tapered limb (cylinder with rounded ends) between two points. */
function taper(a: Vector3, b: Vector3, ra: number, rb: number, c: Color, radial = 14) {
  const d = b.clone().sub(a)
  const len = d.length()
  const cyl = new CylinderGeometry(rb, ra, len, radial, 4, true)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize())
  cyl.applyMatrix4(new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1)))
  const capA = new SphereGeometry(ra, radial, 10).translate(a.x, a.y, a.z)
  const capB = new SphereGeometry(rb, radial, 10).translate(b.x, b.y, b.z)
  return [painted(cyl, c), painted(capA, c), painted(capB, c)]
}

/**
 * Lofted body: elliptical rings swept along a curve, smoothly joined. Gives a
 * believable torso silhouette (waist, chest, sloping shoulders, rounded back)
 * that primitive stacks cannot. Rings: [t along curve, half width, half depth, back bulge].
 */
function loft(curve: CatmullRomCurve3, rings: [number, number, number, number][], c: Color, radial = 28, folds = 0) {
  const pos: number[] = []
  const index: number[] = []
  const up = new Vector3()
  const side = new Vector3(1, 0, 0)
  const fwd = new Vector3()
  rings.forEach(([t, a, b, bulge], k) => {
    const p = curve.getPointAt(t)
    up.copy(curve.getTangentAt(t))
    fwd.crossVectors(side, up).normalize()
    for (let s = 0; s < radial; s++) {
      const ang = (s / radial) * Math.PI * 2
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      // sa > 0 faces forward (+z); the back (sa < 0) gets an extra round.
      const depth = b * (sa < 0 ? 1 + bulge * Math.pow(-sa, 1.5) : 1)
      const wob = folds ? 1 + folds * Math.sin(ang * 5 + k * 1.7) * Math.sin(k * 2.3 + ang) : 1
      const x = ca * a * wob
      const zz = sa * depth * wob
      pos.push(p.x + side.x * x + fwd.x * zz, p.y + side.y * x + fwd.y * zz, p.z + side.z * x + fwd.z * zz)
    }
  })
  const n = rings.length
  for (let k = 0; k < n - 1; k++) {
    for (let s = 0; s < radial; s++) {
      const a = k * radial + s
      const b = k * radial + ((s + 1) % radial)
      const c2 = (k + 1) * radial + s
      const d = (k + 1) * radial + ((s + 1) % radial)
      index.push(a, c2, b, b, c2, d)
    }
  }
  // Cap the bottom ring.
  const bottom = curve.getPointAt(rings[0][0])
  const ci = pos.length / 3
  pos.push(bottom.x, bottom.y, bottom.z)
  for (let s = 0; s < radial; s++) index.push(ci, s, (s + 1) % radial)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return painted(g, c)
}

/** Head: an ellipsoid shaped into skull, brow, jaw and chin. Head space: +z face, y up. */
function headGeometry(skin: Color) {
  const g = new SphereGeometry(1, 40, 30)
  const p = g.attributes.position
  const v = new Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    let { x, y, z } = v
    // Narrow jaw and chin toward the bottom front, fuller cranium at the back.
    const low = Math.max(0, -y)
    x *= 1 - low * 0.32
    z *= 1 - low * 0.12 * (z < 0 ? 2.2 : 0.4)
    if (z > 0 && y < -0.25) z += (y + 0.25) * -0.15 * z
    if (z < 0) z *= 1.08
    // Brow ridge and a hint of a nose.
    if (z > 0.6 && Math.abs(x) < 0.5 && y > 0.05 && y < 0.3) z += 0.03
    if (z > 0.75 && Math.abs(x) < 0.16 && y > -0.35 && y < 0.05) z += 0.09 * (1 - Math.abs(x) / 0.16)
    p.setXYZ(i, x * 0.074, y * 0.112, z * 0.094)
  }
  g.computeVertexNormals()
  return painted(g, skin)
}

/** Short, slightly unruly hair: a displaced shell over the skull, tucked inside the head below the hairline. */
function hairGeometry(hair: Color) {
  const g = new SphereGeometry(1, 40, 30)
  const p = g.attributes.position
  const v = new Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const { x, y, z } = v
    const n = fbm3(x * 3.2, y * 3.2, z * 3.2, 77, 3)
    // Hairline: high on the forehead, over the ears, down to the nape.
    const line = z > 0.35 ? 0.42 - (z - 0.35) * 0.2 : Math.abs(x) > 0.7 && z > -0.3 ? 0.12 : -0.42
    const covered = y > line + (n - 0.5) * 0.12
    const r = covered ? 1.06 + (n - 0.5) * 0.12 + Math.max(0, y) * 0.04 : 0.62
    p.setXYZ(i, x * 0.074 * r, y * 0.112 * r, z * 0.094 * r * (z < 0 ? 1.08 : 1))
  }
  g.computeVertexNormals()
  return painted(g, hair)
}

/**
 * The figure, seated cross-legged and hunched over the laptop on their lap.
 * Built at real-world scale in metres (seated height ~0.92 m) with adult
 * proportions; scaled into the scene by FIGURE_SCALE. Figure space: +z is the
 * way they face, y = 0 is the ground. Returns the body (vertex coloured), the
 * screen pose and two spheres approximating the body for grass shadows.
 */
export function figureGeometry() {
  const jacket = lin('#1a1e26')
  const trousers = lin('#121418')
  const skin = lin('#8c654f')
  const hair = lin('#0c0a09')
  const shoe = lin('#16171a')
  const sole = lin('#55575c')
  const alu = lin('#4a4d53')
  const parts: BufferGeometry[] = []
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z)
  const ball = (r: number, c: Color, p: Vector3, s = V(1, 1, 1), rot = V(0, 0, 0)) => {
    const g = painted(new SphereGeometry(r, 18, 14), c)
    placed(g, p, rot, s)
    parts.push(g)
  }

  // Seat: pelvis and the rounded mass of the hips on the ground.
  ball(0.17, trousers, V(0, 0.1, -0.03), V(1.06, 0.62, 0.95))

  // Legs, crossed: thighs out to the knees, shins folding back in across each other.
  const hipL = V(-0.1, 0.1, 0.02)
  const hipR = V(0.1, 0.1, 0.02)
  const kneeL = V(-0.37, 0.115, 0.3)
  const kneeR = V(0.37, 0.12, 0.29)
  const ankleL = V(0.13, 0.075, 0.43)
  const ankleR = V(-0.12, 0.1, 0.38)
  parts.push(...taper(hipL, kneeL, 0.082, 0.058, trousers))
  parts.push(...taper(hipR, kneeR, 0.082, 0.058, trousers))
  parts.push(...taper(kneeL, ankleL, 0.054, 0.038, trousers))
  parts.push(...taper(kneeR, ankleR, 0.054, 0.038, trousers))
  // Shoes pointing out past the opposite knee.
  ball(0.045, shoe, V(0.21, 0.07, 0.44), V(2.2, 0.95, 1.05), V(0, 0.35, 0))
  ball(0.045, shoe, V(-0.2, 0.095, 0.4), V(2.2, 0.95, 1.05), V(0, -0.35, 0))
  ball(0.03, sole, V(0.24, 0.05, 0.44), V(2.6, 0.5, 1.3), V(0, 0.35, 0))
  ball(0.03, sole, V(-0.23, 0.075, 0.4), V(2.6, 0.5, 1.3), V(0, -0.35, 0))

  // Torso: a jacket lofted along a spine that curves forward over the screen.
  const spine = new CatmullRomCurve3([V(0, 0.1, -0.05), V(0, 0.28, -0.04), V(0, 0.44, 0.02), V(0, 0.57, 0.1), V(0, 0.64, 0.15)])
  parts.push(
    loft(
      spine,
      [
        [0.0, 0.165, 0.125, 0.05],
        [0.12, 0.165, 0.122, 0.08],
        [0.3, 0.152, 0.112, 0.12],
        [0.48, 0.165, 0.118, 0.18],
        [0.64, 0.19, 0.122, 0.22],
        [0.78, 0.205, 0.118, 0.22],
        [0.88, 0.19, 0.105, 0.2],
        [0.95, 0.12, 0.085, 0.12],
        [1.0, 0.07, 0.065, 0.05],
      ],
      jacket,
      32,
      0.018,
    ),
  )
  // Shoulders and a soft collar.
  ball(0.068, jacket, V(-0.2, 0.555, 0.1), V(1, 0.9, 1.05))
  ball(0.068, jacket, V(0.2, 0.555, 0.1), V(1, 0.9, 1.05))
  ball(0.075, jacket, V(0, 0.625, 0.125), V(1.15, 0.45, 1.05), V(-0.5, 0, 0))

  // Neck and head, bowed toward the screen.
  parts.push(...taper(V(0, 0.61, 0.14), V(0, 0.7, 0.18), 0.052, 0.047, skin))
  const head = headGeometry(skin)
  const hairShell = hairGeometry(hair)
  const headPos = V(0, 0.795, 0.215)
  const headRot = V(0.36, 0, 0)
  placed(head, headPos, headRot)
  placed(hairShell, headPos, headRot)
  parts.push(head, hairShell)
  ball(0.022, skin, V(-0.074, 0.79, 0.2), V(0.5, 1.25, 0.9))
  ball(0.022, skin, V(0.074, 0.79, 0.2), V(0.5, 1.25, 0.9))

  // Arms: upper arms hanging forward, forearms reaching to the keyboard.
  const shL = V(-0.205, 0.54, 0.1)
  const shR = V(0.205, 0.54, 0.1)
  const elL = V(-0.25, 0.33, 0.24)
  const elR = V(0.25, 0.33, 0.24)
  const wrL = V(-0.115, 0.255, 0.4)
  const wrR = V(0.115, 0.255, 0.4)
  parts.push(...taper(shL, elL, 0.055, 0.045, jacket))
  parts.push(...taper(shR, elR, 0.055, 0.045, jacket))
  parts.push(...taper(elL, wrL, 0.044, 0.034, jacket))
  parts.push(...taper(elR, wrR, 0.044, 0.034, jacket))
  ball(0.026, skin, V(-0.1, 0.246, 0.44), V(1.35, 0.6, 1.9), V(0, -0.2, 0))
  ball(0.026, skin, V(0.1, 0.246, 0.44), V(1.35, 0.6, 1.9), V(0, 0.2, 0))

  // Laptop on the lap: thin base, lid tipped back.
  const tilt = 0.27
  const hinge = V(0, 0.24, 0.545)
  const base = painted(new BoxGeometry(0.32, 0.016, 0.22), alu)
  placed(base, V(0, 0.232, 0.435))
  parts.push(base)
  const lidCentre = hinge.clone().add(V(0, Math.cos(tilt) * 0.105, Math.sin(tilt) * 0.105))
  const lid = painted(new BoxGeometry(0.32, 0.21, 0.007), alu)
  placed(lid, lidCentre, V(tilt, 0, 0))
  parts.push(lid)

  const normal = V(0, Math.sin(tilt), -Math.cos(tilt))
  return {
    body: mergeGeometries(parts, false)!,
    /** Screen quad pose in figure space (faces the figure). */
    screen: { position: lidCentre.clone().addScaledVector(normal, 0.0045), tilt, size: [0.27, 0.17] as [number, number] },
    /** Torso and head as spheres (figure space): centre xyz, radius. */
    occluders: [
      [0, 0.38, 0.04, 0.2],
      [0, 0.79, 0.21, 0.11],
    ] as [number, number, number, number][],
  }
}

/** Where the figure sits (island space) and how big they are. */
export const figureSpot = new Vector3(0.05, topHeight(0.05, 0.9), 0.9)
export const FIGURE_SCALE = 0.9
