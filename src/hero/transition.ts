/**
 * Hero -> About scroll transition controller.
 *
 * One scrubbed ScrollTrigger (one master timeline) owns the whole sequence
 * (src/hero/shot.ts has the beats). The hero track is a tall section with a
 * sticky stage (the "pin"); About is laid out so its top sits exactly where the
 * pin releases, underneath the stage. Progress 0..1 drives everything, so
 * scrolling back replays it, and nothing moves once the scroll (and its
 * smoothing) comes to rest.
 *
 * The visuals live in the engine (the body dissolving, the head's flight to the
 * dock); this file only does scroll and DOM: the stage stops taking clicks once
 * the backdrop parts, About's world (the fixed stage behind) finishes its
 * handover, and About's page is held still in frame as it arrives, so it is
 * discovered in place, never scrolled in. Its first lines rise into place with
 * the hand-off's settle. Reduced motion / static mode gets a 400 ms crossfade
 * instead.
 */
import { gsap, ScrollTrigger, easeInOutCubic, remap, smoothstep } from '../core/clock'
import { getLenis } from '../core/scroll'
import { signals, useStore } from '../store/useStore'
import { heroConfig as cfg, MOBILE_QUERY, transitionProfile } from './config'
import { shotAt } from './shot'
import { energy, heroScroll } from './motion'
import type { RobotHandle } from './robot/dom'

export interface TransitionOptions {
  /** The tall scroll track (the hero section). */
  section: HTMLElement
  /** The sticky, full-viewport stage inside it. */
  stage: HTMLElement
  /** Wrapper around About (App.tsx). Only its opacity is touched, never its layout. */
  about: () => HTMLElement | null
  engine: () => RobotHandle | null
  mode: 'webgl' | 'static'
}

export interface TransitionHandle {
  /** Re-apply the current frame (e.g. once the engine has mounted). */
  sync(): void
  /** Re-measure after a pin-length or scrub change. */
  refresh(): void
  destroy(): void
}

const INTERACTIVE = 'input, textarea, select, button, a[href], summary, [contenteditable=""], [contenteditable="true"], [role="button"]'

export function createHeroTransition(o: TransitionOptions): TransitionHandle {
  return o.mode === 'webgl' ? webglTransition(o) : crossfade(o)
}

// ------------------------------------------------------------------ webgl

