/**
 * The robot's accessories and the dot materials the scene shares (model.ts and
 * furniture.ts place them; perform.ts animates them):
 *
 *   headphones  premium over-ears resting on the head (the head itself is not
 *               touched): a graphite band with ceramic sliders, graphite cups
 *               with a dot grille and a violet ring on the outer face, and two
 *               dotted sound-wave arcs leaving each cup on every beat
 *   keyboard    real rounded keycaps (5 rows, 61 keys) over a soft violet
 *               backlight; a pressed cap dips and flashes #C4B5FD for 120 ms
 *   screen      the laptop's dot-matrix display laid out like an IDE (tabs,
 *               file tree, gutter, code, minimap, terminal, status bar), all
 *               dots of violet brightness. No text, no syntax colours
 *   stage       a ring of equaliser columns round the stage (beat-locked), two
 *               dotted orbit rings (depth-tested, so the furniture and the
 *               robot hide what passes behind them) and the commit pulse
 *
 * Every colour is a brightness or opacity of the hero's violets.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Kit } from './body'
import { PALETTE } from './body'

const lin = (hex: string) => new Color(hex)

// ---- headphones

export interface Headphones {
  group: Group
  /** The cups' violet rings (beat). */
  rings: MeshBasicMaterial
  /** Sound-wave arcs: uPhase (0..1 through the beat), uOn. */
  waves: ShaderMaterial
  /** Solid materials, for the engine's dissolve. */
  solids: Material[]
  meshes: Mesh[]
}

/** Head-space measures (model.ts HEAD: half sizes 0.56 x 0.43; ear caps at x = +-0.564). */
const CUP_X = 0.652
const CUP_R = 0.148

