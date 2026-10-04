/**
 * Hero -> About scroll transition controller.
 *
 * One scrubbed ScrollTrigger (one master timeline) owns the whole sequence.
 * The hero track is a tall section with a sticky stage (the "pin"); About is
 * laid out so its top sits exactly where the pin releases, underneath the
 * stage. Progress 0..1 drives everything, so scrolling back replays it:
 *
 *   0 .. hold     HOLD    idle hero, the screen glow pulses a little harder
 *   .. dive       DIVE    shader zoom into the laptop with depth parallax
 *   .. portal     PORTAL  the screen opens; the canvas turns transparent there
 *                         and About's own world shows through, settling to scale 1
 *   .. 1          ARRIVE  the stage fades out, the render loop stops, pin releases
 *
 * The visuals live in the engine (engine.ts reads config.transition); this file
 * only does scroll, DOM and loop control. Reduced motion / static mode gets a
 * 400 ms crossfade instead.
 */
import { gsap, ScrollTrigger, easeInOutCubic, onTick, remap, smoothstep } from '../core/clock'
import { getLenis } from '../core/scroll'
import { signals, useStore } from '../store/useStore'
import { heroConfig as cfg, MOBILE_QUERY, transitionProfile } from './config'
import type { HeroHandle } from './engine'

/** Live state for the ?debug panel: `freeze` holds the transition at `progress`. */
export const transitionDebug = { freeze: false, progress: 0, live: 0, raw: 0 }

export interface TransitionOptions {
  /** The tall scroll track (the hero section). */
  section: HTMLElement
  /** The sticky, full-viewport stage inside it. */
  stage: HTMLElement
  /** The canvas container (.hero-cinematic). */
  host: HTMLElement
  /** Wrapper around About (App.tsx). Only its opacity is touched, never its layout. */
  about: () => HTMLElement | null
  engine: () => HeroHandle | null
  mode: 'webgl' | 'static'
}

export interface TransitionHandle {
  /** Re-apply the current frame (e.g. once the engine has mounted). */
  sync(): void
  /** Re-measure after a pin-length or scrub change. */
  refresh(): void
  destroy(): void
}

/** Live handle for the debug panel. */
export let activeTransition: TransitionHandle | null = null

const INTERACTIVE = 'input, textarea, select, button, a[href], summary, [contenteditable=""], [contenteditable="true"], [role="button"]'

export function createHeroTransition(o: TransitionOptions): TransitionHandle {
  const handle = o.mode === 'webgl' ? webglTransition(o) : crossfade(o)
  activeTransition = handle
  return {
    ...handle,
    destroy() {
      handle.destroy()
      if (activeTransition === handle) activeTransition = null
    },
  }
}

// ------------------------------------------------------------------ webgl

