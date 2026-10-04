import Lenis from 'lenis'
import { onTick, ScrollTrigger, damp } from './clock'
import { signals, useStore } from '../store/useStore'
import { sections } from '../content'

let lenis: Lenis | null = null
let lastY = 0

export function getLenis() {
  return lenis
}

/** Lenis smooth scroll, slaved to the GSAP ticker and feeding ScrollTrigger. */
export function initScroll(smooth: boolean) {
  if (smooth) {
    lenis = new Lenis({
      duration: 1.35,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.4,
      autoRaf: false,
    })
    lenis.on('scroll', ScrollTrigger.update)
  }

  const stopTick = onTick((time, dt) => {
    lenis?.raf(time * 1000)
    const y = window.scrollY
    const vh = window.innerHeight || 1
    const raw = dt > 0 ? (y - lastY) / vh / dt : 0
    lastY = y
    signals.velocity = damp(signals.velocity, raw, 6, dt)

    // Global camera parameter: index of the last section that has started + its progress.
    let t = 0
    sections.forEach((s, i) => {
      const p = signals.progress[s.id]
      if (p > 0) t = i + p
    })
    signals.t = t
  }, -100)

  return () => {
    stopTick()
    lenis?.destroy()
    lenis = null
  }
}

export function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduced = useStore.getState().reducedMotion
  if (lenis && !reduced) lenis.scrollTo(el, { duration: 2.2, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) })
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
}

export function scrollToY(y: number, immediate = false) {
  if (lenis) lenis.scrollTo(y, { duration: 1.6, immediate })
  else window.scrollTo({ top: y, behavior: immediate ? 'auto' : 'smooth' })
}

export function lockScroll(locked: boolean) {
  if (!lenis) {
    document.documentElement.style.overflow = locked ? 'hidden' : ''
    return
  }
  if (locked) lenis.stop()
  else lenis.start()
}
