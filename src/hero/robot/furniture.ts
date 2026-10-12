/**
 * The robot's desk: a chair, a table and a laptop, in the same language as the
 * robot (precision hardware, restrained, dots). The chair and the table are
 * dimmer and simpler than the robot, so the robot and the laptop's screen stay
 * the two focal points. Furniture ceramic is the palette's shadow tone
 * (#BDB8D0), never the robot's brighter shell.
 *
 *   chair    a sculpted swivel chair: a graphite pedestal on a five-point base
 *            with small casters, a ceramic seat shell with a faint violet line
 *            round its rim, and a ceramic backrest with a perforated dot panel
 *            lit very faintly from behind. It stays put
 *   table    a level rectangular slab, 2.2 x 1.7 times the laptop's footprint:
 *            a matte graphite top on a ceramic edge band with a thin violet line
 *            along its front and a row of dots inlaid along that edge; four slim
 *            tapered legs, inset from the corners and joined by a perimeter
 *            apron, each on a ceramic foot cap that stands exactly on y = 0; a
 *            soft shadow the shape of the top under it, and a faint violet
 *            underglow
 *   laptop   the hero prop, one device: a slim graphite unibody with chamfered
 *            edges and a hairline highlight, rubber feet, speaker grilles of dot
 *            perforations either side of real backlit keycaps (props.ts), a
 *            trackpad outline, port slits, a ceramic hinge barrel the full
 *            height of the base's back edge with the lid pivoting on its axis
 *            (no gap, nothing floating), one violet dot on its lid. Its display (props.ts) is a real
 *            light: an area light the size of the panel, a little glow on the
 *            table in front of it, and the keyboard's backlight under the hands
 *
 * Local frames: each piece stands on y = 0, its +z toward whoever uses it.
 * Every piece sits on soft contact shadows; the key light's shadow map casts
 * the real ones (lite has no shadow map: the contact shadows carry it).
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
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
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  type BufferGeometry,
  type Material,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { Kit } from './body'
import { PALETTE } from './body'
import { createVent } from './dots'
import { blobGeometry, seamGeometry, type Blob } from './shape'
import { createKeyboard, createScreen, KEYBOARD, SCREEN, type Keyboard } from './props'

/**
 * The seat's top (the robot's knee height) and the tabletop's surface: the seated robot's elbow height
 * with its forearms level (its navel), which leaves its thighs about 7% of its height under the apron.
 */
export const SEAT_TOP = 0.37
export const TABLE_TOP = 0.75
/** The laptop (laptop units): base footprint and thickness; its keyboard's centre on the base; its scale. */
export const LAPTOP = { w: 0.33, d: 0.225, h: 0.013, keysZ: -0.012, scale: 2.43 }
/** The tabletop: 2.2 x 1.7 times the laptop's footprint (the laptop about 45% of its width); its thickness. */
export const TABLE = { w: 2.2 * LAPTOP.w * LAPTOP.scale, d: 1.7 * LAPTOP.d * LAPTOP.scale, t: 0.07 }
/** The legs' centres, inset from the top's corners by 6% of its width; the apron's depth under the top. */
const LEG_INSET = 0.06 * TABLE.w
const APRON = 0.04
/** The top of the keycaps above the laptop's base (laptop units): the deck, the key plane, the caps. */
export const KEYS_TOP = LAPTOP.h + 0.0012 + 0.0003 + 0.0034
/** The lid's opening past upright (radians): open 110 degrees. */
export const LID_TILT = 0.349
/** The lid's height (laptop units). */
export const LID_H = 0.215

