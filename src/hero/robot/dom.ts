/**
 * The robot's page furniture, shared by the WebGL engine and the still
 * fallback: a fixed layer on <body> (outside the hero stage, which fades and
 * hides once the hero is passed), where the robot is drawn while it stands in
 * the hero and while its head flies to the chat launcher. It never takes a
 * click; once landed, the head lives inside the launcher button (bridge.ts).
 */
import type { HeroTier } from '../tier'

export interface RobotOptions {
  /** True while something covers the page (e.g. a full-screen overlay): frames are skipped. */
  isPaused?: () => boolean
  /** The hero's quality tier (src/hero/tier.ts). */
  tier?: HeroTier
  /** Called once, after the first frame has been drawn (the live scene can take over from the poster). */
  onReady?: () => void
  /** The WebGL context was lost (the poster comes back). */
  onLost?: () => void
  /** Integrated / mobile-class GPU (the site's mid tier). */
  integratedGpu?: boolean
}

/** Same surface as the photo engine's handle, so src/hero/transition.ts drives either. */
export interface RobotHandle {
  /** Start drawing: the canvas crossfades over the hero's poster with its first frame. */
  reveal(): void
  setTier(t: HeroTier): void
  /** Hero scroll progress 0..1: the push in, the body dissolving, then the head's flight to the launcher. */
  setProgress(p: number): void
  dispose(): void
}

/**
 * Where the robot stands on screen (viewport px), written by the engine's layout and read by the
 * stage's dot canvas (stage.ts), so its rings, floor and beam line up with the figure exactly.
 * Null until the engine has laid out (or without WebGL): the stage then uses its CSS defaults.
 */
export interface StageFrame {
  /** Horizontal centre of the stage (the dais). */
  x: number
  /** Top of the seated figure (its headphones), its chest centre, and the dais's centre (the floor contact). */
  topY: number
  chestY: number
  daisY: number
  /** The dais ellipse's on-screen size. */
  daisW: number
  daisH: number
  /** The seated figure's height, headphones to the floor. */
  robotH: number
  /** The head's centre and on-screen radius (the backdrop keeps clear of it). */
  head?: { x: number; y: number; r: number }
  /** The laptop display's centre and on-screen size (its glow spills onto the floor). */
  screen?: { x: number; y: number; w: number; h: number }
}

let currentFrame: StageFrame | null = null
const frameListeners = new Set<(f: StageFrame | null) => void>()

export const stageFrame = {
  get: () => currentFrame,
  set(f: StageFrame | null) {
    currentFrame = f
    frameListeners.forEach((fn) => fn(f))
  },
  on(fn: (f: StageFrame | null) => void) {
    frameListeners.add(fn)
    return () => void frameListeners.delete(fn)
  },
}

/** Shared between the engine and the landscape (terrain.ts): one event, one timestamp, read by both. */
export const stageCues = {
  /** performance.now() of the last successful build (ms), or -Infinity: the commit pulse. */
  commitAt: -Infinity,
  /** performance.now() when the latest typing burst on the laptop began (ms), or -Infinity: the floor's tremor. */
  burstAt: -Infinity,
  /** performance.now() when the latest descent agent spawned (ms), or -Infinity: the robot's eyes find it. */
  agentAt: -Infinity,
  /** The agent's position on the hero's screen (px), kept current while it is live. */
  agent: { x: 0, y: 0 },
  /** The inflow vortex's rim arc on the dais (terrain.ts writes it; engine.ts draws it): its angle in the
   * landscape's plateau frame (rad, +z toward the camera) and its gain (0 off). */
  swallow: { angle: 0, gain: 0 },
  /** The vortex's step on the frame-rate ladder (0 whole, 1 half its dots, 2 off): the first thing given up. */
  vortex: 0,
  /**
   * The frame-rate governor's step (engine.ts, after the vortex's two: stageCues.vortex), only ever rising. The landscape (terrain.ts) gives up, in
   * order: 1 its interference waves, 2 the comets, 3 grid density, 4 trail length, the glow, depth of field
   * and ring dots, 7 its pixel ratio, 8 its frame rate; the engine its own at 4-6 (glows and the floor
   * reflection, the shadow map, the equaliser).
   */
  degrade: 0,
  /** The engine's governor is watching the frame rate (HIGH / MEDIUM): the landscape's own watchdog stands down. */
  governed: false,
}

export interface Layer {
  el: HTMLDivElement
  dispose(): void
}

export function createLayer(): Layer {
  const el = document.createElement('div')
  el.className = 'robot-layer'
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return {
    el,
    dispose: () => el.remove(),
  }
}
