/**
 * The hero's quality tier: HIGH, MEDIUM or LOW, chosen automatically (there is no switch).
 *
 *   HIGH     desktops: every layer as designed.
 *   MEDIUM   tablets and modern phones: a 100 x 60 landscape grid, a 1.5 pixel-ratio cap on the robot, no
 *            depth of field, no shadow map or floor reflection (the blob shadow stays), the glow cards
 *            standing in for bloom, both wave families at 70%, comets on, and the pointer's wake only as
 *            tap ripples.
 *   LOW      low-end phones, Save-Data, a slow connection, a draining battery, a software renderer or a
 *            failed probe: an 80 x 48 grid at a pixel ratio of 1, no waves (the descent agent, its landing
 *            ring and the beam's pulse stay), no comets, 30 frames a second, and a static glow for the
 *            laptop's screen.
 *
 * Start-up picks from what the device says about itself (cores, memory, connection, pointer, width, GPU
 * name); a 1.5 s frame-time probe once the hero is live can step it down one tier. After that only the
 * per-layer ladders adapt (terrain.ts, engine.ts: shed one feature at a time when frames run over budget
 * for 2 s, overBudget; far over, an even 30 first, clock.ts), so the tier is only ever stepped down, never up. Never the robot's head or eyes.
 */
import { gpuName, isTouchDevice } from '../core/quality'
import { pacing, refreshesPerFrame } from '../core/clock'
import { isLowEndDevice } from '../core/autoLite'
import { FROZEN } from './freeze'
import { PERF_LAB, labOff } from '../core/perfLab'

export type HeroTier = 'high' | 'medium' | 'low'

export const TIER_ORDER: HeroTier[] = ['high', 'medium', 'low']

/** Per-tier settings read by the landscape (terrain.ts) and the robot (engine.ts). */
export const TIERS = {
  high: { budget: Infinity, terrainDpr: 1.25, robotDpr: 2, waves: 1, flank: true, comets: true, wake: 'pointer', fps: 60, dof: true },
  medium: { budget: 100 * 60, terrainDpr: 1.25, robotDpr: 1.5, waves: 0.7, flank: true, comets: true, wake: 'touch', fps: 60, dof: false },
  low: { budget: 80 * 48, terrainDpr: 1, robotDpr: 1.25, waves: 0, flank: false, comets: false, wake: 'none', fps: 30, dof: false },
} as const

/** The start-up probe's threshold (ms per frame), and the live ladder's window (ms). */
export const SLOW_FRAME = { ms: 24, span: 2000 }

/**
 * The live ladder's budget: frames averaging more than 12% over the paced interval (clock.ts) for a window
 * shed one feature. At 60 Hz that is under ~54 frames a second (under ~27 once locked to 30): a device that
 * cannot hold 60 sheds the least visible features, then locks to an even 30, never hovering in between.
 */
export const overBudget = (avgMs: number, locked = pacing.locked) => avgMs > ((refreshesPerFrame(locked) * 1000) / pacing.hz) * 1.12

/**
 * A drawn frame that missed its paced slot (a refresh late or more). More than JITTER of a window's frames late
 * counts as over budget too, whatever the average: a device whose frames average just inside the interval but
 * keep missing it hovers between cadences, and sheds a step (or locks) like one that is slow.
 */
export const lateFrame = (ms: number, locked = pacing.locked) => ms > ((refreshesPerFrame(locked) * 1000) / pacing.hz) * 1.4
export const JITTER = 0.1

/** The start-up probe: how long it measures (ms), after how long the scene has been live (ms). */
const PROBE = { ms: 1500, after: 3200 }

type Connection = { saveData?: boolean; effectiveType?: string }

function connection(): Connection {
  return (navigator as Navigator & { connection?: Connection }).connection ?? {}
}

/** The tier the device's own signals point to (before any frame has been measured). */
export function initialHeroTier(reducedMotion: boolean): HeroTier {
  // ?tier= forces one in development, and with ?freeze (the baselines), where it defaults to HIGH.
  if (PERF_LAB || FROZEN) {
    const forced = new URLSearchParams(location.search).get('tier')
    if (forced === 'high' || forced === 'medium' || forced === 'low') return forced
    if (FROZEN) return 'high'
  }
  const c = connection()
  if (reducedMotion || c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g') return 'low'
  if (isLowEndDevice()) return 'low'
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpuName())) return 'low'
  if (isTouchDevice() || window.innerWidth <= 1024 || c.effectiveType === '3g') return 'medium'
  return 'high'
}

/** Step down one tier (never up). */
export function lower(t: HeroTier): HeroTier {
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(t) + 1)]
}

/**
 * The asynchronous checks: battery saver (a draining battery under 20%, where the browser says) and the
 * 1.5 s frame-time probe once the hero has been live for a moment. Each may step the tier down once.
 * `live` says whether the hero is being drawn (the probe waits for it).
 */
export function watchHeroTier(get: () => HeroTier, set: (t: HeroTier) => void, live: () => boolean) {
  if (FROZEN || labOff('adapt')) return () => {}
  let stopped = false
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; level: number }> }
  nav
    .getBattery?.()
    .then((b) => {
      if (!stopped && !b.charging && b.level < 0.2 && get() !== 'low') set('low')
    })
    .catch(() => {})

  if (import.meta.env.DEV && new URLSearchParams(location.search).has('tier')) return () => void (stopped = true)

  let raf = 0
  let timer = 0
  let start = 0
  let last = 0
  let frames = 0
  const tick = (now: number) => {
    raf = 0
    if (stopped) return
    if (!live() || document.hidden) {
      // Not being drawn (scrolled away, a hidden tab): measure later, from the start.
      start = last = frames = 0
      timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), 1000)
      return
    }
    if (!start) start = now
    else frames++
    last = now
    if (now - start < PROBE.ms) {
      raf = requestAnimationFrame(tick)
      return
    }
    const avg = (last - start) / Math.max(1, frames)
    // Under ~28 frames a second even the even 30 will not hold: a tier down. Far over the budget short of that
    // (under ~40): the even 30 (clock.ts), every feature of the tier kept. A little over is the live ladder's.
    if (avg > SLOW_FRAME.ms * 1.5) set(lower(get()))
    else if (overBudget(avg / 1.35, false)) pacing.locked = true
  }
  timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), PROBE.after)
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
  }
}