function webglTransition(o: TransitionOptions): TransitionHandle {
  const { section, stage, host } = o
  const proxy = { p: 0 }
  let raw = 0
  let p = 0
  let tl: gsap.core.Timeline | null = null
  let stageCanvas: HTMLElement | null = null

  const setPin = () => section.style.setProperty('--hero-pin', `${transitionProfile().pinVh}vh`)
  setPin()

  /** The About world is the fixed WebGL stage behind <main>: its canvas is the one outside main. */
  const findStageCanvas = () => {
    if (stageCanvas?.isConnected) return stageCanvas
    stageCanvas = Array.from(document.querySelectorAll('canvas')).find((c) => !c.closest('main')) ?? null
    return stageCanvas
  }

  function apply(pv: number) {
    p = pv
    transitionDebug.live = +pv.toFixed(4)
    transitionDebug.raw = +raw.toFixed(4)
    const T = cfg.transition
    const ph = T.phases

    // Engine: visuals are a pure function of p; the loop only runs while the hero can be seen.
    const eng = o.engine()
    eng?.setProgress(pv)
    eng?.setRendering(pv < T.renderUntil)

    // About's world (the fixed stage camera) completes its hero-to-About push
    // behind the opaque hero, so the portal opens onto About's real first frame.
    signals.progress.hero = remap(pv, T.stageMap[0], T.stageMap[1])

    // The canvas has transparent pixels from the moment the portal can open.
    const opening = pv > ph.dive - 0.005
    host.classList.toggle('is-portal', opening)
    stage.style.pointerEvents = opening ? 'none' : ''
    stage.style.setProperty('--hero-cue', String(1 - smoothstep(0, 0.05, pv)))

    // ARRIVE: fade the stage out. Raw scroll wins so a fast fling never leaves it behind.
    const out = remap(Math.max(pv, raw), ph.portal, 1)
    stage.style.opacity = out > 0 ? String(1 - out) : ''
    stage.style.visibility = out >= 1 ? 'hidden' : ''
    stage.style.willChange = out > 0 && out < 1 ? 'opacity' : ''

    // About's DOM slides in beneath the stage during the last screen of the pin;
    // keep it out of the portal until the arrival, then let it land in place.
    const about = o.about()
    if (about) {
      const a = raw >= 1 ? 1 : smoothstep(ph.portal, 1, Math.max(pv, raw))
      about.style.opacity = a >= 1 ? '' : String(a)
      about.style.willChange = a > 0 && a < 1 ? 'opacity' : ''
    }

    // PORTAL: About arrives slightly large and settles to 1 (origin = the screen,
    // which the dive has brought to the centre of the frame).
    const sc = findStageCanvas()
    if (sc) {
      const s = T.portal.settleScale
      const active = s !== 1 && pv > ph.dive - 0.01 && pv < ph.portal
      if (active) {
        const k = 1 - Math.pow(1 - remap(pv, ph.dive, ph.portal), 3)
        sc.style.transform = `scale(${(s + (1 - s) * k).toFixed(5)})`
        sc.style.transformOrigin = '50% 50%'
        sc.style.willChange = 'transform'
      } else if (sc.style.transform) {
        sc.style.transform = ''
        sc.style.transformOrigin = ''
        sc.style.willChange = ''
      }
    }
  }

  function build() {
    tl?.scrollTrigger?.kill()
    tl?.kill()
    const ph = cfg.transition.phases
    tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        // Exactly the sticky distance, so progress 1 is the frame where the pin releases.
        end: () => `+=${Math.max(1, section.offsetHeight - stage.offsetHeight)}`,
        scrub: cfg.transition.scrub,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          raw = self.progress
          if (!transitionDebug.freeze) apply(p)
        },
        onToggle: (self) => {
          if (self.isActive) useStore.getState().set({ section: 'hero' })
        },
      },
    })
    tl.fromTo(
      proxy,
      { p: 0 },
      {
        p: 1,
        duration: 1,
        onUpdate: () => {
          if (!transitionDebug.freeze) apply(proxy.p)
        },
      },
    )
      .addLabel('dive', ph.hold)
      .addLabel('portal', ph.dive)
      .addLabel('arrive', ph.portal)
  }
  build()

  // Debug freeze: hold any frame, regardless of scroll.
  let wasFrozen = false
  const stopTick = onTick(() => {
    if (transitionDebug.freeze) apply(transitionDebug.progress)
    else if (wasFrozen) apply(proxy.p)
    wasFrozen = transitionDebug.freeze
  })

  // PageDown / Space inside the pin play the whole dive and land on the end
  // state; PageUp / Shift+Space from there play it back. Never stuck halfway.
  const onKey = (ev: KeyboardEvent) => {
    if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey) return
    const space = ev.key === ' ' || ev.key === 'Spacebar'
    const down = ev.key === 'PageDown' || (space && !ev.shiftKey)
    const up = ev.key === 'PageUp' || (space && ev.shiftKey)
    if (!down && !up) return
    const target = ev.target as HTMLElement | null
    if (target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
    if (space && target?.closest?.(INTERACTIVE)) return
    const st = tl?.scrollTrigger
    if (!st) return
    const lenis = getLenis()
    const y = lenis ? lenis.targetScroll : window.scrollY
    let to: number
    if (down && y >= st.start - 2 && y < st.end - 2) to = st.end
    else if (up && y > st.start + 2 && y <= st.end + window.innerHeight * 0.5) to = st.start
    else return
    ev.preventDefault()
    if (lenis) lenis.scrollTo(to, { duration: cfg.transition.keyboardDuration, easing: easeInOutCubic })
    else window.scrollTo({ top: to, behavior: 'smooth' })
  }
  window.addEventListener('keydown', onKey)

  // Breakpoint change: new pin length, re-measure.
  const mq = window.matchMedia(MOBILE_QUERY)
  const onBreakpoint = () => {
    setPin()
    ScrollTrigger.refresh()
  }
  mq.addEventListener('change', onBreakpoint)

  apply(0)

  return {
    sync: () => apply(transitionDebug.freeze ? transitionDebug.progress : p),
    refresh() {
      setPin()
      build()
      ScrollTrigger.refresh()
    },
    destroy() {
      stopTick()
      window.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onBreakpoint)
      tl?.scrollTrigger?.kill()
      tl?.kill()
      host.classList.remove('is-portal')
      for (const prop of ['opacity', 'visibility', 'will-change', 'pointer-events', '--hero-cue']) stage.style.removeProperty(prop)
      const about = o.about()
      about?.style.removeProperty('opacity')
      about?.style.removeProperty('will-change')
      if (stageCanvas) {
        stageCanvas.style.transform = ''
        stageCanvas.style.transformOrigin = ''
        stageCanvas.style.willChange = ''
      }
    },
  }
}

// ------------------------------------------------------------------ reduced motion / static

/** No dive: a 400 ms crossfade from the hero to About once the hero starts to leave. */
function crossfade(o: TransitionOptions): TransitionHandle {
  const { section, stage } = o
  const about = o.about()
  const fade = gsap.timeline({ paused: true, defaults: { duration: 0.4, ease: 'power1.inOut' } })
  fade.fromTo(stage, { opacity: 1 }, { opacity: 0 }, 0)
  if (about) fade.fromTo(about, { opacity: 0 }, { opacity: 1 }, 0)

  const st = ScrollTrigger.create({
    trigger: section,
    start: 'top -12%',
    end: 'bottom center',
    onEnter: () => fade.play(),
    onLeaveBack: () => fade.reverse(),
    onToggle: (self) => {
      if (self.isActive) useStore.getState().set({ section: 'hero' })
    },
  })
  // Land in the right state whatever the scroll position (anchor jumps, restored scroll).
  const settle = () => fade.progress(window.scrollY > st.start ? 1 : 0).pause()
  ScrollTrigger.addEventListener('refresh', settle)
  settle()

  return {
    sync: () => {},
    refresh: () => ScrollTrigger.refresh(),
    destroy() {
      ScrollTrigger.removeEventListener('refresh', settle)
      st.kill()
      fade.kill()
      stage.style.removeProperty('opacity')
      about?.style.removeProperty('opacity')
    },
  }
}