export function buildHeadphones(kit: Kit, head: Group): Headphones {
  const { geo, mat } = kit
  const group = new Group()
  head.add(group)
  const meshes: Mesh[] = []
  const graphite = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.38, metalness: 0.55 }))
  const cushion = mat(new MeshStandardMaterial({ color: PALETTE.graphite, roughness: 0.85, metalness: 0.0 }))
  const ceramic = mat(new MeshStandardMaterial({ color: PALETTE.shell, roughness: 0.4, metalness: 0 }))
  const rings = mat(new MeshBasicMaterial({ color: PALETTE.accent, toneMapped: false }))
  const grille = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uHole: { value: lin('#0b0916') }, uFace: { value: lin(PALETTE.graphite) }, uGlow: { value: lin(PALETTE.accent) }, uPulse: { value: 0 } },
      vertexShader: /* glsl */ `
        #include <common>
        varying vec2 vUv;
        void main() { vUv = uv;
          #include <begin_vertex>
          #include <project_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uHole; uniform vec3 uFace; uniform vec3 uGlow; uniform float uPulse;
        varying vec2 vUv;
        void main() {
          vec2 q = vUv * 2.0 - 1.0;
          // Perforations on a 9 x 9 lattice inside the disc, faintly lit violet from within on the beat.
          vec2 p = vUv * 9.0;
          vec2 f = fract(p) - 0.5;
          vec2 cc = (floor(p) + 0.5) / 9.0 * 2.0 - 1.0;
          float d = length(f);
          float aa = fwidth(d) + 1e-4;
          float hole = step(length(cc), 0.86) * (1.0 - smoothstep(0.26 - aa, 0.26 + aa, d));
          vec3 col = mix(uFace, mix(uHole, uGlow, 0.18 + 0.4 * uPulse), hole);
          float edge = 1.0 - smoothstep(0.98, 1.0, length(q));
          gl_FragColor = vec4(col, edge);
        }`,
    }),
  )
  const waves = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: { uPhase: { value: 0 }, uOn: { value: 0 }, uSide: { value: 1 }, uColor: { value: lin(PALETTE.soft) } },
      vertexShader: /* glsl */ `
        uniform float uSide;
        varying vec2 vP;
        varying vec2 vOut;
        void main() {
          vP = position.xy;
          // A camera-facing card; the outward direction is the cup's own axis, seen from here.
          vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec2 o = (modelViewMatrix * vec4(uSide, 0.0, 0.0, 0.0)).xy;
          vOut = length(o) > 1e-4 ? normalize(o) : vec2(1.0, 0.0);
          mv.xy += position.xy;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uPhase; uniform float uOn; uniform vec3 uColor;
        varying vec2 vP;
        varying vec2 vOut;
        float arc(float r, float rad) {
          // Dots along an arc of radius rad, +-55 degrees round the outward direction.
          float ang = atan(vP.x * vOut.y - vP.y * vOut.x, dot(vP, vOut));
          float n = max(5.0, floor(rad * 120.0));
          float step = 1.9 / n;
          float ai = floor(ang / step + 0.5) * step;
          if (abs(ai) > 0.96) return 0.0;
          vec2 dir = vec2(vOut.x * cos(ai) - vOut.y * sin(ai), vOut.y * cos(ai) + vOut.x * sin(ai));
          float d = length(vP - dir * rad);
          float aa = fwidth(d) + 1e-5;
          return 1.0 - smoothstep(0.0075 - aa, 0.0075 + aa, d);
        }
        void main() {
          float t = uPhase;
          float r1 = 0.17 + 0.2 * t;
          float a = arc(length(vP), r1) * (1.0 - t);
          float t2 = clamp(t - 0.18, 0.0, 1.0);
          a += arc(length(vP), 0.17 + 0.2 * t2) * (1.0 - t2) * 0.7 * step(0.18, t);
          a *= 0.25 * uOn * smoothstep(0.0, 0.08, t);
          gl_FragColor = vec4(uColor, a);
        }`,
    }),
  )

  const add = (g: BufferGeometry, m: Material, p: Object3D, x = 0, y = 0, z = 0) => {
    const o = new Mesh(g, m)
    o.position.set(x, y, z)
    p.add(o)
    meshes.push(o)
    return o
  }

  // Cups: a graphite drum over each ear cap, a cushion against the head, the grille and ring outside.
  const cupGeo = geo(new CylinderGeometry(CUP_R, CUP_R * 0.95, 0.072, 48))
  const cushionGeo = geo(new TorusGeometry(0.124, 0.022, 12, 48))
  const grilleGeo = geo(new CircleGeometry(0.108, 48))
  const ringGeo = geo(new TorusGeometry(0.122, 0.0055, 8, 64))
  const yokeGeo = geo(new CapsuleGeometry(0.014, 0.12, 4, 10))
  const waveGeo = geo(new PlaneGeometry(0.9, 0.9))
  for (const s of [-1, 1]) {
    const cup = new Group()
    cup.position.set(s * CUP_X, -0.01, -0.02)
    group.add(cup)
    add(cupGeo, graphite, cup).rotation.z = Math.PI / 2
    add(cushionGeo, cushion, cup, -s * 0.05, 0, 0).rotation.y = Math.PI / 2
    const gr = add(grilleGeo, grille, cup, s * 0.0375, 0, 0)
    gr.rotation.y = (s * Math.PI) / 2
    gr.renderOrder = 1
    add(ringGeo, rings, cup, s * 0.037, 0, 0).rotation.y = Math.PI / 2
    // The yoke: a fork from the band down to the cup's top.
    add(yokeGeo, graphite, cup, s * 0.004, CUP_R - 0.01, 0)
    const w = new Mesh(waveGeo, s > 0 ? waves : (waves.clone() as ShaderMaterial))
    if (s < 0) {
      const m = w.material as ShaderMaterial
      kit.mat(m)
      m.uniforms = { ...waves.uniforms, uSide: { value: -1 } }
    }
    w.position.set(s * 0.05, 0, 0)
    w.renderOrder = 4
    w.frustumCulled = false
    cup.add(w)
  }

  // The band: a squared arc from cup to cup, resting on the head's flat top, with ceramic sliders.
  const band = (t0: number, t1: number) => {
    const pts: Vector3[] = []
    for (let i = 0; i <= 40; i++) {
      const t = t0 + ((t1 - t0) * i) / 40
      const c = Math.cos(t)
      const sn = Math.sin(t)
      pts.push(new Vector3(0.668 * Math.sign(c) * Math.abs(c) ** 0.5, 0.11 + 0.372 * Math.abs(sn) ** 0.42, -0.02))
    }
    return new CatmullRomCurve3(pts)
  }
  add(geo(new TubeGeometry(band(0, Math.PI), 120, 0.016, 10, false)), graphite, group)
  add(geo(new TubeGeometry(band(0.05, 0.32), 30, 0.024, 12, false)), ceramic, group)
  add(geo(new TubeGeometry(band(Math.PI - 0.32, Math.PI - 0.05), 30, 0.024, 12, false)), ceramic, group)
  // A soft pad where it rests.
  const pad = add(geo(new CapsuleGeometry(0.019, 0.42, 6, 12)), cushion, group, 0, 0.456, -0.02)
  pad.rotation.z = Math.PI / 2

  return { group, rings, waves, solids: [graphite, cushion, ceramic, rings, grille], meshes }
}

// ---- keyboard

