/**
 * The hero's stage behind the robot: the loss landscape (terrain.ts), the ground the dais stands on, and
 * the few things the CSS layers (hero.css) cannot do alone:
 *
 *   wash      the laptop's glow spilling onto the floor at its side (#7C5CFF at under 10%), on one
 *             small static canvas (.hero-dots) under the beam
 *   beam      its light pulses on every beat (+-8%, a smooth ease-in-out swell, peaking on the beat)
 *   pointer   desktop only: an eased parallax (--hero-px / --hero-py on the host, -1..1, a 200 ms
 *             response), which the landscape shifts against
 *
 * The orbit rings, the equaliser and the commit pulse are the robot's own (3D, so the furniture can hide
 * what passes behind it): model.ts.
 *
 * Positions come from the robot engine's layout (dom.ts stageFrame), so every layer lines up with the
 * figure; without it, from the CSS defaults' formulas.
 *
 * Idle: [data-idle] on the host while the tab is hidden, the hero is off screen or its backdrop has faded
 * out (hero.css pauses its animations, and this loop stops). Lite (automatic, src/core/autoLite.ts) and
 * reduced motion: still, no parallax.
 */
import { stageFrame, type StageFrame } from './dom'
import { beat, emptySample } from './beat'
import { mountTerrain, type TerrainHandle } from './terrain'

const VIOLET = '124,92,255'
/** Parallax easing rate (1/s): a 200 ms time constant. */
const EASE = 5

export interface StageHandle {
  dispose(): void
}

