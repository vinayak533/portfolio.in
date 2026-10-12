import { useStore } from '../store/useStore'

/**
 * Lite rendering is never a choice the visitor has to make: it switches itself on. Full quality by
 * default; lite from the start for reduced motion or a low-end device (4 cores or fewer, or 4 GB of
 * memory or less, where the browser says), and later if the page cannot hold 40 frames a second for
 * 3 seconds running once the load sequence is over. Only ever on: it never flips back (no oscillation).
 * Everything that read the old switch reads the same `lite` flag in the store.
 */

/** Below this frame rate (fps), for this long (ms), the page goes lite. */
const FLOOR = 40
const SPAN = 3000
/** Frame rate is judged per bucket (ms). */
const BUCKET = 500
/** After the loader has gone: the hero's load sequence (Hud.tsx fades the header in at 3.2 s) and its shader warm-up. */
const SETTLE = 5000

export function isLowEndDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency
  const mem = nav.deviceMemory
  return (typeof cores === 'number' && cores > 0 && cores <= 4) || (typeof mem === 'number' && mem > 0 && mem <= 4)
}

/** The flag at start-up (main.tsx), before first paint. */
export function initialLite(reducedMotion: boolean): boolean {
  // The old switch's stored choice no longer applies.
  try {
    localStorage.removeItem('lattice:lite')
  } catch {
    /* storage unavailable */
  }
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('lite')) return true
  return reducedMotion || isLowEndDevice()
}

/** Watches the frame rate once the page has loaded (WebGL only) and turns lite on if it stays low. */
export function watchFrameRate(): () => void {
  // Development only: ?hq holds quality (captures on slow machines), as the hero engine's governor does.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('hq')) return () => {}
  let raf = 0
  let timer = 0
  let last = 0
  let bucketMs = 0
  let bucketFrames = 0
  let below = 0

  const stop = () => {
    cancelAnimationFrame(raf)
    window.clearTimeout(timer)
    raf = 0
    document.removeEventListener('visibilitychange', onVisibility)
  }

  const tick = (now: number) => {
    raf = 0
    const s = useStore.getState()
    if (s.lite || s.mode !== 'webgl') return stop()
    const dt = last ? now - last : 0
    last = now
    // A hidden tab or a stall far longer than any frame (a debugger, a sleep) is not a frame rate.
    if (dt > 0 && dt < 1000) {
      bucketMs += dt
      bucketFrames++
      if (bucketMs >= BUCKET) {
        const fps = (1000 * bucketFrames) / bucketMs
        below = fps < FLOOR ? below + bucketMs : 0
        bucketMs = bucketFrames = 0
        if (below >= SPAN) {
          useStore.getState().set({ lite: true })
          return stop()
        }
      }
    }
    raf = requestAnimationFrame(tick)
  }

  const onVisibility = () => {
    // Coming back from a hidden tab: start the count again.
    last = bucketMs = bucketFrames = below = 0
    if (!document.hidden && !raf && timer === -1) raf = requestAnimationFrame(tick)
  }

  const begin = () => {
    timer = -1
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(tick)
  }

  const unsub = useStore.subscribe((s, prev) => {
    if (s.loaded && !prev.loaded) timer = window.setTimeout(begin, SETTLE)
  })
  if (useStore.getState().loaded) timer = window.setTimeout(begin, SETTLE)

  return () => {
    unsub()
    stop()
  }
}