/** The keyboard well, laptop units (the laptop group scales it): 15 key units across, 5 rows deep. */
export const KEYBOARD = { w: 0.27, d: 0.098 }
/** Key widths (in key units, 15 per row), row 0 nearest the user. */
const KEY_ROWS: number[][] = [
  [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
]
const KEY_GAP = 0.0034

export interface KeyCap {
  /** Centre, keyboard-plane units (x across, y from the user toward the screen). */
  x: number
  y: number
  w: number
  d: number
  row: number
}

export const KEY_CAPS: KeyCap[] = (() => {
  const u = KEYBOARD.w / 15
  const rh = KEYBOARD.d / KEY_ROWS.length
  const caps: KeyCap[] = []
  KEY_ROWS.forEach((row, r) => {
    let acc = 0
    for (const w of row) {
      caps.push({ x: -KEYBOARD.w / 2 + (acc + w / 2) * u, y: -KEYBOARD.d / 2 + (r + 0.5) * rh, w: w * u - KEY_GAP, d: rh - KEY_GAP, row: r })
      acc += w
    }
  })
  return caps
})()

/** The key under keyboard-plane (x, y), or -1 between keys or off the board. */
export function keyAt(x: number, y: number): number {
  for (let i = 0; i < KEY_CAPS.length; i++) {
    const k = KEY_CAPS[i]
    if (Math.abs(x - k.x) <= k.w / 2 + KEY_GAP / 2 && Math.abs(y - k.y) <= k.d / 2 + KEY_GAP / 2) return i
  }
  return -1
}

/** How many recent presses light the backlight round their key. */
const HALOS = 4
/** A press: the cap goes down and flashes #C4B5FD for 120 ms. */
const FLASH = 0.12

export interface Keyboard {
  /** The keyboard plane (local +Y from the user toward the screen, +Z up): fingertips are mapped onto it. */
  plane: Mesh
  caps: Mesh
  capMaterial: MeshStandardMaterial
  backlight: ShaderMaterial
  /** Press key `i` (KEY_CAPS index). */
  press(i: number): void
  /** Advance the flashes; `power` dims the backlight (the laptop's power-on and power-down). */
  update(dt: number, power: number): void
}

/**
 * Real keycaps (one merged mesh of rounded, bevelled caps, so the screen's light and the room's catch
 * their edges) over a soft violet backlight (#7C5CFF at about 25%) that bleeds up between them. A
 * pressed cap dips and flashes; the backlight swells round it.
 */
export function createKeyboard(kit: Kit): Keyboard {
  const { geo, mat } = kit
  const parts: BufferGeometry[] = []
  KEY_CAPS.forEach((k, i) => {
    const r = Math.min(0.0024, k.d * 0.2)
    const s = new Shape()
    const x0 = k.x - k.w / 2
    const y0 = k.y - k.d / 2
    s.moveTo(x0 + r, y0)
    s.lineTo(x0 + k.w - r, y0)
    s.quadraticCurveTo(x0 + k.w, y0, x0 + k.w, y0 + r)
    s.lineTo(x0 + k.w, y0 + k.d - r)
    s.quadraticCurveTo(x0 + k.w, y0 + k.d, x0 + k.w - r, y0 + k.d)
    s.lineTo(x0 + r, y0 + k.d)
    s.quadraticCurveTo(x0, y0 + k.d, x0, y0 + k.d - r)
    s.lineTo(x0, y0 + r)
    s.quadraticCurveTo(x0, y0, x0 + r, y0)
    const g = new ExtrudeGeometry(s, { depth: 0.0018, bevelEnabled: true, bevelThickness: 0.0007, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 3 })
    g.translate(0, 0, 0.0009)
    const n = g.attributes.position.count
    g.setAttribute('aKey', new Float32BufferAttribute(new Float32Array(n).fill(i), 1))
    parts.push(g)
  })
  const capsGeo = geo(mergeGeometries(parts)!)
  parts.forEach((p) => p.dispose())

  const flash = new Array<number>(KEY_CAPS.length).fill(0)
  const since = new Float32Array(KEY_CAPS.length).fill(9)
  const capMaterial = mat(new MeshStandardMaterial({ color: '#272139', roughness: 0.46, metalness: 0.22 }))
  const flashU = { value: flash }
  const hotU = { value: lin(PALETTE.glow) }
  capMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uFlash = flashU
    shader.uniforms.uKeyHot = hotU
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aKey;\nuniform float uFlash[${KEY_CAPS.length}];\nvarying float vFlash;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvFlash = uFlash[int(aKey + 0.5)];\ntransformed.z -= vFlash * 0.0011;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uKeyHot;\nvarying float vFlash;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uKeyHot * vFlash * 1.5;')
  }
  capMaterial.customProgramCacheKey = () => 'keycaps'

  const halos = Array.from({ length: HALOS }, () => new Vector3(0, 0, 0))
  let haloSlot = 0
  const backlight = mat(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uSize: { value: new Vector2(KEYBOARD.w, KEYBOARD.d) },
        uHalo: { value: halos },
        uBase: { value: lin(PALETTE.accent) },
        uHot: { value: lin(PALETTE.glow) },
        uPower: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uSize; uniform vec3 uHalo[${HALOS}]; uniform vec3 uBase; uniform vec3 uHot; uniform float uPower;
        varying vec2 vP;
        void main() {
          // Inside the well, feathered at its edges (the light bleeds a little past them).
          vec2 e = abs(vP) - uSize * 0.5;
          float inside = 1.0 - smoothstep(-0.004, 0.006, max(e.x, e.y));
          float a = 0.25 * inside;
          vec3 col = uBase;
          float h = 0.0;
          for (int i = 0; i < ${HALOS}; i++) {
            vec2 d = (vP - uHalo[i].xy) / 0.013;
            h += exp(-dot(d, d)) * uHalo[i].z;
          }
          col = mix(col, uHot, clamp(h, 0.0, 1.0));
          a = (a + 0.5 * h * inside) * uPower;
          gl_FragColor = vec4(col, a);
        }`,
    }),
  )
  const plane = new Mesh(geo(new PlaneGeometry(KEYBOARD.w * 1.06, KEYBOARD.d * 1.12)), backlight)
  plane.renderOrder = 2
  const caps = new Mesh(capsGeo, capMaterial)
  plane.add(caps)

  return {
    plane,
    caps,
    capMaterial,
    backlight,
    press(i) {
      if (i < 0) return
      since[i] = 0
      const k = KEY_CAPS[i]
      halos[haloSlot].set(k.x, k.y, 1)
      haloSlot = (haloSlot + 1) % HALOS
    },
    update(dt, power) {
      for (let i = 0; i < since.length; i++) {
        if (since[i] > 1) {
          flash[i] = 0
          continue
        }
        since[i] += dt
        const t = since[i]
        flash[i] = t < 0.02 ? t / 0.02 : 1 - Math.min(1, Math.max(0, (t - FLASH * 0.6) / (FLASH * 0.4)))
      }
      for (const h of halos) h.z = Math.max(0, h.z - dt / 0.18)
      backlight.uniforms.uPower.value = power
    },
  }
}

// ---- screen

/** The display (laptop units), its dot grid (columns; rows follow the aspect). */
export const SCREEN = { w: 0.31, h: 0.19, cols: 72 }

/**
 * The laptop's dot-matrix display, laid out like an IDE and made only of dots of violet brightness
 * (no text, no syntax colours): a tab bar of three pills (one lit), a file tree, a line-number gutter
 * of fine dots, the code (runs of dots of varying indent and length, scrolling up a line every 0.8 s,
 * a blinking dot cursor, two or three highlighted lines in #C4B5FD), a minimap with its lit viewport,
 * a terminal whose output lines append during a build and whose dot check mark pulses on success,
 * and a status bar with a slowly filling progress run. A soft light sweeps it top to bottom on success.
 */
export function createScreen(): ShaderMaterial {
  const rows = Math.round((SCREEN.h / SCREEN.w) * SCREEN.cols)
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uGrid: { value: new Vector2(SCREEN.cols, rows) },
      uAspect: { value: SCREEN.w / SCREEN.h },
      /** Whole dot rows the code has scrolled (two per line). */
      uRows: { value: 0 },
      /** 0..1 through the line being typed. */
      uTyped: { value: 0 },
      uCursor: { value: 1 },
      /** Terminal lines shown (fractional: the last one is still printing), and the build they belong to. */
      uTerm: { value: 4 },
      uTermSeed: { value: 0 },
      /** The check mark: 0 hidden, then its pulse (1 at the peak, settling to 0.35). */
      uCheck: { value: 0.35 },
      /** The success sweep (0 top .. 1 bottom; < 0 none). */
      uSweep: { value: -1 },
      uProgress: { value: 0 },
      /** Overall brightness: the scroll's +-6% and the success's +15%. */
      uGlow: { value: 1 },
      uPower: { value: 0 },
      uFade: { value: 1 },
      uBg: { value: lin('#0c0919') },
      uDot: { value: lin(PALETTE.soft) },
      uHot: { value: lin(PALETTE.glow) },
      uFrame: { value: lin(PALETTE.accent) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uGrid; uniform float uAspect; uniform float uRows; uniform float uTyped; uniform float uCursor;
      uniform float uTerm; uniform float uTermSeed; uniform float uCheck; uniform float uSweep; uniform float uProgress;
      uniform float uGlow; uniform float uPower; uniform float uFade;
      uniform vec3 uBg; uniform vec3 uDot; uniform vec3 uHot; uniform vec3 uFrame;
      varying vec2 vUv;
      float h1(float n) { return fract(sin(n * 91.345 + 17.13) * 43758.5453); }
      float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
      void main() {
        float C = uGrid.x;
        float R = uGrid.y;
        // Cells from the top left; a 1-cell margin all round.
        vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uGrid;
        vec2 cell = floor(p);
        vec2 f = fract(p) - 0.5;
        float cx = cell.x;
        float cy = cell.y;
        float lit = 0.035;
        float hot = 0.0;
        float rad = 0.3;

        float side = 11.0;           // file tree: columns 1..side-1
        float gut = side + 2.0;      // gutter: two fine columns
        float codeL = side + 5.0;    // code
        float mini = C - 7.0;        // minimap: columns mini..C-2
        float codeTop = 5.0;
        float termTop = R - 12.0;
        float codeBot = termTop - 2.0;

        if (cy == 2.0) {
          // Tabs: three pills, the second one open.
          bool t0 = cx >= 2.0 && cx <= 9.0;
          bool t1 = cx >= 11.0 && cx <= 19.0;
          bool t2 = cx >= 21.0 && cx <= 27.0;
          if (t1) { lit = 0.8; hot = 0.55; }
          else if (t0 || t2) lit = 0.3;
        } else if (cy == 4.0 && cx >= 1.0 && cx <= C - 2.0) {
          lit = 0.075;
        } else if (cy == R - 2.0 && cx >= 1.0 && cx <= C - 2.0) {
          // The status bar: a dim run with a slowly filling progress run, and two small marks at the right.
          lit = 0.1;
          if (cx >= 2.0 && cx < 2.0 + floor(uProgress * 22.0)) lit = 0.5;
          if (cx >= C - 10.0 && cx <= C - 8.0) lit = 0.32;
          if (cx >= C - 5.0 && cx <= C - 3.0) lit = 0.22;
        } else if (cy == termTop && cx >= side + 1.0 && cx <= C - 2.0) {
          lit = 0.075;
        } else if (cy > termTop && cy < R - 3.0 && cx >= side + 2.0 && cx <= C - 2.0) {
          // The terminal: a prompt dot and an output run per line, appended during a build.
          float rel = cy - termTop - 2.0;
          if (rel >= 0.0 && mod(rel, 2.0) < 1.0) {
            float line = rel / 2.0;
            float len = 6.0 + floor(h1(uTermSeed * 13.1 + line * 3.7) * 22.0);
            float shown = line < floor(uTerm) ? len : (line < uTerm ? floor(fract(uTerm) * len) : -1.0);
            float x = cx - (side + 3.0);
            if (x == 0.0 && shown >= 0.0) lit = 0.55;
            else if (x >= 2.0 && x < 2.0 + shown) lit = 0.3 + 0.18 * h1(line + floor(x / 5.0) + uTermSeed);
          }
          // The check mark, drawn in dots at the terminal's right.
          vec2 q = vec2(cx - (C - 12.0), cy - (termTop + 2.0));
          float dc = min(segD(q, vec2(0.0, 3.0), vec2(2.0, 5.0)), segD(q, vec2(2.0, 5.0), vec2(7.0, 0.0)));
          if (dc < 0.55 && uCheck > 0.0) { lit = max(lit, 0.25 + 0.75 * uCheck); hot = max(hot, uCheck); }
        } else if (cy >= codeTop && cy <= codeBot) {
          float rowC = cy - codeTop;
          if (cx >= 1.0 && cx < side) {
            // The file tree: entries every other row, indented 0..2 levels; one selected.
            if (mod(rowC, 2.0) < 1.0) {
              float e = rowC / 2.0;
              float ind = floor(h1(e * 3.7 + 1.0) * 3.0);
              float len = 3.0 + floor(h1(e * 5.1 + 2.0) * 4.0);
              float x = cx - 1.0 - ind * 1.5;
              if (x >= 0.0 && x < len) lit = 0.26 + 0.12 * h1(e);
              if (e == 3.0) { lit = x >= 0.0 && x < len ? 0.75 : 0.11; hot = x >= 0.0 && x < len ? 0.4 : 0.0; }
            }
          } else if (cx == side) {
            lit = 0.06;
          } else {
            float rowAbs = rowC + uRows;
            float line = floor(rowAbs / 2.0);
            bool textRow = mod(rowAbs, 2.0) < 1.0;
            float codeRows = codeBot - codeTop + 1.0;
            float lastLine = floor((codeRows - 1.0 + uRows) / 2.0);
            float r0 = h1(line);
            float ind = floor(h1(line + 3.1) * 4.0) * 2.0;
            float len = 4.0 + floor(h1(line + 7.7) * (mini - codeL - 10.0));
            bool empty = r0 < 0.12;
            bool high = mod(line, 7.0) == 3.0;
            if (cx >= gut && cx < gut + 2.0) {
              // Line numbers: a column of fine dots, the current line's brighter.
              if (textRow && !empty) { rad = 0.2; lit = line >= lastLine ? 0.5 : 0.2; }
            } else if (cx >= codeL && cx < mini - 1.0) {
              float x = cx - codeL;
              float gA = ind + 2.0 + floor(h1(line + 11.3) * 5.0);
              float gB = gA + 3.0 + floor(h1(line + 13.9) * 7.0);
              bool inRun = x >= ind && x < ind + len && x != gA && x != gB;
              float shown = line >= lastLine ? floor(uTyped * len) : len;
              bool typed = x < ind + shown;
              bool cursor = line >= lastLine && x == ind + shown && uCursor > 0.5;
              if (textRow && !empty && inRun && typed) {
                lit = high ? 0.95 : 0.4 + 0.32 * h1(line + 5.3) + 0.1 * h1(floor(x / 4.0) + line);
                hot = high ? 0.85 : 0.0;
              }
              if (high && textRow) lit = max(lit, 0.08);
              if (textRow && cursor) { lit = 1.0; hot = 1.0; }
            } else if (cx >= mini && cx <= C - 2.0) {
              // The minimap: every line compressed onto one dot row; its viewport window lit.
              float mLine = floor(uRows / 2.0) - 6.0 + rowC;
              float mLen = floor((4.0 + h1(mLine + 7.7) * 30.0) / 6.0) + 1.0;
              float mx = cx - mini;
              bool win = rowC >= 6.0 && rowC < 6.0 + codeRows / 2.0;
              rad = 0.24;
              lit = win ? 0.1 : 0.035;
              if (h1(mLine) >= 0.12 && mx >= floor(h1(mLine + 3.1) * 2.0) && mx < mLen) lit = win ? 0.42 : 0.2;
            }
          }
        }

        // The success sweep: a soft band of light running top to bottom.
        float sw = uSweep >= 0.0 ? exp(-pow((cy / R - uSweep) * 6.0, 2.0)) : 0.0;
        lit = min(1.0, lit * (1.0 + 0.9 * sw) + 0.28 * sw);
        hot = max(hot, sw * 0.55);
        lit *= uGlow;

        // The dots, anti-aliased; when they get smaller than about two pixels they average out rather than shimmer.
        float d = length(f);
        float px = fwidth(p.x);
        float aa = max(fwidth(d), 1e-4);
        float dotA = 1.0 - smoothstep(rad - aa, rad + aa, d);
        // (Averaged, a lit dot still reads as lit: a display's pixels bleed into each other.)
        dotA = mix(dotA, 0.5, smoothstep(0.35, 0.8, px));

        vec3 dotCol = mix(uDot, uHot, hot) * (1.05 + 0.6 * hot);
        vec3 col = mix(uBg, dotCol, clamp(dotA * lit, 0.0, 1.0));
        // A hairline violet frame just inside the glass, and the panel's faint falloff toward its edges.
        vec2 e = min(vUv, 1.0 - vUv) * vec2(uAspect, 1.0);
        float edgeD = min(e.x, e.y);
        float fa = fwidth(edgeD) + 1e-5;
        float frame = 1.0 - smoothstep(0.003 - fa, 0.003 + fa, abs(edgeD - 0.008));
        col = mix(col, uFrame * 1.2, frame * 0.4);
        col *= 0.88 + 0.12 * smoothstep(0.0, 0.08, edgeD);
        gl_FragColor = vec4(col, uPower * uFade);
      }`,
  })
}

