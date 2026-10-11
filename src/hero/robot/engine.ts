/**
 * The hero robot: a small three.js scene on one transparent canvas, in a fixed
 * layer above the page (see dom.ts), so the same robot can sit in the hero
 * and then become the chat launcher's face (see bridge.ts).
 *
 * The scene (model.ts, perform.ts): one scene, one action. An engineer-robot,
 * headphones on, sits at its desk on a round dot stage and codes on its laptop,
 * to a 96 BPM beat only it hears (beat.ts). It never leaves the chair. Its eyes
 * are its only expression; the laptop's screen is the scene's second light.
 *
 * Load (from reveal(), once the loader has gone): up from black, the stage and
 * the floor (0.6 .. 1.4 s), the horizon and the beam (stage.ts, hero.css), the
 * furniture fades in (1.4 .. 2.0 s), the robot materialises in a dot-scan from
 * the feet up, already seated with its hands on the keys (1.6 .. 2.5 s), the
 * laptop flickers on (2.5 .. 3.0 s), the beat starts; the header comes last.
 *
 * Scroll (setProgress, from src/hero/transition.ts), as a pure function of
 * progress so scrolling back replays it exactly:
 *
 *   hold      0 .. hold          the scene, large and centred
 *   glide     .. GLIDE_END       it turns to face you as the camera pushes in on its
 *                                head; the laptop powers down, the furniture, the
 *                                headphones and the body dissolve (DISSOLVE), leaving
 *                                the head alone
 *   dock      DOCK .. DOCK_END   the head shrinks and arcs down into the chat
 *                                launcher's corner, landing exactly on it
 *
 * Screen placement and size are a 2D transform applied after the projection
 * (clip space), so the robot is re-rendered sharp at every size rather than
 * scaled as a picture. Once docked the canvas moves into the launcher's icon
 * slot, shrinks to it and renders only that crop of the same projection, so
 * the hand-over is pixel-identical, and from then on it moves with the
 * launcher (lift, hover, hop, open) like the icon it replaces.
 *
 * Gaze: the pointer is unprojected through that same projection to a ray, met
 * with a plane between the head and the camera, and turned into yaw / pitch in
 * the body's frame. In the hero it blends over the head and eyes only (never
 * the body): within +-12 deg of the viewer, the eyes a cell or two more, while
 * it moves (fine pointers only; phones are left alone), easing back to the
 * coding gaze 3 s after it stops; in the glide it takes over fully, as before.
 * The head follows on a slightly underdamped spring within neck limits.
 * Docked, it acts as the launcher robot always has: idle glances, a slow
 * float, blinks, and the launcher's moods on its screen.
 */
import {
  ACESFilmicToneMapping,
  BackSide,
  Box3,
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Material,
} from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { clamp, damp, easeInOutCubic, onTick, remap, smoothstep } from '../../core/clock'
import { heroConfig, MOBILE_QUERY } from '../config'
import { shotAt } from '../shot'
import { buildRobot } from './model'
import { createLayer, stageCues, stageFrame, type RobotHandle, type RobotOptions } from './dom'
import { robotLink, setDock } from './bridge'
import { animatedFace } from './face'
import type { FaceMood } from './dots'
import { mountRobot as mountStill } from './still'
import { beat, emptySample } from './beat'
import { createPerformance } from './perform'
import { PULSE, SCREEN } from './props'

const FOV = 28
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180)

/** Scroll beats (hero progress). The glide starts where the transition's idle hold ends. */
const GLIDE_END = 0.44
const DISSOLVE: [number, number] = [0.06, 0.42]
/** The headphones lift away in a dissolve of their own, after the body's has begun. */
const PHONES_OFF: [number, number] = [0.16, 0.38]
/** The laptop powers down as the glide begins. */
const POWER_OFF: [number, number] = [0.02, 0.12]
/** The flight overlaps the backdrop giving way to About (about 0.77..0.95), landing as About settles. */
const DOCK = 0.52
const DOCK_END = 0.9

/** Opening framing: a little above, the stage square on (model.ts SEAT sets the 3/4 view of the robot). */
const YAW0 = 0
const ELEV0 = 0.21
const DIST0 = 8.8
/** The camera's aim in the opening frame: about the seated figure's middle. */
const AIM_Y = 1.05
/** Close-up: nearly level, square on. */
const ELEV1 = 0.03
/** Head height in the close-up, as a share of the viewport height. */
const HEAD_SHARE = { wide: 0.32, tall: 0.24 }
/** Head centre in the close-up, NDC. */
const HEAD_Y1 = 0.08
/** Head height in the launcher, as a share of the launcher button. */
const DOCK_HEAD = 0.6
/** The docked canvas, as a multiple of the launcher button: room for tilts, hops, the halo and z's. */
const DOCK_PAD = 1.7

/** The dissolve's heights: from below the stage to past the collar (the head is never cut). */
const CUT_FROM = -0.15
const CUT_OVER = 0.14

/**
 * The opening composition (shares of the hero's height): the head's centre at about 24% (25% on
 * phones), the stage's centre at 60% (62% on phones). Horizontally, the robot and the desk centred
 * on 52% of the width (the chair left of centre, the table and laptop right of it).
 */
const COMPOSE = { head: { wide: 0.24, phone: 0.25 }, floor: { wide: 0.6, phone: 0.62 }, x: { wide: 0.52, phone: 0.5 } }
/**
 * Then the whole group (the robot, chair, table, laptop and dais) is scaled up uniformly by GROW and
 * centred (headphones to the dais's front rim) at CENTER of the height, standing on the landscape
 * (terrain.ts); the header's clearance, a 5% margin under the dais and the page margins still hold.
 */
const GROW = 1.28
const CENTER = { wide: 0.55, phone: 0.56 }
/** Room kept under the dais's front rim, as a share of the height. */
const UNDER = 0.05
/** Furniture size by screen: tablets 0.9, phones 0.8. */
const FURNITURE = { desktop: 1, tablet: 0.9, phone: 0.8 }
/** Clear space under the header (px), and at the bottom (phones: room for the home indicator). */
const HEADER_CLEAR = 24
const BOTTOM = { wide: 18, phone: 40 }
/** The floor reflection: opacity, and how far down it lasts (share of the figure's height). */
const REFLECT = { opacity: 0.11, length: 0.3 }

/** Neck limits (radians) and the spring that drives it. */
const YAW_MAX = 0.95
const PITCH_UP = 0.42
const PITCH_DOWN = 0.5
const STIFF = 64
const DAMPING = 2 * 0.72 * Math.sqrt(STIFF)
/** In the hero, the pointer's pull: +-12 deg of the viewer; the screen wins back 3 s after it stops. */
const POINTER_LIMIT = (12 * Math.PI) / 180
const POINTER_IDLE = 3000

/** After this long without pointer input (ms) the robot looks around on its own (in the glide). */
const IDLE_MOUSE = 4500
const IDLE_TOUCH = 1600

/** Load sequence (s after reveal). The header (Hud.tsx) fades in at 3.2 s, last. */
const INTRO = { dais: [0.6, 1.4], furniture: [1.4, 2.0], scan: [1.6, 2.5], power: [2.5, 3.0], music: 3.0 }

/** The laptop display as a light (the area light's intensity, the keyboard's backlight under the hands). */
const SCREEN_LIGHT = 3.2
const KEY_LIGHT = 0.22

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpLog = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t))

