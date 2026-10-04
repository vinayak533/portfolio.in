/**
 * The one clock. GSAP's ticker is the only requestAnimationFrame loop on the
 * page: Lenis, ScrollTrigger, the WebGL frame and every DOM tween advance from
 * it, so nothing can drift out of phase.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { CustomEase } from 'gsap/CustomEase'

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
  for (let i = 0; i < ordered.length; i++) ordered[i].fn(time, delta)
})

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