// ---- points sized in world units (the equaliser, the orbit rings, the commit pulse)

const pointVert = /* glsl */ `
  uniform float uSize;
  uniform float uHalfH;
  attribute vec2 aData;
  varying vec2 vData;
  varying float vDepth;
  void main() {
    vData = aData;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, uSize * projectionMatrix[1][1] * uHalfH / gl_Position.w);
    vDepth = position.z;
  }`

export interface PointRing {
  points: Points
  material: ShaderMaterial
}

/** The equaliser: `n` columns of 8 dots round the stage at radius `r`. */
export function createEqualizer(n: number, r: number): PointRing {
  const DOTS = 8
  const pos = new Float32Array(n * DOTS * 3)
  const data = new Float32Array(n * DOTS * 2)
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    for (let k = 0; k < DOTS; k++) {
      const j = i * DOTS + k
      pos.set([Math.cos(t) * r, 0.03 + k * 0.036, Math.sin(t) * r], j * 3)
      data.set([i, k], j * 2)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aData', new BufferAttribute(data, 2))
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uSize: { value: 0.017 },
      uHalfH: { value: 400 },
      uR: { value: r },
      uN: { value: n },
      uBeat: { value: 0 },
      uSince: { value: 9 },
      uOn: { value: 0 },
      /** How hard it moves on the beat (60%). */
      uAmp: { value: 0.6 },
      uFade: { value: 1 },
      uBase: { value: lin(PALETTE.soft) },
      uTop: { value: lin(PALETTE.glow) },
    },
    vertexShader: pointVert,
    fragmentShader: /* glsl */ `
      uniform float uR; uniform float uN; uniform float uBeat; uniform float uSince; uniform float uOn; uniform float uFade; uniform float uAmp;
      uniform vec3 uBase; uniform vec3 uTop;
      varying vec2 vData;
      varying float vDepth;
      float h1(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        if (dot(c, c) > 0.25) discard;
        float i = vData.x;
        float k = vData.y;
        // Heights: 3 dots at rest; on the beat each column jumps toward 3..8 (a pseudo-random spectrum,
        // neighbours related), then falls back within ~300 ms.
        float wave = 0.5 + 0.5 * sin(i / uN * 6.2832 * 3.0 + uBeat * 1.7);
        float peak = 3.0 + 5.0 * clamp(0.55 * h1(i + uBeat * 53.0) + 0.45 * wave, 0.0, 1.0);
        float env = smoothstep(0.0, 0.045, uSince) * exp(-uSince / 0.3) * uOn * uAmp;
        float level = mix(3.0 + 2.0 * h1(i), peak, env);
        if (uOn < 0.5) level = 3.0 + floor(2.0 * h1(i * 1.3));
        if (k >= level) discard;
        bool top = k >= floor(level - 0.001);
        // The column under 30%; only its top dot is brighter.
        float a = mix(0.14, 0.28, k / 7.0);
        vec3 col = uBase;
        if (top) { a = 0.7; col = uTop; }
        // The far side of the ring (behind the stage) is dimmer.
        a *= mix(0.4, 1.0, smoothstep(-uR, uR * 0.6, vDepth));
        gl_FragColor = vec4(col, a * uFade);
      }`,
  })
  const points = new Points(g, material)
  points.frustumCulled = false
  return { points, material }
}

