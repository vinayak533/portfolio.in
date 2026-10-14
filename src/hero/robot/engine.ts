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
 * Load: the hero's poster (Hero.tsx) is the first paint. Once the shaders have
 * compiled, the first frame is drawn and the canvas crossfades over the poster
 * (300 ms, robot.css); the beat starts with it.
 *
 * Scroll (setProgress, from src/hero/transition.ts), as a pure function of
 * progress so scrolling back replays it exactly:
 *
 *   0 .. 0.30     the typing stops, the hands lift off the keys, the laptop's
 *                 screen dims (POWER_OFF); the landscape starts to dim and drift up
 *   0.20 .. 0.60  the chair, the table, the laptop and the body dissolve from the
 *                 feet up into violet dots (DISSOLVE) as the camera closes on the
 *                 head, which turns to face you
 *   0.50 .. 1.00  the head, headphones on, lifts off the neck (DETACH: eyes wide,
 *                 then ^ ^ for 400 ms) and arcs down into the dock in the corner,
 *                 shrinking as it goes, landing exactly as the pin releases
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
 * Docked (the chat launcher's face, in the bottom-right dock: 112 px on desktops,
 * 96 on tablets, 72 on phones), it is quiet: its eyes follow the pointer (within
 * +-12 deg; on touch screens they drift a cell with the scroll), it blinks every
 * 4-6 s, floats (3 px over 4 s, +-1.5 deg of pitch), and wears ^ ^ for 400 ms as
 * each new section comes into view; never more than one new expression in 1.5 s,
 * never a hop. Below 500 px of height it holds still. Only the head is drawn
 * there (the rest of the scene is hidden), at 30 frames a second unless its eyes
 * or head are moving.
 */
import {
  ACESFilmicToneMapping,
  BackSide,
  BasicDepthPacking,
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Matrix4,
  InstancedMesh,
  Mesh,
  Object3D,
  MeshBasicMaterial,
  MeshDepthMaterial,
  NoToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SkinnedMesh,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Light,
  type Material,
  type Texture,
} from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { clamp, createPacer, damp, easeInOutCubic, gsap, onTick, pacing, remap, smoothstep } from '../../core/clock'
import { heroConfig, MOBILE_QUERY } from '../config'
import { shotAt } from '../shot'
import { buildRobot, buildRobotSteps, type RobotModel } from './model'
import { boundsOf } from './merge'
import { createLayer, stageCues, stageFrame, type RobotHandle, type RobotOptions } from './dom'
import { robotLink, setDock } from './bridge'
import { animatedFace } from './face'
import type { FaceMood } from './dots'
import { mountRobot as mountStill } from './still'
import { beat, emptySample } from './beat'
import { createPerformance } from './perform'
import { PULSE, SCREEN } from './props'
import { JITTER, lateFrame, overBudget, SLOW_FRAME, TIERS, type HeroTier } from '../tier'
import { signals, useStore } from '../../store/useStore'
import { FROZEN } from '../freeze'
import { PERF_LAB, labNumber, labOff } from '../../core/perfLab'

const FOV = 28
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180)

/** Scroll beats (hero progress). The glide starts where the transition's idle hold ends. */
const GLIDE_END = 0.5
/** The furniture and the body dissolve, from the feet up (the head and its headphones never do). */
const DISSOLVE: [number, number] = [0.2, 0.6]
/** The typing stops (the hands lift off the keys) and the laptop's screen dims. */
const POWER_OFF: [number, number] = [0, 0.3]
/** The head lifts off the neck (this far, world units) as its flight begins. */
const DETACH: [number, number] = [0.5, 0.6]
const DETACH_LIFT = 0.16
/** The flight overlaps the backdrop giving way to About (about 0.77..0.95), landing as the pin releases. */
const DOCK = 0.5
const DOCK_END = 1

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
/** The dock: the head's box in the corner (px; the docked canvas), by width: desktops, tablets, phones. */
const DOCK_BOX = { desktop: 112, tablet: 96, phone: 72 }
/** The head's height in the dock, as a share of the box (with its headphones it is about 1.4 times as wide). */
const DOCK_HEAD = 0.46
/** Docked: the float (px, s), its pitch (rad), the ^ ^ on a new section (ms), the least time between expressions (ms). */
const DOCKED = { bob: 3, period: 4, pitch: (1.5 * Math.PI) / 180, hello: 400, gap: 1500 }

/** The dissolve's heights: from below the stage to past the collar (the head is never cut). */
const CUT_FROM = -0.15
const CUT_OVER = 0.14
/** How far the dissolve's noise lifts a surviving fragment over the cut (dissolvable(): (n - 0.5) * 0.22), with a margin. */
const DISSOLVE_NOISE = 0.12

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
/** Portrait screens: the clear space kept between the scene (its dais's front rim) and the copy under it (px). */
const COPY_GAP = 16
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

/**
 * The key light: warm (#FFF1E6, the palette's one exception, on the robot only) or the palette's own near-white
 * text colour. The studio environment's key softbox follows it.
 */
const WARM_KEY_ENABLED = true
const KEY_COLOR = WARM_KEY_ENABLED ? '#fff1e6' : '#f5f3ff'
/**
 * A new descent agent (terrain.ts, stageCues.agentAt): the eyes find it and follow it for `hold` s (in over
 * `in`, back over `out`), the head turning `head` of the way; not while the pointer leads or during a glance.
 */
const AGENT_LOOK = { in: 0.12, hold: 1.2, out: 0.4, head: 0.3 }

/** The laptop display as a light (the area light's intensity, the keyboard's backlight under the hands). */
const SCREEN_LIGHT = 3.2
const KEY_LIGHT = 0.12

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpLog = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t))

/**
 * The robot built in slices of a few milliseconds, the main thread handed back between them (the build is most
 * of a second on a phone: in one piece it held up input and the copy's entrance), then mounted.
 */
export async function mountRobotAsync(host: HTMLElement, opts: RobotOptions = {}, cancelled: () => boolean = () => false): Promise<RobotHandle | null> {
  const steps = buildRobotSteps()
  for (;;) {
    const end = performance.now() + SLICE_MS
    let r = steps.next()
    while (!r.done && performance.now() < end) r = steps.next()
    if (r.done) {
      if (cancelled()) {
        r.value.dispose()
        return null
      }
      return mountRobot(host, { ...opts, robot: r.value })
    }
    await yieldToMain()
    if (cancelled()) return null
  }
}

/** How long each slice of the build may run (ms). */
const SLICE_MS = 8
/** Back to the main thread for a moment: scheduler.yield where there is one (it keeps this task's place), else a message. */
const yieldToMain = () => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (s?.yield) return s.yield()
  return new Promise<void>((resolve) => {
    const ch = new MessageChannel()
    ch.port1.onmessage = () => resolve()
    ch.port2.postMessage(0)
  })
}

