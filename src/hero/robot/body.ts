/**
 * The robot's body, fully articulated so it can sit at its desk, stand up and
 * move about (model.ts adds the head, untouched, at the neck; perform.ts poses
 * it every frame). Precision hardware, not a toy: matte ceramic plates over an
 * exposed graphite inner frame, with violet light as the only life.
 *
 *   torso     a tapered, forward-leaning shell split into three ceramic plates
 *             (chest, two flanks) with hairline gaps onto the graphite core; a
 *             faint violet line runs in each gap
 *   chest     a rounded-rect field of 99 perforations over a violet core that
 *             breathes (6 s) and brightens on each beat (perform.ts drives it)
 *   collar    a short graphite ring with a violet inner glow under the head
 *   shoulders ceramic pods, each with a small dot vent, over graphite ball joints
 *   arms      ceramic shells over graphite sleeves; a braided cable bundle runs
 *             inside the forearm into a wrist hub ringed in violet
 *   hands     slim and articulated: three fingers and a thumb, two segments
 *             each, graphite knuckles and ceramic tips
 *   legs      ceramic thighs with graphite knee hubs, tapered shins, soft
 *             ceramic soles with a violet seam
 *   back      a dorsal spine of three stacked dot vents with a faint glow
 *
 * The hips are a group of their own (the pelvis, the waist and the torso ride
 * on them); the limbs are separate segment groups that perform.ts places with
 * two-bone solves, from the shoulders and hip joints to wherever the hands and
 * feet should be. Units and axes as model.ts: the stage at y = 0, facing +z;
 * everything here is in `body` space. The head's pivot sits at `rig.neck`
 * (torso space).
 */
