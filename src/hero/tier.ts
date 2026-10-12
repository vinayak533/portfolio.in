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
 * per-layer ladders adapt (terrain.ts, engine.ts: shed one feature at a time when frames run over 24 ms
 * for 3 s), so the tier is only ever stepped down, never up. Never the robot's head or eyes.
 */
import { gpuName, isTouchDevice } from '../core/quality'
import { isLowEndDevice } from '../core/autoLite'

export type HeroTier = 'high' | 'medium' | 'low'

export const TIER_ORDER: HeroTier[] = ['high', 'medium', 'low']

/** Per-tier settings read by the landscape (terrain.ts) and the robot (engine.ts). */
export const TIERS = {
  high: { budget: Infinity, terrainDpr: 1.25, robotDpr: 2, waves: 1, flank: true, comets: true, wake: 'pointer', fps: 60, dof: true },
  medium: { budget: 100 * 60, terrainDpr: 1.25, robotDpr: 1.5, waves: 0.7, flank: true, comets: true, wake: 'touch', fps: 60, dof: false },
  low: { budget: 80 * 48, terrainDpr: 1, robotDpr: 1.25, waves: 0, flank: false, comets: false, wake: 'none', fps: 30, dof: false },
} as const

/** The live ladder's threshold: frames averaging over this (ms) for this long (ms) shed one feature. */
export const SLOW_FRAME = { ms: 24, span: 3000 }

/** The start-up probe: how long it measures (ms), after how long the scene has been live (ms). */
const PROBE = { ms: 1500, after: 3200 }

type Connection = { saveData?: boolean; effectiveType?: string }

function connection(): Connection {
  return (navigator as Navigator & { connection?: Connection }).connection ?? {}
}

/** The tier the device's own signals point to (before any frame has been measured). */
export function initialHeroTier(reducedMotion: boolean): HeroTier {
  if (import.meta.env.DEV) {
    const forced = new URLSearchParams(location.search).get('tier')
    if (forced === 'high' || forced === 'medium' || forced === 'low') return forced
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
    if (avg > SLOW_FRAME.ms) set(lower(get()))
  }
  timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), PROBE.after)
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
  }
}