export function mountRobot(host: HTMLElement, opts: RobotOptions & { robot?: RobotModel } = {}): RobotHandle {
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
  // Shader diagnostics in development only: in production they are synchronous GL queries (and print the
  // driver's harmless warnings).
  renderer.debug.checkShaderErrors = import.meta.env.DEV
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = !labOff('shadows')
  renderer.shadowMap.type = PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  RectAreaLightUniformsLib.init()

  // ---- scene

  const scene = new Scene()
  // The studio's reflections (prefilteredStudio): made in the background before the first frame, which waits for
  // them (the scene's programs depend on them: they compile once it is in place, below).
  let env: Texture | null = null
  let tornDown = false
  const envReady = labOff('env')
    ? Promise.resolve()
    : prefilteredStudio(renderer).then((t) => {
        if (tornDown) return t.dispose()
        env = t
        scene.environment = t
      })
  scene.environmentIntensity = 0.5

  // Lit in the hero's one hue: a warm key from above, front-left (the stage's beam, hero.css), violet rims
  // from behind on both edges, and a soft lilac fill (the violet bounce) so the shadow side keeps its detail.
  // The key casts soft shadows (the head onto the torso, the arms onto the lap, everything on the dais).
  // The laptop's display is the scene's second light (furniture.ts).
  const key = new DirectionalLight(KEY_COLOR, 2.1)
  key.position.set(-1.4, 7, 2.6)
  key.castShadow = true
  key.shadow.mapSize.setScalar(labNumber('smap') ?? 2048)
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

  const robot = opts.robot ?? buildRobot()
  scene.add(robot.root)
  const { headPivot, body, rig } = robot
  headPivot.rotation.order = 'YXZ'
  const lap = robot.laptop
  if (labOff('screenlight')) lap.screenLight.visible = false
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

  /**
   * By tier (src/hero/tier.ts): HIGH has the shadow map and the floor reflection; MEDIUM drops both (the blob
   * shadow under the dais stays) but keeps the glow cards and the screen's light; LOW (lowPower) also has less
   * environment and the display as a static emissive rather than a light.
   */
  function applyLighting() {
    scene.environmentIntensity = lowPower ? 0.36 : 0.5
    key.shadow.intensity = shadows ? 1 : 0
    key.shadow.radius = opts.integratedGpu ? 3 : 5
  }

  // ---- the body's dissolve (scroll): discarded below a height that climbs from the dais to the collar,
  // broken up by noise, with a thin glowing seam where it is coming apart. The furniture dissolves with
  // it; the head and its headphones never do.
  const cut = { value: CUT_FROM - 1 }
  const seam = { value: new Color('#9c86ff') }
  if (!labOff('dissolve')) {
    for (const m of robot.bodyMaterials) dissolvable(m, cut, seam)
    for (const m of robot.furnitureMaterials) dissolvable(m, cut, seam)
  }
  /** The top of the seated figure (the headphones), stage space. */
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
  if (PERF_LAB) Object.assign(window, { __heroRobot: { robot, scene, perform, renderer, camera, stageCues, frame: () => stageFrame.get(), dock: () => ({ docked, face: shownMood, busy: dockBusy, cost: dockCost.n ? dockCost.sum / dockCost.n : 0, drawMs: dockCost.n ? dockCost.draw / dockCost.n : 0, frames: dockCost.n, draws: dockCost.draws, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, box: L.box }) } })
  const tall = window.matchMedia(MOBILE_QUERY)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  let tier: HeroTier = opts.tier ?? 'high'
  let lowPower = tier === 'low'
  let shadows = tier === 'high'
  stageCues.governed = !lowPower
  applyLighting()
  /** The robot's pixel ratio: by tier (and 1.5 on an integrated GPU). Never lowered by the governor: the head and its eyes stay sharp. */
  const pixelCap = () => labNumber('rdpr') ?? Math.min(window.devicePixelRatio || 1, TIERS[tier].robotDpr, opts.integratedGpu ? 1.5 : 2)

  /**
   * Quality steps taken when the hero cannot hold its frame rate (frames averaging more than 12% over the paced
   * interval across a 2 s window while the scene plays, tier.ts overBudget, or a tenth of them late: lateFrame),
   * one per window, in this order: the
   * vortex (half, then off), 1-3 the backdrop's interference waves, comets and grid density (terrain.ts reads
   * these), 4 the glows that stand in for bloom and the floor reflection, 5 the shadow map halves, 6 the
   * equaliser drops to 28 columns; terrain.ts then lowers its own pixel ratio (7) and frame rate (8); last,
   * every WebGL loop locks to an even 30 (clock.ts). Far over budget, the lock comes first. Only ever downward
   * (no oscillation); the head, the eyes and the laptop's screen are never touched (the robot's pixel ratio is
   * not on the ladder).
   */
  let degrade = 0
  const perf = { sum: 0, n: 0, late: 0 }
  /** Development only: ?hq holds the governor off (for captures on slow, software-rendered machines). */
  const holdQuality = (import.meta.env.DEV && new URLSearchParams(location.search).has('hq')) || FROZEN || labOff('adapt')
  function governor(dt: number) {
    if (holdQuality) return
    perf.sum += dt
    perf.n++
    if (lateFrame(dt * 1000)) perf.late++
    if (perf.sum < SLOW_FRAME.span / 1000) return
    const avg = (perf.sum / perf.n) * 1000
    const jitter = perf.late / perf.n
    perf.sum = perf.n = perf.late = 0
    if (!overBudget(avg) && jitter <= JITTER) return
    // Far over (under ~40 frames a second at 60 Hz): no feature would win back that much, and shedding them
    // one window at a time would leave it stuttering in between for a while: an even 30 at once, every
    // feature kept. A little over: the least visible feature goes, one per window, the lock last. (Once
    // locked, the same ladder runs against the 30's budget.)
    if (!pacing.locked && overBudget(avg / 1.35)) pacing.locked = true
    else stepDown()
  }
  /**
   * LOW's own watch (the governor stands down there, having nothing left to shed): drawn frames averaging more
   * than 12% over the even 30's interval (under ~27 a second), or a tenth of them late (tier.ts lateFrame), for
   * two 2 s windows in a row at rest in the hero, and the hero's last-resort loop is asked for
   * (opts.onStruggling, src/hero/loop.ts). Once.
   */
  const lowWatch = { sum: 0, n: 0, late: 0, windows: 0, told: false, since: performance.now() }
  function watchLow(dt: number) {
    if (holdQuality || lowWatch.told || !opts.onStruggling || performance.now() - lowWatch.since < 1500) return
    lowWatch.sum += dt
    lowWatch.n++
    if (lateFrame(dt * 1000, true)) lowWatch.late++
    if (lowWatch.sum < SLOW_FRAME.span / 1000) return
    const avg = (lowWatch.sum / lowWatch.n) * 1000
    const jitter = lowWatch.late / lowWatch.n
    lowWatch.sum = lowWatch.n = lowWatch.late = 0
    lowWatch.windows = overBudget(avg, true) || jitter > JITTER ? lowWatch.windows + 1 : 0
    if (lowWatch.windows < 2) return
    lowWatch.told = true
    opts.onStruggling()
  }
  function stepDown() {
    // The landscape's inflow vortex goes first: half its dots, then all of them (terrain.ts).
    if (stageCues.vortex < 2) {
      stageCues.vortex++
      return
    }
    // Last: every WebGL loop locks to an even ~30 frames a second (clock.ts).
    if (degrade >= 8) {
      pacing.locked = true
      return
    }
    degrade++
    stageCues.degrade = degrade
    if (degrade === 5) {
      key.shadow.mapSize.set(1024, 1024)
      key.shadow.map?.dispose()
      key.shadow.map = null
    }
    if (degrade === 6) robot.setEqColumns(28)
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

  /** The dock's size (px) at this width. */
  const dockSize = () => (VW > 1024 ? DOCK_BOX.desktop : VW >= 768 ? DOCK_BOX.tablet : DOCK_BOX.phone)

  /**
   * The launcher's box while the head flies to it, read at the top of each frame (a prioritised ticker
   * listener, before this frame's tweens write any style), so the read never forces a layout. It is the box
   * the frame would have measured later on: nothing in between moves the launcher.
   */
  let anchorRect: DOMRect | null = null
  const sampleAnchor = () => {
    anchorRect = robotLink.anchor && !docked && progress >= DOCK - 0.05 ? robotLink.anchor.getBoundingClientRect() : null
  }
  gsap.ticker.add(sampleAnchor, false, true)

  /** The launcher button's box (px, viewport). Before the chat widget mounts: where its CSS will put it (chat.css). */
  function anchorBox() {
    const a = anchorRect ?? robotLink.anchor?.getBoundingClientRect()
    if (a && a.width) return { x: a.left, y: a.top, w: a.width, h: a.height }
    const size = VW > 1024 ? 64 : VW >= 768 ? 56 : 52
    const side = clamp(VW * 0.044, 24, 64) - 0.17 * dockSize() + (dockSize() - size) / 2
    const m = (dockSize() - size) / 2 + (VW > 1024 ? 28 : VW >= 768 ? 24 : 16)
    return { x: VW - side - size, y: VH - m - size, w: size, h: size }
  }

  /** The dock: a box centred on the launcher button, the head at its share of it. */
  function measureDock() {
    const a = anchorBox()
    const size = dockSize()
    L.box = { x: a.x + a.w / 2 - size / 2, y: a.y + a.h / 2 - size / 2, w: size, h: size }
    L.dx = ((a.x + a.w / 2) / VW) * 2 - 1
    L.dy = 1 - ((a.y + a.h / 2) / VH) * 2
    L.sd = (DOCK_HEAD * size) / (VH * L.headShare)
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
    // (The bounds of the original meshes, merged or not: merge.ts.)
    boundsOf(body, box)
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
    // Portrait screens: the scene also keeps COPY_GAP above the hero's copy (it never runs under the text).
    const bottom = Math.min(VH - (phone ? BOTTOM.phone : BOTTOM.wide) - safeBottom(), copyTop() - COPY_GAP)
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

    // (A new layout reads the launcher afresh.)
    anchorRect = null
    measureDock()
  }

  /** Portrait screens: the top of the hero's copy (px; its box is fixed from the first paint, hero.css), else Infinity. */
  function copyTop() {
    if (!tall.matches) return Infinity
    const r = document.querySelector('.hero-copy-layer .hero-intro')?.getBoundingClientRect()
    return r && r.height ? r.top : Infinity
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
    shownFresh = false
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
    shownFresh = false
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
    // Docked, only the head is drawn: the body (all but the head's pivot), the furniture and the stage are hidden.
    for (const c of body.children) if (c !== headPivot) c.visible = !on
    robot.chair.visible = robot.desk.group.visible = !on
    // The laptop's parts go but its two lights stay, dark: a light leaving the scene changes every lit
    // material's program, and the head's would recompile on the spot as it lands (most of a second on a
    // phone, both ways). A light at zero adds exactly nothing, so the docked head looks just the same.
    for (const [o, shown] of laptopParts) o.visible = on ? false : shown
    if (on) lap.screenLight.intensity = lap.keyLight.intensity = 0
    // (The neck, under the head's pivot but of the body, is dissolved by then: not drawn either.)
    for (const m of neckMeshes) m.visible = !on
    // ...and the renderer stops walking the whole scene's matrices each frame (syncWorld updates the head's).
    scene.matrixWorldAutoUpdate = !on
  }

  /** The laptop's parts with no light inside (what docking hides), with their visibility as built. */
  const laptopParts: [Object3D, boolean][] = []
  const holdsLight = (o: Object3D): boolean => (o as Light).isLight === true || o.children.some(holdsLight)
  const collectParts = (o: Object3D) => {
    for (const c of o.children) {
      if ((c as Light).isLight) continue
      if (holdsLight(c)) collectParts(c)
      else laptopParts.push([c, c.visible])
    }
  }
  collectParts(lap.group)

  /** The body's meshes under the head's pivot (the neck). */
  const neckMeshes: Mesh[] = []
  headPivot.traverse((o) => {
    if (o instanceof Mesh && !o.userData.skinBone && robot.bodyMaterials.includes(o.material as Material)) neckMeshes.push(o)
  })

  /**
   * Once the dissolve is complete, whatever lies wholly under the cut (its bounds' top, plus the noise's reach)
   * has every fragment discarded, and the furniture's own glows and details are faded to nothing: such parts are
   * not drawn at all for the rest of the flight (the same picture, without ~150 draws of nothing a frame).
   * Docking hides them anyway (setDocked); back below a full dissolve, they come back.
   */
  const dissolveParts = (): Object3D[] => [...body.children.filter((c) => c !== headPivot), ...neckMeshes, robot.chair, robot.desk.group, ...laptopParts.map(([o]) => o)]
  const putAwayParts: Object3D[] = []
  let putAwayOn = false
  const partBounds = new Box3()
  function putAway(on: boolean) {
    if (docked) {
      // (setDocked owns their visibility while docked.)
      putAwayParts.length = 0
      putAwayOn = false
      return
    }
    if (on === putAwayOn) return
    putAwayOn = on
    if (on) {
      for (const o of dissolveParts()) {
        if (!o.visible) continue
        boundsOf(o, partBounds)
        if (partBounds.isEmpty() || partBounds.max.y + DISSOLVE_NOISE >= cut.value) continue
        o.visible = false
        putAwayParts.push(o)
      }
    } else {
      for (const o of putAwayParts) o.visible = true
      putAwayParts.length = 0
    }
  }

  /** Docked: a quick ^ ^ as each new section comes into view (not in the hero, not when held still). */
  let helloUntil = -Infinity
  const offSection = useStore.subscribe((st, prev) => {
    // (Within 1.5 s of the last new expression there is no greeting: skipped, not delayed.)
    const now = performance.now()
    if (st.section !== prev.section && st.section !== 'hero' && docked && !staticDock() && now - moodAt >= DOCKED.gap) helloUntil = now + DOCKED.hello
  })
  /** Below 500 px of height (or with reduced motion) the docked head holds still: no float, no greeting. */
  const staticDock = () => VH < 500 || reduced.matches || FROZEN

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

  /**
   * The pointer as neck angles (body frame, into `ray`): unprojected through this frame's projection (before
   * the docked crop) to a ray, met with a plane between the head and the camera.
   */
  const ray = { yaw: 0, pitch: 0 }
  function pointerRay(x: number, y: number) {
    const nx = (x / VW) * 2 - 1
    const ny = 1 - (y / VH) * 2
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
      const tt = (plane - offset.subVectors(near, headWorld).dot(normal)) / denom
      point.copy(dir).multiplyScalar(tt).add(near)
    } else {
      point.copy(camera.position)
    }
    body.worldToLocal(point).sub(headLocal)
    const flat = Math.hypot(point.x, point.z)
    ray.yaw = Math.atan2(point.x, Math.max(1e-3, point.z))
    ray.pitch = -Math.atan2(point.y, Math.max(1e-3, flat))
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
  /** The first revealed frame has been drawn (onReady called). */
  let ready = false
  /** performance.now() of reveal() (the governor waits out the first second after it). */
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
  /** When the shadow map was last drawn (ms). */
  let shadowAt = -Infinity
  /** Frames drawn (the floor reflection is redrawn every other frame). */
  let frameNo = 0
  /** The typing was in a burst last frame (its start is published as stageCues.burstAt). */
  let wasBursting = false
  /** The backdrop's last written fade and leave (style writes only when they change). */
  let shownBg = ''
  let shownLeave = ''

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

  /** Time carried over skipped frames (the pacer's), and docked, whether anything moves. */
  const pace = createPacer()
  let dockCarry = 0
  let dockBusy = true
  /** performance.now() when the head last came off the neck (its eyes go wide, then ^ ^). */
  let detachAt = -Infinity
  let detached = false
  /** performance.now() of the docked head's last new expression (at most one per 1.5 s). */
  let moodAt = -Infinity
  /** The camera's aim: the head's seat on the neck (so the lift off it shows), easing onto the lifted head. */
  const camHead = new Vector3()
  /** Development: the docked frame's CPU time (ms), summed. */
  const dockCost = { sum: 0, n: 0, draw: 0, draws: 0 }
  /** The scene's world matrices: docked, only the head moves (its parents hold still), so only its subtree. */
  const syncWorld = () => (docked ? headPivot.updateMatrixWorld(true) : robot.root.updateMatrixWorld(true))
  const tableInv = new Matrix4()
  const pulseU = robot.pulse.material.uniforms
  /** The rings' resting heights (the typing tremor moves them about these). */
  const backRingY = robot.rings[0].points.position.y
  const lowRingY = robot.rings[1].points.position.y
  function frame(time: number, dt0: number) {
    if (lost || !compiled || document.hidden || opts.isPaused?.()) return
    // The landscape's programs compile in the background too: the first frame waits for them (2 s at most), so
    // the scene comes in whole.
    if (!ready && !stageCues.backdropReady && performance.now() - compiledAt < 2000) return
    if (ready && labOff('robot')) return
    // Paced (clock.ts): about 60 frames a second on any display; an even ~30 in LOW, at the quality ladder's
    // last step and docked while nothing moves (the skipped frames' time is carried, so nothing slows).
    dockCarry += dt0
    if (!pace(performance.now(), lowPower || pacing.locked || (docked && !dockBusy))) return
    const dt = dockCarry === dt0 ? dt0 : Math.min(dockCarry, 1 / 15)
    dockCarry = 0
    const t0 = performance.now()
    const now = t0
    const p = progress
    const still = reduced.matches || FROZEN

    // Beats.
    const a = easeInOutCubic(remap(p, heroConfig.transition.hold, GLIDE_END))
    const bLin = remap(p, DOCK, DOCK_END)
    const b = easeInOutCubic(bLin)
    setDocked(bLin >= 1)
    home()
    // In the launcher with the chat open: the icon is put away, nothing to draw.
    if (docked && (!homed || robotLink.open)) return

    // The music: from the first frame (the scene takes over from the poster already playing).
    if (!still && revealed && !beat.running) beat.start()
    if (still && beat.running) beat.stop()
    beat.sample(now, beatNow)

    // ---- the performance: full in the hero, stopped by 0.3 (the hands lift off the keys; the body turns to face us)
    const weight = (1 - smoothstep(POWER_OFF[0], POWER_OFF[1], p)) * (docked ? 0 : 1)
    robot.root.rotation.y = lerp(YAW0, 0, a)
    // Docked, the body is hidden and still: no performance, laptop or stage to update (the head alone is drawn).
    if (!docked) perform.update(dt, beatNow, { amp: lowPower ? 0.7 : 1, weight, still, turn: smoothstep(0, 0.7, a), faceYaw: 0 })
    const pf = perform.out
    // LOW (and the governor's step 4): no glow cards (the scene's stand-in for bloom).
    const glows = !lowPower && degrade < 4 && !labOff('glows')
    if (!glows) rig.coreGlow.opacity = 0
    placeHead(pf.dip)
    // The head lifts off the neck as its flight begins; the camera keeps to its seat at first, so the lift shows.
    const lifted = smoothstep(DETACH[0], DETACH[1], p)
    if (lifted > 0) {
      camHead.copy(headLocal)
      placeHead(pf.dip + DETACH_LIFT * lifted)
      camHead.lerp(headLocal, smoothstep(DETACH[1], 0.75, p))
    } else camHead.copy(headLocal)
    const isOff = p >= DETACH[0] && !docked
    if (isOff && !detached && !still) detachAt = now
    detached = p >= DETACH[0]
    // The camera and the gaze below read the body's frame only; the renderer refreshes the rest as it draws.
    body.updateWorldMatrix(true, false)

    // The body comes apart from the ground up as the camera closes on the head (the furniture with it);
    // the laptop powers down first. The head and its headphones stay whole.
    const d = smoothstep(DISSOLVE[0], DISSOLVE[1], p)
    // (It rises with the head's lift, so the neck stays behind and is gone: nothing hangs under the head.)
    cut.value = d <= 0 ? CUT_FROM - 1 : lerp(CUT_FROM, neck.y + CUT_OVER, d) + DETACH_LIFT * lifted
    putAway(d >= 1 && !docked)
    // (The headphones stay with the head: phonesCut never rises.)
    const props = 1 - smoothstep(POWER_OFF[0], POWER_OFF[1], p)
    robot.setStage(1 - smoothstep(0, 0.22, d))
    if (docked) robot.stage.visible = false
    const furnitureFade = 1 - smoothstep(0, 0.3, d)
    robot.desk.underglow.opacity = 0.08 * furnitureFade
    for (const m of robot.furnitureFades) m.uniforms.uFade.value = furnitureFade

    // Camera: from the opening framing to the close-up on the head.
    target1.copy(camHead)
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
    // Docked: a slow float (3 px over 4 s), eased in after landing; still below 500 px of height.
    head.dock = docked ? Math.min(1, head.dock + dt / 0.8) : 0
    const floating = docked && robotLink.live && !staticDock()
    if (floating) ty += head.dock * ((DOCKED.bob / VH) * 2) * (0.5 - 0.5 * Math.cos(time * ((2 * Math.PI) / DOCKED.period)))
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

    // The space backdrop gives way to About's world once the stage behind is live. Before that, as the hero
    // starts to leave, it dims and drifts up (hero.css, --hero-leave: a transform, nothing re-rendered).
    const bg = (1 - smoothstep(parting, parting + 0.08, p)).toFixed(4)
    const leave = smoothstep(0, 0.75, p).toFixed(4)
    if (bg !== shownBg) host.style.setProperty('--robot-bg', (shownBg = bg))
    if (leave !== shownLeave) host.style.setProperty('--hero-leave', (shownLeave = leave))

    // ---- the laptop: the display (the code scrolls a line every 0.8 s, at half speed while nobody types),
    // the build (the terminal prints, then the sweep, the check mark, the nod), its light and its keys
    let boost = 0
    if (!docked) {
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
      // A typing burst starting (read only, from the performance): the floor's tremor (terrain.ts) and the rings'.
      const bursting = pf.action === 'type' && pf.scroll >= 1 && weight > 0.5 && !still
      if (bursting && !wasBursting) stageCues.burstAt = now
      wasBursting = bursting
      sm.uTermSeed.value = buildSeed
      sm.uTerm.value = pf.buildT >= 0 ? Math.min(4, (pf.buildT / 1.1) * 4) : 4
      // The check mark: hidden while the build prints; on success a single pulse, then it stays, dim.
      sm.uCheck.value = pf.buildT >= 0 && sinceSuccess > pf.buildT ? 0 : sinceSuccess < 0.6 ? 0.35 + 0.65 * Math.sin(Math.PI * (sinceSuccess / 0.6)) : 0.35
      sm.uSweep.value = sinceSuccess < 0.7 ? sinceSuccess / 0.7 : -1
      // The screen as a light: +-6% with the scroll, a brief +15% when the build passes.
      const scrollPulse = still ? 0 : Math.sin((screenT / 0.8) * Math.PI * 2)
      boost = sinceSuccess < 0.8 ? 0.15 * Math.sin(Math.PI * (sinceSuccess / 0.8)) : 0
      const glow = 1 + 0.06 * scrollPulse * 0.5 + boost
      sm.uGlow.value = 0.94 + 0.06 * (0.5 + 0.5 * scrollPulse) + boost
      sm.uPower.value = 1
      sm.uFade.value = props
      // The cast light; in lite a static emissive (the display and its glow on the table only).
      lap.screenLight.intensity = lowPower ? 0 : SCREEN_LIGHT * props * glow
      lap.keyLight.intensity = lowPower ? 0 : KEY_LIGHT * props
      lap.screenGlow.uniforms.uA.value = glows ? 0.07 * props * glow : 0
      lap.tableGlow.uniforms.uA.value = (lowPower ? 0.07 : 0.11 * glow) * props
      lap.lidEdge.opacity = 0.3 * (0.6 + 0.4 * props) * furnitureFade
      lap.keyboard.update(dt, props)

      // ---- the stage: the dais ripples every 2nd beat, the equaliser jumps, the rings turn, the commit pulse
      // (On every 2nd beat, with the landscape's pulse waves, terrain.ts.)
      robot.dais.uniforms.uPulse.value = lowPower || beatNow.index % 2 ? 0 : beatNow.pulse * 0.55 * weight
      // The vortex's swallow light on the outer ring (terrain.ts); the disc's local angle runs the other way.
      robot.dais.uniforms.uArc.value = -stageCues.swallow.angle
      robot.dais.uniforms.uArcGain.value = lowPower || still ? 0 : stageCues.swallow.gain
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
      // The typing tremor: a burst's first keys shiver the rings (0.4% of the figure's height, 240 ms, three
      // damped swings; the landscape's first rows do the same, terrain.ts).
      const tremorT = (now - stageCues.burstAt) / 240
      const tremor = !lowPower && tremorT >= 0 && tremorT < 1 ? 0.004 * top * Math.sin(Math.PI * 2 * 3 * tremorT) * (1 - tremorT) : 0
      backRing.points.position.y = backRingY + tremor
      lowRing.points.position.y = lowRingY + tremor * 0.7
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
    }
    // Shadows go with the dissolve (the shadow pass does not dissolve).
    key.shadow.intensity = shadows ? 1 - smoothstep(0, 0.15, d) : 0

    // ---- mood: the launcher's, once the head is home (^ ^ as a new section arrives); in the hero, the
    // performance's (^ ^ on a build); coming off the neck, wide eyes then ^ ^ (no swap blink: at once).
    const sinceOff = (now - detachAt) / 1000
    const offMood: FaceMood | null = docked || still ? null : sinceOff < 0.18 ? 'surprised' : sinceOff < 0.58 ? 'joy' : null
    const dockWant: FaceMood = now < helloUntil && robotLink.mood === 'neutral' ? 'joy' : robotLink.mood
    let want: FaceMood = docked ? dockWant : (offMood ?? (pf.joy ? 'joy' : 'neutral'))
    // Docked, a new expression at most every 1.5 s (going back to the resting face is always allowed).
    if (docked && want !== shownMood && want !== 'neutral' && now - moodAt < DOCKED.gap) want = shownMood
    if (offMood && shownMood !== offMood) {
      shownMood = offMood
      swapT = -1
    }
    if (want !== shownMood && swapT < 0) {
      if (docked && want !== 'neutral') moodAt = now
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

    // ---- gaze (the body's frame is current: nothing has moved it since the camera read it)
    let yawT: number
    let pitchT: number
    let yawRaw: number
    let pitchRaw: number
    let eyeTX: number
    let eyeTY: number
    if (!docked) {
      // Pointer -> ray through this frame's projection -> plane before the face -> neck angles.
      // (Frozen / reduced motion: the idle wander holds one point, so the glide is a pure function of the scroll.)
      const look = lookAt(now, still ? 0 : time)
      pointerRay(look.x, look.y)
      yawRaw = ray.yaw
      pitchRaw = ray.pitch
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

      // A new descent agent on the landscape: the eyes find it (in 120 ms), follow it, and come back to the
      // screen; the head turns a little with them. Not while the pointer leads or the robot glances at us.
      const ta = (now - stageCues.agentAt) / 1000
      const onAgent = still ? 0 : smoothstep(0, AGENT_LOOK.in, ta) * (1 - smoothstep(AGENT_LOOK.hold, AGENT_LOOK.hold + AGENT_LOOK.out, ta)) * hw * (1 - head.pointer) * (1 - pf.glance)
      if (onAgent > 0.001) {
        pointerRay(stageCues.agent.x, stageCues.agent.y)
        yawT += clamp(ray.yaw - yawT, -POINTER_LIMIT, POINTER_LIMIT) * AGENT_LOOK.head * onAgent
        pitchT += clamp(ray.pitch - pitchT, -POINTER_LIMIT, POINTER_LIMIT) * AGENT_LOOK.head * onAgent
        eyeTX = lerp(eyeTX, clamp((ray.yaw - head.yaw) * 0.09, -0.075, 0.075), onAgent)
        eyeTY = lerp(eyeTY, clamp(-(ray.pitch - head.pitch) * 0.09, -0.055, 0.055), onAgent)
      }

      // Flying to the dock the head shrinks toward the corner, where the glide's pointer ray swings it side-on
      // (its dark back to the viewer): it turns to face us instead, the pointer pulling it +-12 deg, as docked.
      const fly = smoothstep(0, 0.3, bLin)
      if (fly > 0) {
        const toViewer = anglesTo(camera.position)
        yawT = lerp(yawT, toViewer.yaw + clamp(yawRaw - toViewer.yaw, -POINTER_LIMIT, POINTER_LIMIT), fly)
        pitchT = lerp(pitchT, toViewer.pitch + clamp(pitchRaw - toViewer.pitch, -POINTER_LIMIT, POINTER_LIMIT), fly)
      }
    } else {
      // Docked: the eyes follow the pointer (fine pointers, within +-12 deg of the viewer, the eyes a cell or two
      // further), else a glance now and then; a scan while thinking, a droop while asleep or crying, held still
      // while the chat is open. On touch screens the eyes drift a cell with the scroll and come back.
      const g = robotLink.live && shownMood === 'neutral' && !staticDock() ? glance(time) : { yaw: 0, pitch: 0 }
      const follow = robotLink.live && finePointer.matches && !gaze.touch && gaze.inside && now - gaze.at < POINTER_IDLE
      head.pointer = damp(head.pointer, follow ? 1 : 0, follow ? 4 : 1.6, dt)
      let pYaw = 0
      let pPitch = 0
      let pEyeX = 0
      let pEyeY = 0
      if (head.pointer > 0.001) {
        pointerRay(gaze.x, gaze.y)
        const toViewer = anglesTo(camera.position)
        pYaw = toViewer.yaw + clamp(ray.yaw - toViewer.yaw, -POINTER_LIMIT, POINTER_LIMIT)
        pPitch = toViewer.pitch + clamp(ray.pitch - toViewer.pitch, -POINTER_LIMIT, POINTER_LIMIT)
        pEyeX = clamp((ray.yaw - pYaw) * 0.09, -0.075, 0.075)
        pEyeY = clamp(-(ray.pitch - pPitch) * 0.09, -0.055, 0.055)
      }
      yawT = lerp(g.yaw, pYaw, head.pointer)
      pitchT = lerp(g.pitch, pPitch, head.pointer)
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
      eyeTX = lerp(clamp((yawRaw - head.yaw) * 0.085, -0.075, 0.075), pEyeX, head.pointer)
      eyeTY = lerp(clamp(-(pitchRaw - head.pitch) * 0.085, -0.055, 0.055), pEyeY, head.pointer)
      // Touch: a cell's drift in the scroll's direction (down the page, the eyes look down), easing back.
      if (!finePointer.matches && !staticDock()) eyeTY -= clamp(signals.velocity * 0.03, -0.03, 0.03)
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
    // Docked it never hops or wiggles: reactions are a tilt only.
    if (docked) hop = 0
    if (shownMood === 'happy' && docked) roll += 0.06
    // The coding life rides on top of the aim: the bob and the build's nod, the tilt toward a raised hand.
    const floatPitch = floating ? head.dock * DOCKED.pitch * Math.sin(time * ((2 * Math.PI) / DOCKED.period)) : 0
    headPivot.rotation.set(head.pitch + pf.nod + floatPitch, head.yaw, roll + pf.roll)
    headPivot.position.y += hop

    // Eyes lead the head and keep what the neck cannot reach.
    head.eyeX = damp(head.eyeX, eyeTX, 22, dt)
    head.eyeY = damp(head.eyeY, eyeTY, 22, dt)
    robot.eyes.position.x = head.eyeX
    robot.eyes.position.y = head.eyeY
    robot.narrow.value = docked ? 0 : pf.narrow * (1 - head.pointer * 0.6)

    // Blinks: every 4-6 s (8 s when still) the LEDs collapse onto one row for about 120 ms.
    if (blinkT < 0 && now >= blinkAt && !FROZEN) blinkT = 0
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

    // Docked, the body, props and stage are gone: nothing of theirs is drawn or shadowed. (In the hero the
    // renderer walks the scene's matrices itself; docked it does not, and only the head's have moved.)
    if (docked) syncWorld()
    // The shadow map is drawn every frame in the hero (once without shadows, where it is unused), never docked.
    // (About 30 times a second: the casters' motion, the typing and the bob, is slow enough that a refresh's lag
    // in their shadows never shows, and the shadow pass is a third of the robot's draws.)
    const shadowDue = !shadowReady || now - shadowAt >= 25 || labOff('shadow30')
    renderer.shadowMap.needsUpdate = !docked && (shadows || !shadowReady) && shadowDue
    if (renderer.shadowMap.needsUpdate) shadowAt = now
    if (!docked && !lowPower && a < 0.05 && now - revealedAt > 1000) governor(dt)
    if (!docked && lowPower && a < 0.05 && now - revealedAt > 1000) watchLow(dt)
    const tDraw = performance.now()
    // Docked, a frame whose picture would not change is not drawn (render on demand): see samePicture().
    if (!docked || !samePicture(ty)) {
      if (docked) dockCost.draws++
      draw(docked || !shadows || degrade >= 4 || !shadowReady || labOff('reflect') ? 0 : REFLECT.opacity * (1 - smoothstep(0, 0.12, a)))
    }
    if (docked) dockCost.draw += performance.now() - tDraw
    shadowReady ||= renderer.shadowMap.needsUpdate === false
    // Docked, anything moving (the eyes, the neck's spring, a blink or a change of face) earns full frame rate.
    dockBusy =
      !docked ||
      blinkT >= 0 ||
      swapT >= 0 ||
      reactT >= 0 ||
      head.pointer > 0.01 ||
      Math.abs(head.vYaw) + Math.abs(head.vPitch) > 0.02 ||
      Math.abs(head.eyeX - eyeTX) + Math.abs(head.eyeY - eyeTY) > 0.002
    if (docked) {
      dockCost.sum += performance.now() - t0
      dockCost.n++
    }
  }

  /**
   * Docked: whether this frame would show the same picture as the last one drawn: the head's pose, its eyes,
   * lids and glow within a hair of it, the float within a quarter of a device pixel (in a 72-112 px icon), the
   * face unchanged, no halo or z's. Then nothing is drawn: a resting head costs its bookkeeping alone.
   */
  const shown = new Float64Array(9)
  const next = new Float64Array(9)
  const EPS = [3e-4, 3e-4, 3e-4, 2e-4, 2e-4, 2e-4, 2e-3, 0.25, 1e-3]
  let shownFresh = false
  function samePicture(ty: number) {
    if (labOff('dockdemand')) return false
    const r = headPivot.rotation
    next[0] = r.x
    next[1] = r.y
    next[2] = r.z
    next[3] = headPivot.position.y
    next[4] = robot.eyes.position.x
    next[5] = robot.eyes.position.y
    next[6] = robot.lid.scale.y
    next[7] = ((ty * VH) / 2) * renderer.getPixelRatio()
    next[8] = robot.bezel.emissiveIntensity
    let same = shownFresh && painted === shownFace && !robot.halo.visible && head.sleep <= 0.05
    for (let i = 0; i < next.length && same; i++) same = Math.abs(next[i] - shown[i]) < EPS[i]
    if (same) return true
    shown.set(next)
    shownFace = painted
    shownFresh = true
    return false
  }
  let shownFace = ''

  /** The frame, with the floor reflection under it while the figure sits in the hero. */
  function draw(reflect: number) {
    renderer.autoClear = false
    frameNo++
    // The first frame with the scene revealed is on its way to the screen: the poster can go.
    if (revealed && !ready) {
      ready = true
      requestAnimationFrame(() => {
        layer.el.classList.add('is-revealed')
        opts.onReady?.()
      })
    } else if (ready && labOff('robotdraw')) return
    if (reflect > 0.001) {
      // The figure mirrored in the stage plane (y = 0), the stage itself left out, nothing cut. Redrawn at once
      // when the view moves, else about 15 times a second: it shows only what is near the floor (the feet, the
      // chair's and the table's legs, which hold still), at a quarter of the resolution, blurred and faint.
      const view = camera.projectionMatrix.elements
      let moved = !reflectFresh
      for (let i = 0; i < 16 && !moved; i++) moved = view[i] !== reflectView[i]
      const due = labOff('reflect15') ? frameNo % 2 === 0 : performance.now() - reflectAt >= 60
      if (moved || due) {
        drawReflection()
        reflectView.set(view)
        reflectAt = performance.now()
      }
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
  /** The projection the reflection was drawn with, and when (ms). */
  const reflectView = new Float32Array(16)
  let reflectAt = -Infinity
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
    // (The main pass, drawn next, walks the matrices again with the figure upright.)
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
  // The scene's shaders compile in the background (KHR_parallel_shader_compile where there is one) before
  // the first frame: compiled on first use they would hold the main thread for seconds on a phone. The
  // poster covers the hero until that first frame (Hero.tsx).
  let compiled = false
  let compiledAt = 0
  /** One caster of each kind in the scene, wearing the shadow pass's depth material (kept: disposing it would free the program). */
  // (Back faces: the shadow pass's side for the casters' front-sided materials, three's shadowSide.)
  const depthStandIn = new MeshDepthMaterial({ depthPacking: BasicDepthPacking, side: BackSide })
  const shadowLike = new WebGLRenderTarget(4, 4)
  function casterStandIns() {
    const out = new Scene()
    const kinds = new Set<string>()
    scene.traverse((o) => {
      const m = o as Mesh
      if (!m.isMesh || !m.castShadow || m.customDepthMaterial) return
      const s = o as SkinnedMesh
      const kind = s.isSkinnedMesh ? 'skinned' : (o as InstancedMesh).isInstancedMesh ? 'instanced' : 'plain'
      if (kinds.has(kind)) return
      kinds.add(kind)
      let stand: Mesh
      if (kind === 'skinned') {
        const sm = new SkinnedMesh(s.geometry, depthStandIn)
        sm.bind(s.skeleton, s.bindMatrix)
        stand = sm
      } else stand = kind === 'instanced' ? new InstancedMesh(m.geometry, depthStandIn, 1) : new Mesh(m.geometry, depthStandIn)
      stand.frustumCulled = false
      out.add(stand)
    })
    return out
  }
  envReady
    .catch(() => {})
    .then(() => renderer.compileAsync(scene, camera))
    .catch(() => {})
    .then(() => {
      // HIGH draws the floor reflection into a render target, which takes other variants of the same programs
      // (no tone mapping, linear output): compiled on first use they held the first frame for seconds.
      if (!shadows || labOff('compilert')) return
      renderer.setRenderTarget(reflectRT)
      const pending = renderer.compileAsync(scene, camera)
      renderer.setRenderTarget(null)
      return pending
    })
    .catch(() => {})
    .then(() => {
      // Drawn outside the scene, so never compiled with it: the shadow pass (three draws each caster with its own
      // depth material, a plain and a skinned variant here; every tier draws it at least once) and the floor
      // reflection's composite. Compiled on first use they held a first visit's first frame for ~2 s.
      if (labOff('compileaux')) return
      renderer.setRenderTarget(shadowLike)
      // (Lit by the scene's lights: their counts and shadows are part of every program's key, the depth one's too.)
      const pending = renderer.compileAsync(casterStandIns(), camera, scene)
      renderer.setRenderTarget(null)
      return Promise.all([pending, renderer.compileAsync(reflectScene, quadCam)])
    })
    .catch(() => {})
    .then(() => prefetchPrograms(renderer, () => tornDown))
    .catch(() => {})
    .finally(() => {
      compiled = true
      compiledAt = performance.now()
      // The lab: which programs were built ahead (any made later were compiled on first use: a stall).
      if (PERF_LAB) Object.assign(window, { __programsAhead: (renderer.info.programs ?? []).map((p) => `${p.name} ${p.cacheKey.length}`) })
    })
  const stopTick = onTick(frame, 10)

  let fallback: RobotHandle | null = null
  const onLost = (e: Event) => {
    e.preventDefault()
    if (lost) return
    lost = true
    teardown()
    opts.onLost?.()
    fallback = mountStill(host, opts)
    if (revealed) fallback.reveal()
    fallback.setProgress(progress)
  }
  canvas.addEventListener('webglcontextlost', onLost)

  function teardown() {
    tornDown = true
    stopTick()
    gsap.ticker.remove(sampleAnchor)
    offSection()
    observer.disconnect()
    beat.stop()
    canvas.removeEventListener('webglcontextlost', onLost)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('touchstart', onTouch)
    window.removeEventListener('touchmove', onTouch)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('blur', onBlur)
    robot.dispose()
    env?.dispose()
    reflectRT.dispose()
    reflectMat.dispose()
    depthStandIn.dispose()
    shadowLike.dispose()
    reflectQuad.geometry.dispose()
    key.shadow.map?.dispose()
    renderer.dispose()
    canvas.remove()
    safeProbe.remove()
    layer.dispose()
    setDock('none', false)
    host.style.removeProperty('--robot-bg')
    host.style.removeProperty('--hero-leave')
    for (const prop of ['--robot-x', '--robot-y', '--robot-h', '--robot-foot', '--chest-y', '--dais-w', '--dais-h']) stageEl.style.removeProperty(prop)
    stageFrame.set(null)
    stageCues.commitAt = -Infinity
    stageCues.agentAt = -Infinity
    stageCues.vortex = 0
    stageCues.degrade = 0
    stageCues.burstAt = -Infinity
    stageCues.governed = false
  }

  return {
    reveal() {
      if (!revealed) revealedAt = performance.now()
      revealed = true
      // The canvas shows with the first frame (draw()), crossfading with the poster.
      fallback?.reveal()
    },
    setTier(v) {
      tier = v
      // (Stepping down to LOW: its watch starts afresh, once the step has settled.)
      if (v === 'low' && !lowPower) Object.assign(lowWatch, { sum: 0, n: 0, late: 0, windows: 0, since: performance.now() })
      lowPower = v === 'low'
      shadows = v === 'high'
      stageCues.governed = !lowPower && !lost
      applyLighting()
      if (!docked && !lost) sizeCanvas()
    },
    setProgress(p) {
      progress = p
      fallback?.setProgress(p)
    },
    dispose() {
      if (fallback) fallback.dispose()
      else if (!lost) teardown()
    },
  }
}

/**
 * three asks each program for its uniforms and attributes at its first draw: a synchronous round trip to the GPU
 * process, queued behind that frame's driver work (ANGLE builds the final shaders at a program's first draw), which
 * on a first visit held a first frame ~1.3 s. Asked ahead instead, a few at a time between frames (while the poster
 * shows). Programs already asked answer at once.
 */
async function prefetchPrograms(renderer: WebGLRenderer, gone: () => boolean = () => false) {
  if (labOff('prefetch')) return
  let t = performance.now()
  for (const p of renderer.info.programs ?? []) {
    if (gone()) return
    p.getUniforms()
    p.getAttributes()
    if (performance.now() - t > SLICE_MS) {
      await yieldToMain()
      t = performance.now()
    }
  }
}

/** The prefiltered studio's face size: the studio is a few soft boxes in the dark, and a 256 cube's prefilter cost the load ~0.5 s on a phone. */
const ENV_SIZE = 128

/**
 * The studio (studioEnvironment) prefiltered for reflections (PMREM). three compiles PMREM's shaders when it
 * first draws with them, holding the main thread until the driver has built them (~2 s on a first visit, with
 * no shader cache): here they are built first, in the background (compileAsync: KHR_parallel_shader_compile
 * where there is one), along with the studio's own for the cube it is drawn into. Reaching into PMREM's steps
 * (it allocates the same targets and materials again and reuses them); if that ever fails, the prefilter simply
 * compiles as it draws.
 */
async function prefilteredStudio(renderer: WebGLRenderer): Promise<Texture> {
  const pmrem = new PMREMGenerator(renderer)
  const studio = studioEnvironment()
  const steps = pmrem as unknown as { _setSize?(size: number): void; _allocateTargets?(): WebGLRenderTarget; _blurMaterial?: Material; _ggxMaterial?: Material; _lodMeshes?: Mesh[] }
  try {
    if (steps._setSize && steps._allocateTargets) {
      steps._setSize(ENV_SIZE)
      const target = steps._allocateTargets()
      const passes = new Scene()
      // (On PMREM's own quads: whether a geometry has positions is part of a program's key.)
      const geometry = steps._lodMeshes?.[0]?.geometry ?? new BufferGeometry()
      for (const m of [steps._blurMaterial, steps._ggxMaterial]) {
        if (!m) continue
        const quad = new Mesh(geometry, m)
        quad.frustumCulled = false
        passes.add(quad)
      }
      const previous = renderer.getRenderTarget()
      const tone = renderer.toneMapping
      renderer.setRenderTarget(target)
      renderer.toneMapping = NoToneMapping
      // (The traversal is synchronous: the target and tone mapping only need to hold for the calls.)
      const pending = Promise.all([renderer.compileAsync(passes, new OrthographicCamera()), renderer.compileAsync(studio.scene, new PerspectiveCamera(90, 1, 0.1, 100))])
      renderer.setRenderTarget(previous)
      renderer.toneMapping = tone
      await pending
      await prefetchPrograms(renderer)
      target.dispose()
    }
  } catch {
    // (The prefilter below compiles as it draws.)
  }
  const env = pmrem.fromScene(studio.scene, 0.04, 0.1, 100, { size: ENV_SIZE }).texture
  pmrem.dispose()
  studio.dispose()
  return env
}

/**
 * A dark studio for reflections and soft fill (instead of a photographic HDRI): a near-black room
 * with a large softbox above front-left in the key's colour, violet strip boxes behind on the right
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
  box(KEY_COLOR, 5, 3.4, 2.2, -2.2, 3.6, 2.8)
  box('#7c5cff', 6, 1.2, 4.2, 3.6, 1.8, -3.2)
  box('#a78bfa', 3.5, 1, 3.4, -3.8, 1.6, -3)
  box('#c4b5fd', 1.4, 2.4, 1.4, 3.2, 1.2, 3.4)
  box('#14102a', 2, 8, 8, 0, -3.5, 0)
  return { scene, dispose: () => disposables.forEach((d) => d.dispose()) }
}

/**
 * Patches a material so fragments below `cut` (world height, rough-edged by noise) are discarded (the scroll's
 * dissolve), with a thin emissive seam glowing at the cut (solid surfaces only: on a glow or shadow quad it would
 * light the whole plane). With cut far below, it changes nothing. A material's own patch, if it has one (the
 * keycaps'), runs first.
 */
function dissolvable(m: Material, cut: { value: number }, seam: { value: Color }) {
  const own = m.onBeforeCompile.bind(m)
  const ownKey = m.customProgramCacheKey.bind(m)
  m.onBeforeCompile = (shader, r) => {
    own(shader, r)
    shader.uniforms.uCut = cut
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
// (Before the dissolve starts the cut lies far below the scene: no fragment is near it, so the noise is skipped.
// A uniform branch: every fragment takes the same side.)
float dSeam = 0.0;
if (uCut > ${labOff('dissolveskip') ? '-1000.0' : '-0.5'}) {
  float dN = dNoise(vDissolve * 11.0) * 0.6 + dNoise(vDissolve * 27.0) * 0.4;
  float dH = vDissolve.y + (dN - 0.5) * 0.22 - uCut;
  if (dH < 0.0) discard;
  dSeam = 1.0 - smoothstep(0.0, 0.035, dH);
}`,
      )
      .replace('#include <opaque_fragment>', `outgoingLight += uSeam * dSeam * ${m.transparent ? '0.0' : '2.2'};
#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => `${ownKey()}|${m.transparent ? 'dissolve-t' : 'dissolve'}`
}
