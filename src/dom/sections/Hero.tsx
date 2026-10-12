import { useEffect, useRef, type CSSProperties } from 'react'
import { signals, useStore } from '../../store/useStore'
import type { RobotHandle } from '../../hero/robot/dom'
import { transitionProfile } from '../../hero/config'
import { createHeroTransition, type TransitionHandle } from '../../hero/transition'
import { watchHeroTier } from '../../hero/tier'
import { heroScroll } from '../../hero/motion'
import '../../hero/hero.css'
import '../../hero/robot/robot.css'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource-variable/inter/opsz.css'
import { HeroCopy } from '../HeroCopy'

/**
 * The scene, pre-rendered (no text): phones, portrait tablets and landscape screens each get their own
 * framing, AVIF with a WebP fallback (index.html preloads the matching AVIF). Decorative: the host carries
 * the scene's description.
 */
export const POSTER = {
  phone: '/hero/poster-phone',
  tablet: '/hero/poster-tablet',
  desktop: '/hero/poster-desktop',
}
function HeroPoster() {
  return (
    <picture className="hero-poster" aria-hidden="true">
      <source type="image/avif" media="(max-width: 767px)" srcSet={`${POSTER.phone}.avif`} />
      <source type="image/webp" media="(max-width: 767px)" srcSet={`${POSTER.phone}.webp`} />
      <source type="image/avif" media="(orientation: portrait)" srcSet={`${POSTER.tablet}.avif`} />
      <source type="image/webp" media="(orientation: portrait)" srcSet={`${POSTER.tablet}.webp`} />
      <source type="image/avif" srcSet={`${POSTER.desktop}.avif`} />
      <img src={`${POSTER.desktop}.webp`} alt="" fetchPriority="high" decoding="async" draggable={false} />
    </picture>
  )
}

/**
 * The opening frame: an interactive 3D robot (src/hero/robot) seated at its
 * desk, coding on its laptop on a spotlit stage, and one small block of copy
 * in the bottom-left corner (src/dom/HeroCopy.tsx: with WebGL its scrim is
 * here and its text in a layer over the robot's canvas). Its head and eyes follow
 * the pointer. The section is a tall track with a sticky stage (the pin);
 * src/hero/transition.ts scrubs the hand-over to About: the camera closes on
 * the robot's head as its body dissolves away, then the head flies down into
 * the bottom-right corner and becomes the chat launcher (src/dom/chat).
 *
 * Loading: a pre-rendered poster of the scene (the landscape and the robot, no
 * text; public/hero/poster-*, scripts/prepare-poster.mjs) is the first paint and
 * the page's largest one, with the real copy and the navigation live over it; the
 * live scene comes up underneath, skips its build-up, and crossfades over it
 * (300 ms) once its first frame is drawn. Without WebGL, or if the context is
 * lost, the poster stays (with the copy). The stage behind it is made of light
 * dots: the beam and the floor's glow pool are CSS in hero.css; the halftone
 * field, the horizon wave, the dot floor, the edge streams and the two
 * far-field panels are drawn by src/hero/robot/stage.ts. This component only
 * provides the containers and forwards site state (loader done, overlay
 * pause, lite; lite is automatic, src/core/autoLite.ts).
 */
export function Hero() {
  const track = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<RobotHandle | null>(null)
  const transition = useRef<TransitionHandle | null>(null)
  const loaded = useStore((s) => s.loaded)
  const mode = useStore((s) => s.mode)
  // The hero's tier (src/hero/tier.ts); automatic lite (src/core/autoLite.ts) always means LOW.
  const tier = useStore((s) => (s.lite ? 'low' : s.heroTier))
  const lowPower = tier === 'low'
  const webgl = mode === 'webgl'

  useEffect(() => {
    let cancelled = false
    let backdrop: { dispose(): void } | null = null
    import('../../hero/robot/stage').then(({ mountStage }) => {
      if (!cancelled && host.current) backdrop = mountStage(host.current)
    })
    const isWebgl = useStore.getState().mode === 'webgl'
    const engine = isWebgl ? import('../../hero/robot/engine') : import('../../hero/robot/still')
    engine.then(({ mountRobot }) => {
      if (cancelled || !host.current) return
      const { lite, heroTier, quality, loaded } = useStore.getState()
      const el = host.current
      handle.current = mountRobot(el, {
        isPaused: () => signals.paused,
        tier: lite ? 'low' : heroTier,
        integratedGpu: quality === 'mid',
        // The poster is up: no build-up; the live scene takes over from it with its first frame.
        skipIntro: isWebgl,
        onReady: () => el.setAttribute('data-live', ''),
        onLost: () => el.removeAttribute('data-live'),
      })
      // WebGL: live at once, under the poster (no curtain to wait for). Static: as the curtain lifts.
      if (isWebgl || loaded) handle.current.reveal()
      transition.current?.sync()
    })
    return () => {
      cancelled = true
      backdrop?.dispose()
      handle.current?.dispose()
      handle.current = null
    }
  }, [])

  // One scrubbed ScrollTrigger drives the whole hero -> About sequence.
  useEffect(() => {
    const t = createHeroTransition({
      section: track.current!,
      stage: stage.current!,
      host: host.current!,
      about: () => document.querySelector<HTMLElement>('[data-hero-portal-target]'),
      engine: () => handle.current,
      mode,
    })
    transition.current = t
    return () => {
      t.destroy()
      transition.current = null
    }
  }, [mode])

  // Static: the still fades in as the curtain lifts (WebGL is revealed at mount, under the poster).
  useEffect(() => {
    if (loaded) handle.current?.reveal()
  }, [loaded])

  useEffect(() => {
    handle.current?.setTier(tier)
  }, [tier])

  // Battery saver and the start-up frame probe (src/hero/tier.ts): each may step the tier down once.
  useEffect(() => {
    if (!loaded || !webgl) return
    const { set } = useStore.getState()
    return watchHeroTier(
      () => useStore.getState().heroTier,
      (t) => set({ heroTier: t }),
      () => heroScroll.p < 0.5 && !document.hidden,
    )
  }, [loaded, webgl])

  return (
    <section
      id="hero"
      ref={track}
      aria-label="Introduction"
      className={webgl ? 'hero-track' : 'hero-static'}
      data-lite={lowPower || undefined}
      data-lite-landscape={lowPower || undefined}
      data-tier={tier}
      style={webgl ? ({ '--hero-pin': `${transitionProfile().pinVh}vh` } as CSSProperties) : undefined}
    >
      <div ref={stage} className="hero-stage">
        <div
          ref={host}
          className="hero-cinematic"
          data-on={webgl || loaded || undefined}
          role="img"
          aria-label="A small white robot in headphones sits at a desk coding on a glowing laptop, on a stage of violet light dots."
        >
          {/* The stage, back to front, under the robot's canvas (a fixed layer above the page). */}
          <div className="hero-scene">
            <div className="hero-scene__in">
              {/* stage.ts inserts its far-field panels first and its dot canvas here, under the light. */}
              <div className="hero-beam">
                <div className="hero-beam__light" />
              </div>
              <div className="hero-pool" />
            </div>
          </div>
          <HeroPoster />
          <div className="hero-grain" />
        </div>
        {/* With WebGL only the scrim is here, under the robot's canvas; the text is over it (App.tsx). */}
        <HeroCopy part={webgl ? 'scrim' : 'both'} />
      </div>
    </section>
  )
}
