import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react'
import { site } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { scrollToSection } from '../../core/scroll'
import { useResumeUrl } from '../useResumeUrl'
import type { HeroHandle } from '../../hero'
import { transitionProfile } from '../../hero/config'
import { createHeroTransition, type TransitionHandle } from '../../hero/transition'
import '../../hero/hero.css'

const jump = (id: string) => (e: MouseEvent) => {
  e.preventDefault()
  scrollToSection(id)
}

/**
 * The opening frame: the night island photograph, brought to life by the
 * framework-free WebGL engine in src/hero, with the name, role, a one-line
 * pitch and the ways in set over its sky. The section is a tall track with a
 * sticky stage (the pin); src/hero/transition.ts scrubs one camera move:
 * a push toward the figure, then a flight through the clouds onto About, and
 * fades the intro out as it starts. This component only provides the
 * containers and forwards site state (loader done, overlay pause, lite).
 */
export function Hero() {
  const track = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<HeroHandle | null>(null)
  const transition = useRef<TransitionHandle | null>(null)
  const loaded = useStore((s) => s.loaded)
  const mode = useStore((s) => s.mode)
  const lowPower = useStore((s) => s.lite || s.quality === 'low')
  const webgl = mode === 'webgl'
  const resume = useResumeUrl()

  useEffect(() => {
    let cancelled = false
    import('../../hero').then(({ mountHero }) => {
      if (cancelled || !host.current) return
      const { lite, quality, loaded } = useStore.getState()
      handle.current = mountHero(host.current, {
        isPaused: () => signals.paused,
        lowPower: lite || quality === 'low',
        integratedGpu: quality === 'mid',
      })
      if (loaded) handle.current.reveal()
      transition.current?.sync()
    })
    return () => {
      cancelled = true
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
      style={webgl ? ({ '--hero-pin': `${transitionProfile().pinVh}vh` } as CSSProperties) : undefined}
    >
      <div ref={stage} className="hero-stage">
        <div ref={host} className="hero-cinematic" role="img" aria-label="At night, a person works on a laptop in the long grass of a small floating island above a sea of clouds, under a bright moon." />
        <div className="hero-cue" data-on={loaded || undefined} aria-hidden="true">
          <span className="hero-cue__inner">
            <span className="mono mono-sm">Scroll</span>
            <span className="hero-cue__line" />
          </span>
        </div>
        <div className="hero-intro" data-on={loaded || undefined} data-hero-intro>
          <div className="hero-intro__inner">
            <p className="mono hero-intro__meta">
              {site.role} <span aria-hidden="true">·</span> {site.location}
            </p>
            <h1 className="display hero-intro__name">{site.name}</h1>
            <p className="hero-intro__pitch">{site.intro}</p>
            <p className="mono hero-intro__status">
              <span className="glow-dot" aria-hidden="true" />
              {site.availability}
            </p>
            <div className="hero-intro__actions">
              <a href="#works" className="btn-solid" onClick={jump('works')}>
                View projects <span aria-hidden="true">→</span>
              </a>
              <a href="#contact" className="btn-line" onClick={jump('contact')}>
                Contact
              </a>
              {resume && (
                <a href={resume} className="btn-line" target="_blank" rel="noopener noreferrer">
                  Résumé <span className="sr-only">(PDF, opens in a new tab)</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
