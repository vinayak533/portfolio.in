import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Section } from '../Section'
import { about, site } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { holdEnd } from '../../core/timeline'
import { onTick } from '../../core/clock'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import './about.css'

/**
 * The portrait scan, render toggle and exit stay on the scroll-scrubbed
 * timeline. The copy instead plays in on time once the About stage arrives
 * (a CSS stagger keyed off `is-in`), and resets if you scroll back into the
 * hero. The kicker ([data-a-head]) arrives with the hero's camera as it leaves
 * the cloud bank (src/hero/transition.ts).
 */
const SCAN_END = 0.46
const SHIMMER_END = 0.6

/** Reveal order: the accent line of the heading lands last. */
const ORDER = { lead: 0, intro: 1, body: 2, divider: 3, closing: 4, accent: 5 } as const
const reveal = (i: number) => ({ '--i': i }) as CSSProperties

export function About() {
  const mode = useStore((s) => s.mode)
  const duotone = useStore((s) => s.duotone)
  const lite = useStore((s) => s.lite)
  const set = useStore((s) => s.set)
  const webgl = mode === 'webgl'
  const panel = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (webgl) {
      let state = false
      return onTick(() => {
        const p = signals.progress.about
        const next = p > 0.01 ? true : p <= 0 ? false : state
        if (next !== state) setEntered((state = next))
      })
    }
    const el = panel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setEntered(true), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  return (
    <Section
      id="about"
      title="About Me"
      choreography={(tl, root) => {
        const q = <T extends Element>(s: string) => Array.from(root.querySelectorAll<T>(s))
        tl.fromTo(signals, { scan: 0 }, { scan: 1, duration: SCAN_END, ease: 'none' }, 0)
        tl.fromTo(signals, { shimmer: 0 }, { shimmer: 1, duration: SHIMMER_END - SCAN_END, ease: 'none' }, SCAN_END)
        tl.fromTo(q('[data-a-tool]'), { opacity: 0 }, { opacity: 1, duration: 0.05 }, SHIMMER_END - 0.06)

        const exitAt = holdEnd('about') - 0.03
        tl.to(root.querySelector('[data-a-copy]'), { opacity: 0, y: -50, duration: 0.06, ease: 'power2.in' }, exitAt)
      }}
    >
      <div className="relative h-full w-full">
        {webgl && <div aria-hidden="true" className="about-scrim" />}
        <div
          data-a-copy
          className={`about-layout ${webgl ? 'about-layout--immersive' : 'about-layout--static'}${lite ? ' is-lite' : ''}`}
          data-lenis-prevent={webgl ? '' : undefined}
        >
          <div ref={panel} className={`about-panel${entered ? ' is-in' : ''}`}>
            <span data-a-head className="about-kicker">
              <span aria-hidden="true" className="about-index">02</span>
              <span aria-hidden="true" className="about-kicker-rule" />
              {about.kicker}
            </span>

            <h2 className="about-heading">
              <span className="about-reveal about-heading-lead" style={reveal(ORDER.lead)}>
                {about.heading[0]}
              </span>{' '}
              <span className="about-reveal about-heading-line" style={reveal(ORDER.accent)}>
                <em className="about-heading-accent">{about.heading[1]}</em>
              </span>
            </h2>

            <p className="about-reveal about-intro" style={reveal(ORDER.intro)}>
              {about.intro.before}
              <strong className="about-name">{about.intro.name}</strong>
              {about.intro.after}
            </p>

            {about.body.map((text, i) => (
              <p key={i} className="about-reveal about-body" style={reveal(ORDER.body + i * 0.5)}>
                {text}
              </p>
            ))}

            <div aria-hidden="true" className="about-reveal about-divider" style={reveal(ORDER.divider)} />

            <p className="about-reveal about-closing" style={reveal(ORDER.closing)}>
              {about.closing}
            </p>

            {webgl && (
              <div data-a-tool className="about-render">
                <span className="about-render-label">Render</span>
                <div role="group" aria-label="Portrait colour" className="about-toggle">
                  {[
                    { v: false, l: 'Photo' },
                    { v: true, l: 'Spectral' },
                  ].map((o) => (
                    <button key={o.l} type="button" aria-pressed={duotone === o.v} onClick={() => set({ duotone: o.v })}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!webgl && (
            <figure className="about-portrait">
              <div aria-hidden="true" className="about-portrait-glow" />
              <img src={site.portrait.still} alt={site.portrait.alt} width={1054} height={1066} />
              <figcaption className="about-portrait-caption">
                <span>{site.name}</span>
                <span>AI / ML Engineer</span>
              </figcaption>
            </figure>
          )}
        </div>
        {webgl && <img src={site.portrait.still} alt={site.portrait.alt} className="sr-only" />}
      </div>
    </Section>
  )
}