import {
  AdditiveBlending,
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { blobGeometry, blobPatch, frontPanel, frontZ, seamGeometry, squircle, type Blob } from './shape'
import { createVent } from './dots'

export interface Kit {
  geo<G extends BufferGeometry>(g: G): G
  mat<M extends Material>(m: M): M
  tex<T extends Texture>(t: T): T
  /** Soft round falloff, for glow cards. */
  glow: Texture
}

export interface Finger {
  /** At the knuckle: rotation.x curls the finger. */
  base: Group
  /** At the middle joint: rotation.x curls the tip. */
  mid: Group
  /** The fingertip (for key hits). */
  tip: Object3D
  /** Resting curl (base, mid). */
  rest: [number, number]
}

export interface Arm {
  side: -1 | 1
  /** The shoulder joint, torso space. */
  shoulder: Vector3
  upper: Group
  fore: Group
  hand: Group
  /** Index, middle, ring, thumb. */
  fingers: Finger[]
}

export interface Leg {
  side: -1 | 1
  /** The hip joint, hips space. */
  hip: Vector3
  thigh: Group
  shin: Group
  /** At the ankle: turn it to aim the toes; rotation.x on `sole` lifts them (a tap). */
  foot: Group
  sole: Group
  toe: Object3D
}

export interface BodyRig {
  /** The pelvis: position it to sit, rise and shift weight; the torso rides on it. */
  hips: Group
  /** Pivots at the waist (hips space): rotation.x is the lean, scale the breath. */
  torso: Group
  /** Neck point (the head's pivot), torso space. */
  neck: Vector3
  /** The waist pivot's height in the hips. */
  waistY: number
  arms: Arm[]
  legs: Leg[]
  /** The chest core and the small vents (shoulders, spine): breath and beat. */
  vents: ShaderMaterial[]
  /** Glow cards in front of the chest core (fake bloom). */
  coreGlow: MeshBasicMaterial
  /** Wrist rings (violet emissive). */
  wristRings: MeshBasicMaterial
  /** All solid meshes (for shadows). */
  solids: Mesh[]
  /** Limb lengths, and the ankle's height over the sole. */
  upperLen: number
  foreLen: number
  thighLen: number
  shinLen: number
  ankleH: number
}

export const PALETTE = {
  shell: '#ece8ee',
  shade: '#bdb8d0',
  graphite: '#1a1726',
  accent: '#7c5cff',
  soft: '#a78bfa',
  glow: '#c4b5fd',
}

/** Torso shell (torso space: the waist pivot at the origin). */
const TORSO: Blob = { a: 0.305, b: 0.31, c: 0.205, e: 2.7, eTop: 3.4, eBottom: 2.3, taper: 0.24 }
const TORSO_Y = 0.33
/** The waist pivot above the pelvis's centre. */
const WAIST_Y = 0.175
const NECK = new Vector3(0, TORSO_Y + TORSO.b + 0.035, 0.0)
/** Plate gaps (radians), the chest plate's half width (azimuth) and the waist seam (polar). */
const GAP = 0.034
const CHEST_AZ = 0.86
const SEAM_TH = 2.3
/** Chest vent: centre height on the torso blob, half sizes. */
const VENT = { y: 0.07, w: 0.118, h: 0.09 }
const UPPER = 0.25
const FORE = 0.29
const THIGH = 0.31
const SHIN = 0.29
const ANKLE_H = 0.068

/** A procedural orange-peel normal map with faint scuffs (2 x 256 px tiles). */
function orangePeel(): { normal: Texture; rough: Texture } {
  const N = 256
  const h = new Float32Array(N * N)
  const rnd = (i: number, j: number) => {
    const s = Math.sin(((i + N) % N) * 12.9898 + ((j + N) % N) * 78.233) * 43758.5453
    return s - Math.floor(s)
  }
  // Two octaves of smoothed value noise, tiling.
  for (const [cell, amp] of [
    [8, 0.65],
    [3, 0.35],
  ] as const) {
    const n = N / cell
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const gx = x / cell
        const gy = y / cell
        const ix = Math.floor(gx)
        const iy = Math.floor(gy)
        let fx = gx - ix
        let fy = gy - iy
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        const v = (a: number, b: number) => rnd(a % n, b % n)
        const top = v(ix, iy) * (1 - fx) + v(ix + 1, iy) * fx
        const bot = v(ix, iy + 1) * (1 - fx) + v(ix + 1, iy + 1) * fx
        h[y * N + x] += (top * (1 - fy) + bot * fy) * amp
      }
    }
  }
  const mk = () => {
    const c = document.createElement('canvas')
    c.width = c.height = N
    return c
  }
  const nc = mk()
  const rc = mk()
  const ng = nc.getContext('2d')!
  const rg = rc.getContext('2d')!
  const nd = ng.createImageData(N, N)
  const rd = rg.createImageData(N, N)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const at = (i: number, j: number) => h[((j + N) % N) * N + ((i + N) % N)]
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2
      const l = Math.hypot(dx, dy, 1)
      const k = (y * N + x) * 4
      nd.data[k] = ((-dx / l) * 0.5 + 0.5) * 255
      nd.data[k + 1] = ((dy / l) * 0.5 + 0.5) * 255
      nd.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255
      nd.data[k + 3] = 255
      // Roughness: mostly even, with a few faint scuff streaks.
      const streak = Math.max(0, Math.sin(x * 0.11 + y * 0.037 + rnd(x >> 5, y >> 5) * 6) - 0.96) * 6
      const r = 0.92 + 0.08 * at(x, y) - 0.12 * streak
      rd.data[k] = rd.data[k + 1] = rd.data[k + 2] = Math.max(0, Math.min(255, r * 255))
      rd.data[k + 3] = 255
    }
  }
  ng.putImageData(nd, 0, 0)
  rg.putImageData(rd, 0, 0)
  const normal = new CanvasTexture(nc)
  const rough = new CanvasTexture(rc)
  for (const t of [normal, rough]) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(3, 3)
    t.anisotropy = 16
  }
  return { normal, rough }
}

const Y = new Vector3()
const Z = new Vector3()
const X = new Vector3()
const basis = new Matrix4()

