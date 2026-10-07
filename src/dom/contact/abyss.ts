/**
 * Contact's light: one soft bioluminescent lamp that follows the pointer like a
 * torch in deep water, and a few specks of marine snow sinking past it.
 *
 * The lamp is a color-dodge layer over the page, so dim type brightens inside
 * it and the dark stays dark. Everything moves by transform; positions are read
 * once at the start of a frame and written after. One subscriber on the shared
 * ticker, running only while the section is on screen and the tab is visible.
 */
import { damp, onTick, smoothstep } from '../../core/clock'
import { signals } from '../../store/useStore'

export interface AbyssOptions {
  /** No pointer: the lamp drifts on its own and pulses where a link is tapped. */
  touch: boolean
  /** Reduced motion: a static lamp near the anchor, no loop, no specks. */
  still: boolean
  /** Where the lamp rests before the pointer arrives (and stays when still). */
  anchor: () => HTMLElement | null
}

interface Speck {
  x0: number
  y: number
  r: number
  a: number
  vy: number
  amp: number
  f: number
  ph: number
}

/** Per-frame lerp at 60fps, made frame-rate independent below. */
const FOLLOW = 0.08

/** Deterministic PRNG so the snow looks the same on every visit. */
function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createAbyss(
  root: HTMLElement,
  lamp: HTMLElement,
  glow: HTMLElement,
  canvas: HTMLCanvasElement | null,
  opts: AbyssOptions,
) {
  const ctx = canvas?.getContext('2d') ?? null
  const rand = mulberry(0xab55)
  const pos = { x: 0, y: 0 }
  const target = { x: 0, y: 0 }
  const tap = { x: 0, y: 0 }
  const specks: Speck[] = []

  let w = 1
  let h = 1
  let dpr = 1
  let clock = 0
  let placed = false
  let want = false
  let stop: (() => void) | null = null

  let cover = 1
  let lit = 0
  let litTarget = 0
  let boost = 0
  let boostTarget = 0
  let pulse = 0
  let tapHold = 0
  let focus: HTMLElement | null = null
  let focusAt = 0

  function measure() {
    const r = root.getBoundingClientRect()
    w = Math.max(1, r.width)
    h = Math.max(1, r.height)
    if (canvas && ctx) {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    if (ctx && !specks.length) {
      const n = w < 768 ? 20 : 26
      for (let i = 0; i < n; i++) {
        specks.push({
          x0: rand() * w,
          y: rand() * h,
          r: 0.5 + rand() * 0.9,
          a: 0.07 + rand() * 0.16,
          vy: 3 + rand() * 7,
          amp: 2 + rand() * 7,
          f: 0.05 + rand() * 0.1,
          ph: rand() * Math.PI * 2,
        })
      }
    }
  }

  function anchorPoint(r: DOMRect) {
    const a = opts.anchor()
    if (!a) return { x: w * 0.3, y: h * 0.55 }
    const b = a.getBoundingClientRect()
    return { x: b.left - r.left + Math.min(b.width, 360) * 0.5, y: b.top - r.top + b.height * 0.5 }
  }

  function write() {
    const t = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) scale(${(1 + pulse * 0.3).toFixed(3)})`
    lamp.style.transform = t
    glow.style.transform = t
    // The lamp only switches on once the dark has fully settled behind the page.
    const gate = smoothstep(0.85, 1, cover) * lit
    lamp.style.opacity = Math.min(1, gate * (0.84 + 0.16 * boost + 0.16 * pulse)).toFixed(3)
    glow.style.opacity = Math.min(1, gate * (0.7 + 0.3 * boost + 0.3 * pulse)).toFixed(3)
  }

  function drawSnow(dt: number) {
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgb(214 208 255)'
    for (const s of specks) {
      s.y += s.vy * dt
      if (s.y > h + 4) {
        s.y = -4
        s.x0 = rand() * w
      }
      const x = s.x0 + Math.sin(clock * s.f * Math.PI * 2 + s.ph) * s.amp
      ctx.globalAlpha = s.a
      ctx.beginPath()
      ctx.arc(x, s.y, s.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function tick(_: number, dt: number) {
    clock += dt
    // Reads first, writes last: no forced layout inside the frame.
    const r = root.getBoundingClientRect()
    const p = signals.pointer
    if (focus && p.lastMove > focusAt) focus = null

    if (focus) {
      const b = focus.getBoundingClientRect()
      target.x = b.left - r.left + Math.min(b.width, 360) * 0.5
      target.y = b.top - r.top + b.height * 0.5
    } else if (opts.touch) {
      if (tapHold > 0) {
        tapHold -= dt
        target.x = tap.x
        target.y = tap.y
      } else {
        target.x = w * 0.45 + Math.sin((clock * Math.PI * 2) / 26) * w * 0.3
        target.y = h * 0.5 + Math.sin((clock * Math.PI * 2) / 37 + 1.3) * h * 0.26
      }
    } else if (p.active && p.lastMove > 0) {
      target.x = p.x - r.left
      target.y = p.y - r.top
    }

    if (!placed) {
      const a = anchorPoint(r)
      pos.x = a.x
      pos.y = a.y
      if (!p.active && !opts.touch) Object.assign(target, a)
      placed = true
    }

    const k = 1 - Math.pow(1 - FOLLOW, dt * 60)
    pos.x += (target.x - pos.x) * k
    pos.y += (target.y - pos.y) * k
    lit = damp(lit, litTarget, 1.6, dt)
    boost = damp(boost, boostTarget, 6, dt)
    pulse = damp(pulse, 0, 2.4, dt)

    write()
    drawSnow(dt)
  }

  function placeStill() {
    const a = anchorPoint(root.getBoundingClientRect())
    pos.x = a.x
    pos.y = a.y
    lit = litTarget
    write()
  }

  function sync() {
    const run = want && !document.hidden && !opts.still
    if (run && !stop) stop = onTick(tick)
    else if (!run && stop) {
      stop()
      stop = null
      write()
    }
  }

  const ro = new ResizeObserver(() => {
    measure()
    if (opts.still) placeStill()
  })
  ro.observe(root)
  document.addEventListener('visibilitychange', sync)
  measure()

  return {
    /** Section on screen (the loop also pauses on its own while the tab is hidden). */
    setRunning(on: boolean) {
      want = on
      sync()
    },
    /** 0..1 how opaque the dark behind the page is (the WebGL hand-off). */
    setCover(c: number) {
      cover = c
      if (!stop) write()
    },
    setLit(on: boolean) {
      litTarget = on ? 1 : 0
      if (opts.still) placeStill()
    },
    /** Hovering the address: the lamp brightens a little. */
    setBoost(on: boolean) {
      boostTarget = on ? 1 : 0
    },
    /** Keyboard focus: the lamp swims to the focused element until the pointer moves again. */
    focusOn(el: HTMLElement) {
      if (opts.still) return
      focus = el
      focusAt = performance.now()
    },
    /** Touch: the lamp goes to the tapped link and pulses once. */
    tapAt(clientX: number, clientY: number) {
      if (opts.still) return
      const r = root.getBoundingClientRect()
      tap.x = clientX - r.left
      tap.y = clientY - r.top
      tapHold = 1.6
      pulse = 1
    },
    destroy() {
      want = false
      sync()
      ro.disconnect()
      document.removeEventListener('visibilitychange', sync)
    },
  }
}

export type Abyss = ReturnType<typeof createAbyss>