export interface Furniture {
  chair: Group
  table: Group
  laptop: Group
  /** The lid (its display, light and glow ride on it). */
  lid: Group
  keyboard: Keyboard
  screen: ShaderMaterial
  /** The display mesh (its centre and size, for the layout and the stage). */
  display: Mesh
  /** The display as a light: an area light over the panel, and the keyboard's backlight under the hands. */
  screenLight: RectAreaLight
  keyLight: PointLight
  /** Glows that stand in for bloom (gone in lite): round the display, and its spill on the table. */
  screenGlow: ShaderMaterial
  tableGlow: ShaderMaterial
  /** The screen's light on the tabletop: lies in the table's frame, placed under the laptop (model.ts). */
  tableGlowMesh: Mesh
  underglow: MeshBasicMaterial
  /** The specular hairline along the lid's top edge (it brightens with the screen). */
  lidEdge: MeshBasicMaterial
  /** Small shader details that fade with the furniture (uFade): the inlay, the grilles, the trackpad. */
  fades: ShaderMaterial[]
  /** Solid meshes (shadows). */
  solids: Mesh[]
  /** Materials that are not dissolved with the body (the screen and glows fade by power, the underglow by itself). */
  own: Material[]
}

/** A soft dark disc for contact shadows (multiplied over the floor, the table). */
function contact(kit: Kit, m: MeshBasicMaterial, parent: Object3D, w: number, d: number, x = 0, y = 0.002, z = 0) {
  const o = new Mesh(kit.geo(new PlaneGeometry(w, d)), m)
  o.rotation.x = -Math.PI / 2
  o.position.set(x, y, z)
  o.renderOrder = -1
  parent.add(o)
  return o
}

/** A soft-edged rectangle (white, alpha falling off over its outer `soft` share), for shadows the shape of a top. */
function softRect(soft: number): CanvasTexture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  const ramp = (u: number) => {
    const t = Math.min(1, Math.max(0, (0.5 - Math.abs(u - 0.5)) / (soft / 2)))
    return t * t * (3 - 2 * t)
  }
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      const a = ramp((i + 0.5) / size) * ramp((j + 0.5) / size)
      const k = (j * size + i) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255
      img.data[k + 3] = Math.round(a * 255)
    }
  g.putImageData(img, 0, 0)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

/** A tapered leg, darkened toward its top (occlusion under the apron) and its foot (the floor). */
function legGeometry(rTop: number, rBottom: number, h: number) {
  const g = new CylinderGeometry(rTop, rBottom, h, 20, 6)
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i) / h + 0.5
    const ao = 1 - 0.45 * Math.exp(-(1 - v) / 0.12) - 0.25 * Math.exp(-v / 0.08)
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

