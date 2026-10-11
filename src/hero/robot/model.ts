/**
 * The hero robot, built from primitives (no external model): an engineer-robot
 * in a late-night flow state, headphones on, seated at its desk on a round dot
 * stage, coding on its laptop (perform.ts). It never leaves the chair.
 *
 *   head    (unchanged) one squircle shell, flatter on top, graphite ear caps
 *           ringed in violet, a black glass visor with a thin violet bezel, and
 *           behind the glass a dot-matrix LED face (dots.ts)
 *   body    matte ceramic plates over a graphite frame, fully articulated (body.ts)
 *   props   headphones over the ear caps (props.ts)
 *   desk    a chair, a table and a laptop (furniture.ts), laid out square to
 *           the seat: the table centred in front of the robot, the laptop on it
 *           with its keys toward the robot, cheated a little toward the camera
 *           (placeFurniture)
 *   stage   a wide flat disc of concentric dot rings everything stands on, an
 *           equaliser ring round it, two dotted orbit rings and the commit pulse
 *
 * Units: the stage is at y = 0; `body` sits on the chair facing +z (perform.ts
 * poses it). `headPivot` sits at the neck (the engine keeps it on the torso's
 * neck point); rotating it turns the head without moving the body.
 *
 * The head has materials of its own (exactly as before), so the body can
 * dissolve away while the head stays whole (engine.ts); the headphones have
 * theirs, which dissolve on their own cue. The engine moves `eyes` (gaze),
 * scales `lid` (blinks) and sets `narrow`; the face reads them each frame.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  RectAreaLight,
  ShaderMaterial,
  ShadowMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three'
import { createDais, createDotFace, DAIS_R, FACE_GRID, type FaceMood } from './dots'
import { blobGeometry, frontPanel, frontRect, seamGeometry, squircle, squircleR, type Blob } from './shape'
import { buildBody, type BodyRig, type Kit } from './body'
import { buildHeadphones, createCommitPulse, createEqualizer, createOrbitRing, KEYBOARD, type CommitPulse, type Headphones, type Keyboard, type PointRing } from './props'
import { buildFurniture, KEYS_TOP, LAPTOP, LID_H, LID_TILT, TABLE, TABLE_TOP } from './furniture'

export interface Seat {
  x: number
  z: number
  yaw: number
}

export interface RobotModel {
  /** Robot and dais; turn this to turn the whole figure. */
  root: Group
  /** Everything above the dais. */
  body: Group
  /** At the neck: the head's rotation. */
  headPivot: Group
  /** The head's centre, in headPivot space. */
  headCenter: { x: number; y: number; z: number }
  /** Gaze: its position (head units) shifts the face's LEDs. */
  eyes: Object3D
  /** Blinks: its scale.y squashes the face's LEDs toward the middle row. */
  lid: Object3D
  /** Focus: 0..1 narrows the eyes (their top rows dim). */
  narrow: { value: number }
  /** Redraws the face for a mood (`time` animates the tears). */
  drawFace(mood: FaceMood, time?: number): void
  /** The violet bezel: dimmed while asleep. */
  bezel: MeshPhysicalMaterial
  /** Angel mood: a halo above the head (hidden by default). */
  halo: Object3D
  /** Sleepy mood: two z's beside the head (hidden by default). */
  zzz: Sprite[]
  /** Everything but the head, the headphones, the props and the dais: these dissolve (engine.ts patches their shaders). */
  bodyMaterials: Material[]
  /** The head's materials (left whole by the dissolve; the load reveal patches them). */
  headMaterials: Material[]
  /** The furniture's solids (they dissolve with the body, but fade in before it). */
  furnitureMaterials: Material[]
  /** The face's mesh (shown once the reveal passes it). */
  face: Mesh
  /** The dais, its glow, the equaliser, the rings, the contact shadows. */
  stage: Group
  /** Dais visibility (0..1: it fades as the body dissolves). */
  setStage(fade: number): void
  /** The body's rig (perform.ts). */
  rig: BodyRig
  phones: Headphones
  /** Where the robot sits (stage space). */
  seat: Seat
  chair: Group
  desk: { group: Group; underglow: MeshBasicMaterial; half: Vector2 }
  /** The furniture's small shader details (uFade). */
  furnitureFades: ShaderMaterial[]
  laptop: {
    group: Group
    keyboard: Keyboard
    screen: ShaderMaterial
    display: Mesh
    screenLight: RectAreaLight
    keyLight: PointLight
    screenGlow: ShaderMaterial
    tableGlow: ShaderMaterial
    lidEdge: MeshBasicMaterial
  }
  /** Lays the desk out round the seat, the table and the laptop at `k` times their size (tablets 0.9, phones 0.8). */
  placeFurniture(k: number): void
  /** The highest furniture surface under a world point (the keycaps, the laptop's deck, the tabletop), or -Infinity. */
  deskTop(world: Vector3): number
  /** Points the layout keeps in frame (stage space): the furniture's corners (updated by placeFurniture). */
  frame: Vector3[]
  dais: ShaderMaterial
  eq: PointRing
  /** The orbit rings: [behind the table, low round the stage in front of the feet]. */
  rings: PointRing[]
  pulse: CommitPulse
  /** Soft contact shadows under the feet (perform.ts keeps them under the soles). */
  footShadows: Mesh[]
  /** Meshes that cast and take shadows. */
  shadowCasters: Mesh[]
  shadowFloor: ShadowMaterial
  /** Rebuilds the equaliser with this many columns (phones: fewer). */
  setEqColumns(n: number): void
  /** The stage's radius. */
  extents: { daisR: number }
  dispose(): void
}