/** Turns `o` so its local +Y runs along `up` and its +Z leans toward `hint`. */
export function orient(o: Object3D, up: Vector3, hint: Vector3) {
  Y.copy(up).normalize()
  Z.copy(hint).addScaledVector(Y, -hint.dot(Y))
  if (Z.lengthSq() < 1e-8) Z.set(0, 0, 1).addScaledVector(Y, -Y.z)
  Z.normalize()
  X.crossVectors(Y, Z)
  basis.makeBasis(X, Y, Z)
  o.quaternion.setFromRotationMatrix(basis)
}

const AB = new Vector3()
/** Places a segment group (geometry hanging along its local -Y) from a to b. */
export function span(o: Object3D, a: Vector3, b: Vector3, hint: Vector3) {
  o.position.copy(a)
  orient(o, AB.subVectors(a, b), hint)
}

/**
 * The body, built in steps (a generator: each `yield` is a point where the build may hand the main thread back,
 * engine.ts mountRobotAsync; buildRobot runs it straight through).
 */
export function* buildBody(kit: Kit, parent: Group): Generator<void, BodyRig> {
  const { geo, mat } = kit
  const solids: Mesh[] = []
  const peel = orangePeel()
  kit.tex(peel.normal)
  kit.tex(peel.rough)
  yield

  yield
  // ---- materials (the body's own: the head keeps its originals, model.ts)

  const ceramic = mat(
    new MeshPhysicalMaterial({
      color: PALETTE.shell,
      roughness: 0.44,
      roughnessMap: peel.rough,
      metalness: 0,
      normalMap: peel.normal,
      normalScale: new Vector2(0.09, 0.09),
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
      sheen: 0.18,
      sheenRoughness: 0.7,
      sheenColor: PALETTE.shade,
    }),
  )
  // Rubberised graphite for the frame, a harder satin graphite for hubs and bolts.
  const rubber = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.7, metalness: 0.08 }))
  const satin = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.42, metalness: 0.45 }))
  const recess = mat(new MeshStandardMaterial({ color: '#0b0916', roughness: 0.8, metalness: 0.1 }))
  const seamGlow = mat(new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }))
  const footSeam = mat(new MeshBasicMaterial({ color: PALETTE.soft, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false }))
  const wristRings = mat(new MeshBasicMaterial({ color: PALETTE.soft, toneMapped: false }))
  wristRings.color.multiplyScalar(1.6)
  const collarGlow = mat(new MeshBasicMaterial({ color: PALETTE.soft, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }))
  const coreGlow = mat(
    new MeshBasicMaterial({ map: kit.glow, color: PALETTE.accent, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  )

  const add = (g: BufferGeometry, m: Material, p: Object3D, x = 0, y = 0, z = 0, solid = true) => {
    const o = new Mesh(g, m)
    o.position.set(x, y, z)
    p.add(o)
    if (solid) solids.push(o)
    return o
  }

  /** A graphite hub: a short drum on `axis` (local), a recessed face and a ring of bolts on each side. */
  const hubCache = new Map<string, BufferGeometry[]>()
  function hub(p: Object3D, r: number, depth: number, axis: 'x' | 'y' | 'z', x = 0, y = 0, z = 0) {
    const key = `${r}:${depth}`
    let g = hubCache.get(key)
    if (!g) {
      g = [
        geo(new CylinderGeometry(r, r, depth, 32)),
        geo(new CylinderGeometry(r * 0.62, r * 0.62, depth + 0.004, 28)),
        geo(new CylinderGeometry(r * 0.09, r * 0.09, depth + 0.008, 8)),
      ]
      hubCache.set(key, g)
    }
    const o = new Group()
    o.position.set(x, y, z)
    if (axis === 'x') o.rotation.z = Math.PI / 2
    if (axis === 'z') o.rotation.x = Math.PI / 2
    p.add(o)
    add(g[0], satin, o)
    add(g[1], recess, o, 0, 0, 0, false)
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * Math.PI * 2
      add(g[2], satin, o, Math.cos(t) * r * 0.8, 0, Math.sin(t) * r * 0.8, false)
    }
    return o
  }

  /** A turned shell (lathe) along -Y: [radius, -y] pairs. */
  const lathe = (profile: [number, number][], segs = 28) => geo(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, -y)).reverse(), segs))

  yield
  // ---- pelvis, waist and the torso pivot (all riding on the hips)

  const hips = new Group()
  parent.add(hips)
  add(geo(blobGeometry({ a: 0.19, b: 0.095, c: 0.15, e: 2.6, eBottom: 3.4 }, 40, 24)), ceramic, hips)
  add(geo(blobGeometry({ a: 0.13, b: 0.075, c: 0.1, e: 2.4 }, 32, 18)), rubber, hips, 0, 0.135, 0.01)
  const ribGeo = geo(new TorusGeometry(0.124, 0.008, 8, 40))
  for (const y of [0.11, 0.145]) {
    yield
    const rib = add(ribGeo, satin, hips, 0, y, 0.0)
    rib.rotation.x = Math.PI / 2
    rib.scale.set(1, 0.8, 1)
  }
  hub(hips, 0.058, 0.05, 'x', -0.17, -0.03, 0.03)
  hub(hips, 0.058, 0.05, 'x', 0.17, -0.03, 0.03)

  const torso = new Group()
  torso.position.y = WAIST_Y
  hips.add(torso)
  const shell = new Group()
  shell.position.y = TORSO_Y
  torso.add(shell)

  // The graphite core, a touch smaller: what shows in the gaps and below the waist seam.
  const core: Blob = { ...TORSO, a: TORSO.a * 0.955, b: TORSO.b * 0.97, c: TORSO.c * 0.94 }
  add(geo(blobGeometry(core, 48, 32)), rubber, shell)
  // Three plates: the chest (with the vent), and two flanks meeting down the back.
  const plates = [
    blobPatch(TORSO, -CHEST_AZ, CHEST_AZ, 0.36, SEAM_TH, 40, 40),
    blobPatch(TORSO, CHEST_AZ + GAP, Math.PI - GAP / 2, 0.02, SEAM_TH, 40, 44),
    blobPatch(TORSO, -Math.PI + GAP / 2, -CHEST_AZ - GAP, 0.02, SEAM_TH, 40, 44),
  ]
  for (const p of plates) add(geo(p), ceramic, shell)
  // Violet hairlines in the gaps (down each side, down the back) and round the waist seam.
  /** A hairline on the core's surface through (azimuth, polar) samples. */
  const coreLine = (at: (t: number) => [number, number], n: number, closed: boolean) => {
    const pts: Vector3[] = []
    for (let i = 0; i < (closed ? n : n + 1); i++) {
      const [az, th] = at(i / n)
      const along = new Vector3(Math.sin(az) * Math.sin(th), Math.cos(th), Math.cos(az) * Math.sin(th))
      // Where this direction meets the core (bisection on the tapered superellipsoid).
      let lo = 0
      let hi = 0.6
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2
        const x = along.x * mid
        const y = along.y * mid
        const z = along.z * mid
        const t = 1 + ((core.taper ?? 0) * y) / core.b
        const e2 = y >= 0 ? (core.eTop ?? core.e) : (core.eBottom ?? core.e)
        const v = Math.abs(x / (core.a * t)) ** core.e + Math.abs(y / core.b) ** e2 + Math.abs(z / (core.c * t)) ** core.e
        if (v > 1) hi = mid
        else lo = mid
      }
      pts.push(along.multiplyScalar(lo + 0.002))
    }
    add(geo(new TubeGeometry(new CatmullRomCurve3(pts, closed), closed ? 160 : 48, 0.0026, 5, closed)), seamGlow, shell, 0, 0, 0, false)
  }
  const down = (az: number, th0: number) => (t: number): [number, number] => [az, th0 + (SEAM_TH - th0) * t]
  coreLine(down(CHEST_AZ + GAP / 2, 0.36), 24, false)
  coreLine(down(-CHEST_AZ - GAP / 2, 0.36), 24, false)
  coreLine(down(Math.PI, 0.3), 24, false)
  coreLine((t) => [t * Math.PI * 2, SEAM_TH + 0.012], 120, true)

  // The chest vent: a rounded-rect perforated grille over the violet core, with a soft glow card.
  const vent = mat(createVent({ cols: 11, rows: 9, shape: 'rect' }))
  const ventOutline = squircle(VENT.w, VENT.h, 5, 0, VENT.y)
  const ventMesh = add(
    geo(frontPanel(TORSO, () => [0, VENT.y], ventOutline, () => 0.0035, [-VENT.w, VENT.y - VENT.h, VENT.w * 2, VENT.h * 2], 72, 8)),
    vent,
    shell,
    0,
    0,
    0,
    false,
  )
  ventMesh.renderOrder = 1
  const coreCard = add(geo(new PlaneGeometry(0.46, 0.4)), coreGlow, shell, 0, VENT.y, frontZ(TORSO, 0, VENT.y) + 0.02, false)
  coreCard.renderOrder = 3
  // A thin graphite bezel round the vent.
  add(
    geo(frontPanel(TORSO, ventOutline, squircle(VENT.w + 0.012, VENT.h + 0.012, 5, 0, VENT.y), () => 0.0025, [-VENT.w, VENT.y - VENT.h, VENT.w * 2, VENT.h * 2], 72, 2)),
    satin,
    shell,
  )

  // Dorsal spine: three stacked vents in the back gap.
  const spineVent = mat(createVent({ cols: 5, rows: 3, shape: 'rect', dim: 0.6 }))
  const spineGeo = geo(new PlaneGeometry(0.075, 0.045))
  for (const [i, y] of [0.12, 0.03, -0.06].entries()) {
    yield
    const z = -frontZ(TORSO, 0, y) - 0.004
    const sv = add(spineGeo, spineVent, shell, 0, y, z, false)
    sv.rotation.y = Math.PI
    // Follow the back's slope a little.
    sv.rotation.x = -0.18 + i * 0.12
  }

  // Collar: a short graphite ring under the head, glowing faintly inside.
  const collarY = TORSO_Y + TORSO.b - 0.015
  const collar = add(geo(new TorusGeometry(0.098, 0.026, 14, 48)), satin, torso, 0, collarY, 0)
  collar.rotation.x = Math.PI / 2
  const glowRing = add(geo(new TorusGeometry(0.075, 0.006, 8, 48)), collarGlow, torso, 0, collarY + 0.018, 0, false)
  glowRing.rotation.x = Math.PI / 2
  add(geo(new CylinderGeometry(0.1, 0.13, 0.04, 40)), rubber, torso, 0, collarY - 0.02, 0)

  yield
  // ---- shoulders: ceramic pods with a dot vent, over graphite ball joints

  const podGeo = geo(blobGeometry({ a: 0.1, b: 0.09, c: 0.105, e: 2.5, eBottom: 2.1 }, 32, 22))
  const podVent = mat(createVent({ cols: 5, rows: 5, shape: 'circle', dim: 0.75 }))
  const podVentGeo = geo(new CircleGeometry(0.036, 32))
  const shoulders: Vector3[] = []
  for (const s of [-1, 1] as const) {
    yield
    const sx = s * 0.335
    const sy = TORSO_Y + 0.165
    const pod = add(podGeo, ceramic, torso, sx, sy + 0.04, -0.005)
    pod.rotation.z = -s * 0.32
    const pv = add(podVentGeo, podVent, pod, s * 0.1, 0.006, 0, false)
    pv.rotation.y = s * (Math.PI / 2)
    pv.position.x = s * 0.1005
    shoulders.push(new Vector3(sx + s * 0.03, sy - 0.015, 0.0))
  }

  yield
  // ---- arms (placed each frame by perform.ts) and hands

  const ballGeo = geo(new SphereGeometry(0.055, 24, 16))
  const upperSleeve = geo(new CapsuleGeometry(0.036, UPPER - 0.03, 6, 16))
  const upperShell = lathe([
    [0.0, 0.05],
    [0.05, 0.052],
    [0.062, 0.08],
    [0.064, 0.13],
    [0.058, 0.18],
    [0.044, 0.205],
    [0.0, 0.207],
  ])
  const foreSleeve = geo(new CapsuleGeometry(0.032, FORE - 0.02, 6, 16))
  const foreShell = lathe([
    [0.0, 0.035],
    [0.046, 0.037],
    [0.058, 0.07],
    [0.061, 0.13],
    [0.055, 0.2],
    [0.046, 0.235],
    [0.0, 0.237],
  ])
  const wristRingGeo = geo(new TorusGeometry(0.041, 0.0042, 8, 40))
  const wristHubGeo = geo(new CylinderGeometry(0.038, 0.034, 0.036, 28))
  // The braided cable bundle: three strands twisting round each other along the inner forearm.
  const cables: BufferGeometry[] = [0, 1, 2].map((k) => {
    const pts: Vector3[] = []
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const a = t * Math.PI * 5 + (k * Math.PI * 2) / 3
      pts.push(new Vector3(Math.cos(a) * 0.0075, -0.03 - t * (FORE - 0.06), 0.006 + Math.sin(a) * 0.0075))
    }
    return geo(new TubeGeometry(new CatmullRomCurve3(pts), 60, 0.0052, 6, false))
  })

  yield
  const knuckleGeo = geo(new SphereGeometry(0.0125, 14, 10))
  const proxGeo = geo(new CapsuleGeometry(0.0102, 0.024, 4, 10))
  const midJointGeo = geo(new SphereGeometry(0.0108, 12, 8))
  const tipGeo = geo(new CapsuleGeometry(0.0112, 0.018, 4, 10))
  const palmCore = geo(blobGeometry({ a: 0.044, b: 0.017, c: 0.044, e: 2.6 }, 24, 14))
  const palmBack = geo(blobGeometry({ a: 0.047, b: 0.0125, c: 0.042, e: 3, eBottom: 6 }, 24, 14))
  const wristBall = geo(new SphereGeometry(0.027, 16, 12))

  const arms: Arm[] = []
  for (const [i, s] of ([-1, 1] as const).entries()) {
    yield
    const upper = new Group()
    const fore = new Group()
    const hand = new Group()
    parent.add(upper, fore, hand)
    add(ballGeo, satin, upper)
    add(upperSleeve, rubber, upper, 0, -UPPER / 2, 0)
    add(upperShell, ceramic, upper)
    hub(upper, 0.044, 0.07, 'x', 0, -UPPER, 0)

    add(foreSleeve, rubber, fore, 0, -FORE / 2, 0)
    add(foreShell, ceramic, fore)
    // Cables on the inner side (toward the body: local -X for the right-hand arm, +X for the left).
    for (const c of cables) add(c, rubber, fore, -s * 0.046, 0, 0.012)
    add(wristHubGeo, satin, fore, 0, -FORE + 0.012, 0)
    const wr = add(wristRingGeo, wristRings, fore, 0, -FORE + 0.012, 0, false)
    wr.rotation.x = Math.PI / 2

    // Hand: local +Z along the fingers, +Y the back of the hand, the wrist at the origin.
    add(wristBall, satin, hand)
    add(palmCore, rubber, hand, 0, -0.002, 0.048)
    add(palmBack, ceramic, hand, 0, 0.011, 0.046)
    const fingers: Finger[] = []
    const defs = [
      { x: -s * 0.027, z: 0.088, len: 1.0, splay: -s * 0.08 },
      { x: 0, z: 0.093, len: 1.08, splay: 0 },
      { x: s * 0.027, z: 0.086, len: 0.95, splay: s * 0.09 },
      // Thumb: low on the inner side, angled forward and in.
      { x: -s * 0.05, z: 0.03, len: 0.9, splay: -s * 0.75, thumb: true },
    ]
    for (const d of defs) {
      yield
      const base = new Group()
      base.position.set(d.x, d.thumb ? -0.008 : 0, d.z)
      base.rotation.y = d.splay
      if (d.thumb) base.rotation.z = -s * 0.5
      hand.add(base)
      add(knuckleGeo, satin, base)
      const prox = add(proxGeo, rubber, base, 0, 0, 0.022 * d.len)
      prox.rotation.x = Math.PI / 2
      prox.scale.y = d.len
      const mid = new Group()
      mid.position.z = 0.042 * d.len
      base.add(mid)
      add(midJointGeo, satin, mid)
      const tip = add(tipGeo, ceramic, mid, 0, 0, 0.018 * d.len)
      tip.rotation.x = Math.PI / 2
      tip.scale.y = d.len
      const marker = new Object3D()
      marker.position.z = 0.034 * d.len
      mid.add(marker)
      const rest: [number, number] = d.thumb ? [0.35, 0.3] : [0.42, 0.55]
      base.rotation.x = rest[0]
      mid.rotation.x = rest[1]
      fingers.push({ base, mid, tip: marker, rest })
    }
    arms[i] = { side: s, shoulder: shoulders[i], upper, fore, hand, fingers }
  }

  yield
  // ---- legs (placed each frame by perform.ts): thigh -> knee hub -> shin -> ankle -> foot

  const thighSleeve = geo(new CapsuleGeometry(0.05, THIGH - 0.06, 6, 18))
  const thighShell = lathe(
    [
      [0.0, 0.05],
      [0.068, 0.055],
      [0.084, 0.09],
      [0.086, 0.17],
      [0.076, 0.24],
      [0.058, 0.265],
      [0.0, 0.267],
    ],
    32,
  )
  const shinSleeve = geo(new CapsuleGeometry(0.042, SHIN - 0.05, 6, 16))
  const shinShell = lathe(
    [
      [0.0, 0.05],
      [0.056, 0.055],
      [0.068, 0.09],
      [0.066, 0.17],
      [0.054, 0.235],
      [0.042, 0.255],
      [0.0, 0.257],
    ],
    30,
  )
  const FOOT: Blob = { a: 0.058, b: 0.044, c: 0.105, e: 2.6, eBottom: 4.5 }
  const footGeo = geo(blobGeometry(FOOT, 32, 20))
  const footSeamGeo = geo(seamGeometry(FOOT, 'y', -0.016, 0.0026, 100))
  const ankleGeo = geo(new SphereGeometry(0.034, 16, 12))

  const legs: Leg[] = []
  for (const s of [-1, 1] as const) {
    yield
    const thigh = new Group()
    const shin = new Group()
    const foot = new Group()
    parent.add(thigh, shin, foot)
    add(thighSleeve, rubber, thigh, 0, -THIGH / 2, 0)
    add(thighShell, ceramic, thigh)
    hub(thigh, 0.056, 0.1, 'x', 0, -THIGH, 0)
    add(shinSleeve, rubber, shin, 0, -SHIN / 2, 0)
    add(shinShell, ceramic, shin)
    add(ankleGeo, satin, shin, 0, -SHIN, 0)
    // The foot: the toes along local +Z, the sole ANKLE_H below the ankle.
    const sole = new Group()
    foot.add(sole)
    add(footGeo, ceramic, sole, 0, -ANKLE_H + FOOT.b, 0.04)
    add(footSeamGeo, footSeam, sole, 0, -ANKLE_H + FOOT.b, 0.04, false)
    const toe = new Object3D()
    toe.position.set(0, -ANKLE_H, 0.13)
    sole.add(toe)
    legs.push({ side: s, hip: new Vector3(s * 0.17, -0.03, 0.03), thigh, shin, foot, sole, toe })
  }

  return {
    hips,
    torso,
    neck: NECK.clone(),
    waistY: WAIST_Y,
    arms,
    legs,
    vents: [vent, podVent, spineVent],
    coreGlow,
    wristRings,
    solids,
    upperLen: UPPER,
    foreLen: FORE,
    thighLen: THIGH,
    shinLen: SHIN,
    ankleH: ANKLE_H,
  }
}
