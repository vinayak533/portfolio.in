import { useEffect, useRef, type CSSProperties } from 'react'
import { site } from '../../content'
import { signals, useStore } from '../../store/useStore'
import type { RobotHandle } from '../../hero/robot/dom'
import { transitionProfile } from '../../hero/config'
import { createHeroTransition, type TransitionHandle } from '../../hero/transition'
import { isTouchDevice } from '../../core/quality'
import '../../hero/hero.css'
import '../../hero/robot/robot.css'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource-variable/inter/opsz.css'

/**
 * The opening frame: an interactive 3D robot (src/hero/robot) seated at its
 * desk, coding on its laptop on a spotlit stage, with no copy beside it (the
 * name is kept for screen readers and search only). Its head and eyes follow
 * the pointer. The section is a tall track with a sticky stage (the pin);
 * src/hero/transition.ts scrubs the hand-over to About: the camera closes on
 * the robot's head as its body dissolves away, then the head flies down into
 * the bottom-right corner and becomes the chat launcher (src/dom/chat).
 * Without WebGL it is a still render. The stage behind it is made of light
 * dots: the beam and the floor's glow pool are CSS in hero.css; the halftone
 * field, the horizon wave, the dot floor, the edge streams and the two
 * far-field panels are drawn by src/hero/robot/stage.ts. This component only
 * provides the containers and forwards site state (loader done, overlay
 * pause, lite).
 */
export function Hero() {
  const track = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<RobotHandle | null>(null)
  const transition = useRef<TransitionHandle | null>(null)
  const loaded = useStore((s) => s.loaded)
  const mode = useStore((s) => s.mode)
  const lowPower = useStore((s) => s.lite || s.quality === 'low')
  // The landscape behind the robot (src/hero/robot/terrain.ts) has its own phone profile, so being a phone
  // (the low tier's usual reason) does not make it lite: only the LITE toggle or a software renderer does.
  const liteLandscape = useStore((s) => s.lite || (s.quality === 'low' && !isTouchDevice() && window.innerWidth >= 760))
  const webgl = mode === 'webgl'

  useEffect(() => {
    let cancelled = false
    let backdrop: { dispose(): void } | null = null
    import('../../hero/robot/stage').then(({ mountStage }) => {
      if (!cancelled && host.current) backdrop = mountStage(host.current)
    })
    const engine = useStore.getState().mode === 'webgl' ? import('../../hero/robot/engine') : import('../../hero/robot/still')
    engine.then(({ mountRobot }) => {
      if (cancelled || !host.current) return
      const { lite, quality, loaded } = useStore.getState()
      handle.current = mountRobot(host.current, {
        isPaused: () => signals.paused,
        lowPower: lite || quality === 'low',
        integratedGpu: quality === 'mid',
      })
      if (loaded) handle.current.reveal()
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

  // Fade in from black as the loader curtain parts.
  useEffect(() => {
    if (loaded) handle.current?.reveal()
  }, [loaded])

  useEffect(() => {
    handle.current?.setLowPower(lowPower)
  }, [lowPower])

  return (
    <section
      id="hero"
      ref={track}
      aria-label="Introduction"
      className={webgl ? 'hero-track' : 'hero-static'}
      data-lite={lowPower || undefined}
      data-lite-landscape={liteLandscape || undefined}
      style={webgl ? ({ '--hero-pin': `${transitionProfile().pinVh}vh` } as CSSProperties) : undefined}
    >
      <div ref={stage} className="hero-stage">
        <h1 className="sr-only">
          {site.name}, {site.role}
        </h1>
        <div
          ref={host}
          className="hero-cinematic"
          data-on={loaded || undefined}
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
          <div className="hero-grain" />
        </div>
      </div>
    </section>
  )
}