/** The head shell: a squircle, flatter on top. */
const HEAD: Blob = { a: 0.56, b: 0.43, c: 0.44, e: 3.2, eTop: 4.2, eBottom: 3 }
/** Where the head shell's centre sits above the neck pivot. */
const HEAD_LIFT = 0.47
/** The visor (black glass): half sizes, superellipse exponent, centre height on the head. */
const VISOR = { w: 0.415, h: 0.255, p: 4.5, y: -0.02 }
const BEZEL = 0.016
/** One LED cell on the face, in head units. */
const LED = 0.0375
/** The equaliser's radius: 1.35 times the stage. */
export const EQ_R = DAIS_R * 1.35
/**
 * The seated group: the chair, the robot, the table squarely in front of it and the laptop on that, turned
 * as one about GROUP (stage space) so the robot faces FACING from the camera's direction (3/4 toward
 * profile): enough of its visor and both eyes read from the opening camera. The group's centre is half way
 * from the seat to the table's centre, so turning it never moves it in the composition.
 */
const FACING = (55 * Math.PI) / 180
const GROUP = { x: -0.29, z: 0.15 }
/** Along the facing axis from the robot's origin: its belly at the table's edge, the 10% gap to the edge. */
const BELLY = 0.155
const BELLY_GAP = 0.04
const TABLE_FRONT = BELLY + BELLY_GAP
/** The laptop's nearest point behind the table's front edge; its yaw toward the camera off the robot's axis. */
const LAPTOP_FRONT = 0.03
export const LAPTOP_CHEAT = (10 * Math.PI) / 180
const GROUP_R = (TABLE_FRONT + TABLE.d / 2) / 2
export const SEAT: Seat = {
  x: GROUP.x - Math.sin(FACING) * GROUP_R,
  z: GROUP.z - Math.cos(FACING) * GROUP_R,
  yaw: FACING,
}

const PALETTE = {
  shell: '#e9e6f2',
  graphite: '#1a1726',
  accent: '#7c5cff',
  soft: '#a78bfa',
  glow: '#c4b5fd',
  deep: '#14102a',
}

/** The bezel's colour: #A78BFA at the top to #7C5CFF at the bottom (planar UVs across the visor). */
function bezelTexture(): Texture {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, PALETTE.soft)
  grad.addColorStop(1, PALETTE.accent)
  g.fillStyle = grad
  g.fillRect(0, 0, 4, 128)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** Soft round falloff (contact shadows, glow cards). */
