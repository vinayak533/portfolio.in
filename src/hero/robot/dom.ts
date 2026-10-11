/**
 * The robot's page furniture, shared by the WebGL engine and the still
 * fallback: a fixed layer on <body> (outside the hero stage, which fades and
 * hides once the hero is passed), where the robot is drawn while it stands in
 * the hero and while its head flies to the chat launcher. It never takes a
 * click; once landed, the head lives inside the launcher button (bridge.ts).
 */

export interface RobotOptions {
  /** True while something covers the page (e.g. a full-screen overlay): frames are skipped. */
  isPaused?: () => boolean
  /** Lite / low tier: a lower pixel-ratio cap. */
  lowPower?: boolean
  /** Integrated / mobile-class GPU (the site's mid tier). */
  integratedGpu?: boolean
}

/** Same surface as the photo engine's handle, so src/hero/transition.ts drives either. */
export interface RobotHandle {
  /** Fade in (call when the loader has gone). */
  reveal(): void
  setLowPower(v: boolean): void
  /** Hero scroll progress 0..1: the push in, the body dissolving, then the head's flight to the launcher. */
  setProgress(p: number): void
  /** The hero stage's own loop hint; the robot outlives the stage (it docks), so it may ignore this. */
  setRendering(on: boolean): void
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

/** Shared between the engine and the stage's dot canvas (stage.ts). */
export const stageCues = {
  /** performance.now() of the last successful build (ms), or -Infinity: the commit pulse. */
  commitAt: -Infinity,
  /** performance.now() when the current (or last) build started printing (ms); it passes 1.2 s later. */
  buildAt: -Infinity,
  /** performance.now() when the next build is due (ms; it starts at the next pause in the typing), or Infinity. */
  buildDue: Infinity,
  /**
   * The frame-rate governor's step (engine.ts), only ever rising. The landscape (terrain.ts) gives up, in
   * order: 1 its depth of field, 2 grid density, 3 trail length, 4 the contours and glow, 5 ring dots,
   * 6 its pixel ratio; the engine its own from 4 (glows, shadows, equaliser, pixel ratio).
   */
  degrade: 0,
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
