/**
 * The hero's motion system: one master clock and one scalar.
 *
 *   clock     the 96 BPM beat (robot/beat.ts, 625 ms a beat). Every background motion is timed in beats
 *             from it; before the music starts (the load sequence) the wall clock stands in.
 *   ENERGY    0..1, read by every background layer. Interaction raises it a little (the pointer moving
 *             over the hero, a tap, the scroll inside the hero) and it eases back to a calm baseline
 *             (0.35) over 1.2 s. Layers map it onto small changes of tempo and brightness, never onto
 *             new motion: richer, never noisier.
 *   tokens    the few durations and easings every layer uses (mirrored in hero.css as --ease-out,
 *             --ease-in-out and --dur-fast / --dur-base / --dur-slow).
 *
 * Also the hero's scroll progress (0..1, written by src/hero/transition.ts from its one scrubbed reader),
 * so the layers can follow the hand-over without a scroll listener of their own.
 */
import { beat, BEAT } from './robot/beat'

/** Motion tokens (s, and cubic-bezier control points). */
export const MOTION = {
  fast: 0.2,
  base: 0.4,
  slow: 0.8,
  easeOut: [0.2, 0.8, 0.2, 1] as const,
  easeInOut: [0.65, 0, 0.35, 1] as const,
}

/** ENERGY: the calm baseline, how fast it rises (s), and how long it takes to ease back (s). */
export const ENERGY = { base: 0.35, rise: 0.2, settle: 1.2 }

/** How much each kind of interaction raises ENERGY (its target while the input lasts). */
export const POKE = { pointer: 0.6, tap: 0.85, scroll: 1 } as const

/** A cubic-bezier easing (x1, y1, x2, y2), solved for y at x by Newton's method. */
export function bezier([x1, y1, x2, y2]: readonly [number, number, number, number]) {
  const ax = 3 * x1 - 3 * x2 + 1
  const bx = 3 * x2 - 6 * x1
  const cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1
  const by = 3 * y2 - 6 * y1
  const cy = 3 * y1
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 6; i++) {
      const f = ((ax * t + bx) * t + cx) * t - x
      const d = (3 * ax * t + 2 * bx) * t + cx
      if (Math.abs(d) < 1e-6) break
      t -= f / d
    }
    return ((ay * t + by) * t + cy) * t
  }
}
export const easeOut = bezier(MOTION.easeOut)
export const easeInOut = bezier(MOTION.easeInOut)

/** The master clock in beats: the music's beat count once it plays, the wall clock (in beats) before. */
const sample = { on: false, t: 0, index: 0, phase: 0, inBar: 0, bar: 0, since: 0, pulse: 0 }
const clockOut = { on: false, beats: 0 }
/** (One shared result object: read it, don't keep it.) */
export function masterBeats(now = performance.now()) {
  beat.sample(now, sample)
  clockOut.on = sample.on
  clockOut.beats = sample.on ? sample.t : now / 1000 / BEAT
  return clockOut
}

// ---- ENERGY

let value = ENERGY.base
let target = 0
let heldUntil = 0
let sampledAt = performance.now()

/**
 * The shared ENERGY scalar. `poke` is cheap (input handlers only record it); the value advances lazily on
 * `read`, so any number of layers can read it in a frame and it moves at the same rate for all of them.
 */
export const energy = {
  poke(kind: keyof typeof POKE, holdMs = 150) {
    const now = performance.now()
    target = Math.max(now < heldUntil ? target : 0, POKE[kind])
    heldUntil = Math.max(heldUntil, now + holdMs)
  },
  read(now = performance.now()) {
    const dt = Math.min(0.1, Math.max(0, (now - sampledAt) / 1000))
    sampledAt = now
    const goal = now < heldUntil ? Math.max(ENERGY.base, target) : ENERGY.base
    // Up quickly (a 200 ms rise), down gently: 95% of the way back within ENERGY.settle.
    const tau = goal > value ? ENERGY.rise / 3 : ENERGY.settle / 3
    value += (goal - value) * (1 - Math.exp(-dt / tau))
    return value
  },
  /** 0 at the baseline .. 1 at full energy. */
  excess(now = performance.now()) {
    return Math.max(0, (energy.read(now) - ENERGY.base) / (1 - ENERGY.base))
  },
}

/** The hero's scroll progress, 0..1 (src/hero/transition.ts writes it on every scroll update). */
export const heroScroll = { p: 0 }