export function mountRobot(host: HTMLElement, opts: RobotOptions = {}): RobotHandle {
  const layer = createLayer()
  const canvas = document.createElement('canvas')
  canvas.className = 'robot-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  layer.el.appendChild(canvas)

  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' })
  } catch {
    layer.dispose()
    return mountStill(host, opts)
  }
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  RectAreaLightUniformsLib.init()

  // ---- scene

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const studio = studioEnvironment()
  const env = pmrem.fromScene(studio.scene, 0.04).texture
  pmrem.dispose()
  studio.dispose()
  scene.environment = env
  scene.environmentIntensity = 0.5

  // Lit in the hero's one hue: a near-white key from above, front-left (the stage's beam, hero.css),
  // violet rims from behind on both edges, and a soft lilac fill so the shadow side keeps its detail.
  // The key casts soft shadows (the head onto the torso, the arms onto the lap, everything on the dais).
  // The laptop's display is the scene's second light (furniture.ts).
  const key = new DirectionalLight('#f5f3ff', 2.1)
  key.position.set(-1.4, 7, 2.6)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.radius = 5
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.012
  Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 3, far: 12 })
  key.shadow.camera.updateProjectionMatrix()
  const rimL = new DirectionalLight('#a78bfa', 1.5)
  rimL.position.set(-4, 2.6, -4.2)
  const rimR = new DirectionalLight('#7c5cff', 1.9)
  rimR.position.set(4, 3.2, -4)
  const fill = new DirectionalLight('#c4b5fd', 0.45)
  fill.position.set(3.5, 1.2, 3.5)
  scene.add(key, rimL, rimR, fill)

  const robot = buildRobot()
  scene.add(robot.root)
  const { headPivot, body, rig } = robot
  headPivot.rotation.order = 'YXZ'
  const lap = robot.laptop
  /** The neck (the head's pivot) and the head's centre, in the body's frame; updated as it moves. */
  const neck = new Vector3()
  const headLocal = new Vector3()
  function placeHead(lift: number) {
    neck.copy(rig.neck).applyMatrix4(rig.torso.matrix).applyMatrix4(rig.hips.matrix)
    headPivot.position.set(neck.x, neck.y + lift, neck.z)
    headLocal.set(neck.x, neck.y + lift + robot.headCenter.y, neck.z)
  }
  rig.hips.updateMatrix()
  rig.torso.updateMatrix()
  placeHead(0)
  const bezelGlow = robot.bezel.emissiveIntensity
  const perform = createPerformance(robot)
  const beatNow = emptySample()
  const silent = emptySample()

  /** Lite: less environment, no shadows, no reflection, and the display a static emissive rather than a light. */
  function applyLighting() {
    scene.environmentIntensity = lowPower ? 0.36 : 0.5
    key.shadow.intensity = lowPower ? 0 : 1
    key.shadow.radius = opts.integratedGpu ? 3 : 5
  }

  // ---- the body's dissolve (scroll): discarded below a height that climbs from the dais to the collar,
  // broken up by noise, with a thin glowing seam where it is coming apart. The load's scan reveal: the
  // same, upside down (discarded above a height that climbs from the feet to the headphones). The
  // furniture fades in before the robot (a fine dither), and dissolves with it on the scroll.
  const cut = { value: CUT_FROM - 1 }
  const phonesCut = { value: -100 }
  const noCut = { value: -100 }
  const reveal = { value: 1e3 }
  const noReveal = { value: 1e3 }
  const shown = { value: 1 }
  const furnitureShow = { value: 1 }
  const seam = { value: new Color('#9c86ff') }
  for (const m of robot.bodyMaterials) dissolvable(m, cut, reveal, shown, seam)
  for (const m of robot.furnitureMaterials) dissolvable(m, cut, noReveal, furnitureShow, seam)
  for (const m of robot.phones.solids) dissolvable(m, phonesCut, reveal, shown, seam)
  // The head: only the scan reveal (it never dissolves; once revealed the patch does nothing).
  for (const m of robot.headMaterials) if (m instanceof MeshBasicMaterial || m instanceof MeshStandardMaterial) dissolvable(m, noCut, reveal, shown, seam)
  /** The top of the seated figure (the headphones), stage space: the scan's end. */
  let top = 2.4

  // ---- the floor reflection: the figure mirrored in the dais plane, drawn at a quarter of the
  // resolution (a free blur), then laid under the robot faint, blurred a little more, and fading
  // out within REFLECT.length of the figure's height below the floor contact.
  const reflectRT = new WebGLRenderTarget(1, 1)
  const reflectMat = new ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tMap: { value: reflectRT.texture },
      uTexel: { value: new Vector2(1, 1) },
      uFloor: { value: 0 },
      uLength: { value: 0.5 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tMap;
      uniform vec2 uTexel;
      uniform float uFloor;
      uniform float uLength;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float below = uFloor - (vUv.y * 2.0 - 1.0);
        float fade = smoothstep(-0.004, 0.012, below) * (1.0 - smoothstep(0.0, uLength, below));
        if (fade <= 0.0) discard;
        vec4 c = vec4(0.0);
        for (int j = -1; j <= 1; j++)
          for (int i = -1; i <= 1; i++)
            c += texture2D(tMap, vUv + vec2(float(i), float(j)) * uTexel * 1.4);
        c /= 9.0;
        gl_FragColor = vec4(c.rgb / max(c.a, 1e-3), c.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float k = uOpacity * fade;
        gl_FragColor = vec4(gl_FragColor.rgb * gl_FragColor.a * k, gl_FragColor.a * k);
      }`,
  })
  const reflectQuad = new Mesh(new PlaneGeometry(2, 2), reflectMat)
  reflectQuad.frustumCulled = false
  const reflectScene = new Scene()
  reflectScene.add(reflectQuad)
  const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const floorPt = new Vector3()
  const topPt = new Vector3()

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60)
  if (import.meta.env.DEV) Object.assign(window, { __heroRobot: { robot, scene, perform, renderer, camera, stageCues } })
  const tall = window.matchMedia(MOBILE_QUERY)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  let lowPower = !!opts.lowPower
  applyLighting()
  const pixelCap = () => Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : opts.integratedGpu ? 1.5 : 2) * (1 - 0.15 * Math.max(0, degrade - 6))

  /**
   * Quality steps taken when the hero cannot hold its frame rate (measured over 2 s windows while the
   * scene plays), in this order: 1 the backdrop's depth of field, 2 its far-field panels, 3 its horizon
   * wave (stage.ts reads these), 4 the glows that stand in for bloom and the floor reflection, 5 the
   * shadow map halves, 6 the equaliser drops to 28 columns, 7-8 the pixel ratio steps down. Only ever
   * downward (no oscillation); the head, the eyes and the laptop's screen are never touched.
   */
  let degrade = 0
  const perf = { sum: 0, n: 0 }
  /** Development only: ?hq holds the governor off (for captures on slow, software-rendered machines). */
  const holdQuality = import.meta.env.DEV && new URLSearchParams(location.search).has('hq')
  function governor(dt: number) {
    if (holdQuality) return
    perf.sum += dt
    perf.n++
    if (perf.sum < 2) return
    const avg = perf.sum / perf.n
    perf.sum = perf.n = 0
    if (avg <= 1 / (phone ? 28 : 45) || degrade >= 8) return
    degrade++
    stageCues.degrade = degrade
    if (degrade === 5) {
      key.shadow.mapSize.set(1024, 1024)
      key.shadow.map?.dispose()
      key.shadow.map = null
    }
    if (degrade === 6) robot.setEqColumns(28)
    if (degrade >= 7) sizeCanvas()
  }

  // ---- layout: where the robot sits, how big, where the launcher is

  let VW = 1
  let VH = 1
  let phone = false
  let furnitureK = 0
  const L = {
    /** Opening placement (2D, after projection). */
    s0: 1,
    t0x: 0,
    t0y: 0,
    target0: new Vector3(),
    /** Close-up camera distance. */
    dist1: 5,
    headShare: 0.4,
    /** Landing: the launcher's centre (NDC), the scale that fits the head in it, the docked canvas box in px. */
    dx: 0,
    dy: 0,
    sd: 0.1,
    box: { x: 0, y: 0, w: 96, h: 96 },
  }

  function placeCamera(target: Vector3, dist: number, elev: number) {
    camera.position.set(target.x, target.y + dist * Math.sin(elev), target.z + dist * Math.cos(elev))
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }

  /** The launcher button's box (px, viewport). Before the chat widget mounts: where its CSS will put it. */
  function anchorBox() {
    const a = robotLink.anchor?.getBoundingClientRect()
    if (a && a.width) return { x: a.left, y: a.top, w: a.width, h: a.height }
    const wide = VW >= 768
    const size = wide ? 60 : 56
    const m = wide ? 24 : 16
    return { x: VW - m - size, y: VH - m - size, w: size, h: size }
  }

  function measureDock() {
    const a = anchorBox()
    const w = a.w * DOCK_PAD
    const h = a.h * DOCK_PAD
    L.box = { x: a.x + a.w / 2 - w / 2, y: a.y + a.h / 2 - h / 2, w, h }
    L.dx = ((a.x + a.w / 2) / VW) * 2 - 1
    L.dy = 1 - ((a.y + a.h / 2) / VH) * 2
    L.sd = (DOCK_HEAD * a.h) / (VH * L.headShare)
  }

  /** The hero stage: the layout's CSS variables go here, for the stage's light and floor (hero.css). */
  const stageEl = host.parentElement ?? host

  const corner = new Vector3()
  const pt = new Vector3()
  const box = new Box3()
  function layout() {
    VW = Math.max(1, layer.el.clientWidth)
    VH = Math.max(1, layer.el.clientHeight)
    camera.aspect = VW / VH
    camera.updateProjectionMatrix()
    const portrait = tall.matches
    phone = VW < 768
    const size = VW > 1024 ? 'desktop' : !phone ? 'tablet' : 'phone'
    robot.setEqColumns(phone || degrade >= 6 ? 28 : 48)
    if (FURNITURE[size] !== furnitureK) {
      furnitureK = FURNITURE[size]
      robot.placeFurniture(furnitureK)
    }

    // The seated figure at rest, to measure: its head's centre, its bounds and the desk's.
    robot.root.rotation.y = YAW0
    perform.update(0, silent, { amp: 1, weight: 1, still: true, turn: 0, faceYaw: 0 })
    placeHead(0)
    headPivot.rotation.set(0, 0, 0)
    robot.root.updateMatrixWorld(true)
    box.setFromObject(body)
    top = box.max.y
    L.target0.set(0, AIM_Y, 0)
    placeCamera(L.target0, DIST0, ELEV0)
    const at1 = (x: number, y: number, z: number) => corner.set(x, y, z).project(camera)
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    const grow = () => {
      x0 = Math.min(x0, corner.x)
      x1 = Math.max(x1, corner.x)
      y0 = Math.min(y0, corner.y)
      y1 = Math.max(y1, corner.y)
    }
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      at1(x, y, z)
      grow()
    }
    for (const p of robot.frame) {
      at1(p.x, p.y, p.z)
      grow()
    }
    const { daisR } = robot.extents
    let dx0 = Infinity
    let dx1 = -Infinity
    let dy0 = Infinity
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * Math.PI * 2
      at1(Math.cos(t) * daisR, 0, Math.sin(t) * daisR)
      dx0 = Math.min(dx0, corner.x)
      dx1 = Math.max(dx1, corner.x)
      dy0 = Math.min(dy0, corner.y)
    }
    // The head's centre (world), the stage's centre, and the chair and laptop (for the horizontal balance).
    const headW = new Vector3()
    headPivot.localToWorld(headW.set(robot.headCenter.x, robot.headCenter.y, robot.headCenter.z))
    const headN = at1(headW.x, headW.y, headW.z).clone()
    const floorN = at1(0, 0, 0).clone()

    // Scale: the head's centre and the stage's centre at their shares of the height; then no larger
    // than lets the whole scene (the robot, the desk, the dais's front rim) clear the header by
    // HEADER_CLEAR (Hud: a 44px row with clamp(10px, 1.4vw, 20px) above and below) and the bottom by
    // BOTTOM (+ the safe area), and keep the robot and the desk inside the page margins.
    const yHead = (phone ? COMPOSE.head.phone : COMPOSE.head.wide) * VH
    let yFloor = (phone ? COMPOSE.floor.phone : COMPOSE.floor.wide) * VH
    const gut = clamp(VW * 0.044, 16, 64)
    const topPx = 44 + 2 * clamp(VW * 0.014, 10, 20) + HEADER_CLEAR
    const bottom = VH - (phone ? BOTTOM.phone : BOTTOM.wide) - safeBottom()
    const per = VH / 2
    let s = (yFloor - yHead) / ((headN.y - floorN.y) * per)
    // The top of the scene may not come nearer than topPx; the dais's front rim not past the bottom.
    s = Math.min(s, (yFloor - topPx) / ((y1 - floorN.y) * per))
    s = Math.min(s, (bottom - yFloor) / ((floorN.y - Math.min(y0, dy0)) * per))
    // The group, grown: as tall as the room between the header and the bottom margin allows, centred.
    const up = (y1 - floorN.y) * per
    const down = (floorN.y - Math.min(y0, dy0)) * per
    const low = Math.min(bottom, VH * (1 - UNDER) - safeBottom())
    s = Math.min(Math.max(0.12, s) * GROW, (low - topPx) / (up + down))
    s = Math.min(s, (VW - 2 * gut) / ((x1 - x0) * (VW / 2)))
    L.s0 = Math.max(0.12, s)
    yFloor = (phone ? CENTER.phone : CENTER.wide) * VH - ((down - up) * L.s0) / 2
    yFloor = Math.min(low - down * L.s0, Math.max(topPx + up * L.s0, yFloor))
    const cx = (phone ? COMPOSE.x.phone : COMPOSE.x.wide) * VW
    L.t0x = (cx / VW) * 2 - 1 - L.s0 * ((x0 + x1) / 2)
    L.t0y = 1 - (yFloor / VH) * 2 - L.s0 * floorN.y

    // Where the stage's layers line up with the scene (stage.ts, hero.css).
    const pxX = (ndcX: number) => ((L.s0 * ndcX + L.t0x + 1) / 2) * VW
    const pxY = (ndcY: number) => ((1 - (L.s0 * ndcY + L.t0y)) / 2) * VH
    const xPx = pxX(floorN.x)
    const daisPx = pxY(floorN.y)
    const topY = pxY(at1(0, top, 0).y)
    const hS = daisPx - topY
    const chestPx = pxY(at1(0, robot.rig.hips.position.y + 0.55, 0).y)
    let sx0 = Infinity
    let sx1 = -Infinity
    let sy0 = Infinity
    let sy1 = -Infinity
    for (const [u, v] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      lap.display.localToWorld(pt.set((u * SCREEN.w) / 2, (v * SCREEN.h) / 2, 0))
      robot.root.worldToLocal(pt)
      at1(pt.x, pt.y, pt.z)
      sx0 = Math.min(sx0, pxX(corner.x))
      sx1 = Math.max(sx1, pxX(corner.x))
      sy0 = Math.min(sy0, pxY(corner.y))
      sy1 = Math.max(sy1, pxY(corner.y))
    }
    const headR = (pxY(at1(headW.x, headW.y - 0.5, headW.z).y) - pxY(headN.y)) * 1.15
    const frame = {
      x: xPx,
      topY,
      chestY: chestPx,
      daisY: daisPx,
      daisW: ((dx1 - dx0) * L.s0 * VW) / 2,
      daisH: ((floorN.y - dy0) * 2 * L.s0 * VH) / 2,
      robotH: hS,
      head: { x: pxX(headN.x), y: pxY(headN.y), r: headR },
      screen: { x: (sx0 + sx1) / 2, y: (sy0 + sy1) / 2, w: sx1 - sx0, h: sy1 - sy0 },
    }
    stageEl.style.setProperty('--robot-x', `${((xPx / VW) * 100).toFixed(1)}%`)
    stageEl.style.setProperty('--robot-y', `${Math.round(daisPx - hS / 2)}px`)
    stageEl.style.setProperty('--robot-h', `${Math.round(hS)}px`)
    stageEl.style.setProperty('--robot-foot', `${Math.round(daisPx)}px`)
    stageEl.style.setProperty('--chest-y', `${Math.round(chestPx)}px`)
    stageEl.style.setProperty('--dais-w', `${Math.round(frame.daisW)}px`)
    stageEl.style.setProperty('--dais-h', `${Math.round(frame.daisH)}px`)
    stageFrame.set(frame)

    // Close-up: the head at its share of the height, and never wider than 70% of the width.
    L.headShare = portrait ? HEAD_SHARE.tall : HEAD_SHARE.wide
    L.dist1 = Math.max(0.9 / (L.headShare * 2 * TAN), 1.25 / (0.7 * 2 * TAN * camera.aspect))
    // The head's actual share at that distance (the width rule may have pushed the camera back).
    L.headShare = 0.9 / (L.dist1 * 2 * TAN)

    measureDock()
  }

  /** The bottom safe-area inset (px), read once per layout. */
  const safeProbe = document.createElement('div')
  safeProbe.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);width:0;visibility:hidden;pointer-events:none'
  layer.el.appendChild(safeProbe)
  const safeBottom = () => safeProbe.offsetHeight || 0

  // ---- canvas mode: the whole viewport, or just the launcher

  let docked = false
  /** The launcher slot the canvas sits in while docked (null: no launcher yet, the head waits unseen). */
  let homed: HTMLElement | null = null
  function sizeCanvas() {
    if (docked) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(L.box.w, L.box.h, false)
      canvas.style.width = `${L.box.w}px`
      canvas.style.height = `${L.box.h}px`
    } else {
      renderer.setPixelRatio(pixelCap())
      renderer.setSize(VW, VH, false)
      canvas.style.removeProperty('width')
      canvas.style.removeProperty('height')
      const rw = Math.max(1, Math.round(canvas.width / 4))
      const rh = Math.max(1, Math.round(canvas.height / 4))
      reflectRT.setSize(rw, rh)
      reflectMat.uniforms.uTexel.value.set(1 / rw, 1 / rh)
    }
    // The dot props are sized in world units: they need the drawing buffer's height.
    for (const m of [robot.eq.material, ...robot.rings.map((r) => r.material), robot.pulse.material]) m.uniforms.uHalfH.value = canvas.height / 2
  }
  function home() {
    const slot = docked ? robotLink.slot : null
    if (slot === homed) return
    homed = slot
    if (slot) slot.appendChild(canvas)
    else if (canvas.parentElement !== layer.el) layer.el.appendChild(canvas)
    canvas.classList.toggle('is-docked', !!slot)
    canvas.classList.toggle('is-waiting', docked && !slot)
  }
  function setDocked(on: boolean) {
    if (docked === on) return
    docked = on
    if (on) measureDock()
    sizeCanvas()
    home()
    setDock(on ? 'docked' : 'away', true)
    head.react = 0
  }

  // ---- gaze input (the hero's pointer tracking)

  const gaze = { x: 0, y: 0, at: -Infinity, touch: false, inside: true }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    gaze.x = e.clientX
    gaze.y = e.clientY
    gaze.at = performance.now()
    gaze.touch = false
    gaze.inside = true
  }
  const onTouch = (e: TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    gaze.x = t.clientX
    gaze.y = t.clientY
    gaze.at = performance.now()
    gaze.touch = true
  }
  const onLeave = (e: PointerEvent) => {
    if (!e.relatedTarget) gaze.inside = false
  }
  const onBlur = () => (gaze.inside = false)
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('touchstart', onTouch, { passive: true })
  window.addEventListener('touchmove', onTouch, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  window.addEventListener('blur', onBlur)

  /** Where the robot looks (viewport px): the pointer, else a slow wander. */
  function lookAt(now: number, time: number) {
    const idle = gaze.touch ? IDLE_TOUCH : IDLE_MOUSE
    if (gaze.inside && now - gaze.at < idle) return { x: gaze.x, y: gaze.y }
    return {
      x: VW * (0.5 + 0.16 * Math.sin(time * 0.31) + 0.07 * Math.sin(time * 0.77 + 1.3)),
      y: VH * (0.42 + 0.1 * Math.sin(time * 0.43 + 2.1) + 0.04 * Math.sin(time * 0.97)),
    }
  }

  /** The launcher's idle glance (the chat robot's 9 s look-around), as yaw / pitch targets. */
  function glance(time: number) {
    const t = (time % 9) / 9
    const seg = (a: number, b: number) => smoothstep(a, b, t)
    // 0..28% ahead, 34..52% left, 58..80% right, back by 92%.
    const left = seg(0.28, 0.34) * (1 - seg(0.52, 0.58))
    const right = seg(0.52, 0.58) * (1 - seg(0.8, 0.92))
    return { yaw: -0.32 * left + 0.32 * right, pitch: -0.03 * left + 0.06 * right }
  }

  /** Neck angles (body frame) toward a world point. */
  const aim = new Vector3()
  function anglesTo(world: Vector3) {
    aim.copy(world)
    body.worldToLocal(aim).sub(headLocal)
    const flat = Math.hypot(aim.x, aim.z)
    return { yaw: Math.atan2(aim.x, Math.max(1e-3, aim.z)), pitch: -Math.atan2(aim.y, Math.max(1e-3, flat)) }
  }

  // ---- per frame

  let progress = 0
  let revealed = false
  let revealedAt = Infinity
  let lost = false
  const proj = new Matrix4()
  const screen = new Matrix4()
  const crop = new Matrix4()
  const projInv = new Matrix4()
  const target1 = new Vector3()
  const camTarget = new Vector3()
  const near = new Vector3()
  const far = new Vector3()
  const dir = new Vector3()
  const headWorld = new Vector3()
  const normal = new Vector3()
  const point = new Vector3()
  const offset = new Vector3()
  const screenWorld = new Vector3()
  const head = { yaw: 0.3, pitch: 0.1, vYaw: 0, vPitch: 0, eyeX: 0, eyeY: 0, dock: 0, react: 0, sleep: 0, pointer: 0 }
  let blinkAt = performance.now() + 1800
  let blinkT = -1
  /** The face being shown, the mood asked for, and the swap blink between them (s, -1 = none). */
  let shownMood: FaceMood = 'neutral'
  let swapT = -1
  let reactT = -1
  let reactMood: FaceMood = 'neutral'
  let painted = ''
  /** The laptop display's own clock: its scroll and cursor (s); the build's sweep (s since success). */
  let screenT = 0
  let sinceSuccess = 99
  let buildSeed = 0
  /** The shadow map exists (the reflection pass, which never updates it, waits for the first). */
  let shadowReady = false
  /** Frames drawn (the floor reflection is redrawn every other frame). */
  let frameNo = 0

  // The hero transition parts (turns transparent onto About) at a fixed progress:
  // the backdrop may only fade from there, or the fixed stage behind would show unrendered.
  const parting = (() => {
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (shotAt(mid).sceneVis < 1) hi = mid
      else lo = mid
    }
    return hi
  })()

  /** The display's power-on: a 500 ms flicker, then steady. */
  function flicker(t: number) {
    if (t <= 0) return 0
    if (t >= 0.5) return 1
    const on = [0.04, 0.09, 0.15, 0.2, 0.27, 0.34, 0.4]
    let lit = false
    for (const x of on) if (t >= x) lit = !lit
    return (lit ? 0.85 : 0.12) * (0.4 + 0.6 * (t / 0.5))
  }

  const tableInv = new Matrix4()
  const pulseU = robot.pulse.material.uniforms
  function frame(time: number, dt: number) {
    if (lost || document.hidden || opts.isPaused?.()) return
    const now = performance.now()
    const p = progress
    const still = reduced.matches

    // Beats.
    const a = easeInOutCubic(remap(p, heroConfig.transition.hold, GLIDE_END))
    const bLin = remap(p, DOCK, DOCK_END)
    const b = easeInOutCubic(bLin)
    setDocked(bLin >= 1)
    home()
    // In the launcher with the chat open: the icon is put away, nothing to draw.
    if (docked && (!homed || robotLink.open)) return

    // ---- the load sequence: the dais, the furniture, the scan up the figure, the power-on, then the music.
    const t = still ? 99 : (now - revealedAt) / 1000
    const introDais = smoothstep(INTRO.dais[0], INTRO.dais[1], t)
    const introFurniture = smoothstep(INTRO.furniture[0], INTRO.furniture[1], t)
    const scan = smoothstep(INTRO.scan[0], INTRO.scan[1], t)
    reveal.value = scan >= 1 ? 1e3 : lerp(-0.12, top + 0.12, scan)
    furnitureShow.value = introFurniture
    robot.face.visible = reveal.value > headLocal.y - 0.1
    const power = still ? 1 : flicker(t - INTRO.power[0])
    if (!still && t >= INTRO.music && !beat.running) beat.start()
    if (still && beat.running) beat.stop()
    beat.sample(now, beatNow)

    // ---- the performance: full in the hero, gone by the close-up (the body turns to face us)
    const weight = (1 - smoothstep(0, 0.6, a)) * (docked ? 0 : 1)
    robot.root.rotation.y = lerp(YAW0, 0, a)
    perform.update(dt, beatNow, { amp: lowPower ? 0.7 : 1, weight, still, turn: smoothstep(0, 0.7, a), faceYaw: 0 })
    const pf = perform.out
    // Lite (and the governor's step 4): no glow cards (the scene's stand-in for bloom).
    const glows = !lowPower && degrade < 4
    if (!glows) rig.coreGlow.opacity = 0
    placeHead(pf.dip)
    robot.root.updateMatrixWorld(true)

    // The body comes apart from the ground up as the camera closes on the head (the furniture with it);
    // the headphones lift away after it; the laptop powers down first.
    const d = smoothstep(DISSOLVE[0], DISSOLVE[1], p)
    cut.value = d <= 0 ? CUT_FROM - 1 : lerp(CUT_FROM, neck.y + CUT_OVER, d)
    const ph = smoothstep(PHONES_OFF[0], PHONES_OFF[1], p)
    phonesCut.value = ph <= 0 ? -100 : lerp(neck.y + 0.25, headLocal.y + 0.55, ph)
    const props = (1 - smoothstep(POWER_OFF[0], POWER_OFF[1], p)) * power
    const stageFade = (1 - smoothstep(0, 0.22, d)) * introDais
    robot.setStage(stageFade)
    robot.shadowFloor.opacity *= introFurniture
    const furnitureFade = introFurniture * (1 - smoothstep(0, 0.3, d))
    robot.desk.underglow.opacity = 0.08 * furnitureFade
    for (const m of robot.furnitureFades) m.uniforms.uFade.value = furnitureFade

    // Camera: from the opening framing to the close-up on the head.
    target1.copy(headLocal)
    body.localToWorld(target1)
    camTarget.lerpVectors(L.target0, target1, a)
    placeCamera(camTarget, lerpLog(DIST0, L.dist1, a), lerp(ELEV0, ELEV1, a))

    // While the head flies, keep aiming at where the launcher is right now (it may have lifted).
    if (bLin > 0 && bLin < 1) measureDock()

    // Placement on screen (NDC): the opening frame -> the close-up -> the launcher, on a soft arc.
    let s: number
    let tx: number
    let ty: number
    if (bLin <= 0) {
      s = lerpLog(L.s0, 1, a)
      tx = lerp(L.t0x, 0, a)
      ty = lerp(L.t0y, HEAD_Y1, a)
    } else {
      s = lerpLog(1, L.sd, b)
      tx = lerp(0, L.dx, easeInOutCubic(Math.min(1, bLin * 1.08)))
      ty = lerp(HEAD_Y1, L.dy, b) + 0.12 * Math.sin(Math.PI * b) * (1 - b)
    }
    // Docked: a slow float (the launcher's), eased in after landing.
    head.dock = docked ? Math.min(1, head.dock + dt / 0.8) : 0
    if (docked && robotLink.live) ty += head.dock * ((1.8 / VH) * 2) * (0.5 - 0.5 * Math.cos(time * ((2 * Math.PI) / 3.6)))
    screen.set(s, 0, 0, tx, 0, s, 0, ty, 0, 0, 1, 0, 0, 0, 0, 1)
    camera.updateProjectionMatrix()
    proj.multiplyMatrices(screen, camera.projectionMatrix)
    projInv.copy(proj).invert()
    if (docked) {
      // Render only the launcher's crop of the same full-viewport projection.
      const { x, y, w, h } = L.box
      crop.set(VW / w, 0, 0, (VW - 2 * x) / w - 1, 0, VH / h, 0, 1 - (VH - 2 * y) / h, 0, 0, 1, 0, 0, 0, 0, 1)
      camera.projectionMatrix.multiplyMatrices(crop, proj)
    } else {
      camera.projectionMatrix.copy(proj)
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()

    // The space backdrop gives way to About's world once the stage behind is live.
    host.style.setProperty('--robot-bg', String(1 - smoothstep(parting, parting + 0.08, p)))

    // ---- the laptop: the display (the code scrolls a line every 0.8 s, at half speed while nobody types),
    // the build (the terminal prints, then the sweep, the check mark, the nod), its light and its keys
    screenT += still ? 0 : dt * pf.scroll
    const sm = lap.screen.uniforms
    sm.uRows.value = Math.floor(screenT / 0.4)
    sm.uTyped.value = (screenT % 0.8) / 0.8
    sm.uCursor.value = ((still ? 0 : time) % 1.06) / 1.06 < 0.55 ? 1 : 0
    sm.uProgress.value = still ? 0.6 : (screenT / 40) % 1
    if (pf.buildT >= 0 && pf.buildT < dt + 1e-4) buildSeed++
    if (pf.success) {
      sinceSuccess = 0
      if (!lowPower && !still) stageCues.commitAt = now
    } else sinceSuccess += dt
    // Read only, for the backdrop's descent (terrain.ts): when the next build is due, and when this one began.
    if (!lowPower && !still && weight > 0.02) {
      stageCues.buildDue = now + pf.compileIn * 1000
      if (pf.buildT >= 0) stageCues.buildAt = now - pf.buildT * 1000
    } else stageCues.buildDue = Infinity
    sm.uTermSeed.value = buildSeed
    sm.uTerm.value = pf.buildT >= 0 ? Math.min(4, (pf.buildT / 1.1) * 4) : 4
    // The check mark: hidden while the build prints; on success a single pulse, then it stays, dim.
    sm.uCheck.value = pf.buildT >= 0 && sinceSuccess > pf.buildT ? 0 : sinceSuccess < 0.6 ? 0.35 + 0.65 * Math.sin(Math.PI * (sinceSuccess / 0.6)) : 0.35
    sm.uSweep.value = sinceSuccess < 0.7 ? sinceSuccess / 0.7 : -1
    // The screen as a light: +-6% with the scroll, a brief +15% when the build passes.
    const scrollPulse = still ? 0 : Math.sin((screenT / 0.8) * Math.PI * 2)
    const boost = sinceSuccess < 0.8 ? 0.15 * Math.sin(Math.PI * (sinceSuccess / 0.8)) : 0
    const glow = 1 + 0.06 * scrollPulse * 0.5 + boost
    sm.uGlow.value = 0.94 + 0.06 * (0.5 + 0.5 * scrollPulse) + boost
    sm.uPower.value = power
    sm.uFade.value = props / Math.max(power, 1e-3)
    // The cast light; in lite a static emissive (the display and its glow on the table only).
    lap.screenLight.intensity = lowPower ? 0 : SCREEN_LIGHT * props * glow
    lap.keyLight.intensity = lowPower ? 0 : KEY_LIGHT * props
    lap.screenGlow.uniforms.uA.value = glows ? 0.07 * props * glow : 0
    lap.tableGlow.uniforms.uA.value = (lowPower ? 0.07 : 0.11 * glow) * props
    lap.lidEdge.opacity = 0.3 * (0.6 + 0.4 * props) * furnitureFade
    lap.keyboard.update(dt, props)

    // ---- the stage: the dais breathes on the beat, the equaliser jumps, the rings turn, the commit pulse
    robot.dais.uniforms.uPulse.value = lowPower ? 0 : beatNow.pulse * 0.55 * weight
    const eq = robot.eq.material.uniforms
    eq.uBeat.value = beatNow.index
    eq.uSince.value = beatNow.since
    eq.uOn.value = beatNow.on && !lowPower ? 1 : 0
    eq.uAmp.value = pf.eq
    const [backRing, lowRing] = robot.rings
    backRing.points.rotation.y = still ? 0.4 : time * ((2 * Math.PI) / 150)
    lowRing.points.rotation.y = still ? 1.2 : -time * ((2 * Math.PI) / 120)
    backRing.material.uniforms.uSat.value = still ? 2 : (-time * (2 * Math.PI)) / 70
    lowRing.material.uniforms.uSat.value = still ? 0.6 : (time * (2 * Math.PI)) / 48
    lowRing.points.visible = true
    backRing.points.visible = !phone
    // The commit pulse: across the table and the floor from the laptop, and a trail up into the beam.
    const pulseT = (now - stageCues.commitAt) / 1000
    pulseU.uT.value = pulseT >= 0 && pulseT < PULSE.life ? pulseT : -1
    if (pulseU.uT.value >= 0) {
      lap.group.getWorldPosition(pulseU.uTableC.value)
      pulseU.uFloorC.value.copy(pulseU.uTableC.value).setY(0)
      tableInv.copy(robot.desk.group.matrixWorld).invert()
      pulseU.uTableInv.value.copy(tableInv)
      pulseU.uTableHalf.value.set(robot.desk.half.x / robot.desk.group.scale.x, robot.desk.half.y / robot.desk.group.scale.z)
      lap.display.localToWorld(pulseU.uTop.value.set(0, (SCREEN.h / 2) * 1.05, 0.004))
      // Up and toward the beam over the stage's centre.
      pulseU.uRise.value.set(-pulseU.uTop.value.x * 0.5, 1.25, -pulseU.uTop.value.z * 0.4)
    }
    // Shadows come in with the furniture and go with the dissolve (the shadow pass does not dissolve).
    key.shadow.intensity = lowPower ? 0 : introFurniture * (1 - smoothstep(0, 0.15, d))

    // ---- mood: the launcher's, once the head is home; in the hero, the performance's (^ ^ on a build).
    const want: FaceMood = docked ? robotLink.mood : pf.joy ? 'joy' : 'neutral'
    if (want !== shownMood && swapT < 0) {
      // The hero's joy comes and goes without a swap blink.
      if (!docked && (want === 'joy' || shownMood === 'joy')) shownMood = want
      else {
        swapT = 0
        reactT = 0
        reactMood = want
      }
    }
    let swapLid = 1
    if (swapT >= 0) {
      swapT += dt
      const k = swapT / 0.24
      // Eyes shut, the face swaps while they are closed, then they reopen.
      swapLid = k < 0.45 ? 1 - (k / 0.45) * 0.94 : k < 0.55 ? 0.06 : 0.06 + ((k - 0.55) / 0.45) * 0.94
      if (k >= 0.5 && shownMood !== reactMood) shownMood = reactMood
      if (k >= 1) {
        swapT = -1
        swapLid = 1
      }
    }
    const faceKey = shownMood !== 'joy' && animatedFace(shownMood) ? `${shownMood}@${Math.floor(time * 30)}` : shownMood
    if (faceKey !== painted) {
      robot.drawFace(shownMood, time)
      painted = faceKey
    }

    // ---- gaze
    robot.root.updateMatrixWorld(true)
    let yawT: number
    let pitchT: number
    let yawRaw: number
    let pitchRaw: number
    let eyeTX: number
    let eyeTY: number
    if (!docked) {
      // Pointer -> ray through this frame's projection -> plane before the face -> neck angles.
      const look = lookAt(now, time)
      const nx = (look.x / VW) * 2 - 1
      const ny = 1 - (look.y / VH) * 2
      near.set(nx, ny, -1).applyMatrix4(projInv).applyMatrix4(camera.matrixWorld)
      far.set(nx, ny, 1).applyMatrix4(projInv).applyMatrix4(camera.matrixWorld)
      dir.subVectors(far, near).normalize()
      headWorld.copy(headLocal)
      body.localToWorld(headWorld)
      normal.subVectors(camera.position, headWorld)
      const plane = normal.length() * 0.5
      normal.normalize()
      const denom = dir.dot(normal)
      if (Math.abs(denom) > 1e-4) {
        // Plane: through headWorld + normal * plane, facing the camera.
        const tt = (plane - offset.subVectors(near, headWorld).dot(normal)) / denom
        point.copy(dir).multiplyScalar(tt).add(near)
      } else {
        point.copy(camera.position)
      }
      body.worldToLocal(point).sub(headLocal)
      const flat = Math.hypot(point.x, point.z)
      yawRaw = Math.atan2(point.x, Math.max(1e-3, point.z))
      pitchRaw = -Math.atan2(point.y, Math.max(1e-3, flat))
      const glideYaw = clamp(yawRaw, -YAW_MAX, YAW_MAX)
      const glidePitch = clamp(pitchRaw, -PITCH_UP, PITCH_DOWN)
      const glideEyeX = clamp((yawRaw - head.yaw) * 0.085, -0.075, 0.075)
      const glideEyeY = clamp(-(pitchRaw - head.pitch) * 0.085, -0.055, 0.055)

      // The coding gaze: at the laptop's display (the eyes take up the rest); glancing, about 15 deg
      // toward the viewer with the eyes meeting theirs.
      lap.display.getWorldPosition(screenWorld)
      const toScreen = anglesTo(screenWorld)
      const toViewer = anglesTo(camera.position)
      const lean = clamp(toViewer.yaw - toScreen.yaw, -0.26, 0.26)
      // Partway: the face stays turned toward the viewer, the eyes look the rest of the way.
      const baseYaw = clamp(toScreen.yaw * 0.42, -0.36, 0.36) + lean * pf.glance
      const basePitch = clamp(toScreen.pitch, -0.2, 0.35) - 0.04 * pf.glance
      const baseEyeX = lerp(clamp((toScreen.yaw - baseYaw) * 0.12, -0.075, 0.075), clamp((toViewer.yaw - baseYaw) * 0.09, -0.075, 0.075), pf.glance) + pf.eyeX
      const baseEyeY = lerp(clamp(-(toScreen.pitch - basePitch) * 0.08, -0.03, 0.03), 0.01, pf.glance) + pf.eyeY

      // The pointer, while it moves (fine pointers on larger screens only): it pulls the head within
      // +-12 deg of the viewer and the eyes a cell or two further, then lets go after 3 s.
      const active = !phone && finePointer.matches && !gaze.touch && gaze.inside && now - gaze.at < POINTER_IDLE
      head.pointer = damp(head.pointer, active ? 1 : 0, active ? 4 : 1.6, dt)
      const pYaw = toViewer.yaw + clamp(yawRaw - toViewer.yaw, -POINTER_LIMIT, POINTER_LIMIT)
      const pPitch = toViewer.pitch + clamp(pitchRaw - toViewer.pitch, -POINTER_LIMIT, POINTER_LIMIT)
      const pEyeX = clamp((yawRaw - pYaw) * 0.09, -0.075, 0.075)
      const pEyeY = clamp(-(pitchRaw - pPitch) * 0.09, -0.055, 0.055)
      const heroYaw = lerp(baseYaw, pYaw, head.pointer)
      const heroPitch = lerp(basePitch, pPitch, head.pointer)

      // The scroll hands the head back to the pointer (and its idle wander), as before.
      const hw = weight
      yawT = lerp(glideYaw, heroYaw, hw)
      pitchT = lerp(glidePitch, heroPitch, hw)
      eyeTX = lerp(glideEyeX, lerp(baseEyeX, pEyeX, head.pointer), hw)
      eyeTY = lerp(glideEyeY, lerp(baseEyeY, pEyeY, head.pointer), hw)
    } else {
      // The launcher robot's own life: glances while neutral, a scan while thinking,
      // a droop while asleep or crying, held still while the chat is open.
      const g = robotLink.live && shownMood === 'neutral' ? glance(time) : { yaw: 0, pitch: 0 }
      yawT = g.yaw
      pitchT = g.pitch
      if (shownMood === 'thinking') {
        yawT = -0.22 + 0.18 * Math.sin(time * ((2 * Math.PI) / 3.2))
        pitchT = -0.14
      } else if (shownMood === 'sleepy') {
        pitchT = 0.3
      } else if (shownMood === 'sad') {
        pitchT = 0.2
      } else if (shownMood === 'angel') {
        pitchT = -0.08
      }
      yawRaw = yawT * 1.6
      pitchRaw = pitchT * 1.3
      eyeTX = clamp((yawRaw - head.yaw) * 0.085, -0.075, 0.075)
      eyeTY = clamp(-(pitchRaw - head.pitch) * 0.085, -0.055, 0.055)
    }

    // Neck: a slightly underdamped spring (a soft settle, never a snap).
    const h = Math.min(dt, 1 / 30)
    head.vYaw += ((yawT - head.yaw) * STIFF - head.vYaw * DAMPING) * h
    head.vPitch += ((pitchT - head.pitch) * STIFF - head.vPitch * DAMPING) * h
    head.yaw += head.vYaw * h
    head.pitch += head.vPitch * h

    // A curious tilt that grows as it looks aside; asleep, it lolls; a mood change wiggles it.
    head.sleep = damp(head.sleep, docked && shownMood === 'sleepy' ? 1 : 0, 3, dt)
    let roll = 0.07 - head.yaw * 0.16 + head.sleep * (0.16 + 0.03 * Math.sin(time * 1.4))
    let hop = 0
    if (reactT >= 0 && docked) {
      reactT += dt
      const k = Math.min(1, reactT / 0.6)
      if (reactMood === 'surprised') {
        // A jump.
        hop = Math.sin(Math.PI * Math.min(1, k * 1.6)) * 0.12 * (k < 0.625 ? 1 : 0)
      } else {
        // Tilt, counter-tilt, settle.
        roll += k < 0.3 ? -0.14 * (k / 0.3) : k < 0.62 ? lerp(-0.14, 0.07, (k - 0.3) / 0.32) : lerp(0.07, 0, (k - 0.62) / 0.38)
        hop = (k < 0.3 ? k / 0.3 : Math.max(0, 1 - (k - 0.3) / 0.32)) * 0.03
      }
      if (k >= 1) reactT = -1
    }
    if (shownMood === 'happy' && docked) roll += 0.06 * Math.sin(time * 6) * 0.5 + 0.06
    // The coding life rides on top of the aim: the bob and the build's nod, the tilt toward a raised hand.
    headPivot.rotation.set(head.pitch + pf.nod, head.yaw, roll + pf.roll)
    headPivot.position.y += hop

    // Eyes lead the head and keep what the neck cannot reach.
    head.eyeX = damp(head.eyeX, eyeTX, 22, dt)
    head.eyeY = damp(head.eyeY, eyeTY, 22, dt)
    robot.eyes.position.x = head.eyeX
    robot.eyes.position.y = head.eyeY
    robot.narrow.value = docked ? 0 : pf.narrow * (1 - head.pointer * 0.6)

    // Blinks: every 4-6 s (8 s when still) the LEDs collapse onto one row for about 120 ms.
    if (blinkT < 0 && now >= blinkAt) blinkT = 0
    let lid = 1
    if (blinkT >= 0) {
      blinkT += dt
      const bd = 0.12
      lid = 1 - Math.sin(Math.PI * Math.min(1, blinkT / bd)) * 0.94
      if (blinkT >= bd) {
        blinkT = -1
        blinkAt = now + (still ? 8000 : 4000 + Math.random() * 2000)
      }
    }
    const blinks = shownMood === 'neutral' || shownMood === 'thinking' || shownMood === 'surprised'
    robot.lid.scale.y = (blinks ? lid : 1) * swapLid

    // Mood props: the halo, the z's, the bezel dimmed in sleep.
    robot.halo.visible = shownMood === 'angel' && docked
    if (robot.halo.visible) {
      robot.halo.position.y = 0.65 + 0.025 * Math.sin(time * ((2 * Math.PI) / 2.4))
      robot.halo.rotation.z = 0.05 * Math.sin(time * ((2 * Math.PI) / 2.4))
    }
    robot.zzz.forEach((z, i) => {
      z.visible = head.sleep > 0.05
      if (!z.visible) return
      const tz = ((time + i * 1.2) % 2.4) / 2.4
      // Up and away to the left: the launcher's status light sits at its top right.
      z.position.set(-0.52 - i * 0.16 - 0.08 * tz, 0.42 + i * 0.16 + 0.3 * tz, 0.2)
      const m = z.material
      m.opacity = head.sleep * (tz < 0.3 ? tz / 0.3 : 1 - (tz - 0.3) / 0.7)
      const sc = (i ? 0.14 : 0.2) * (0.6 + 0.5 * tz)
      z.scale.set(sc, sc, 1)
    })
    // The bezel catches the screen's light a little (+15% when the build passes); dimmed in sleep.
    robot.bezel.emissiveIntensity = bezelGlow * (1 - 0.45 * head.sleep) * (docked ? 1 : 1 + boost * props)

    // Docked, the body, props and stage are gone: nothing of theirs is drawn or shadowed.
    robot.root.updateMatrixWorld(true)
    // The shadow map is drawn every frame in the hero (once in lite, where it is unused), never docked.
    renderer.shadowMap.needsUpdate = !docked && (!lowPower || !shadowReady)
    if (!docked && !lowPower && a < 0.05 && t > INTRO.music + 1) governor(dt)
    draw(docked || lowPower || degrade >= 4 || !shadowReady ? 0 : REFLECT.opacity * (1 - smoothstep(0, 0.12, a)) * introDais)
    shadowReady ||= renderer.shadowMap.needsUpdate === false
  }

  /** The frame, with the floor reflection under it while the figure sits in the hero. */
  function draw(reflect: number) {
    renderer.autoClear = false
    frameNo++
    if (reflect > 0.001) {
      // The figure mirrored in the stage plane (y = 0), the stage itself left out, nothing cut. Redrawn
      // every other frame (a quarter-resolution blur: the lag does not show).
      if (frameNo % 2 === 0 || !reflectFresh) drawReflection()
      floorPt.set(0, 0, 0).project(camera)
      topPt.set(0, top, 0).project(camera)
      const u = reflectMat.uniforms
      u.uFloor.value = floorPt.y
      u.uLength.value = Math.max(0.01, (topPt.y - floorPt.y) * REFLECT.length)
      u.uOpacity.value = reflect
      renderer.clear()
      renderer.render(reflectScene, quadCam)
    } else {
      reflectFresh = false
      renderer.clear()
    }
    renderer.render(scene, camera)
  }

  let reflectFresh = false
  function drawReflection() {
    reflectFresh = true
    const cutWas = cut.value
    const stageWas = robot.stage.visible
    const shadowWas = renderer.shadowMap.needsUpdate
    cut.value = -100
    robot.stage.visible = false
    robot.root.scale.y = -1
    renderer.shadowMap.needsUpdate = false
    renderer.setRenderTarget(reflectRT)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    robot.root.scale.y = 1
    robot.stage.visible = stageWas
    cut.value = cutWas
    renderer.shadowMap.needsUpdate = shadowWas
    robot.root.updateMatrixWorld(true)
  }

  // ---- lifecycle

  const observer = new ResizeObserver(() => {
    layout()
    sizeCanvas()
  })
  observer.observe(layer.el)
  layout()
  sizeCanvas()
  setDock('away', true)
  const stopTick = onTick(frame, 10)

  let fallback: RobotHandle | null = null
  const onLost = (e: Event) => {
    e.preventDefault()
    if (lost) return
    lost = true
    teardown()
    fallback = mountStill(host, opts)
    if (revealed) fallback.reveal()
    fallback.setProgress(progress)
  }
  canvas.addEventListener('webglcontextlost', onLost)

  function teardown() {
    stopTick()
    observer.disconnect()
    beat.stop()
    canvas.removeEventListener('webglcontextlost', onLost)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('touchstart', onTouch)
    window.removeEventListener('touchmove', onTouch)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('blur', onBlur)
    robot.dispose()
    env.dispose()
    reflectRT.dispose()
    reflectMat.dispose()
    reflectQuad.geometry.dispose()
    key.shadow.map?.dispose()
    renderer.dispose()
    canvas.remove()
    safeProbe.remove()
    layer.dispose()
    setDock('none', false)
    host.style.removeProperty('--robot-bg')
    for (const prop of ['--robot-x', '--robot-y', '--robot-h', '--robot-foot', '--chest-y', '--dais-w', '--dais-h']) stageEl.style.removeProperty(prop)
    stageFrame.set(null)
    stageCues.commitAt = -Infinity
    stageCues.buildAt = -Infinity
    stageCues.buildDue = Infinity
    stageCues.degrade = 0
  }

  return {
    reveal() {
      if (!revealed) revealedAt = performance.now()
      revealed = true
      layer.el.classList.add('is-revealed')
      fallback?.reveal()
    },
    setLowPower(v) {
      lowPower = v
      applyLighting()
      if (!docked && !lost) sizeCanvas()
    },
    setProgress(p) {
      progress = p
      fallback?.setProgress(p)
    },
    setRendering() {
      // The robot outlives the stage (it becomes the launcher); it keeps its own loop.
    },
    dispose() {
      if (fallback) fallback.dispose()
      else if (!lost) teardown()
    },
  }
}

/**
 * A dark studio for reflections and soft fill (instead of a photographic HDRI): a near-black room
 * with a large near-white softbox above front-left (the key), violet strip boxes behind on the right
 * (#7C5CFF) and the left (#A78BFA), and a faint floor bounce. Prefiltered once (PMREM).
 */
function studioEnvironment() {
  const scene = new Scene()
  const disposables: { dispose(): void }[] = []
  const room = new BoxGeometry(12, 9, 12)
  const roomMat = new MeshBasicMaterial({ color: '#0b0916', side: BackSide })
  scene.add(new Mesh(room, roomMat))
  disposables.push(room, roomMat)
  const box = (hex: string, power: number, w: number, h: number, x: number, y: number, z: number) => {
    const g = new PlaneGeometry(w, h)
    const m = new MeshBasicMaterial({ color: new Color(hex).multiplyScalar(power), side: DoubleSide })
    const o = new Mesh(g, m)
    o.position.set(x, y, z)
    o.lookAt(0, 1, 0)
    scene.add(o)
    disposables.push(g, m)
  }
  box('#f5f3ff', 5, 3.4, 2.2, -2.2, 3.6, 2.8)
  box('#7c5cff', 6, 1.2, 4.2, 3.6, 1.8, -3.2)
  box('#a78bfa', 3.5, 1, 3.4, -3.8, 1.6, -3)
  box('#c4b5fd', 1.4, 2.4, 1.4, 3.2, 1.2, 3.4)
  box('#14102a', 2, 8, 8, 0, -3.5, 0)
  return { scene, dispose: () => disposables.forEach((d) => d.dispose()) }
}

/**
 * Patches a material so fragments below `cut` (world height, rough-edged by noise) are discarded
 * (the scroll's dissolve), fragments above `reveal` too (the load's scan, climbing from the feet), and
 * a share of them by a fine dither while `show` is under 1 (the furniture's fade-in). A thin emissive
 * seam glows at the cut and the scan (solid surfaces only: on a glow or shadow quad it would light the
 * whole plane). With cut far below, reveal far above and show at 1, it changes nothing. A material's
 * own patch, if it has one (the keycaps'), runs first.
 */
function dissolvable(m: Material, cut: { value: number }, reveal: { value: number }, show: { value: number }, seam: { value: Color }) {
  const own = m.onBeforeCompile.bind(m)
  const ownKey = m.customProgramCacheKey.bind(m)
  m.onBeforeCompile = (shader, r) => {
    own(shader, r)
    shader.uniforms.uCut = cut
    shader.uniforms.uReveal = reveal
    shader.uniforms.uShow = show
    shader.uniforms.uSeam = seam
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDissolve;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDissolve = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDissolve;
uniform float uCut;
uniform float uReveal;
uniform float uShow;
uniform vec3 uSeam;
float dHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(dHash(i), dHash(i + vec3(1, 0, 0)), f.x), mix(dHash(i + vec3(0, 1, 0)), dHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(dHash(i + vec3(0, 0, 1)), dHash(i + vec3(1, 0, 1)), f.x), mix(dHash(i + vec3(0, 1, 1)), dHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
float dN = dNoise(vDissolve * 11.0) * 0.6 + dNoise(vDissolve * 27.0) * 0.4;
float dH = vDissolve.y + (dN - 0.5) * 0.22 - uCut;
if (dH < 0.0) discard;
// The fade-in: a fine low-discrepancy dither, so it reads as a fade rather than a wipe.
if (uShow < 1.0 && fract(dot(floor(gl_FragCoord.xy), vec2(0.7548777, 0.5698403))) >= uShow) discard;
// The scan: in rows of dots (a 0.02 world grid), so it reads as a dot-scan rather than a wipe.
vec2 dCell = fract(vec2(vDissolve.x + vDissolve.z, vDissolve.y) / 0.02) - 0.5;
float dR = uReveal - vDissolve.y;
float dDots = step(length(dCell), 0.34);
if (dR < 0.0 || (dR < 0.05 && dDots < 0.5)) discard;
float dSeam = max(1.0 - smoothstep(0.0, 0.035, dH), (1.0 - smoothstep(0.0, 0.07, dR)) * step(uReveal, 500.0));`,
      )
      .replace('#include <opaque_fragment>', `outgoingLight += uSeam * dSeam * ${m.transparent ? '0.0' : '2.2'};\n#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => `${ownKey()}|${m.transparent ? 'dissolve-t' : 'dissolve'}`
}
