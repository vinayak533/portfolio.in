/**
 * The hero's one musical clock: 96 BPM, four beats to the bar. The robot hears
 * the beat in its headphones; everything that grooves (the head bob, the foot,
 * the chest core, the headphone rings, the equaliser, the floor ripple, the
 * beam) reads its phase from here, so the scene moves as one. Nothing plays.
 *
 * Not running until the music "starts" (the engine starts it once the screen
 * has powered on, after the load sequence), and stopped for reduced motion.
 * Wall-clock based: a hidden tab simply comes back later in the song.
 */

export const BPM = 96
/** One beat, seconds (625 ms). */
export const BEAT = 60 / BPM
export const BAR = 4

export interface BeatSample {
  /** The music is playing. */
  on: boolean
  /** Beats since the start (fractional). */
  t: number
  /** Whole beats since the start. */
  index: number
  /** 0..1 through the current beat. */
  phase: number
  /** 0..3: which beat of the bar (0 = the downbeat). */
  inBar: number
  /** Whole bars since the start. */
  bar: number
  /** Seconds since the last beat. */
  since: number
  /** A pulse on every beat: 1 on the beat, decaying over ~300 ms (0 when off). */
  pulse: number
}

let startedAt: number | null = null
const listeners = new Set<() => void>()

export const beat = {
  start(at = performance.now()) {
    if (startedAt !== null) return
    startedAt = at
    listeners.forEach((fn) => fn())
  },
  stop() {
    if (startedAt === null) return
    startedAt = null
    listeners.forEach((fn) => fn())
  },
  get running() {
    return startedAt !== null
  },
  on(fn: () => void) {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  },
  sample(now = performance.now(), out: BeatSample = emptySample()): BeatSample {
    if (startedAt === null) {
      out.on = false
      out.t = out.phase = out.since = out.pulse = 0
      out.index = out.inBar = out.bar = 0
      return out
    }
    const t = Math.max(0, (now - startedAt) / 1000 / BEAT)
    out.on = true
    out.t = t
    out.index = Math.floor(t)
    out.phase = t - out.index
    out.inBar = out.index % BAR
    out.bar = Math.floor(out.index / BAR)
    out.since = out.phase * BEAT
    out.pulse = Math.exp(-out.since / 0.11)
    return out
  },
}

export function emptySample(): BeatSample {
  return { on: false, t: 0, index: 0, phase: 0, inBar: 0, bar: 0, since: 0, pulse: 0 }
}

/** Cheap deterministic hash, 0..1 (column heights, keystrokes). */
export function hash1(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
