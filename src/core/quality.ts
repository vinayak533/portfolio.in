import type { Quality } from '../store/useStore'

export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    const ok = !!ctx
    ctx?.getExtension('WEBGL_lose_context')?.loseContext()
    return ok
  } catch {
    return false
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 && window.innerWidth < 1024
}

/** Unmasked GPU name, when the browser exposes it. */
export function gpuName(): string {
  try {
    const c = document.createElement('canvas')
    const g = c.getContext('webgl2')
    if (!g) return ''
    const ext = g.getExtension('WEBGL_debug_renderer_info')
    const name = String(ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER))
    g.getExtension('WEBGL_lose_context')?.loseContext()
    return name
  } catch {
    return ''
  }
}

/** First-guess tier. The PerformanceMonitor refines DPR at runtime. */
export function detectQuality(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const mem = nav.deviceMemory ?? 8
  const gpu = gpuName()
  if (isTouchDevice() || window.innerWidth < 760) return 'low'
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 'low'
  // Integrated / mobile-class GPUs are fill-rate bound: keep them on the mid tier.
  if (/intel|uhd|iris|mali|adreno|powervr|radeon\(tm\) graphics|vega \d+ graphics/i.test(gpu)) return 'mid'
  if (cores <= 4 || mem <= 4) return 'mid'
  return 'high'
}

export const tier = {
  high: { particles: 56000, dust: 2600, maxDpr: 2, startDpr: 2, minDpr: 1, msaa: 4, ca: true, bloomLevels: 7 },
  // Integrated GPUs share their fill rate with the hero canvas: 1x at most, no chromatic aberration (an extra full-res pass).
  mid: { particles: 30000, dust: 1600, maxDpr: 1, startDpr: 1, minDpr: 0.85, msaa: 0, ca: false, bloomLevels: 5 },
  low: { particles: 14000, dust: 900, maxDpr: 1, startDpr: 1, minDpr: 0.75, msaa: 0, ca: false, bloomLevels: 5 },
} as const