export function mountStage(host: HTMLElement): StageHandle {
  const parent = host.querySelector<HTMLElement>('.hero-scene__in') ?? host
  const canvas = document.createElement('canvas')
  canvas.className = 'hero-dots'
  canvas.setAttribute('aria-hidden', 'true')
  // Under the beam's light, the floor pool and the robot.
  parent.insertBefore(canvas, parent.querySelector('.hero-beam'))
  const ctx = canvas.getContext('2d')

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  const beamLight = host.querySelector<HTMLElement>('.hero-beam__light')
  const beatNow = emptySample()
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1025px)')
  const hero = host.closest<HTMLElement>('#hero')
  /** The landscape's lite (automatic lite, or a software renderer; phones have their own profile). */
  const lite = () => !!host.closest('[data-lite-landscape]')
  /** The backdrop's fade as About's world comes through (engine.ts writes it inline on the host). */
  const backdrop = () => {
    const v = parseFloat(host.style.getPropertyValue('--robot-bg'))
    return Number.isFinite(v) ? v : 1
  }

  let W = 1
  let H = 1
  let F: StageFrame = fallbackFrame(1, 1)
  let terrain: TerrainHandle | null = null

  /** The screen's glow on the floor beside it: drawn once per size. */
  function drawWash() {
    if (!ctx) return
    // A soft gradient: a quarter of the pixels is plenty (the browser scales it up), and saves the memory.
    const dpr = 0.5
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (!F.screen) return
    const cx = F.screen.x
    const cy = Math.min(H - 8, F.daisY + F.daisH * 0.15)
    const rx = F.screen.w * 1.6
    const ry = Math.max(24, F.daisH * 0.8)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, ry / rx)
    const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
    wash.addColorStop(0, `rgba(${VIOLET},0.09)`)
    wash.addColorStop(0.5, `rgba(${VIOLET},0.035)`)
    wash.addColorStop(1, `rgba(${VIOLET},0)`)
    ctx.fillStyle = wash
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2)
    ctx.restore()
  }

  function size() {
    W = Math.max(1, host.clientWidth)
    H = Math.max(1, host.clientHeight)
    F = stageFrame.get() ?? fallbackFrame(W, H)
    drawWash()
    terrain?.resize()
  }

  // ---- pointer: the parallax (eased)

  const aim = { x: 0, y: 0 }
  const at = { x: 0, y: 0 }
  let written = ''
  const pointerFx = () => finePointer.matches && !lite() && !reduced.matches
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    aim.x = (e.clientX / window.innerWidth) * 2 - 1
    aim.y = (e.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener('pointermove', onMove, { passive: true })

  function parallax(dt: number) {
    const on = pointerFx()
    const k = 1 - Math.exp(-EASE * dt)
    at.x += ((on ? aim.x : 0) - at.x) * k
    at.y += ((on ? aim.y : 0) - at.y) * k
    write()
  }
  function write() {
    const key = `${at.x.toFixed(3)},${at.y.toFixed(3)}`
    if (key === written) return
    written = key
    host.style.setProperty('--hero-px', at.x.toFixed(3))
    host.style.setProperty('--hero-py', at.y.toFixed(3))
  }

  function pulseBeam() {
    beat.sample(performance.now(), beatNow)
    const still = reduced.matches || lite()
    // The beam swells with every beat, +-8% about 92% (a cosine: eased in and out, full on the beat). No flicker.
    const v = still || !beatNow.on ? -1 : 0.92 + 0.08 * Math.cos(beatNow.phase * Math.PI * 2)
    // Only when it has moved visibly (the beam is masked: each change repaints it).
    if (!beamLight || Math.abs(v - beamShown) < 0.008) return
    beamShown = v
    beamLight.style.opacity = v < 0 ? '' : v.toFixed(3)
  }
  let beamShown = -2

  // ---- the loop: only while the hero can be seen

  let onScreen = true
  let disposed = false
  let raf = 0
  let last = 0
  const moving = () => !reduced.matches && !lite() && onScreen && !document.hidden && backdrop() > 0.01

  function tick(now: number) {
    raf = 0
    if (!moving()) return idle()
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0)
    // Phones and touch screens (no parallax): the beam's pulse alone, at ~20 frames a second.
    const fine = pointerFx()
    if (fine || !last || now - last >= 48) {
      last = now
      // (Easing any leftover offset back to rest, if the pointer went away.)
      if (fine || at.x || at.y) parallax(dt)
      pulseBeam()
    }
    raf = requestAnimationFrame(tick)
  }

  function idle() {
    host.toggleAttribute('data-idle', !onScreen || document.hidden || backdrop() <= 0.01)
    // Still (lite, reduced motion): the parallax let go, the beam steady.
    if (reduced.matches || lite()) {
      at.x = at.y = 0
      write()
      beamLight?.style.removeProperty('opacity')
      return
    }
    // The backdrop fading out is the scroll: check again soon, cheaply, without drawing.
    if (onScreen && !document.hidden) setTimeout(wake, 250)
  }

  function wake() {
    if (disposed) return
    if (!moving()) return idle()
    host.removeAttribute('data-idle')
    if (!raf) {
      last = 0
      raf = requestAnimationFrame(tick)
    }
  }

  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting
    wake()
  })
  io.observe(host)
  const ro = new ResizeObserver(size)
  ro.observe(host)
  // The engine's layout lands after the first paint (and moves on resize): rebuild to match it.
  const offFrame = stageFrame.on(() => size())
  const mo = new MutationObserver(wake)
  if (hero) mo.observe(hero, { attributes: true, attributeFilter: ['data-lite-landscape'] })
  document.addEventListener('visibilitychange', wake)
  reduced.addEventListener('change', wake)
  // The loss landscape, farthest back (terrain.ts): its own canvas and loop.
  terrain = mountTerrain(host, parent, () => F)
  size()
  wake()

  return {
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      raf = 0
      io.disconnect()
      ro.disconnect()
      mo.disconnect()
      offFrame()
      document.removeEventListener('visibilitychange', wake)
      reduced.removeEventListener('change', wake)
      window.removeEventListener('pointermove', onMove)
      host.removeAttribute('data-idle')
      beamLight?.style.removeProperty('opacity')
      host.style.removeProperty('--hero-px')
      host.style.removeProperty('--hero-py')
      terrain?.dispose()
      canvas.remove()
    },
  }
}

/** The stage frame the CSS defaults describe (hero.css .hero-stage), for the still robot. */
function fallbackFrame(W: number, H: number): StageFrame {
  const phone = W < 768
  const daisY = H * (phone ? 0.66 : 0.72)
  const robotH = daisY - H * (phone ? 0.16 : 0.15)
  return {
    x: W / 2,
    topY: daisY - robotH,
    chestY: daisY - robotH * 0.5,
    daisY,
    daisW: robotH * 1.4,
    daisH: robotH * 0.3,
    robotH,
  }
}
