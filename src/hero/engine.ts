import {
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  CustomBlending,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Matrix3,
  Mesh,
  NoColorSpace,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  Points,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
  ZeroFactor,
  type IUniform,
} from 'three'
import heroUrl from '../assets/hero.jpg'
import moonAlbedoUrl from '../assets/moon/albedo.png'
import moonNormalUrl from '../assets/moon/normal.png'
import moonMeta from '../assets/moon/meta.json'
import { heroConfig as cfg, transitionProfile } from './config'
import { atmosphereBands, opticalDepth, shotAt } from './shot'
import { PHOTO_WIDTHS, photoTierForView, sceneSizeForView, type PhotoTier as Tier } from './resolution'
import { buildFallbackMaps, loadImage, MAP_NAMES, suppliedMapUrl, type MapName } from './maps'
import { smoothstep, wispField } from './noise'
import { createInput } from './input'
import { buildScreenArt, DESIGN } from './screen'
import { createScreenVideo } from './video'
import fullscreenVert from './shaders/fullscreen.vert'
import sceneFrag from './shaders/scene.frag'
import raysFrag from './shaders/rays.frag'
import blurFrag from './shaders/blur.frag'
import finalFrag from './shaders/final.frag'
import lensFrag from './shaders/dive.frag'
import cloudsFrag from './shaders/clouds.frag'
import particlesVert from './shaders/particles.vert'
import particlesFrag from './shaders/particles.frag'

export interface HeroOptions {
  /** True while something covers the hero (e.g. a full-screen overlay): frames are skipped. */
  isPaused?: () => boolean
  /** Lite / low tier: lower resolution caps and fewer particles. */
  lowPower?: boolean
  /** Integrated / mobile-class GPU (the site's mid tier): the scene pass keeps a smaller pixel budget. */
  integratedGpu?: boolean
}

export interface HeroHandle {
  /** Start the fade from black (call when the page is ready to be seen). */
  reveal(): void
  setLowPower(v: boolean): void
  /** Scroll-transition progress 0..1 (hold, push, clouds, parting); see config.transition. */
  setProgress(p: number): void
  /** Start or stop the render loop (the transition stops it once About has taken over). */
  setRendering(on: boolean): void
  dispose(): void
}

/** Debug-only state that is not a tunable. */
export const heroDebug = {
  view: 0,
  fps: 0,
  frameMs: 0,
  quality: 1,
  scene: '',
  maps: '',
  photo: '1672x941',
  moonMaps: moonMeta.source.startsWith('NASA') ? `NASA ${moonMeta.width}x${moonMeta.height}` : `procedural stand-in ${moonMeta.width}x${moonMeta.height}`,
  moonCover: 0,
  moonLight: 1,
  zoom: 1,
  pauseTime: false,
  video: 'none',
  meteorNow: false,
}

/**
 * Hooks for the ?debug tools (moon split view, video corner handles). Positions
 * are css px inside the hero container; image uv is 0..1 with y down.
 */
export const heroDebugApi = {
  /** Runs right after each frame is drawn, while the canvas still holds it. */
  afterRender: null as (() => void) | null,
  canvas: null as HTMLCanvasElement | null,
  container: null as HTMLElement | null,
  /** A point on the laptop plane, image uv -> container css px. */
  toScreen: (_u: number, _v: number): [number, number] => [0, 0],
  /** Container css px -> image uv on the laptop plane. */
  fromScreen: (_x: number, _y: number): [number, number] => [0, 0],
  /** The moon's centre and radius on screen, container css px. */
  moon: (): { x: number; y: number; r: number } => ({ x: 0, y: 0, r: 0 }),
}

const remap = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a || 1e-6)))

/** Centre and edge vectors of a quad given as top-left, top-right, bottom-right, bottom-left. */
function quadFrame(q: [number, number][]) {
  const [tl, tr, br, bl] = q
  return {
    cx: (tl[0] + tr[0] + br[0] + bl[0]) / 4,
    cy: (tl[1] + tr[1] + br[1] + bl[1]) / 4,
    xx: (tr[0] - tl[0] + br[0] - bl[0]) / 2,
    xy: (tr[1] - tl[1] + br[1] - bl[1]) / 2,
    yx: (bl[0] - tl[0] + br[0] - tr[0]) / 2,
    yy: (bl[1] - tl[1] + br[1] - tr[1]) / 2,
  }
}

/**
 * Homography taking a quad (TL, TR, BR, BL) to the unit square, so a pixel
 * finds its point on the screen art in true perspective.
 */
function quadToUnit(out: Matrix3, q: [number, number][]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  let a: number, b: number, d: number, e: number, g: number, h: number
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = x1 - x0
    b = x3 - x0
    d = y1 - y0
    e = y3 - y0
    g = 0
    h = 0
  } else {
    const dx1 = x1 - x2
    const dx2 = x3 - x2
    const dy1 = y1 - y2
    const dy2 = y3 - y2
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9
    g = (sx * dy2 - dx2 * sy) / den
    h = (dx1 * sy - sx * dy1) / den
    a = x1 - x0 + g * x1
    b = x3 - x0 + h * x3
    d = y1 - y0 + g * y1
    e = y3 - y0 + h * y3
  }
  return out.set(a, b, x0, d, e, y0, g, h, 1).invert()
}

/** Column-major inverse of the 2x2 matrix with columns X, Y (px offset -> frame unit coords). */
function frameInverse(out: number[], xx: number, xy: number, yx: number, yy: number) {
  const det = xx * yy - yx * xy || 1e-6
  out[0] = yy / det
  out[1] = -xy / det
  out[2] = -yx / det
  out[3] = xx / det
  return out
}

const TILE = 16
const WISP_TILE = 32 // mirrors scene.frag
const TAU = Math.PI * 2
/** Still with the moon composited in (built by `npm run hero`), for when WebGL is unavailable or lost. */
const STILL_URL = '/hero/night-1672.webp'
const COOL = new Vector3(0.82, 0.9, 1.0) // the scene's silver-blue skylight
const WARM = new Vector3(1.0, 0.9, 0.8)

// Start downloading the photograph (the clean plate) and the moon maps the moment this module is evaluated.
const photo = loadImage(heroUrl)
photo.catch(() => {})
const moonMaps = Promise.all([loadImage(moonAlbedoUrl), loadImage(moonNormalUrl)])
moonMaps.catch(() => {})

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
const luma3 = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/** Blackbody colour (Tanner Helland's fit), linear RGB at luminance 1. Mirrors scripts/prepare-moon.mjs. */
function kelvinRGB(k: number): number[] {
  const t = k / 100
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const c = [r, g, b].map((v) => lin(Math.min(255, Math.max(0, v)) / 255))
  const l = luma3(c)
  return c.map((v) => v / l)
}

/** The moon's colour at luminance 1: blackbody, pulled toward the scene's cloud highlights, times the tint. Mirrors prepare-moon moonColor(). */
function moonHue(m: typeof cfg.moon): number[] {
  const k = kelvinRGB(m.kelvin)
  const hl = luma3(m.sceneHighlight) || 1
  const c = k.map((v, i) => (v + (m.sceneHighlight[i] / hl - v) * m.sceneMatch) * m.tint[i])
  const l = luma3(c) || 1
  return c.map((v) => v / l)
}

/**
 * Sharper copies of the photo (src/assets/hero-hi/{2k,4k,8k}.{ktx2,avif,webp},
 * built by `npm run hero`). Budget for the entire camera push, not only the
 * opening frame. Fetch alongside the base assets and crossfade once uploaded.
 */