/**
 * A dotted orbit ring of `n` dots and one brighter satellite (under 30% like the rest of the backdrop:
 * it reads brighter by its size), depth-tested so the furniture and the robot hide what passes behind
 * them. `back`: only the half beyond the stage's centre is drawn, fading out at its ends.
 */
export function createOrbitRing(n: number, r: number, back: boolean): PointRing {
  const pos = new Float32Array((n + 1) * 3)
  const data = new Float32Array((n + 1) * 2)
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    pos.set([Math.cos(t) * r, 0, Math.sin(t) * r], i * 3)
    data.set([i, 0], i * 2)
  }
  data.set([n, 1], n * 2)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aData', new BufferAttribute(data, 2))
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uSize: { value: 0.012 },
      uHalfH: { value: 400 },
      uR: { value: r },
      uFade: { value: 1 },
      /** The satellite's angle round the ring (radians). */
      uSat: { value: 0.7 },
      uBack: { value: back ? 1 : 0 },
      uBase: { value: lin(PALETTE.soft) },
      uTop: { value: lin(PALETTE.glow) },
    },
    vertexShader: /* glsl */ `
      uniform float uSize; uniform float uHalfH; uniform float uR; uniform float uSat; uniform float uBack;
      attribute vec2 aData;
      varying vec2 vData;
      varying float vNear;
      varying float vKeep;
      void main() {
        vData = aData;
        vec3 p = aData.y > 0.5 ? vec3(cos(uSat) * uR, 0.0, sin(uSat) * uR) : position;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vec4 c = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        // Nearer the camera (world +z) a touch brighter; the back ring keeps only its far half.
        float z = (world.z - c.z) / uR;
        vNear = z;
        vKeep = uBack > 0.5 ? 1.0 - smoothstep(-0.35, 0.05, z) : 1.0;
        vec4 mv = viewMatrix * world;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, uSize * (aData.y > 0.5 ? 2.6 : 1.0) * projectionMatrix[1][1] * uHalfH / gl_Position.w);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFade; uniform vec3 uBase; uniform vec3 uTop;
      varying vec2 vData;
      varying float vNear;
      varying float vKeep;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d2 = dot(c, c);
        if (d2 > 0.25 || vKeep < 0.01) discard;
        bool sat = vData.y > 0.5;
        float a = mix(0.16, 0.28, smoothstep(-1.0, 1.0, vNear));
        vec3 col = uBase;
        if (sat) { a = 0.3 * (0.35 + 0.65 * exp(-d2 * 14.0)); col = uTop; }
        gl_FragColor = vec4(col, a * vKeep * uFade);
      }`,
  })
  const points = new Points(g, material)
  points.frustumCulled = false
  return { points, material }
}

