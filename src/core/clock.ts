/**
 * The one clock. GSAP's ticker is the only requestAnimationFrame loop on the
 * page: Lenis, ScrollTrigger, the WebGL frame and every DOM tween advance from
 * it, so nothing can drift out of phase.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { CustomEase } from 'gsap/CustomEase'
import { labNumber, labOff } from './perfLab'

gsap.registerPlugin(ScrollTrigger, SplitText, CustomEase)
gsap.ticker.lagSmoothing(0)
gsap.defaults({ ease: 'expo.out', duration: 0.9 })

type TickFn = (time: number, delta: number) => void
const subscribers = new Set<{ fn: TickFn; priority: number }>()
let ordered: { fn: TickFn; priority: number }[] = []

/** Lower priority runs first. Returns an unsubscribe function. */
export function onTick(fn: TickFn, priority = 0) {
  const entry = { fn, priority }
  subscribers.add(entry)
  ordered = [...subscribers].sort((a, b) => a.priority - b.priority)
  return () => {
    subscribers.delete(entry)
    ordered = [...subscribers].sort((a, b) => a.priority - b.priority)
  }
}

gsap.ticker.add((time, deltaMs) => {
  const delta = Math.min(deltaMs / 1000, 1 / 20)
  if (deltaMs > 0 && deltaMs < 100) sampleRefresh(deltaMs)
  for (let i = 0; i < ordered.length; i++) ordered[i].fn(time, delta)
})

/**
 * WebGL frame pacing. Every WebGL loop on the page (the hero's robot and landscape, the sections' stage)
 * draws at the display's refresh rate up to about 60 frames a second, on whole refreshes so the cadence is
 * even: 60 Hz to 100 Hz screens draw every refresh, 120 Hz every 2nd (60), 144 Hz every 2nd (72: the even
 * cadence nearest 60), 165 Hz every 3rd (55), 240 Hz every 4th. `locked` (the last step of the hero's
 * quality ladder, and LOW) holds an even ~30 instead: every 2nd refresh at 60 Hz, 4th at 120, 5th at 144.
 * The DOM (scrolling, tweens) still runs on every refresh; motion is delta-time based, so speeds never change.
 */
export const pacing = { hz: 60, locked: false }

/** The standard refresh rates the measurement snaps to. */
const RATES = [48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240]
const deltas = new Float32Array(90)
let deltaN = 0
/** The refresh rate from the ticker's fastest frames (the 10th percentile of 90): busy frames only ever run long. */
function sampleRefresh(ms: number) {
  deltas[deltaN++ % deltas.length] = ms
  if (deltaN % deltas.length || forcedHz) return
  const sorted = Array.from(deltas).sort((a, b) => a - b)
  const raw = 1000 / sorted[Math.floor(sorted.length * 0.1)]
  const snapped = RATES.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a))
  pacing.hz = Math.abs(snapped - raw) / raw < 0.08 ? snapped : Math.round(raw)
}
/** The performance lab can stand in for a display (?hz=120: as if each refresh were one of 120 a second). */
const forcedHz = Number(new URLSearchParams(import.meta.env.DEV || import.meta.env.VITE_PERF_LAB === '1' ? location.search : '').get('hz')) || 0
if (forcedHz) pacing.hz = forcedHz
/** And hold the even 30 from the start (?lock=1). */
if (labNumber('lock') === 1) pacing.locked = true

/** Refreshes per WebGL frame. */
export function refreshesPerFrame(locked = pacing.locked) {
  const hz = pacing.hz
  if (locked) return Math.max(1, Math.round(hz / 30))
  return hz <= 100 ? 1 : Math.ceil(hz / 75)
}

/**
 * A pacer for one loop: true when that loop should draw this frame. Every loop at the same cadence gets the same
 * answer in a frame (it is decided once per frame, keyed by the frame's own time), so at 30 the robot, the
 * landscape and the sections all draw on one refresh and leave the next one free, rather than taking turns and
 * crowding both. Half a refresh of slack, so a frame that arrives a little early still counts. `locked`
 * overrides the shared lock (LOW, a resting docked head). (`now` is the caller's clock, used where the frame's
 * own time is not available.)
 */
export function createPacer() {
  if (labOff('sharedpace')) {
    // The performance lab's revert: each loop paced on its own clock.
    let last = -Infinity
    return (now: number, locked = pacing.locked) => {
      if (now - last < (refreshesPerFrame(locked) - 0.5) * (1000 / pacing.hz)) return false
      last = now
      return true
    }
  }
  return (now: number, locked = pacing.locked) => frameDue(refreshesPerFrame(locked), now)
}
const cadences = new Map<number, { at: number; due: boolean; last: number }>()
function frameDue(n: number, now: number) {
  const t = (document.timeline?.currentTime as number | null) ?? now
  let c = cadences.get(n)
  if (!c) cadences.set(n, (c = { at: NaN, due: false, last: -Infinity }))
  if (c.at !== t) {
    c.at = t
    c.due = t - c.last >= (n - 0.5) * (1000 / pacing.hz)
    if (c.due) c.last = t
  }
  return c.due
}

export { gsap, ScrollTrigger, SplitText }

/** Frame-rate independent exponential damping. */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-lambda * dt))

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const remap = (v: number, a: number, b: number) => clamp((v - a) / (b - a))
export const smoothstep = (a: number, b: number, v: number) => {
  const t = remap(v, a, b)
  return t * t * (3 - 2 * t)
}
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))