function webglTransition(o: TransitionOptions): TransitionHandle {
  const { section, stage } = o
  const proxy = { p: 0 }
  let raw = 0
  let p = 0
  let tl: gsap.core.Timeline | null = null
  /** True between ScrollTrigger's refreshInit and refresh: About stays unlifted while it measures. */
  let measuring = false

  const setPin = () => section.style.setProperty('--hero-pin', `${transitionProfile().pinVh}vh`)
  setPin()

  /** About's opening lines (kicker, heading): revealed by the shot, not by About's own scroll. */
  const heads = () => Array.from(o.about()?.querySelectorAll<HTMLElement>('[data-a-head]') ?? [])

  function apply(pv: number) {
    // The background's energy system (src/hero/motion.ts): scrolling inside the hero raises ENERGY.
    if (pv !== heroScroll.p && pv > 0 && pv < 1) energy.poke('scroll', 250)
    heroScroll.p = pv
    p = pv
    const T = cfg.transition
    const shot = shotAt(pv)

    // Engine: visuals are a pure function of p.
    o.engine()?.setProgress(pv)

    // About's world (the fixed stage behind) finishes its hero-to-About handover before the backdrop parts.
    signals.progress.hero = remap(pv, T.stageMap[0], T.stageMap[1])

    // From the moment the backdrop parts, the stage takes no clicks.
    const parting = shot.sceneVis < 1
    stage.style.pointerEvents = parting ? 'none' : ''
    // The intro leaves with the first push; hidden once gone, so its links drop out of the tab order.
    const intro = 1 - smoothstep(0, 0.07, Math.max(pv, raw))
    stage.style.setProperty('--hero-intro', String(intro))
    // The copy: its scrim in the stage, its text in a layer of its own over the robot (src/dom/HeroCopy.tsx).
    for (const introEl of document.querySelectorAll<HTMLElement>('[data-hero-intro]')) {
      introEl.style.setProperty('--hero-intro', String(intro))
      introEl.style.visibility = intro <= 0.001 ? 'hidden' : ''
    }

    // The stage only steps aside at the very end. Raw scroll wins so a fast fling never leaves it behind.
    const out = remap(Math.max(pv, raw), 0.97, 1)
    stage.style.opacity = out > 0 ? String(1 - out) : ''
    stage.style.visibility = out >= 1 ? 'hidden' : ''
    stage.style.willChange = out > 0 && out < 1 ? 'opacity' : ''
    // Until the backdrop starts to part, nothing of the fixed stage behind can be seen.
    signals.heroCovers = !parting && out === 0

    const about = o.about()
    if (!about) return
    const done = raw >= 1 && pv >= 0.999
    // The page arrives...
    const a = done ? 1 : smoothstep(0, 0.45, Math.max(shot.arrive, shotAt(raw).arrive))
    about.style.opacity = a >= 1 ? '' : String(a)
    // ...held still in frame: while the pin runs, About's top is still below the
    // fold, so a sticky bottom edge lifts it to the top of the viewport. It is
    // discovered, not scrolled in. Sticky, not a per-frame transform: the browser
    // applies it in the same frame as the scroll, so a native touch scroll cannot
    // run a frame ahead of it and shake the page.
    if (!measuring) about.classList.toggle('hero-hold', a > 0 && raw < 1)
    about.style.willChange = a > 0 && a < 1 ? 'opacity' : ''

    // Kicker, then heading: a short rise and a soft arrival, staggered, settling with the hand-off.
    heads().forEach((el, i) => {
      const t = done ? 1 : smoothstep(0.3 + i * 0.14, 0.86 + i * 0.12, shot.arrive)
      const k = 1 - (1 - t) * (1 - t)
      el.style.opacity = t >= 1 ? '' : String(t * t)
      el.style.transform = t >= 1 ? '' : `translate3d(0, ${((1 - k) * 0.42).toFixed(4)}em, 0)`
      el.style.willChange = t > 0 && t < 1 ? 'opacity, transform' : ''
    })
  }

  function build() {
    tl?.scrollTrigger?.kill()
    tl?.kill()
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
          apply(p)
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
        onUpdate: () => apply(proxy.p),
      },
    )
      .addLabel('move', cfg.transition.hold)
  }
  build()

  // PageDown / Space inside the pin play the whole shot and land on the end
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

  // About's hold-still lift is a sticky offset on an ancestor of its section: drop it while
  // ScrollTrigger measures, so every trigger below is laid out where it really is.
  const unlift = () => {
    measuring = true
    o.about()?.classList.remove('hero-hold')
  }
  const relift = () => {
    measuring = false
    const about = o.about()
    // The lift that puts About's top at the top of the viewport: its own height, less one screen.
    about?.style.setProperty('--hero-hold-h', `${about.offsetHeight}px`)
    // The proxy, not the last applied value: a refresh re-renders the timeline from 0 (with events) and
    // restores it silently, so `p` can be left at 0 while the scroll is past the hero, and the robot
    // (which outlives the stage) would show its opening frame.
    apply(proxy.p)
  }
  ScrollTrigger.addEventListener('refreshInit', unlift)
  ScrollTrigger.addEventListener('refresh', relift)

  relift()

  return {
    sync: () => apply(p),
    refresh() {
      setPin()
      build()
      ScrollTrigger.refresh()
    },
    destroy() {
      signals.heroCovers = false
      heroScroll.p = 0
      ScrollTrigger.removeEventListener('refreshInit', unlift)
      ScrollTrigger.removeEventListener('refresh', relift)
      window.removeEventListener('keydown', onKey)
      mq.removeEventListener('change', onBreakpoint)
      tl?.scrollTrigger?.kill()
      tl?.kill()
      for (const prop of ['opacity', 'visibility', 'will-change', 'pointer-events', '--hero-intro']) stage.style.removeProperty(prop)
      for (const introEl of document.querySelectorAll<HTMLElement>('[data-hero-intro]')) {
        introEl.style.removeProperty('visibility')
        introEl.style.removeProperty('--hero-intro')
      }
      const about = o.about()
      about?.classList.remove('hero-hold')
      about?.style.removeProperty('--hero-hold-h')
      for (const prop of ['opacity', 'transform', 'will-change']) {
        about?.style.removeProperty(prop)
        for (const el of heads()) el.style.removeProperty(prop)
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
  // autoAlpha: hidden at 0, so the intro's links leave the tab order with it.
  fade.fromTo(stage, { autoAlpha: 1 }, { autoAlpha: 0 }, 0)
  if (about) fade.fromTo(about, { opacity: 0 }, { opacity: 1 }, 0)

  // The engine (the robot's still) docks with the same crossfade.
  const dock = (on: boolean) => {
    heroScroll.p = on ? 1 : 0
    o.engine()?.setProgress(on ? 1 : 0)
  }
  const st = ScrollTrigger.create({
    trigger: section,
    start: 'top -12%',
    end: 'bottom center',
    onEnter: () => {
      fade.play()
      dock(true)
    },
    onLeaveBack: () => {
      fade.reverse()
      dock(false)
    },
    onToggle: (self) => {
      if (self.isActive) useStore.getState().set({ section: 'hero' })
    },
  })
  // Land in the right state whatever the scroll position (anchor jumps, restored scroll).
  const settle = () => {
    fade.progress(window.scrollY > st.start ? 1 : 0).pause()
    dock(window.scrollY > st.start)
  }
  ScrollTrigger.addEventListener('refresh', settle)
  settle()

  return {
    sync: () => dock(window.scrollY > st.start),
    refresh: () => ScrollTrigger.refresh(),
    destroy() {
      ScrollTrigger.removeEventListener('refresh', settle)
      st.kill()
      fade.kill()
      stage.style.removeProperty('opacity')
      stage.style.removeProperty('visibility')
      about?.style.removeProperty('opacity')
    },
  }
}