/**
 * The commit pulse, the backdrop's one event (on each successful build, with the robot's nod): a ring
 * of dots running out from the laptop across the tabletop and another across the floor, and a thin
 * trail of 14 dots rising from the screen into the beam, all gone in about 1.6 s. Positions are
 * computed in the vertex shader from the event's clock; nothing is drawn between events.
 */
export const PULSE = { floor: 120, table: 54, trail: 14, life: 1.6 }

export interface CommitPulse {
  points: Points
  material: ShaderMaterial
}

export function createCommitPulse(): CommitPulse {
  const n = PULSE.floor + PULSE.table + PULSE.trail
  const pos = new Float32Array(n * 3)
  const data = new Float32Array(n * 2)
  let j = 0
  const push = (kind: number, count: number) => {
    for (let i = 0; i < count; i++, j++) data.set([kind, count > 1 ? i / count : 0], j * 2)
  }
  push(0, PULSE.floor)
  push(1, PULSE.table)
  for (let i = 0; i < PULSE.trail; i++, j++) data.set([2, i], j * 2)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(pos, 3))
  g.setAttribute('aData', new BufferAttribute(data, 2))
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uSize: { value: 0.016 },
      uHalfH: { value: 400 },
      /** Seconds since the build passed (< 0: nothing). */
      uT: { value: -1 },
      /** Under the laptop on the floor; the laptop on the table top (world). */
      uFloorC: { value: new Vector3() },
      uTableC: { value: new Vector3() },
      /** World -> table space, and the table top's half size (the table ring stays on it). */
      uTableInv: { value: new Matrix4() },
      uTableHalf: { value: new Vector2(0.6, 0.4) },
      /** The screen's top edge (world), and where the trail heads: up into the beam. */
      uTop: { value: new Vector3() },
      uRise: { value: new Vector3(0, 1.3, 0) },
      uBase: { value: lin(PALETTE.soft) },
      uHot: { value: lin(PALETTE.glow) },
    },
    vertexShader: /* glsl */ `
      uniform float uSize; uniform float uHalfH; uniform float uT;
      uniform vec3 uFloorC; uniform vec3 uTableC; uniform mat4 uTableInv; uniform vec2 uTableHalf;
      uniform vec3 uTop; uniform vec3 uRise;
      attribute vec2 aData;
      varying float vA;
      float ease(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - pow(1.0 - x, 3.0); }
      void main() {
        float kind = aData.x;
        vec3 w = vec3(0.0);
        vA = 0.0;
        if (uT >= 0.0) {
          if (kind < 0.5) {
            float a = aData.y * 6.2832;
            float u = uT / ${PULSE.life.toFixed(2)};
            float r = mix(0.2, 2.5, ease(u));
            w = uFloorC + vec3(cos(a) * r, 0.006, sin(a) * r);
            vA = 0.26 * pow(1.0 - clamp(u, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.08, uT);
          } else if (kind < 1.5) {
            float a = aData.y * 6.2832;
            float u = uT / 0.9;
            float r = mix(0.05, 0.85, ease(u));
            w = uTableC + vec3(cos(a) * r, 0.004, sin(a) * r);
            vec3 q = (uTableInv * vec4(w, 1.0)).xyz;
            float on = step(abs(q.x), uTableHalf.x - 0.01) * step(abs(q.z), uTableHalf.y - 0.01);
            vA = 0.3 * pow(1.0 - clamp(u, 0.0, 1.0), 1.4) * on;
          } else {
            float i = aData.y;
            float u = clamp((uT - i * 0.045) / 1.15, 0.0, 1.0);
            float k = ease(u);
            w = uTop + uRise * k + vec3(sin(i * 2.1 + u * 5.0) * 0.025, 0.0, 0.0);
            vA = 0.3 * sin(3.1416 * u) * (1.0 - i / 20.0);
          }
        }
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.0 ? max(1.0, uSize * projectionMatrix[1][1] * uHalfH / gl_Position.w) : 0.0;
        if (vA <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase; uniform vec3 uHot;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d2 = dot(c, c);
        if (d2 > 0.25) discard;
        gl_FragColor = vec4(mix(uBase, uHot, 0.5), vA * (0.6 + 0.4 * exp(-d2 * 10.0)));
      }`,
  })
  const points = new Points(g, material)
  points.frustumCulled = false
  return { points, material }
}
