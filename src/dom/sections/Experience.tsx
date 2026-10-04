import { Section } from '../Section'
import { experience } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { shatter } from '../../core/registry'
import { sampleGlyphs } from '../ui/sampleGlyphs'
import { holdEnd, waypointU } from '../../core/timeline'

/** Section progress at which the beam head reaches waypoint i (inverse of experienceHead). */
const progressAt = (u: number) => 0.02 + u * (holdEnd('experience') - 0.04)

export function Experience() {
  const mode = useStore((s) => s.mode)
  const webgl = mode === 'webgl'

  return (
    <Section
      id="experience"
      title="Experience"
      choreography={(tl, root) => {
        const head = root.querySelectorAll('[data-x-head]')
        tl.fromTo(head, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.05, ease: 'power3.out' }, 0)
        const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-x-card]'))
        cards.forEach((card, i) => {
          const at = progressAt(waypointU[i]) - 0.07
          const lines = card.querySelectorAll('[data-x-line]')
          const tick = root.querySelectorAll('[data-x-tick]')[i]
          tl.set(card, { visibility: 'visible' }, at - 0.001)
          tl.fromTo(lines, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.05, stagger: 0.008, ease: 'power3.out' }, at)
          if (tick) tl.fromTo(tick, { scaleX: 0 }, { scaleX: 1, duration: 0.05, ease: 'power3.out' }, at)

          // Leaving a role: the card's own letters shatter into crystals (WebGL)
          // and the camera flies through the debris. Scrubbed, so it reverses.
          const boom = i < cards.length - 1 ? progressAt(waypointU[i + 1]) - 0.115 : holdEnd('experience') - 0.095
          const span = 0.09
          shatter.start[i] = boom
          shatter.end[i] = boom + span
          shatter.sample[i] = () => {
            const q = useStore.getState()
            const tierMax = q.lite || q.quality === 'low' ? 800 : q.quality === 'mid' ? 1500 : 2400
            return sampleGlyphs(card, tierMax)
          }
          tl.fromTo(signals.shatter[i], { p: 0 }, { p: 1, duration: span, ease: 'none' }, boom)
          tl.set(lines, { opacity: 0 }, boom + 0.003)
          tl.set(card, { visibility: 'hidden' }, boom + span)
        })
        shatter.version++
        tl.to(head, { opacity: 0, y: -30, duration: 0.04 }, holdEnd('experience') - 0.02)
      }}
    >
      <div className={webgl ? 'relative h-full w-full' : 'mx-auto max-w-[80rem] px-[var(--gutter)] py-[16vh]'}>
        <div data-x-head className={webgl ? 'absolute left-[var(--gutter)] top-[calc(var(--gutter)+3.4rem)] flex flex-col gap-3' : 'flex flex-col gap-3'}>
          <span className="mono dim">(04) Experience</span>
          <h2 className="display-s max-w-[20rem]">A path, measured in what shipped.</h2>
        </div>

        {webgl && (
          <ol data-x-head aria-hidden="true" className="absolute right-[var(--gutter)] top-[calc(var(--gutter)+3.6rem)] hidden flex-col gap-3 md:flex">
            {experience.map((r, i) => (
              <li key={r.company} className="mono mono-sm flex items-center justify-end gap-3">
                <span className="dimmer">{r.start}</span>
                <span className="relative block h-px w-10 bg-[var(--line)]">
                  <span data-x-tick className="absolute inset-0 origin-left bg-[var(--accent)]" style={{ transform: 'scaleX(0)' }} />
                </span>
                <span className="dim">{String(i + 1).padStart(2, '0')}</span>
              </li>
            ))}
          </ol>
        )}

        <ol className={webgl ? '' : 'mt-14 flex flex-col gap-16'}>
          {experience.map((r) => (
            <li
              key={r.company}
              data-x-card
              className={
                webgl
                  ? 'invisible absolute bottom-[calc(var(--gutter)+2rem)] left-[var(--gutter)] right-[var(--gutter)] flex max-w-[40rem] flex-col gap-5'
                  : 'flex max-w-[44rem] flex-col gap-5 border-t border-[var(--line)] pt-10'
              }
            >
              <span className="line-mask block">
                <span data-x-line className="mono dim block">
                  {r.start} - {r.end} <span className="dimmer">/ {r.location}</span>
                </span>
              </span>
              <h3 className="flex flex-col gap-2">
                <span className="line-mask block">
                  <span data-x-line className="display display-m block">
                    {r.company}
                  </span>
                </span>
                <span className="line-mask block">
                  <span data-x-line className="display-s dim block">
                    {r.title}
                  </span>
                </span>
              </h3>
              <ul className="flex flex-col gap-3 border-t border-[var(--line)] pt-5">
                {r.impact.map((b) => (
                  <li key={b} className="line-mask block">
                    <span data-x-line className="body-copy grid grid-cols-[1.4rem_1fr]">
                      <span className="accent" aria-hidden="true">
                        +
                      </span>
                      <span>{b}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  )
}