export function buildFurniture(kit: Kit): Furniture {
  const { geo, mat } = kit
  const solids: Mesh[] = []
  const own: Material[] = []

  const ceramic = mat(new MeshPhysicalMaterial({ color: PALETTE.shade, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 }))
  const hingeCeramic = mat(new MeshPhysicalMaterial({ color: PALETTE.shell, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.25 }))
  const satin = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.5, metalness: 0.35 }))
  const matte = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.66, metalness: 0.22 }))
  // The laptop's unibody: a satin anodised graphite, smoother than the furniture.
  const shellMat = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.34, metalness: 0.62 }))
  const rubber = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.78, metalness: 0.05 }))
  const slot = mat(new MeshBasicMaterial({ color: '#040309' }))
  const rim = mat(new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false }))
  const shade = mat(new MeshBasicMaterial({ map: kit.glow, color: '#000000', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }))

  const add = (g: BufferGeometry, m: Material, p: Object3D, x = 0, y = 0, z = 0, solid = true) => {
    const o = new Mesh(g, m)
    o.position.set(x, y, z)
    p.add(o)
    if (solid) solids.push(o)
    return o
  }

  // ---- chair

  const chair = new Group()
  const SEAT: Blob = { a: 0.215, b: 0.034, c: 0.205, e: 3.2, eTop: 7, eBottom: 2.6 }
  add(geo(blobGeometry(SEAT, 48, 20)), ceramic, chair, 0, SEAT_TOP - 0.03, 0)
  add(geo(seamGeometry(SEAT, 'y', -0.004, 0.0024, 140)), rim, chair, 0, SEAT_TOP - 0.03, 0, false)
  add(geo(new CylinderGeometry(0.07, 0.06, 0.04, 28)), satin, chair, 0, SEAT_TOP - 0.075, -0.01)
  add(geo(new CylinderGeometry(0.023, 0.023, 0.2, 16)), satin, chair, 0, 0.19, 0)
  add(geo(new CylinderGeometry(0.032, 0.03, 0.1, 18)), rubber, chair, 0, 0.12, 0)
  // Five spokes, each ending in a small caster, each caster on its own soft shadow.
  const spoke = geo(new BoxGeometry(0.024, 0.02, 0.23))
  const caster = geo(new CylinderGeometry(0.019, 0.019, 0.016, 16))
  const hood = geo(new SphereGeometry(0.02, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2))
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    const arm = new Group()
    arm.rotation.y = a
    chair.add(arm)
    const sp = add(spoke, satin, arm, 0, 0.06, 0.115)
    sp.rotation.x = 0.12
    add(hood, satin, arm, 0, 0.03, 0.235)
    add(caster, rubber, arm, 0, 0.019, 0.235).rotation.z = Math.PI / 2
    contact(kit, shade, arm, 0.09, 0.09, 0, 0.002, 0.235)
  }
  contact(kit, shade, chair, 0.62, 0.62, 0, 0.0015, 0)
  // The backrest: a ceramic shell on a graphite spine, its perforated panel faintly lit.
  const back = new Group()
  back.position.set(0, 0.64, -0.27)
  back.rotation.x = -0.12
  chair.add(back)
  add(geo(blobGeometry({ a: 0.2, b: 0.16, c: 0.026, e: 3.4 }, 40, 24)), ceramic, back)
  const panel = mat(createVent({ cols: 9, rows: 8, shape: 'rect', dim: 0.32 }))
  const pv = add(geo(new PlaneGeometry(0.29, 0.23)), panel, back, 0, 0, 0.027, false)
  pv.renderOrder = 1
  const spine = add(geo(new BoxGeometry(0.05, 0.3, 0.022)), satin, chair, 0, SEAT_TOP + 0.1, -0.255)
  spine.rotation.x = -0.1

  // ---- table: level, centred on its own frame, its +z (the front edge) toward the robot

  const table = new Group()
  const SLAB = 0.048
  const BAND = TABLE.t - SLAB
  add(geo(new RoundedBoxGeometry(TABLE.w, SLAB, TABLE.d, 2, 0.008)), matte, table, 0, TABLE_TOP - SLAB / 2, 0)
  add(geo(new RoundedBoxGeometry(TABLE.w + 0.004, BAND, TABLE.d + 0.004, 2, 0.006)), ceramic, table, 0, TABLE_TOP - SLAB - BAND / 2, 0)
  // A thin violet line along the front edge, where the slab meets its band, barely lit.
  const edgeLine = mat(new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }))
  add(geo(new BoxGeometry(TABLE.w * 0.97, 0.0018, 0.0018)), edgeLine, table, 0, TABLE_TOP - SLAB, TABLE.d / 2 + 0.0032, false)
  // The legs' centres, the apron between them, the legs, and a ceramic cap under each, standing on y = 0.
  const LX = TABLE.w / 2 - LEG_INSET
  const LZ = TABLE.d / 2 - LEG_INSET
  const under = TABLE_TOP - TABLE.t
  const CAP_H = 0.018
  const apronX = geo(new BoxGeometry(LX * 2, APRON, 0.018))
  const apronZ = geo(new BoxGeometry(0.018, APRON, LZ * 2))
  for (const s of [-1, 1]) {
    add(apronX, satin, table, 0, under - APRON / 2, s * LZ)
    add(apronZ, satin, table, s * LX, under - APRON / 2, 0)
  }
  const legMat = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.5, metalness: 0.35, vertexColors: true }))
  const leg = geo(legGeometry(0.024, 0.017, under - CAP_H))
  const cap = geo(new CylinderGeometry(0.026, 0.03, CAP_H, 24))
  for (const [x, z] of [
    [-LX, -LZ],
    [LX, -LZ],
    [-LX, LZ],
    [LX, LZ],
  ]) {
    add(leg, legMat, table, x, CAP_H + (under - CAP_H) / 2, z)
    add(cap, ceramic, table, x, CAP_H / 2, z)
    contact(kit, shade, table, 0.12, 0.12, x, 0.0016, z)
  }
  // The top's own soft shadow on the floor, its shape (the key light casts the sharp one).
  const rectShade = mat(new MeshBasicMaterial({ map: kit.tex(softRect(0.3)), color: '#000000', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }))
  contact(kit, rectShade, table, TABLE.w * 1.08, TABLE.d * 1.12, 0, 0.0012, 0)
  // A row of dots inlaid along the near edge (#A78BFA, under 20%).
  const inlay = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: { uColor: { value: new Color(PALETTE.soft) }, uFade: { value: 1 }, uCols: { value: Math.round((TABLE.w * 0.88) / 0.0143) } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uFade; uniform float uCols; varying vec2 vUv;
        void main() {
          vec2 p = vUv * vec2(uCols, 2.0);
          vec2 f = fract(p) - 0.5;
          float d = length(f * vec2(1.0, 0.9));
          float aa = fwidth(d) + 1e-4;
          float a = (1.0 - smoothstep(0.26 - aa, 0.26 + aa, d)) * 0.18 * uFade;
          gl_FragColor = vec4(uColor, a);
        }`,
    }),
  )
  own.push(inlay)
  // In the strip of top in front of the laptop (model.ts keeps the laptop 0.03 behind the edge).
  const strip = add(geo(new PlaneGeometry(TABLE.w * 0.88, 0.016)), inlay, table, 0, TABLE_TOP + 0.0006, TABLE.d / 2 - 0.016, false)
  strip.rotation.x = -Math.PI / 2
  strip.renderOrder = 2
  const underglow = mat(
    new MeshBasicMaterial({ map: kit.glow, color: PALETTE.accent, transparent: true, opacity: 0.08, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
  )
  own.push(underglow)
  const pool = add(geo(new PlaneGeometry(TABLE.w * 1.5, TABLE.d * 1.8)), underglow, table, 0, 0.004, 0, false)
  pool.rotation.x = -Math.PI / 2
  pool.renderOrder = -1

  // ---- laptop

  const L = LAPTOP
  const laptop = new Group()
  laptop.scale.setScalar(L.scale)
  // A soft shadow its own shape under it on the table, and the unibody on four rubber feet. The base's
  // back edge is the hinge barrel (below): the box stops at the barrel's axis, the barrel rounds it off.
  contact(kit, rectShade, laptop, L.w * 1.08, L.d * 1.1, 0, 0.0002, 0)
  const HINGE_R = L.h / 2 + 0.0006
  const hingeY = L.h / 2 + 0.0012
  const hingeZ = -L.d / 2 + HINGE_R
  add(geo(new RoundedBoxGeometry(L.w, L.h, L.d - HINGE_R, 2, 0.0028)), shellMat, laptop, 0, hingeY, HINGE_R / 2)
  const foot = geo(new CylinderGeometry(0.006, 0.006, 0.0014, 12))
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    add(foot, rubber, laptop, x * (L.w / 2 - 0.02), 0.0007, z * (L.d / 2 - 0.02), false)
  const top = L.h + 0.0012
  // The chamfer's hairline highlight along the front edge.
  const hairline = mat(new MeshBasicMaterial({ color: PALETTE.glow, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }))
  add(geo(new BoxGeometry(L.w * 0.96, 0.0005, 0.0005)), hairline, laptop, 0, top - 0.0006, L.d / 2 - 0.0004, false)
  // The keys and their backlight.
  const keyboard = createKeyboard(kit)
  keyboard.plane.position.set(0, top + 0.0003, L.keysZ)
  keyboard.plane.rotation.x = -Math.PI / 2
  laptop.add(keyboard.plane)
  own.push(keyboard.backlight)
  // Speaker grilles: dot perforations either side of the keys.
  const grille = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uHole: { value: new Color('#050409') }, uTint: { value: new Color(PALETTE.accent) }, uFade: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uHole; uniform vec3 uTint; uniform float uFade; varying vec2 vUv;
        void main() {
          vec2 p = vUv * vec2(3.0, 16.0);
          vec2 f = fract(p) - 0.5;
          float d = length(f * vec2(1.0, 0.55));
          float aa = fwidth(d) + 1e-4;
          float a = 1.0 - smoothstep(0.2 - aa, 0.2 + aa, d);
          gl_FragColor = vec4(mix(uHole, uTint, 0.06), a * 0.85 * uFade);
        }`,
    }),
  )
  own.push(grille)
  for (const s of [-1, 1]) {
    const g = add(geo(new PlaneGeometry(0.016, KEYBOARD.d * 0.95)), grille, laptop, s * (KEYBOARD.w / 2 + 0.0135), top + 0.0002, L.keysZ, false)
    g.rotation.x = -Math.PI / 2
  }
  // The trackpad: a faint outline in the palm rest.
  const padMat = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uLine: { value: new Color('#4a4363') }, uFade: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uLine; uniform float uFade; varying vec2 vUv;
        void main() {
          vec2 q = abs(vUv - 0.5) * vec2(0.11, 0.062);
          vec2 hs = vec2(0.055, 0.031) - 0.004;
          float d = length(max(q - hs + 0.004, 0.0)) - 0.004;
          float aa = fwidth(d) + 1e-5;
          float line = 1.0 - smoothstep(0.0003 - aa, 0.0003 + aa, abs(d));
          float fill = (1.0 - smoothstep(-aa, aa, d)) * 0.08;
          gl_FragColor = vec4(uLine, max(line * 0.55, fill) * uFade);
        }`,
    }),
  )
  own.push(padMat)
  const pad = add(geo(new PlaneGeometry(0.11, 0.062)), padMat, laptop, 0, top + 0.0002, L.d / 2 - 0.042, false)
  pad.rotation.x = -Math.PI / 2
  // Port slits on both sides.
  const port = geo(new BoxGeometry(0.0008, 0.0032, 0.012))
  for (const [x, z] of [
    [-1, -0.05],
    [-1, -0.03],
    [1, -0.045],
  ])
    add(port, slot, laptop, x * (L.w / 2 + 0.0001), L.h / 2 + 0.0012, z, false)
  // The hinge: a ceramic barrel along the whole back edge, the base's height, the lid turning on its
  // axis; a faint violet line in the seam where the deck meets it.
  const hinge = add(geo(new CylinderGeometry(HINGE_R, HINGE_R, L.w - 0.005, 24)), hingeCeramic, laptop, 0, hingeY, hingeZ)
  hinge.rotation.z = Math.PI / 2
  const hingeLine = mat(new MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }))
  const hl = add(geo(new CylinderGeometry(0.0007, 0.0007, L.w * 0.8, 6)), hingeLine, laptop, 0, top + 0.0002, hingeZ + 0.0035, false)
  hl.rotation.z = Math.PI / 2

  // The lid, open 110 degrees on the hinge's axis (its lower edge inside the barrel): the display on its
  // inner face behind a thin black bezel.
  const lid = new Group()
  lid.position.set(0, hingeY, hingeZ)
  lid.rotation.x = -LID_TILT
  laptop.add(lid)
  add(geo(new RoundedBoxGeometry(L.w, LID_H, 0.0055, 2, 0.0022)), shellMat, lid, 0, LID_H / 2, 0)
  const glass = mat(new MeshPhysicalMaterial({ color: '#05040a', roughness: 0.12, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 0.25 }))
  add(geo(new PlaneGeometry(L.w - 0.006, LID_H - 0.006)), glass, lid, 0, LID_H / 2, 0.0029, false)
  const SCREEN_Y = 0.113
  const screen = mat(createScreen())
  own.push(screen)
  const display = add(geo(new PlaneGeometry(SCREEN.w, SCREEN.h)), screen, lid, 0, SCREEN_Y, 0.0031, false)
  display.renderOrder = 3
  // The specular hairline along the lid's top edge.
  const lidEdge = mat(new MeshBasicMaterial({ color: PALETTE.glow, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }))
  add(geo(new BoxGeometry(L.w * 0.97, 0.0006, 0.0006)), lidEdge, lid, 0, LID_H - 0.0004, 0.0029, false)
  // The violet dot on the back.
  const dot = mat(new MeshBasicMaterial({ color: PALETTE.soft, toneMapped: false }))
  const logo = add(geo(new CircleGeometry(0.0075, 20)), dot, lid, 0, SCREEN_Y, -0.0029, false)
  logo.rotation.y = Math.PI
  // The display's glow (the scene's stand-in for bloom on its HDR dots): soft, just past the panel.
  const screenGlow = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: { uColor: { value: new Color(PALETTE.accent) }, uHalf: { value: new Vector2(SCREEN.w / 2, SCREEN.h / 2) }, uA: { value: 0 } },
      vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform vec2 uHalf; uniform float uA; varying vec2 vP;
        void main() {
          vec2 q = max(abs(vP) - uHalf, 0.0);
          float d = length(q);
          float a = exp(-d / 0.022) * (1.0 - step(d, 0.0) * 0.7) * uA;
          gl_FragColor = vec4(uColor, a);
        }`,
    }),
  )
  own.push(screenGlow)
  const sg = add(geo(new PlaneGeometry(SCREEN.w + 0.12, SCREEN.h + 0.12)), screenGlow, lid, 0, SCREEN_Y, 0.0036, false)
  sg.renderOrder = 4
  // The display as a light: an area light over the panel (sized in world units), shining out of it.
  const screenLight = new RectAreaLight('#8f7bff', 0, SCREEN.w * L.scale, SCREEN.h * L.scale)
  screenLight.position.set(0, SCREEN_Y, 0.006)
  screenLight.rotation.y = Math.PI
  lid.add(screenLight)
  // The keyboard's backlight, under the fingers and wrists.
  const keyLight = new PointLight(PALETTE.accent, 0, 0.45, 2)
  // (Far enough above the caps that none of them takes a near-white hot spot.)
  keyLight.position.set(0, top + 0.03, L.keysZ)
  laptop.add(keyLight)
  // The screen's light on the tabletop round the laptop: in the table's frame, clipped to the top
  // (model.ts sets uOff to the laptop's place on it), brightest along the laptop's front.
  const tableGlow = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uColor: { value: new Color(PALETTE.accent) },
        uA: { value: 0 },
        uOff: { value: new Vector2() },
        uHalf: { value: new Vector2(TABLE.w / 2, TABLE.d / 2) },
        uSize: { value: new Vector2(L.w * L.scale * 1.7, L.d * L.scale * 1.5) },
      },
      vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uA; uniform vec2 uOff; uniform vec2 uHalf; uniform vec2 uSize; varying vec2 vP;
        void main() {
          vec2 q = vP / (uSize * 0.5);
          float a = exp(-dot(q, q) * 2.4) * (0.7 + 0.3 * clamp(-q.y, 0.0, 1.0)) * (1.0 - smoothstep(0.8, 1.0, max(abs(q.x), abs(q.y))));
          // Table space (the plane lies flat: its y is the table's -z); nothing past the top's edges.
          vec2 e = uHalf - abs(vec2(vP.x + uOff.x, -vP.y + uOff.y));
          a *= smoothstep(0.0, 0.025, min(e.x, e.y)) * uA;
          gl_FragColor = vec4(uColor, a);
        }`,
    }),
  )
  own.push(tableGlow)
  const tableGlowMesh = new Mesh(geo(new PlaneGeometry(L.w * L.scale * 1.7, L.d * L.scale * 1.5)), tableGlow)
  tableGlowMesh.rotation.x = -Math.PI / 2
  tableGlowMesh.position.y = TABLE_TOP + 0.0008
  tableGlowMesh.renderOrder = 1
  table.add(tableGlowMesh)

  return { chair, table, laptop, lid, keyboard, screen, display, screenLight, keyLight, screenGlow, tableGlow, tableGlowMesh, underglow, lidEdge, fades: [inlay, grille, padMat], solids, own }
}