function glowTexture(): Texture {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

/** A single "z", for the sleepy mood's sprites. */
function zTexture(): Texture {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.font = '700 52px system-ui, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('z', size / 2, size / 2 + 2)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

export function buildRobot(): RobotModel {
  const geometries: BufferGeometry[] = []
  const materials: Material[] = []
  const textures: Texture[] = []
  const headMaterials = new Set<Material>()
  const stageMaterials = new Set<Material>()
  const propMaterials = new Set<Material>()
  const geo = <G extends BufferGeometry>(g: G) => (geometries.push(g), g)
  const mat = <M extends Material>(m: M, owner?: Set<Material>) => (materials.push(m), owner?.add(m), m)
  const tex = <T extends Texture>(t: T) => (textures.push(t), t)

  // ---- the head's materials, exactly as designed (the body has its own, body.ts)

  // Matte ceramic with a soft clearcoat: the key light gives it a gentle highlight, never a mirror.
  const shell = new MeshPhysicalMaterial({
    color: PALETTE.shell,
    roughness: 0.55,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
    sheen: 0.2,
    sheenRoughness: 0.7,
    sheenColor: '#bdb8d0',
  })
  const graphite = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.45, metalness: 0.3 }))
  // Hairline seams: violet, barely lit.
  const seam = new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false })
  const glowTex = tex(glowTexture())

  // The head's own copies: the body's dissolve never touches the head.
  const H = headMaterials
  const headShell = mat(shell.clone(), H)
  const headGraphite = mat(graphite.clone(), H)
  const headSeam = mat(seam.clone(), H)
  shell.dispose()
  seam.dispose()
  const earRing = mat(new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.85, toneMapped: false }), H)
  const glass = mat(
    // A subtle sheen, not a mirror: the room's lights only glance off it.
    new MeshPhysicalMaterial({
      color: '#05040a',
      roughness: 0.2,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.28,
      reflectivity: 0.35,
      envMapIntensity: 0.14,
    }),
    H,
  )
  const bezelTex = tex(bezelTexture())
  const bezel = mat(
    new MeshPhysicalMaterial({
      color: '#ffffff',
      map: bezelTex,
      emissive: '#ffffff',
      emissiveMap: bezelTex,
      emissiveIntensity: 0.32,
      roughness: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.2,
    }),
    H,
  )

  const mesh = (g: BufferGeometry, m: Material, x = 0, y = 0, z = 0, parent?: Object3D) => {
    const o = new Mesh(g, m)
    o.position.set(x, y, z)
    parent?.add(o)
    return o
  }

  const root = new Group()
  const body = new Group()
  root.add(body)

  // ---- dais: a base disc, the rings of dots, a faint glow lifting off them, a shadow catcher for the
  // figure and the furniture, the equaliser round it all, two orbit rings and the commit pulse

  const stage = new Group()
  root.add(stage)
  const S = stageMaterials
  const daisBase = mat(new MeshBasicMaterial({ color: PALETTE.deep, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }), S)
  const daisDots = mat(createDais(), S)
  const shadowFloor = mat(new ShadowMaterial({ color: '#040309', opacity: 0.42, transparent: true, depthWrite: false }), S)
  const footShade = mat(new MeshBasicMaterial({ map: glowTex, color: '#000000', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }), S)
  const upGlow = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: { uFade: { value: 1 } },
      vertexShader: `varying float vY; void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // #7C5CFF, rising off the rim and gone within a hand's height.
      fragmentShader: `uniform float uFade; varying float vY; void main() { float a = 0.06 * pow(1.0 - vY, 2.2) * uFade; gl_FragColor = vec4(0.486, 0.361, 1.0, a); }`,
    }),
    S,
  )
  const flat = (g: BufferGeometry, m: Material, order: number) => {
    const o = mesh(g, m, 0, 0, 0, stage)
    o.rotation.x = -Math.PI / 2
    o.renderOrder = order
    return o
  }
  flat(geo(new CircleGeometry(DAIS_R * 1.02, 96)), daisBase, -4)
  const catcher = flat(geo(new CircleGeometry(DAIS_R * 1.05, 96)), shadowFloor, -3)
  catcher.position.y = 0.0025
  catcher.receiveShadow = true
  flat(geo(new CircleGeometry(DAIS_R * 1.02, 128)), daisDots, -2).position.y = 0.003
  const glowWall = mesh(geo(new CylinderGeometry(DAIS_R * 0.97, DAIS_R, 0.14, 96, 1, true)), upGlow, 0, 0.07, 0, stage)
  glowWall.renderOrder = -1
  const footShadows = [0, 1].map(() => {
    const o = flat(geo(new PlaneGeometry(0.2, 0.3)), footShade, -1)
    o.position.y = 0.004
    return o
  })

  let eq = createEqualizer(48, EQ_R)
  geo(eq.points.geometry)
  mat(eq.material, S)
  stage.add(eq.points)
  // Two orbit rings: one far behind the table (only its back half), one low round the stage that passes
  // in front of the robot's feet and behind the chair and the table's legs.
  const backRing = createOrbitRing(220, DAIS_R * 1.25, true)
  backRing.points.position.set(0.15, 1.05, -0.35)
  backRing.points.rotation.set(0.06, 0, -0.04)
  const lowRing = createOrbitRing(170, DAIS_R * 0.9, false)
  lowRing.points.position.y = 0.16
  lowRing.points.rotation.set(0.05, 0, -0.03)
  const rings = [backRing, lowRing]
  for (const r of rings) {
    geo(r.points.geometry)
    mat(r.material, S)
    stage.add(r.points)
  }
  const pulse = createCommitPulse()
  geo(pulse.points.geometry)
  mat(pulse.material, S)
  stage.add(pulse.points)

  // ---- body

  const kit: Kit = { geo, mat: (m) => mat(m), tex, glow: glowTex }
  const rig = buildBody(kit, body)
  rig.hips.position.set(0, 0.672, 0)
  rig.hips.updateMatrix()
  rig.torso.updateMatrix()
  const NECK_Y = rig.neck.clone().applyMatrix4(rig.torso.matrix).applyMatrix4(rig.hips.matrix).y

  // ---- the desk

  const furnitureFrom = materials.length
  const furniture = buildFurniture(kit)
  for (const m of furniture.own) propMaterials.add(m)
  const furnitureMaterials = materials.slice(furnitureFrom).filter((m) => !propMaterials.has(m))
  root.add(furniture.chair, furniture.table, furniture.laptop)
  const deskHalf = new Vector2(TABLE.w / 2, TABLE.d / 2)
  const frame: Vector3[] = []

  /**
   * The desk, square to the seat. The chair stands under the hips. The table is level and centred on the
   * robot's facing axis, its front edge BELLY_GAP clear of the belly. The laptop yaws LAPTOP_CHEAT toward
   * the camera about its home row, which stays on the robot's axis; it is pushed back until its nearest
   * corner is LAPTOP_FRONT behind the table's edge (perform.ts puts the hands on that home row).
   */
  const lapAt = new Vector3()
  function placeFurniture(k: number) {
    const { x, z, yaw } = SEAT
    const fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw))
    const seatP = new Vector3(x, 0, z)
    furniture.chair.position.copy(seatP).addScaledVector(fwd, -0.03)
    furniture.chair.rotation.y = yaw

    // The table: its +z (front edge) back toward the robot.
    const tab = furniture.table
    tab.scale.set(k, 1, k)
    tab.rotation.y = yaw + Math.PI
    tab.position.copy(seatP).addScaledVector(fwd, TABLE_FRONT + (TABLE.d * k) / 2)
    deskHalf.set((TABLE.w * k) / 2, (TABLE.d * k) / 2)

    // The laptop: its home row (the keyboard's centre row) on the axis, its base's corners behind the edge.
    const lap = furniture.laptop
    const sc = LAPTOP.scale * k
    lap.scale.setScalar(sc)
    const lapYaw = yaw + Math.PI + LAPTOP_CHEAT
    lap.rotation.y = lapYaw
    const c = Math.cos(lapYaw)
    const s = Math.sin(lapYaw)
    /** Laptop units, about the home row, to stage space (horizontal). */
    const offset = (lx: number, lz: number) => new Vector3((lx * c + (lz - LAPTOP.keysZ) * s) * sc, 0, (-lx * s + (lz - LAPTOP.keysZ) * c) * sc)
    let near = Infinity
    for (const [lx, lz] of [
      [-LAPTOP.w / 2, -LAPTOP.d / 2],
      [LAPTOP.w / 2, -LAPTOP.d / 2],
      [-LAPTOP.w / 2, LAPTOP.d / 2],
      [LAPTOP.w / 2, LAPTOP.d / 2],
    ])
      near = Math.min(near, offset(lx, lz).dot(fwd))
    const home = TABLE_FRONT + LAPTOP_FRONT - near
    lapAt.copy(seatP).addScaledVector(fwd, home).add(offset(0, 0))
    lap.position.set(lapAt.x, TABLE_TOP, lapAt.z)

    // The screen's light on the top, under the laptop (table space).
    tab.updateMatrix()
    const tl = lapAt.clone().setY(TABLE_TOP).applyMatrix4(tab.matrix.clone().invert())
    furniture.tableGlowMesh.position.set(tl.x, TABLE_TOP + 0.0008, tl.z)
    furniture.tableGlow.uniforms.uOff.value.set(tl.x, tl.z)

    // The frame the layout keeps in view.
    root.updateMatrixWorld(true)
    frame.length = 0
    for (const [px, pz] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ])
      frame.push(tab.localToWorld(new Vector3(px * TABLE.w, TABLE_TOP, pz * TABLE.d)), tab.localToWorld(new Vector3(px * TABLE.w, 0, pz * TABLE.d)))
    const lidBack = -LAPTOP.d / 2 - LID_H * Math.sin(LID_TILT)
    for (const lx of [-1, 1]) frame.push(lap.localToWorld(new Vector3((lx * LAPTOP.w) / 2, LID_H * Math.cos(LID_TILT), lidBack)))
    for (const [px, py, pz] of [
      [-0.24, 0, 0.24],
      [0.24, 0, 0.24],
      [0, 0.82, -0.3],
    ])
      frame.push(furniture.chair.localToWorld(new Vector3(px, py, pz)))
    for (const p of frame) root.worldToLocal(p)
  }

  const probe = new Vector3()
  function deskTop(world: Vector3) {
    let top = -Infinity
    const lap = furniture.laptop
    lap.worldToLocal(probe.copy(world))
    if (Math.abs(probe.x) <= LAPTOP.w / 2 && Math.abs(probe.z) <= LAPTOP.d / 2) {
      const keys = Math.abs(probe.x) <= KEYBOARD.w / 2 && Math.abs(probe.z - LAPTOP.keysZ) <= KEYBOARD.d / 2
      top = lap.localToWorld(probe.set(0, keys ? KEYS_TOP : LAPTOP.h + 0.0012, 0)).y
    }
    furniture.table.worldToLocal(probe.copy(world))
    if (Math.abs(probe.x) <= TABLE.w / 2 && Math.abs(probe.z) <= TABLE.d / 2) top = Math.max(top, furniture.table.localToWorld(probe.set(0, TABLE_TOP, 0)).y)
    return top
  }
  placeFurniture(1)

  // ---- head

  const headPivot = new Group()
  headPivot.position.set(0, NECK_Y, 0)
  body.add(headPivot)
  // The neck goes with the body (its material dissolves): only the head is left.
  mesh(geo(new CylinderGeometry(0.07, 0.085, 0.16, 28)), graphite, 0, 0, 0, headPivot)

  const head = new Group()
  head.position.set(0, HEAD_LIFT, 0)
  headPivot.add(head)
  mesh(geo(blobGeometry(HEAD, 72, 52)), headShell, 0, 0, 0, head)
  // One hairline seam where the face shell meets the back shell, behind the ears.
  mesh(geo(seamGeometry(HEAD, 'z', -0.2, 0.0024)), headSeam, 0, 0, 0, head)

  // Ear caps: graphite, with a thin violet ring.
  const earGeo = geo(new CylinderGeometry(0.1, 0.1, 0.06, 40))
  const earInnerGeo = geo(new CylinderGeometry(0.06, 0.066, 0.02, 32))
  const earRingGeo = geo(new TorusGeometry(0.078, 0.0045, 8, 64))
  for (const s of [-1, 1]) {
    const ear = mesh(earGeo, headGraphite, s * (HEAD.a + 0.004), -0.01, -0.02, head)
    ear.rotation.z = Math.PI / 2
    const inner = mesh(earInnerGeo, headGraphite, s * (HEAD.a + 0.042), -0.01, -0.02, head)
    inner.rotation.z = Math.PI / 2
    const r = mesh(earRingGeo, earRing, s * (HEAD.a + 0.035), -0.01, -0.02, head)
    r.rotation.y = Math.PI / 2
  }

  // Visor: black glass bulging gently out of the shell, a thin violet bezel round it,
  // and the LED face just behind the glass's surface.
  const visorLift = (x: number, y: number) => {
    const r = Math.min(1, squircleR(x, y - VISOR.y, VISOR.w, VISOR.h, VISOR.p))
    return 0.004 + 0.014 * (1 - r * r)
  }
  const visorBox: [number, number, number, number] = [-VISOR.w - BEZEL, VISOR.y - VISOR.h - BEZEL, (VISOR.w + BEZEL) * 2, (VISOR.h + BEZEL) * 2]
  const visorOutline = squircle(VISOR.w, VISOR.h, VISOR.p, 0, VISOR.y)
  mesh(geo(frontPanel(HEAD, () => [0, VISOR.y], visorOutline, visorLift, visorBox, 128, 10)), glass, 0, 0, 0, head)
  mesh(
    geo(frontPanel(HEAD, visorOutline, squircle(VISOR.w + BEZEL, VISOR.h + BEZEL, VISOR.p, 0, VISOR.y), () => 0.0055, visorBox, 128, 2)),
    bezel,
    0,
    0,
    0,
    head,
  )

  const dotFace = createDotFace()
  textures.push(dotFace.texture)
  const faceMat = mat(dotFace.material, H)
  const fw = FACE_GRID.cols * LED
  const fh = FACE_GRID.rows * LED
  const faceMesh = mesh(geo(frontRect(HEAD, 0, VISOR.y, fw, fh, (x, y) => visorLift(x, y) + 0.0015, 38, 22)), faceMat, 0, 0, 0, head)
  faceMesh.renderOrder = 2
  // Gaze and blinks, as the engine sets them: these objects only carry the values.
  const eyes = new Object3D()
  const lid = new Object3D()
  head.add(eyes, lid)
  const narrow = { value: 0 }
  faceMesh.onBeforeRender = () => dotFace.set(eyes.position.x / LED, eyes.position.y / LED, lid.scale.y, narrow.value)
  dotFace.paint('neutral')

  // Angel: a ring of light above the head.
  const halo = mesh(geo(new TorusGeometry(0.3, 0.03, 12, 56)), mat(new MeshBasicMaterial({ color: PALETTE.glow, toneMapped: false }), H), 0, HEAD.b + 0.2, 0.02, head)
  halo.rotation.x = Math.PI / 2 - 0.25
  halo.visible = false

  // Sleepy: two z's drifting up beside the head.
  const zTex = tex(zTexture())
  const zzz = [0.2, 0.14].map((size) => {
    const m = mat(new SpriteMaterial({ map: zTex, color: PALETTE.glow, transparent: true, depthWrite: false, toneMapped: false }), H)
    const sprite = new Sprite(m as SpriteMaterial)
    sprite.scale.set(size, size, 1)
    sprite.visible = false
    head.add(sprite)
    return sprite
  })


  // ---- headphones, over the ear caps (the head itself is not touched)

  const phoneKit: Kit = { geo, mat: (m) => mat(m, propMaterials), tex, glow: glowTex }
  const phones = buildHeadphones(phoneKit, head)

  // ---- shadows: the body, the head, the headphones and the furniture cast and take soft shadows

  const shadowCasters: Mesh[] = [...rig.solids, ...phones.meshes, ...furniture.solids]
  head.traverse((o) => {
    if (o instanceof Mesh && (o.material === headShell || o.material === headGraphite)) shadowCasters.push(o)
  })
  for (const m of shadowCasters) {
    // Small parts (finger segments, knuckles, casters) only take shadows: casting, they would cost a
    // draw call each in the shadow pass for a shadow too small to see.
    m.geometry.computeBoundingSphere()
    m.castShadow = (m.geometry.boundingSphere?.radius ?? 1) * Math.max(m.scale.x, m.scale.y, m.scale.z) > 0.03
    m.receiveShadow = true
  }
  // The keycaps take the screen's light and the room's, never a shadow pass of their own.
  furniture.keyboard.caps.receiveShadow = true

  const bodyMaterials = materials.filter((m) => !headMaterials.has(m) && !stageMaterials.has(m) && !propMaterials.has(m) && !furnitureMaterials.includes(m))
  const baseOpacity = daisBase.opacity
  const fadeables = () => [daisDots as ShaderMaterial, upGlow as ShaderMaterial, eq.material, ...rings.map((r) => r.material)]
  const shadowOpacity = shadowFloor.opacity
  const footOpacity = footShade.opacity

  return {
    root,
    body,
    headPivot,
    headCenter: { x: 0, y: HEAD_LIFT, z: 0 },
    eyes,
    lid,
    narrow,
    drawFace: dotFace.paint,
    bezel,
    halo,
    zzz,
    bodyMaterials,
    headMaterials: [...headMaterials],
    furnitureMaterials,
    face: faceMesh,
    stage,
    rig,
    phones,
    seat: SEAT,
    chair: furniture.chair,
    desk: { group: furniture.table, underglow: furniture.underglow, half: deskHalf },
    furnitureFades: furniture.fades,
    laptop: {
      group: furniture.laptop,
      keyboard: furniture.keyboard,
      screen: furniture.screen,
      display: furniture.display,
      screenLight: furniture.screenLight,
      keyLight: furniture.keyLight,
      screenGlow: furniture.screenGlow,
      tableGlow: furniture.tableGlow,
      lidEdge: furniture.lidEdge,
    },
    placeFurniture,
    deskTop,
    frame,
    dais: daisDots as ShaderMaterial,
    get eq() {
      return eq
    },
    rings,
    pulse,
    footShadows,
    shadowCasters,
    shadowFloor,
    setEqColumns(n) {
      if (eq.material.uniforms.uN.value === n) return
      const next = createEqualizer(n, EQ_R)
      next.material.uniforms.uHalfH.value = eq.material.uniforms.uHalfH.value
      next.material.uniforms.uFade.value = eq.material.uniforms.uFade.value
      stage.remove(eq.points)
      eq.points.geometry.dispose()
      eq.material.dispose()
      geometries.splice(geometries.indexOf(eq.points.geometry), 1)
      materials.splice(materials.indexOf(eq.material), 1)
      stageMaterials.delete(eq.material)
      eq = next
      geo(eq.points.geometry)
      mat(eq.material, S)
      stage.add(eq.points)
    },
    setStage(fade) {
      stage.visible = fade > 0.001
      for (const m of fadeables()) m.uniforms.uFade.value = fade
      daisBase.opacity = baseOpacity * fade
      shadowFloor.opacity = shadowOpacity * fade
      footShade.opacity = footOpacity * fade
    },
    extents: { daisR: DAIS_R },
    dispose() {
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
    },
  }
}
