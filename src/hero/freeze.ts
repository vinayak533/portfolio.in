/**
 * ?freeze=1: the hero's visual-regression frame (scripts/hero-baseline.mjs). Every hero clock and agent is
 * held still (the engine, the landscape and the stage take their reduced-motion composition, without
 * blinks), Math.random is seeded so every arrangement is the same on every run, and the tier is pinned
 * (?tier=, else HIGH) with no probe, governor or automatic lite. Harmless in production: it only stops
 * motion. Imported first by main.tsx, so the seed is in place before anything draws a number.
 */
export const FROZEN = new URLSearchParams(location.search).has('freeze')

/** mulberry32: small, fast, and the same sequence on every engine. */
export function seeded(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A layer's own random source: seeded when frozen, so its draws never depend on the order other modules load
 * in (they share Math.random); Math.random otherwise.
 */
export const randomSource = (seed: number) => (FROZEN ? seeded(seed) : Math.random)

if (FROZEN) Math.random = seeded(0x2f6b1a5d)
