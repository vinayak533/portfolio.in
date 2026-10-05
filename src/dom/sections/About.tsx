import { Section } from '../Section'
import { about, site } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { holdEnd } from '../../core/timeline'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import './about.css'

/**
 * The copy is choreographed on the same scrubbed timeline that writes the
 * scan uniform, so each copy block lands as the beam passes it. The kicker
 * ([data-a-head]) arrives with the hero's camera as
 * it leaves the cloud bank (src/hero/transition.ts).
 */
const SCAN_END = 0.46
const SHIMMER_END = 0.6

export function About() {
  const mode = useStore((s) => s.mode)
  const duotone = useStore((s) => s.duotone)
  const set = useStore((s) => s.set)
  const webgl = mode === 'webgl'

  return (
    <Section
      id="about"
      title="About Me"
      choreography={(tl, root) => {
        const q = <T extends Element>(s: string) => Array.from(root.querySelectorAll<T>(s))
        tl.fromTo(signals, { scan: 0 }, { scan: 1, duration: SCAN_END, ease: 'none' }, 0)
        tl.fromTo(signals, { shimmer: 0 }, { shimmer: 1, duration: SHIMMER_END - SCAN_END, ease: 'none' }, SCAN_END)

        q('[data-a-line]').forEach((el, i, all) => {
          const at = 0.05 + (i / Math.max(all.length, 1)) * (SCAN_END - 0.16)
          tl.fromTo(el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.08, ease: 'power3.out' }, at)
        })
        q('[data-a-fact]').forEach((el, i) => {
          tl.fromTo(el, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.06, ease: 'power3.out' }, SCAN_END - 0.08 + i * 0.03)
        })
        tl.fromTo(q('[data-a-tool]'), { opacity: 0 }, { opacity: 1, duration: 0.05 }, SHIMMER_END - 0.06)

        const exitAt = holdEnd('about') - 0.03
        tl.to(root.querySelector('[data-a-copy]'), { opacity: 0, y: -50, duration: 0.06, ease: 'power2.in' }, exitAt)
      }}
    >
      <div className="relative h-full w-full">
        {webgl && <div aria-hidden="true" className="about-scrim" />}
        <div
          data-a-copy
          className={webgl ? 'about-layout about-layout--immersive' : 'about-layout about-layout--static'}
          data-lenis-prevent={webgl ? '' : undefined}
        >
          <div className="about-panel">
            <span data-a-head className="about-kicker">
              <span aria-hidden="true" className="about-index">02</span>
              <span aria-hidden="true" className="about-kicker-rule" />
              {about.kicker}
            </span>

            <h2 data-a-line className="about-heading">
              <span className="about-heading-lead">{about.heading[0]}</span>
              <em className="about-heading-accent">{about.heading[1]}</em>
            </h2>

            <p data-a-line className="about-lede">
              I’m <strong>{site.name}</strong>, {about.lede}
            </p>

            <p data-a-line className="about-body">{about.body}</p>

            <p data-a-line className="about-closing">
              {about.closing.map((line) => (
                <span key={line} data-a-fact>
                  {line}
                </span>
              ))}
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