const hiResUrls = import.meta.glob('../assets/hero-hi/*.{ktx2,avif,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
function hiResCandidates(want: Tier | 'off'): { tier: Tier; url: string; ktx2: boolean }[] {
  const tiers: Tier[] = want === '8k' ? ['8k', '4k', '2k'] : want === '4k' ? ['4k', '2k'] : want === '2k' ? ['2k'] : []
  const out: { tier: Tier; url: string; ktx2: boolean }[] = []
  for (const tier of tiers)
    for (const ext of ['ktx2', 'avif', 'webp']) {
      const hit = Object.entries(hiResUrls).find(([p]) => p.endsWith(`/${tier}.${ext}`))
      if (hit) out.push({ tier, url: hit[1], ktx2: ext === 'ktx2' })
    }
  return out
}

export function mountHero(container: HTMLElement, opts: HeroOptions = {}): HeroHandle {
  const debugOn = new URLSearchParams(location.search).has('debug')
  let still: HTMLImageElement | null = null
  let revealed = false
  const showStill = () => {
    if (still) return
    still = new Image()
    still.src = STILL_URL
    still.alt = ''
    still.decoding = 'async'
    still.className = 'hero-cinematic__still'
    container.appendChild(still)
    if (revealed) requestAnimationFrame(() => still?.classList.add('is-revealed'))
  }

  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  container.appendChild(canvas)
  heroDebugApi.canvas = canvas
  heroDebugApi.container = container

  let renderer: WebGLRenderer
  try {
    // alpha: the parting cloud bank opens this canvas onto About (output is premultiplied).
    renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'high-performance' })
  } catch {
    canvas.remove()
    showStill()
    return {
      reveal: () => {
        revealed = true
        still?.classList.add('is-revealed')
      },
      setLowPower: () => {},
      setProgress: () => {},
      setRendering: () => {},
      dispose: () => still?.remove(),
    }
  }
  renderer.outputColorSpace = LinearSRGBColorSpace // the final pass encodes sRGB itself
  renderer.autoClear = false
  renderer.setClearColor(0x000000, 1)

  const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float') ? HalfFloatType : UnsignedByteType
  const target = () =>
    new WebGLRenderTarget(1, 1, { type: hdr, depthBuffer: false, stencilBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, generateMipmaps: false })
  const sceneRT = target()
  const raysRT = target()
  const bloomA = target()
  const bloomB = target()
  const lensRT = target()
  const cloudRT = target()

  const tri = new BufferGeometry()
  tri.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const pass = (fragmentShader: string, uniforms: Record<string, IUniform>) =>
    new ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader, uniforms, depthTest: false, depthWrite: false })

  // Shared camera uniforms (the particles use the very same objects).
  const uRef = { value: new Vector2(cfg.image.ref[0], cfg.image.ref[1]) }
  const uCover = { value: new Vector4(1, 1, 0, 0) }
  const uParallax = { value: new Vector2() }
  const uFocus = { value: cfg.parallax.focus }
  const uTime = { value: 0 }
  const uWrap = { value: cfg.loop.seconds }
  const uMoonPos = { value: new Vector2() }
  const uLightRel = { value: 1 }

  const sceneMat = pass(sceneFrag, {
    uImage: { value: null },
    uImgLod: { value: 0 },
    uImageHi: { value: null },
    uImgLodHi: { value: 0 },
    uImgMix: { value: 0 },
    uSkyMask: { value: null },
    uDepth: { value: null },
    uGrassMask: { value: null },
    uProtect: { value: null },
    uMoonMatte: { value: null },
    uMoonAlbedo: { value: null },
    uMoonNormal: { value: null },
    uRef,
    uCover,
    uParallax,
    uFocus,
    uPersonDepth: { value: cfg.scene.personDepth },
    uTime,
    uWrap,
    uMotion: { value: 1 },
    uPxPerH: { value: 1000 },
    uLayerF: { value: new Vector4() },
    uLayerM: { value: new Vector4() },
    uLayerN: { value: new Vector4() },
    uDrift: { value: new Vector3() },
    uEvo: { value: new Vector3() },
    uSplit: { value: new Vector3() },
    uAdvect: { value: new Vector4() },
    uSea: { value: new Vector3() },
    uRim: { value: new Vector4() },
    uUnderCol: { value: new Vector3() },
    uDetail: { value: new Vector2() },
    uWispMid: { value: new Vector4() },
    uWispNear: { value: new Vector4() },
    uWispDrift: { value: new Vector4() },
    uWispEvo: { value: new Vector2() },
    uWispOpt: { value: new Vector4() },
    uWispLight: { value: new Vector3() },
    uMoonPos,
    uMoonRadius: { value: 0 },
    uMoonRot: { value: new Vector2(1, 0) },
    uMoonSun: { value: new Vector3(0, 0, 1) },
    uMoonShade: { value: new Vector4() },
    uEarthCol: { value: new Vector3() },
    uMoonCol: { value: new Vector3() },
    uMoonHue: { value: new Vector3(1, 1, 1) },
    uMapSat: { value: 0 },
    uFeather: { value: 1.5 },
    uScatter: { value: new Vector2() },
    uHalo: { value: new Vector4() },
    uHaloOpt: { value: new Vector3() },
    uHaloSoft: { value: 1 },
    uMoonGlow: { value: 0 },
    uMoonTint: { value: new Vector3() },
    uMoonI: { value: 1 },
    uMoonDiskI: { value: 1 },
    uWispTint: { value: 1 },
    uKnee: { value: cfg.film.knee },
    uLightRel,
    uSceneResp: { value: 0 },
    uRimGain: { value: 0 },
    uGrass: { value: new Vector4() },
    uWindDir: { value: new Vector2(-1, 0) },
    uLaptop: { value: new Vector4() },
    uLaptopPulse: { value: 1 },
    uLaptopPool: { value: 0 },
    uDive: { value: new Vector4() },
    uDiveTarget: { value: new Vector2() },
    uDiveIter: { value: 3 },
    uScreenC: { value: new Vector2() },
    uScreenInv: { value: [1, 0, 0, 1] },
    uScreenLen: { value: new Vector2(1, 1) },
    uScreenR: { value: 0 },
    uScreenGlow: { value: new Vector4() },
    uVideoGlow: { value: new Vector4() },
    uSpill: { value: new Vector4() },
    uStars: { value: new Vector4() },
    uMeteor: { value: new Vector4(0, 0, 1, 0) },
    uMeteorK: { value: new Vector2() },
    uGrade: { value: new Vector2() },
    uExposure: { value: 1 },
    uView: { value: 0 },
  })
  const raysMat = pass(raysFrag, {
    uScene: { value: sceneRT.texture },
    uMoon: { value: new Vector2() },
    uAspect: { value: 1 },
    uLength: { value: 0 },
    uDecay: { value: 0 },
    uThreshold: { value: 0 },
    uReach: { value: 0.3 },
  })
  const blurH = pass(blurFrag, { uSrc: { value: sceneRT.texture }, uStep: { value: new Vector2() }, uThreshold: { value: 0 }, uPrefilter: { value: 1 } })
  const blurV = pass(blurFrag, { uSrc: { value: bloomA.texture }, uStep: { value: new Vector2() }, uThreshold: { value: 0 }, uPrefilter: { value: 0 } })
  const lensMat = pass(lensFrag, {
    uScene: { value: sceneRT.texture },
    uAnchor: { value: new Vector2(0.5, 0.5) },
    uAspect: { value: 1 },
    uMotion: { value: 0 },
    uDof: { value: 0 },
    uFocus: { value: 0.16 },
  })
  const cloudMat = pass(cloudsFrag, {
    uAspect: { value: 1 },
    uCentre: { value: new Vector2(0.5, 0.5) },
    uCamX: { value: 0 },
    uBands: { value: [new Vector4(), new Vector4(), new Vector4(), new Vector4()] },
    uDensMax: { value: 1 },
    uSlices: { value: 8 },
    uTime: { value: 0 },
    uWind: { value: new Vector2() },
    uMoon: { value: new Vector2() },
    uMoonCol: { value: new Vector3() },
    uAmbient: { value: new Vector3() },
    uDeep: { value: new Vector3() },
    uGlow: { value: new Vector3() },
    uLaptop: { value: new Vector4() },
    uLaptopCol: { value: new Vector3() },
    uShape: { value: new Vector4() },
    uLight: { value: new Vector4() },
    // The scene's depth, through the same camera (shared uniform objects, so maps and moves stay in step).
    uDepth: sceneMat.uniforms.uDepth,
    uProtect: sceneMat.uniforms.uProtect,
    uCover,
    uDive: sceneMat.uniforms.uDive,
    uDiveTarget: sceneMat.uniforms.uDiveTarget,
    uPersonDepth: sceneMat.uniforms.uPersonDepth,
    uDist: { value: new Vector3() },
    uFigure: { value: 1 },
  })
  const finalMat = pass(finalFrag, {
    uScene: { value: sceneRT.texture },
    uRays: { value: raysRT.texture },
    uBloom: { value: bloomB.texture },
    uLensTex: { value: lensRT.texture },
    uRes: { value: new Vector2(1, 1) },
    uRayColor: { value: new Vector3() },
    uBloomStrength: { value: 0 },
    uVignette: { value: 0 },
    uVigTight: { value: 0 },
    uGrain: { value: 0 },
    uAberration: { value: 0 },
    uCaSpread: { value: 0 },
    uKnee: { value: 0.75 },
    uStreak: { value: 0 },
    uToe: { value: 0 },
    uFade: { value: 0 },
    uSeed: { value: 0 },
    uRaw: { value: 0 },
    uSceneTexel: { value: new Vector2(1, 1) },
    uSharpen: { value: 0 },
    uClarity: { value: 0 },
    uLensOn: { value: 0 },
    uLens: { value: new Vector4(0.5, 0.5, 0, 0) },
    uLensFocus: { value: 0.16 },
    uCloudOn: { value: 0 },
    uClouds: { value: cloudRT.texture },
    uSceneVis: { value: 1 },
    uScreenOn: { value: 0 },
    uScreenTex: { value: null },
    uScreenH: { value: new Matrix3() },
    uScreenDesign: { value: new Vector2(DESIGN[0], DESIGN[1]) },
    uScreenRad: { value: 0 },
    uBezel: { value: 0 },
    uScreenBright: { value: 1 },
    uScreenGlare: { value: 0 },
    uCaret: { value: new Vector4() },
    uCaretOn: { value: 0 },
    uVideoOn: { value: 0 },
    uVideoTex: { value: null },
    uVideoCover: { value: new Vector2(1, 1) },
    uVideoBright: { value: 1 },
  })

  const quad = new Mesh(tri, sceneMat)
  quad.frustumCulled = false
  const quadScene = new Scene()
  quadScene.add(quad)

  // ---------------------------------------------------------------- particles
  const particleMat = new ShaderMaterial({
    vertexShader: particlesVert,
    fragmentShader: particlesFrag,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    // Leaves reduce sky transmittance (alpha) so rays do not shine through them.
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
    uniforms: {
      uTime,
      uWrap,
      uCover,
      uParallax,
      uFocus,
      uRef,
      uPxScale: { value: 1 },
      uWind: { value: -1 },
      uMoonPos,
      uLight: uLightRel,
      uBright: { value: 1 },
      uSpeed: { value: new Vector3(1, 1, 1) },
      uDive: { value: new Vector4() },
      uDiveTarget: sceneMat.uniforms.uDiveTarget,
    },
  })
  const particleScene = new Scene()
  let points: Points | null = null
  let particleKey = ''

  let lowPower = !!opts.lowPower

  function buildParticles() {
    const k = lowPower ? 0.6 : 1
    const counts = [cfg.particles.dust, cfg.particles.fireflies, cfg.particles.leaves].map((n) => Math.max(0, Math.round(n * k)))
    const key = counts.join('|')
    if (key === particleKey) return
    particleKey = key
    if (points) {
      particleScene.remove(points)
      points.geometry.dispose()
      points = null
    }
    const total = counts[0] + counts[1] + counts[2]
    if (!total) return
    let s = 0x2f6e2b1
    const rand = () => {
      s = (s + 0x6d2b79f5) | 0
      let t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const seed = new Float32Array(total * 4)
    const params = new Float32Array(total * 4)
    const [ref0, ref1] = cfg.image.ref
    const [pcx, pcy] = cfg.scene.person.center
    let i = 0
    for (let n = 0; n < counts[0]; n++, i++) {
      seed.set([rand(), 0.04 + rand() * 0.92, 0.15 + rand() * 0.85, rand()], i * 4)
      params.set([0, 0.5 + rand(), 0.7 + rand() * 0.6, rand()], i * 4)
    }
    for (let n = 0; n < counts[1]; n++, i++) {
      let x = 0
      let y = 0
      // Homes over the grass, never on the figure.
      for (let tries = 0; tries < 20; tries++) {
        x = 0.28 + rand() * 0.46
        y = 0.38 + rand() * 0.18
        const dx = (x * ref0 - pcx) / 110
        const dy = (y * ref1 - pcy) / 90
        if (dx * dx + dy * dy > 1) break
      }
      seed.set([x, y, 0.5 + rand() * 0.18, rand()], i * 4)
      params.set([1, rand(), 0.8 + rand() * 0.4, rand()], i * 4)
    }
    for (let n = 0; n < counts[2]; n++, i++) {
      seed.set([rand(), 0.15 + rand() * 0.7, 0.62 + rand() * 0.38, rand()], i * 4)
      params.set([2, 0.5 + rand(), 0.8 + rand() * 0.4, rand()], i * 4)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(total * 3), 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 4))
    g.setAttribute('aParams', new BufferAttribute(params, 4))
    points = new Points(g, particleMat)
    points.frustumCulled = false
    particleScene.add(points)
  }

  // ---------------------------------------------------------------- sizing
  let cssW = 1
  let cssH = 1
  let sceneW = 1
  let sceneH = 1
  let hiRes = false // a 4K / 8K photo is on the GPU: render the scene at full device resolution
  let photoWidth = cfg.image.ref[0]
  let qScale = 1 // automatic quality: fraction of the scene pixel cap (perf.adaptive)
  function resize() {
    cssW = Math.max(1, container.clientWidth)
    cssH = Math.max(1, container.clientHeight)
    const maxDpr = lowPower ? Math.min(1.5, cfg.perf.maxDpr) : cfg.perf.maxDpr
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
    renderer.setPixelRatio(dpr)
    renderer.setSize(cssW, cssH, false)
    const fw = Math.round(cssW * dpr)
    const fh = Math.round(cssH * dpr)
    // Protect spatial detail while allowing the atmosphere/effects to adapt independently.
    const integrated = !!opts.integratedGpu
    const base = hiRes ? cfg.perf.maxScenePixelsHi : cfg.perf.maxScenePixels
    const cap = base * (lowPower ? cfg.perf.lowPowerScale : integrated ? cfg.perf.integratedScale : 1)
    const size = sceneSizeForView(cssW, cssH, dpr, cap, qScale)
    sceneW = size.width
    sceneH = size.height
    sceneRT.setSize(sceneW, sceneH)
    const effectScale = Math.sqrt(qScale)
    raysRT.setSize(Math.ceil(sceneW * effectScale / 2), Math.ceil(sceneH * effectScale / 2))
    bloomA.setSize(Math.ceil(sceneW * effectScale / 4), Math.ceil(sceneH * effectScale / 4))
    bloomB.setSize(Math.ceil(sceneW * effectScale / 4), Math.ceil(sceneH * effectScale / 4))
    lensRT.setSize(Math.ceil(sceneW / 2), Math.ceil(sceneH / 2))
    cloudRT.setSize(Math.ceil(sceneW * effectScale / 2), Math.ceil(sceneH * effectScale / 2))
    finalMat.uniforms.uRes.value.set(fw, fh)
    finalMat.uniforms.uSceneTexel.value.set(1 / sceneW, 1 / sceneH)
    heroDebug.scene = `${sceneW}x${sceneH} of ${fw}x${fh}`
  }
  resize()
  const ro = new ResizeObserver(() => {
    resize()
    if (ready) void streamHiRes()
  })
  ro.observe(container)

  // ---------------------------------------------------------------- assets
  let ready = false
  let disposed = false
  const textures: Texture[] = []
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  // Every texture: trilinear mipmaps and full anisotropic filtering, so nothing shimmers or smears at an angle or in the dive.
  const makeTexture = (source: TexImageSource, srgb: boolean) => {
    const t = new Texture(source as HTMLImageElement)
    t.flipY = false
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace
    t.generateMipmaps = true
    t.minFilter = LinearMipmapLinearFilter
    t.magFilter = LinearFilter
    t.wrapS = t.wrapT = ClampToEdgeWrapping
    t.anisotropy = maxAniso
    t.needsUpdate = true
    textures.push(t)
    return t
  }

  // The laptop screen art: drawn once at native resolution, uploaded behind the loader.
  let screenReady = false
  let hasCaret = false
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 700
  const compact = smallScreen || window.matchMedia('(pointer: coarse)').matches
  const artWidth = Math.min(renderer.capabilities.maxTextureSize, lowPower || smallScreen ? 2048 : cfg.screen.resolution)
  buildScreenArt(artWidth)
    .then(({ canvas: art, caret }) => {
      if (disposed) return
      const t = makeTexture(art, true)
      t.anisotropy = renderer.capabilities.getMaxAnisotropy()
      renderer.initTexture(t)
      finalMat.uniforms.uScreenTex.value = t
      if (caret) finalMat.uniforms.uCaret.value.set(...caret)
      hasCaret = !!caret
      screenReady = true
    })
    .catch((e) => console.warn('[hero] screen art failed; the photo screen stays', e))

  // K. The screen video: starts loading (and playing, muted) right away, before any scroll.
  const video = cfg.video.enabled && cfg.video.sources.length ? createScreenVideo(container, cfg.video, renderer.capabilities.getMaxAnisotropy()) : null

  const uniformFor: Record<MapName, string> = {
    'sky-mask': 'uSkyMask',
    depth: 'uDepth',
    'grass-mask': 'uGrassMask',
    'protect-mask': 'uProtect',
    'moon-matte': 'uMoonMatte',
  }
  // Download and decode the selected photo during base-map setup, not after shader warm-up.
  const firstCandidate = hiResCandidates(wantedTier())[0]
  let earlyImage = firstCandidate && !firstCandidate.ktx2 ? loadImage(firstCandidate.url) : null
  earlyImage?.catch(() => {})
  let streaming = false
  let attemptedTier: Tier | 'off' | null = null
  photo
    .then(async (img) => {
      const [albedo, normal] = await moonMaps
      const supplied = await Promise.all(
        MAP_NAMES.map(async (name) => {
          const url = suppliedMapUrl(name)
          return [name, url ? await loadImage(url).catch(() => null) : null] as const
        }),
      )
      const missing = supplied.filter(([, im]) => !im).map(([n]) => n)
      const generated = buildFallbackMaps(img, cfg, missing)
      if (disposed) return
      sceneMat.uniforms.uImage.value = makeTexture(img, true)
      // Seamless equirect maps: longitude wraps (Repeat), so filtering never draws a seam.
      const ma = makeTexture(albedo, true)
      const mn = makeTexture(normal, false)
      ma.wrapS = mn.wrapS = RepeatWrapping
      sceneMat.uniforms.uMoonAlbedo.value = ma
      sceneMat.uniforms.uMoonNormal.value = mn
      for (const [name, im] of supplied) sceneMat.uniforms[uniformFor[name]].value = makeTexture((im ?? generated[name])!, false)
      heroDebug.maps = MAP_NAMES.map((n) => `${n}: ${missing.includes(n) ? 'temporary' : 'supplied'}`).join(', ')
      if (import.meta.env.DEV && missing.length) console.info(`[hero] using temporary maps for ${missing.join(', ')}; see src/hero/README.md`)
      buildParticles()
      prewarm()
      ready = true
      sync()
      streamHiRes()
    })
    .catch((e) => {
      console.warn('[hero] falling back to the still image', e)
      showStill()
    })

  /**
   * Include cover-cropping, depth magnification and the last visible point of the push.
   */
  function wantedTier(): Tier | 'off' {
    const A = cfg.transition.atmosphere
    const visibleTravel = (A.bank.ramp + 0.6 - A.path[0]) / -A.path[0]
    return photoTierForView({
      width: cssW, height: cssH,
      dpr: Math.min(window.devicePixelRatio || 1, lowPower ? Math.min(1.5, cfg.perf.maxDpr) : cfg.perf.maxDpr),
      aspect: cfg.image.ref[0] / cfg.image.ref[1],
      zoom: Math.pow(transitionProfile().zoom, visibleTravel) * cfg.dolly.max,
      nearExponent: Math.max(1, cfg.transition.parallax.near),
      maxTextureSize: renderer.capabilities.maxTextureSize,
      cap: cfg.perf.hiRes, compact: lowPower || compact,
    })
  }

  let swapT = -1 // seconds into the crossfade to the sharp tier (-1 = none)
  let swapping: Texture | null = null

  /** Loads a KTX2 (Basis) photo: GPU-compressed, so an 8K tier costs a fraction of the memory. */
  async function loadKtx2(url: string): Promise<Texture> {
    const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
    const loader = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}hero/basis/`).detectSupport(renderer)
    try {
      const t = await loader.loadAsync(url)
      t.flipY = false
      t.minFilter = t.mipmaps && t.mipmaps.length > 1 ? LinearMipmapLinearFilter : LinearFilter
      t.magFilter = LinearFilter
      t.wrapS = t.wrapT = ClampToEdgeWrapping
      t.anisotropy = maxAniso
      textures.push(t)
      return t
    } finally {
      loader.dispose()
    }
  }

  /** Streams the sharp tier in after the first frame (best format first), then crossfades to it: no visible pop. */
  async function streamHiRes() {
    const want = wantedTier()
    if (streaming || swapping || want === 'off' || want === attemptedTier || PHOTO_WIDTHS[want] <= photoWidth) return
    streaming = true
    attemptedTier = want
    const candidates = hiResCandidates(want).filter(c => PHOTO_WIDTHS[c.tier] <= renderer.capabilities.maxTextureSize && PHOTO_WIDTHS[c.tier] > photoWidth)
    try {
      for (const c of candidates) {
        if (disposed || contextLost) return
        try {
          let t: Texture
          let width: number
          if (c.ktx2) {
            t = await loadKtx2(c.url)
            width = (t.image as { width: number }).width
          } else {
            const img = await (c.url === firstCandidate?.url && earlyImage ? earlyImage : loadImage(c.url))
            earlyImage = null
            if (disposed || contextLost) return
            if (img.naturalWidth > renderer.capabilities.maxTextureSize) continue // this GPU cannot hold it: next tier down
            t = makeTexture(img, true)
            width = img.naturalWidth
          }
          if (disposed || contextLost) {
            t.dispose()
            textures.splice(textures.indexOf(t), 1)
            return
          }
          renderer.initTexture(t) // upload and build mips now, not mid-frame
          sceneMat.uniforms.uImageHi.value = t
          sceneMat.uniforms.uImgLodHi.value = Math.log2(width / cfg.image.ref[0])
          swapping = t
          swapT = 0
          hiRes = width >= PHOTO_WIDTHS['2k']
          photoWidth = width
          qScale = 1
          cooldown = 2
          slowFor = fastFor = 0
          judging = null
          adaptiveOff = false
          heroDebug.photo = `${c.tier} (${c.url.split('.').pop()}), ${width} px`
          resize()
          return
        } catch (e) {
          console.warn(`[hero] ${c.tier} photo (${c.url}) failed; trying the next`, e)
        }
      }
    } finally {
      streaming = false
      earlyImage = null
    }
  }

  /** Advances the crossfade; at the end the sharp tier becomes the photo and the base is freed. */
  function stepSwap(dt: number) {
    if (swapT < 0 || !swapping) return
    swapT += dt
    const k = smoothstep(0, Math.max(0.01, cfg.perf.swapSeconds), swapT)
    const u = sceneMat.uniforms
    u.uImgMix.value = k
    if (k < 1) return
    const old = u.uImage.value as Texture | null
    u.uImage.value = swapping
    u.uImgLod.value = u.uImgLodHi.value
    u.uImgMix.value = 0
    u.uImageHi.value = null
    if (old && old !== swapping) {
      old.dispose()
      textures.splice(textures.indexOf(old), 1)
    }
    swapping = null
    swapT = -1
    void streamHiRes() // the viewport may have grown while the first tier was loading
  }

  /** Compile every program, upload every texture and allocate every target now, so the first scroll never hitches. */
  function prewarm() {
    for (const m of [sceneMat, raysMat, blurH, blurV, lensMat, cloudMat, finalMat]) {
      quad.material = m
      renderer.compile(quadScene, camera)
    }
    renderer.compile(particleScene, camera)
    textures.forEach((t) => renderer.initTexture(t))
    quad.material = lensMat
    renderer.setRenderTarget(lensRT)
    renderer.render(quadScene, camera)
    renderer.setRenderTarget(null)
  }

  // ---------------------------------------------------------------- state
  const input = createInput(container, () => cfg.parallax.gyro)
  const mouse = { x: 0, y: 0 }
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reduced = reducedQuery.matches
  const onReduced = () => (reduced = reducedQuery.matches)
  reducedQuery.addEventListener('change', onReduced)

  let clock = 37 // motion time; a pleasant phase for the frozen reduced-motion frame
  let breathClock = 0
  const LAYERS = ['far', 'mid', 'near'] as const
  const drift = [0, 0, 0] // warp-field offsets per sky layer (cells, wrapped)
  const evo = [0, 0, 0] // shape morph per sky layer
  // G. shooting star: a rare event, scheduled on the motion clock.
  let meteorNext = clock + 25 + Math.random() * 30
  let meteorT = -1
  const meteor = { x: 0, y: 0, dx: 1, dy: 0 }
  let wispMidDrift = 0
  let wispNearDrift = 0
  let wispEvo = 0
  let moonCover = -1
  let fadeStart = -1
  let fpsAcc = 0
  let fpsFrames = 0
  let progress = 0
  let renderOn = true
  let lensOn = false
  let lastLogZ = NaN
  let zoomVel = 0
  // The atmosphere's own life (billows morph, a slow lateral wind): unwrapped clocks, so it never jumps.
  // It never advances the shot: that is the scroll's alone.
  let cloudClock = 0
  let cloudWind = 0
  let cloudOn = false
  let sceneOn = true

  /** How much the wisps cover the moon (centre and six points near the limb), from the same field the shader draws. */
  function moonCoverage(): number {
    const [r0, r1] = cfg.image.ref
    const a = r0 / r1
    const mx = (cfg.moon.pos[0] / r0) * a
    const my = cfg.moon.pos[1] / r1
    const R = (cfg.moon.radius / r1) * 0.9
    const m = cfg.wisps.mid
    const n = cfg.wisps.near
    const env = 1 - smoothstep(0.26, 0.5, my)
    let acc = 0
    for (let i = 0; i < 7; i++) {
      const ang = ((i - 1) / 6) * TAU
      const rr = i === 0 ? 0 : R
      const x = mx + Math.cos(ang) * rr
      const y = my + Math.sin(ang) * rr
      const dM = wispField(x, y, m.scale, m.stretch, m.threshold, m.softness, wispMidDrift, 0, wispEvo, WISP_TILE) * env
      const dN = wispField(x, y, n.scale, n.stretch, n.threshold, n.softness, wispNearDrift, 0, wrapE(wispEvo * 1.3), WISP_TILE) * env
      acc += 1 - Math.exp(-(dM * m.density + dN * n.density))
    }
    return acc / 7
  }

  /** Wisp drift in noise cells per second for a layer (right to left with the wind). */
  function wispRate(l: { scale: number; stretch: number; speed: number }) {
    return -(cfg.wind.direction < 0 ? -1 : 1) * (l.speed / cfg.image.ref[1]) * (l.scale / l.stretch)
  }
  function wrapW(d: number) {
    return ((d % WISP_TILE) + WISP_TILE) % WISP_TILE
  }
  function wrapE(d: number) {
    return ((d % (WISP_TILE * 0.5)) + WISP_TILE * 0.5) % (WISP_TILE * 0.5)
  }

  // Open on a clear moon with a wisp reaching it 10-18 s in, so even a short
  // visit sees one drift across the disk. The prediction includes the shapes
  // morphing, not just the drift. Reduced motion freezes here, on the clear moon.
  {
    const coverAt = (d: number, t: number) => {
      wispNearDrift = wrapW(d + wispRate(cfg.wisps.near) * t)
      wispMidDrift = wrapW(wispRate(cfg.wisps.mid) * t)
      wispEvo = wrapE(cfg.wisps.evolve * t)
      return moonCoverage()
    }
    let best = 0
    let bestScore = -Infinity
    let clearest = Infinity
    for (let d = 0; d < WISP_TILE; d += 0.08) {
      const now = coverAt(d, 0)
      if (bestScore === -Infinity && now < clearest) {
        clearest = now
        best = d // fallback when no opening is clear (very dense settings)
      }
      if (now > 0.05) continue
      let arriving = 0
      for (let t = 10; t <= 18; t += 2) arriving = Math.max(arriving, coverAt(d, t))
      const tooSoon = Math.max(0, coverAt(d, 5) - 0.25) // keep the opening seconds clear
      const score = Math.min(arriving, 0.6) - now - tooSoon
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    wispNearDrift = wrapW(best)
    wispMidDrift = 0
    wispEvo = 0
  }

  function update(dt: number, now: number) {
    const motion = !reduced
    const [r0, r1] = cfg.image.ref
    const W = Math.max(60, cfg.loop.seconds)
    const wind = cfg.wind.direction < 0 ? -1 : 1

    // ---- J. the shot: every value below is a pure function of progress (src/hero/shot.ts)
    const T = cfg.transition
    const prof = transitionProfile()
    const shot = shotAt(progress)
    const cueW = remap(progress, 0, T.hold)
    // One camera move: the push lands as the camera enters the bank (e), the air
    // between camera and sky thickens as it goes (veil).
    const e = shot.push
    const veil = shot.veil
    const mdt = heroDebug.pauseTime ? 0 : dt * (1 - T.ambientSlow * e)

    if (motion) {
      clock += mdt
      // A. each sky layer's warp field travels with the wind at its own speed (px / s -> noise cells / s).
      LAYERS.forEach((name, k) => {
        const L = cfg.sky.layers[name]
        drift[k] = (((drift[k] - wind * (L.drift / r1) * L.scale * mdt) % TILE) + TILE) % TILE
        evo[k] = (evo[k] + L.billow * mdt) % TILE
      })
      wispMidDrift = wrapW(wispMidDrift + wispRate(cfg.wisps.mid) * mdt)
      wispNearDrift = wrapW(wispNearDrift + wispRate(cfg.wisps.near) * mdt)
      wispEvo = wrapE(wispEvo + cfg.wisps.evolve * mdt)
    }
    breathClock += mdt

    // ---- B. the moon's response to the cloud density over it (the same moving field the shader draws):
    // thick cloud dims and softens the glow and warms the light, a clear gap lets it flare back.
    const M = cfg.moon
    const cover = moonCoverage()
    moonCover = moonCover < 0 ? cover : moonCover + (cover - moonCover) * (1 - Math.exp(-M.smoothing * dt))
    const hz = M.breathHz
    const wave = 0.7 * Math.sin(TAU * hz * breathClock) + 0.3 * Math.sin(TAU * hz * 0.37 * breathClock + 1.3)
    const breathGlow = 1 + M.breathAmount * wave
    const breath = 1 + (M.breathAmount / 3) * wave
    const lightRel = (((1 - M.response * moonCover) * breath) / M.baseline) * (1 - T.atmosphere.dim * veil)
    const diskI = (breath / M.baseline) * M.lightBrightness
    const hue = moonHue(M)
    // The light it throws: its own warm silver, half folded into the scene's cool skylight; warmer under cloud.
    const tint = COOL.clone()
      .lerp(new Vector3(hue[0], hue[1], hue[2]), 0.5)
      .lerp(WARM, Math.min(1, moonCover * M.warmth))
    heroDebug.moonCover = +moonCover.toFixed(3)
    heroDebug.moonLight = +lightRel.toFixed(3)

    // ---- H. camera: overscan for the parallax, idle dolly
    const target = motion ? input.target : { x: 0, y: 0 }
    const ease = 1 - Math.pow(1 - cfg.parallax.ease, dt * 60)
    mouse.x += (target.x - mouse.x) * ease
    mouse.y += (target.y - mouse.y) * ease
    const shift = cfg.parallax.maxShiftPx
    const overscan = 1 / (1 - Math.min(0.2, (2.2 * shift) / Math.min(cssW, cssH)))
    const dolly = motion ? cfg.dolly.min + (cfg.dolly.max - cfg.dolly.min) * (0.5 - 0.5 * Math.cos((TAU * clock) / Math.max(1, cfg.dolly.period))) : cfg.dolly.min
    const zoom = overscan * dolly

    const ia = r0 / r1
    const va = cssW / cssH
    const sx = va > ia ? 1 : va / ia
    const sy = va > ia ? ia / va : 1
    const bx0 = cfg.image.objectPosition[0] * (1 - sx)
    const by0 = cfg.image.objectPosition[1] * (1 - sy)
    const fx = Math.min(bx0 + sx, Math.max(bx0, cfg.dolly.focus[0] / r0))
    const fy = Math.min(by0 + sy, Math.max(by0, cfg.dolly.focus[1] / r1))
    const ax0 = sx / zoom
    const ay0 = sy / zoom
    const bxRest = fx + (bx0 - fx) / zoom
    const byRest = fy + (by0 - fy) / zoom
    // J. push: exponential in the camera's travel, so it reads as a steady approach; the
    // figure glides from where it sits in the wide shot to its place in the frame.
    const logZ = shot.logZ
    const Z = Math.exp(logZ)
    const [tx, ty] = prof.target
    const restX = (tx - bxRest) / ax0
    const restY = (ty - byRest) / ay0
    const anchorX = restX + (prof.frame[0] - restX) * e
    const anchorY = restY + (prof.frame[1] - restY) * e
    const ax = ax0 / Z
    const ay = ay0 / Z
    const bx = tx - anchorX * ax
    const by = ty - anchorY * ay
    uCover.value.set(ax, ay, bx, by)
    uParallax.value.set(mouse.x * shift * 2 * (ax / cssW) * (1 - e), mouse.y * shift * 2 * (ay / cssH) * (1 - e))
    uFocus.value = cfg.parallax.focus
    uTime.value = clock % W
    uWrap.value = W
    uMoonPos.value.set(cfg.moon.pos[0] / r0, cfg.moon.pos[1] / r1)
    uLightRel.value = lightRel
    heroDebug.zoom = +Z.toFixed(2)

    // ---- scene uniforms
    const u = sceneMat.uniforms
    u.uMotion.value = motion ? 1 : 0
    u.uPersonDepth.value = cfg.scene.personDepth
    const SL = cfg.sky.layers
    const still = motion ? 1 : 0.6
    u.uLayerF.value.set(SL.far.scale, TILE, cfg.sky.warp, SL.far.displace * still)
    u.uLayerM.value.set(SL.mid.scale, TILE, cfg.sky.warp, SL.mid.displace * still)
    u.uLayerN.value.set(SL.near.scale, TILE, cfg.sky.warp, SL.near.displace * still)
    u.uDrift.value.set(drift[0], drift[1], drift[2])
    u.uEvo.value.set(evo[0], evo[1], evo[2])
    u.uSplit.value.set(cfg.sky.split[0], cfg.sky.split[1], Math.max(0.001, cfg.sky.blend))
    // The flow cycle is quantised to the loop so the whole film still wraps without a seam.
    u.uAdvect.value.set(SL.far.advect, SL.mid.advect, SL.near.advect, W / Math.max(1, Math.round(W / Math.max(1, cfg.sky.advectCycle))))
    u.uSea.value.set(cfg.sea.coverage, cfg.sea.softness, cfg.sea.shadow)
    const RM = cfg.sky.rim
    u.uRim.value.set(RM.amount, RM.reach * (M.radius / r1), RM.under, RM.shimmer)
    const ul = luma3(RM.underColor) || 1
    u.uUnderCol.value.set(RM.underColor[0] / ul, RM.underColor[1] / ul, RM.underColor[2] / ul)
    u.uDetail.value.set(cfg.sky.detail, 0)
    const Wm = cfg.wisps.mid
    const Wn = cfg.wisps.near
    u.uWispMid.value.set(Wm.scale, Wm.stretch, Wm.threshold, Wm.softness)
    u.uWispNear.value.set(Wn.scale, Wn.stretch, Wn.threshold, Wn.softness)
    u.uWispDrift.value.set(wispMidDrift, 0, wispNearDrift, 0)
    u.uWispEvo.value.set(wispEvo, wrapE(wispEvo * 1.3))
    u.uWispOpt.value.set(Wm.density, Wn.density, Wm.parallax, Wn.parallax)
    u.uWispLight.value.set(cfg.wisps.light, cfg.wisps.ambient, cfg.wisps.selfShadow)
    u.uMoonRadius.value = M.radius / r1
    u.uMoonTint.value.copy(tint)
    u.uMoonI.value = lightRel
    u.uMoonDiskI.value = diskI
    // Sampling turned the other way turns the face clockwise on screen.
    const rot = (M.rotation * Math.PI) / 180
    u.uMoonRot.value.set(Math.cos(rot), Math.sin(rot))
    const th = (M.lightAngle * Math.PI) / 180
    const sp = (M.phase * Math.PI) / 180
    u.uMoonSun.value.set(Math.sin(sp) * Math.cos(th), Math.sin(sp) * Math.sin(th), Math.cos(sp))
    u.uMoonShade.value.set(Math.max(1e-3, M.terminator), 1 - M.limbDarkening, M.earthshine, M.relief)
    u.uEarthCol.value.set(...M.earthshineColor)
    // Face colour folds in the brightness, the (faint) breath and the map's mean albedo, so any map lands at the same brightness.
    const faceK = (M.brightness * breath) / Math.max(1e-3, moonMeta.meanAlbedo)
    u.uMoonCol.value.set(hue[0] * faceK, hue[1] * faceK, hue[2] * faceK)
    u.uMoonHue.value.set(hue[0], hue[1], hue[2])
    u.uMapSat.value = M.mapSaturation
    u.uFeather.value = M.feather
    u.uScatter.value.set(M.scatter.amount, M.scatter.width)
    const H = M.halo
    u.uHalo.value.set(H.amp[0], Math.max(1e-3, H.scale[0]), H.amp[1], Math.max(1e-3, H.scale[1]))
    u.uHaloOpt.value.set(H.haze, H.occlusion, H.skyColor)
    u.uHaloSoft.value = 1 + M.soften * moonCover
    // Glow: flares in a clear gap, dims under thick cloud, breathes slowly, fades as the camera dives away.
    u.uMoonGlow.value = M.glow * (1 + M.flare + (-M.dim - M.flare) * moonCover) * breathGlow * (1 - 0.8 * T.raysFade * veil)
    u.uWispTint.value = M.wispTint
    u.uKnee.value = cfg.film.knee
    u.uSceneResp.value = cfg.light.sceneResponse
    u.uRimGain.value = cfg.light.rim
    // The wind builds as the weather rolls in (amplitudes only: a frequency change would jump the phase).
    const windUp = 1 + T.windUp * veil
    u.uGrass.value.set(cfg.grass.amplitude * windUp, cfg.grass.frequency, cfg.grass.gust * windUp, cfg.grass.gustSpeed)
    u.uWindDir.value.set(wind, 0)
    u.uLaptop.value.set(cfg.laptop.pos[0] / r0, cfg.laptop.pos[1] / r1, cfg.laptop.size[0] / 2 / r1, cfg.laptop.size[1] / 2 / r1)
    // ---- F. laptop: its own rhythm, unrelated to the moon. J. hold: it pulses a little harder.
    const lt = clock
    const lhz = cfg.laptop.hz
    const amp = cfg.laptop.pulse * (1 + T.cue.pulse * cueW)
    u.uLaptopPulse.value = motion
      ? 1 + amp * (0.65 * Math.sin(TAU * lhz * lt) + 0.35 * Math.sin(TAU * lhz * 2.7 * lt + 0.8)) + 0.012 * Math.sin(lt * 23) * Math.sin(lt * 7.3) + T.cue.glow * cueW
      : 1
    u.uLaptopPool.value = cfg.laptop.pool
    u.uStars.value.set(cfg.stars.twinkle, cfg.stars.density, cfg.stars.brightness, cfg.stars.milkyWay)
    // ---- G. shooting star: very rare, high in the dark sky, never near the moon; none with reduced motion or mid-dive.
    const MT = cfg.stars.meteor
    if (motion && meteorT < 0 && (clock >= meteorNext || heroDebug.meteorNow)) {
      heroDebug.meteorNow = false
      const a = r0 / r1
      for (let tries = 0; tries < 12; tries++) {
        meteor.x = (0.05 + Math.random() * 0.6) * a
        meteor.y = 0.03 + Math.random() * 0.15
        if (Math.hypot(meteor.x - (M.pos[0] / r0) * a, meteor.y - M.pos[1] / r1) > 0.3) break
      }
      const dirA = ((20 + Math.random() * 18) * Math.PI) / 180
      const side = meteor.x > 0.45 * a ? -1 : Math.random() < 0.5 ? -1 : 1
      meteor.dx = side * Math.cos(dirA)
      meteor.dy = Math.sin(dirA) // y down: falling
      meteorT = 0
      meteorNext = clock + MT.every * (0.5 + Math.random())
    }
    if (meteorT >= 0) {
      meteorT += mdt
      const dur = Math.max(0.1, MT.duration)
      const k = meteorT / dur
      if (k >= 1 || !motion) {
        meteorT = -1
        u.uMeteorK.value.set(0, 0)
      } else {
        const speed = (MT.length * 2.6) / dur
        const tail = Math.min(MT.length, speed * meteorT)
        u.uMeteor.value.set(meteor.x + meteor.dx * speed * meteorT, meteor.y + meteor.dy * speed * meteorT, meteor.dx, meteor.dy)
        u.uMeteorK.value.set(tail, MT.brightness * Math.pow(Math.sin(Math.PI * k), 0.8) * (1 - e))
      }
    }
    u.uGrade.value.set(cfg.sky.grade, 0)
    u.uExposure.value = cfg.image.exposure
    u.uView.value = heroDebug.view

    // ---- J. push parallax and the screen's light in the mist
    const { far: kFar, near: kNear, iterations } = T.parallax
    u.uDive.value.set(logZ, kFar, kNear, -0.5 * e) // a crisper depth lookup as the zoom deepens keeps silhouettes clean
    u.uDiveTarget.value.set(tx, ty)
    u.uDiveIter.value = iterations
    const sf = quadFrame(cfg.screen.corners)
    // K. With the video on, the screen is wherever its four corners say (image uv -> source px).
    const vTex = cfg.video.enabled ? (video?.texture ?? null) : null
    const videoOn = !!vTex
    heroDebug.video = !video ? 'off' : video.failed ? 'missing (public/video/screen.mp4)' : videoOn ? 'playing' : 'loading'
    const screenPx = videoOn ? cfg.video.corners.map(([cu, cv]) => [cu * r0, cv * r1] as [number, number]) : cfg.screen.corners
    const ssf = videoOn ? quadFrame(screenPx) : sf
    u.uScreenC.value.set(ssf.cx, ssf.cy)
    frameInverse(u.uScreenInv.value as number[], ssf.xx, ssf.xy, ssf.yx, ssf.yy)
    u.uScreenLen.value.set(Math.hypot(ssf.xx, ssf.xy), Math.hypot(ssf.yx, ssf.yy))
    u.uScreenR.value = cfg.screen.radius
    const [gr, gg, gb] = T.atmosphere.laptopColor
    // Linear HDR so the screen blooms into the rising mist.
    u.uScreenGlow.value.set(gr * 1.6, gg * 1.6, gb * 1.6, Math.min(1, T.screenGlow * smoothstep(0.3, 1, e)))
    // K. The video's colour: its emission for the bloom, and the light it spills.
    const avg = video?.average ?? [0, 0, 0]
    const V = cfg.video
    u.uVideoGlow.value.set(avg[0] * V.bloom, avg[1] * V.bloom, avg[2] * V.bloom, videoOn ? 1 : 0)
    u.uSpill.value.set(avg[0], avg[1], avg[2], videoOn ? V.spill : 0)

    // ---- particles
    buildParticles()
    const pu = particleMat.uniforms
    pu.uPxScale.value = sceneH / (r1 * ay)
    u.uPxPerH.value = sceneH / ay
    pu.uWind.value = wind
    pu.uBright.value = cfg.particles.brightness
    pu.uSpeed.value.set(cfg.particles.dustSpeed, cfg.particles.leafSpeed, cfg.particles.leafFlutter)
    pu.uDive.value.set(logZ, kFar, kNear, cfg.scene.personDepth)

    // ---- D. rays toward the moon's on-screen position (sky depth ~ 0, so it zooms by the far exponent)
    const skyLayer = Math.exp(logZ * (kFar - 1))
    const mxImg = tx + (cfg.moon.pos[0] / r0 + uParallax.value.x * cfg.parallax.focus - tx) * skyLayer
    const myImg = ty + (cfg.moon.pos[1] / r1 + uParallax.value.y * cfg.parallax.focus - ty) * skyLayer
    const ru = raysMat.uniforms
    ru.uMoon.value.set((mxImg - bx) / ax, 1 - (myImg - by) / ay)
    ru.uAspect.value = cssW / cssH
    ru.uLength.value = cfg.rays.length
    ru.uDecay.value = cfg.rays.decay
    ru.uThreshold.value = cfg.rays.threshold
    ru.uReach.value = cfg.rays.reach

    blurH.uniforms.uStep.value.set(1 / bloomA.width, 0)
    blurH.uniforms.uThreshold.value = cfg.film.bloomThreshold
    blurV.uniforms.uStep.value.set(0, 1 / bloomB.height)

    // ---- J. lens: radial streak from zoom speed, depth of field away from the screen
    const rate = Number.isFinite(lastLogZ) && dt > 0 ? Math.abs(logZ - lastLogZ) / dt : 0
    lastLogZ = logZ
    zoomVel += (rate - zoomVel) * (1 - Math.exp(-10 * dt))
    const streak = Math.min(0.3, zoomVel * T.blur.motion * 0.05)
    const dof = T.blur.dof * e
    lensOn = motion && (streak > 0.002 || dof > 1e-4)
    const lu = lensMat.uniforms
    lu.uAnchor.value.set(anchorX, 1 - anchorY)
    lu.uAspect.value = cssW / cssH
    lu.uMotion.value = streak
    lu.uDof.value = dof
    lu.uFocus.value = T.blur.focus

    // ---- J. the atmosphere: a cloud volume composited against the photo's depth (shaders/clouds.frag)
    const AT = T.atmosphere
    if (motion) {
      cloudClock += dt
      cloudWind += AT.wind * wind * dt
    }
    const bands = atmosphereBands()
    const reach = shot.camX + AT.scene.sky
    cloudOn = bands.some(([from, to, , s]) => s > 0 && reach > from && shot.camX < to)
    sceneOn = shot.sceneVis > 0
    if (cloudOn) {
      const cu = cloudMat.uniforms
      cu.uAspect.value = cssW / cssH
      cu.uCentre.value.set(anchorX, 1 - anchorY)
      cu.uCamX.value = shot.camX
      const ub = cu.uBands.value as Vector4[]
      for (let i = 0; i < 4; i++) {
        const bd = bands[i]
        if (bd) ub[i].set(bd[0], bd[1], bd[2], bd[3])
        else ub[i].set(0, 1, 0.5, 0)
      }
      cu.uDensMax.value = AT.bank.density
      // Phones, tablets, Lite and integrated GPUs integrate fewer slices: the same shot, lighter billows.
      const light = lowPower || compact || opts.integratedGpu
      cu.uSlices.value = Math.min(16, Math.max(2, Math.round(light ? AT.slicesLow : AT.slices)))
      cu.uTime.value = cloudClock
      cu.uWind.value.set(cloudWind, 0)
      cu.uMoon.value.copy(ru.uMoon.value)
      cu.uMoonCol.value.copy(tint).multiplyScalar(0.6 * Math.max(0.2, lightRel))
      cu.uAmbient.value.set(...AT.ambient)
      cu.uDeep.value.set(...AT.deep)
      cu.uGlow.value.set(...AT.glow)
      const lx = (cfg.laptop.pos[0] / r0 - bx) / ax
      const ly = 1 - (cfg.laptop.pos[1] / r1 - by) / ay
      // Its glow is seen through whatever cloud already lies between camera and figure,
      // and is left behind with the photo once the camera is through.
      const figure = AT.scene.figure / Z
      const seen = Math.exp(-opticalDepth(shot.camX, shot.camX + figure * 0.7)) * shot.sceneVis
      cu.uLaptop.value.set(lx, ly, 0.06 * Math.sqrt(Z), AT.laptop * seen)
      cu.uLaptopCol.value.set(...AT.laptopColor)
      cu.uShape.value.set(AT.scale, AT.softness, AT.structure, AT.bank.depth)
      cu.uLight.value.set(AT.silver, AT.scatter, AT.moonReach, AT.glowReach)
      cu.uDist.value.set(AT.scene.figure, AT.scene.spread, AT.scene.sky)
      cu.uFigure.value = figure
    }

    const fu = finalMat.uniforms
    const fw = fu.uRes.value.x
    const fh = fu.uRes.value.y
    fu.uCloudOn.value = cloudOn ? 1 : 0
    fu.uSceneVis.value = shot.sceneVis
    // Screen corners on the laptop plane, in device px (y up), mouse parallax included.
    const lift = cfg.scene.personDepth - cfg.parallax.focus
    const dev = cfg.screen.corners.map(
      ([x, y]) => [((x / r0 - uParallax.value.x * lift - bx) / ax) * fw, (1 - (y / r1 - uParallax.value.y * lift - by) / ay) * fh] as [number, number],
    )

    // ---- F2. the screen art (or K. the video), crisp at full device resolution
    const S = cfg.screen
    const screenOn = (screenReady || videoOn) && S.enabled
    fu.uScreenOn.value = screenOn ? 1 : 0
    fu.uVideoOn.value = videoOn ? 1 : 0
    fu.uVideoTex.value = vTex
    if (videoOn) {
      // Cover fit to the panel's aspect: crop the long side, never stretch.
      const va = video!.aspect || V.screenAspect
      const sa = Math.max(0.1, V.screenAspect)
      fu.uVideoCover.value.set(va > sa ? sa / va : 1, va > sa ? 1 : va / sa)
      fu.uVideoBright.value = V.emissive
    }
    if (screenOn) {
      const quad = videoOn
        ? screenPx.map(([x, y]) => [((x / r0 - uParallax.value.x * lift - bx) / ax) * fw, (1 - (y / r1 - uParallax.value.y * lift - by) / ay) * fh] as [number, number])
        : dev
      quadToUnit(fu.uScreenH.value, quad)
      fu.uScreenRad.value = (S.radius / Math.max(1e-3, Math.hypot(ssf.xx, ssf.xy))) * DESIGN[0]
      fu.uScreenBright.value = S.brightness * (motion ? 1 + (u.uLaptopPulse.value - 1) * 0.5 : 1)
      fu.uScreenGlare.value = S.glare
      fu.uBezel.value = S.bezel
      fu.uCaretOn.value = !hasCaret ? 0 : motion ? (Math.floor(clock * S.caretHz * 2) % 2 === 0 ? 1 : 0) : 1
    }
    fu.uLensOn.value = lensOn ? 1 : 0
    fu.uLens.value.set(anchorX, 1 - anchorY, streak, dof)
    fu.uLensFocus.value = T.blur.focus

    // ---- ?debug: the camera, for the moon split view and the corner handles
    if (debugOn) {
      heroDebugApi.toScreen = (iu, iv) => [((iu - uParallax.value.x * lift - bx) / ax) * cssW, ((iv - uParallax.value.y * lift - by) / ay) * cssH]
      heroDebugApi.fromScreen = (x, y) => [(x / cssW) * ax + bx + uParallax.value.x * lift, (y / cssH) * ay + by + uParallax.value.y * lift]
      const mr = ((cfg.moon.radius / r1) * skyLayer) / ay
      const mx = ((mxImg - bx) / ax) * cssW
      const my = ((myImg - by) / ay) * cssH
      heroDebugApi.moon = () => ({ x: mx, y: my, r: mr * cssH })
    }

    // ---- I. film (J: rays fade under the clouds, vignette tightens with the push, speed adds aberration)
    if (revealed && fadeStart < 0) fadeStart = now
    const fade = fadeStart < 0 ? 0 : smoothstep(0, 1, (now - fadeStart) / 1000 / Math.max(0.01, cfg.film.fadeIn))
    fu.uRayColor.value.copy(tint).multiplyScalar(cfg.rays.strength * lightRel * (1 - T.raysFade * veil))
    fu.uBloomStrength.value = cfg.film.bloom
    fu.uVignette.value = Math.min(0.95, cfg.film.vignette + T.vignette * e)
    fu.uVigTight.value = e
    fu.uGrain.value = cfg.film.grain
    fu.uSharpen.value = cfg.film.sharpen
    fu.uClarity.value = cfg.film.clarity
    // Bound channel separation to half an output pixel, including on retina displays.
    fu.uAberration.value = Math.min(cfg.film.aberration + streak * 0.02, 1 / Math.max(fu.uRes.value.x, fu.uRes.value.y))
    fu.uCaSpread.value = Math.min(1, streak * 4)
    fu.uKnee.value = cfg.film.knee
    fu.uStreak.value = cfg.film.streak
    fu.uToe.value = cfg.film.toe
    fu.uFade.value = fade
    fu.uSeed.value = motion ? Math.floor(clock * 24) % 64 : 0
    fu.uRaw.value = heroDebug.view > 0 ? 1 : 0
  }

  function render() {
    // Once the bank has closed the photo is hidden for good: only the clouds are drawn.
    if (sceneOn) {
      quad.material = sceneMat
      renderer.setRenderTarget(sceneRT)
      renderer.render(quadScene, camera)
      if (points && !reduced && heroDebug.view === 0) renderer.render(particleScene, camera)

      quad.material = raysMat
      renderer.setRenderTarget(raysRT)
      renderer.render(quadScene, camera)

      quad.material = blurH
      renderer.setRenderTarget(bloomA)
      renderer.render(quadScene, camera)
      quad.material = blurV
      renderer.setRenderTarget(bloomB)
      renderer.render(quadScene, camera)

      if (lensOn) {
        quad.material = lensMat
        renderer.setRenderTarget(lensRT)
        renderer.render(quadScene, camera)
      }
    }

    if (cloudOn) {
      quad.material = cloudMat
      renderer.setRenderTarget(cloudRT)
      renderer.render(quadScene, camera)
    }

    quad.material = finalMat
    renderer.setRenderTarget(null)
    renderer.render(quadScene, camera)
  }

  // ---------------------------------------------------------------- loop
  let raf = 0
  let running = false
  let last = 0
  let throttle = 0
  let inView = true
  let contextLost = false

  function frame(now: number) {
    if (!running) return
    raf = requestAnimationFrame(frame)
    let dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (reduced) {
      // A still frame with a breathing moon needs very few frames.
      throttle += dt
      if (throttle < 1 / 15) return
      dt = throttle
      throttle = 0
    }
    syncVideo(dt)
    if (!ready || opts.isPaused?.()) return
    fpsAcc += dt
    fpsFrames++
    if (fpsAcc > 0.5) {
      heroDebug.fps = Math.round(fpsFrames / fpsAcc)
      fpsAcc = 0
      fpsFrames = 0
    }
    if (!reduced) adapt(dt)
    stepSwap(dt)
    update(dt, now)
    render()
    heroDebugApi.afterRender?.()
  }

  // ---- automatic quality: hold the frame budget by stepping the scene resolution
  // down when frames run long (and back up after a long stretch with headroom).
  // If a step down does not speed things up, the display or the browser is
  // throttling, not the GPU: the step is undone and adaptation stops.
  let ema = 1000 / 60
  let slowFor = 0
  let fastFor = 0
  let cooldown = 2 // seconds before the first judgement (uploads, shader warm-up)
  let judging: { before: number; scale: number } | null = null
  let adaptiveOff = false
  function adapt(dt: number) {
    const ms = dt * 1000
    ema += (ms - ema) * 0.08
    heroDebug.frameMs = +ema.toFixed(1)
    heroDebug.quality = +qScale.toFixed(2)
    if (!cfg.perf.adaptive || adaptiveOff || swapT >= 0) return
    cooldown -= dt
    if (cooldown > 0) return
    if (judging) {
      if (ema > judging.before * 0.92) {
        qScale = judging.scale
        adaptiveOff = true
        resize()
      }
      judging = null
    }
    const target = cfg.perf.targetMs
    slowFor = ema > target * 1.12 ? slowFor + dt : Math.max(0, slowFor - dt * 0.5)
    fastFor = ema < target * 0.72 ? fastFor + dt : 0
    if (slowFor > 1.5 && qScale > cfg.perf.minScale + 1e-3) {
      judging = { before: ema, scale: qScale }
      qScale = Math.max(cfg.perf.minScale, qScale * 0.8)
      slowFor = 0
      cooldown = 2.5
      resize()
    } else if (fastFor > 10 && qScale < 1) {
      qScale = Math.min(1, qScale / 0.85)
      fastFor = 0
      cooldown = 2.5
      resize()
    }
  }

  /** K. The video plays while the hero is live and visible, and holds the GPU until About takes over. */
  function syncVideo(dt = 0) {
    if (!video) return
    const live = !disposed && renderOn && !contextLost
    video.update({ play: live && inView && !document.hidden && !reduced && !opts.isPaused?.(), gpu: live }, dt)
  }

  function sync() {
    syncVideo()
    const run = ready && renderOn && !disposed && inView && !document.hidden && !contextLost
    if (run && !running) {
      running = true
      last = performance.now()
      lastLogZ = NaN // no streak spike from a stale zoom after a pause
      raf = requestAnimationFrame(frame)
    } else if (!run && running) {
      running = false
      cancelAnimationFrame(raf)
    }
  }

  const io = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting
    sync()
  })
  io.observe(container)
  document.addEventListener('visibilitychange', sync)

  const onLost = (e: Event) => {
    e.preventDefault()
    contextLost = true
    sync()
    showStill()
  }
  const onRestored = () => {
    contextLost = false
    attemptedTier = null
    textures.forEach((t) => (t.needsUpdate = true))
    still?.remove()
    still = null
    sync()
    if (ready) void streamHiRes()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  // ---------------------------------------------------------------- debug
  if (import.meta.env.DEV) {
    // Dev-only probe: GPU time of one hero frame at progress p, independent of rAF (works in a hidden tab).
    ;(window as unknown as Record<string, unknown>).__heroProbe = async (p: number, frames = 20) => {
      const gl = renderer.getContext() as WebGL2RenderingContext
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
      if (!ext || !ready) return 'unavailable'
      const keep = progress
      progress = p
      const times: number[] = []
      let now = performance.now()
      for (let i = 0; i < frames; i++) {
        const q = gl.createQuery()!
        gl.beginQuery(ext.TIME_ELAPSED_EXT, q)
        now += 1000 / 60
        update(1 / 60, now)
        render()
        gl.endQuery(ext.TIME_ELAPSED_EXT)
        while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) await new Promise((r) => setTimeout(r, 1))
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6)
        gl.deleteQuery(q)
      }
      progress = keep
      times.sort((a, b) => a - b)
      return { median: +times[times.length >> 1].toFixed(2), scene: heroDebug.scene, cloud: cloudOn }
    }
  }
  let detachDebug: (() => void) | null = null
  if (debugOn) {
    import('./debug')
      .then(({ attachDebug }) => {
        if (!disposed) detachDebug = attachDebug(() => resize())
      })
      .catch((e) => console.warn('[hero] debug panel failed to load', e))
  }

  return {
    reveal() {
      revealed = true
      still?.classList.add('is-revealed')
    },
    setLowPower(v: boolean) {
      if (v === lowPower) return
      lowPower = v
      resize()
      if (ready) void streamHiRes()
    },
    setProgress(p: number) {
      progress = Math.min(1, Math.max(0, p))
    },
    setRendering(on: boolean) {
      if (on === renderOn) return
      renderOn = on
      sync()
    },
    dispose() {
      disposed = true
      sync()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', sync)
      reducedQuery.removeEventListener('change', onReduced)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      input.dispose()
      video?.dispose()
      detachDebug?.()
      heroDebugApi.afterRender = null
      textures.forEach((t) => t.dispose())
      for (const m of [sceneMat, raysMat, blurH, blurV, lensMat, cloudMat, finalMat, particleMat]) m.dispose()
      for (const rt of [sceneRT, raysRT, bloomA, bloomB, lensRT, cloudRT]) rt.dispose()
      tri.dispose()
      points?.geometry.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      still?.remove()
    },
  }
}
