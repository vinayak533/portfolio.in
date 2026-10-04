import { Section } from '../Section'
import { about, site } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { holdEnd } from '../../core/timeline'
import { SplitLines } from '../ui/SplitLines'

/**
 * The copy is choreographed on the same scrubbed timeline that writes the
 * scan uniform, so each line lands exactly as the beam passes it.
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
      title="About"
      choreography={(tl, root) => {
        const q = <T extends Element>(s: string) => Array.from(root.querySelectorAll<T>(s))
        tl.fromTo(signals, { scan: 0 }, { scan: 1, duration: SCAN_END, ease: 'none' }, 0)
        tl.fromTo(signals, { shimmer: 0 }, { shimmer: 1, duration: SHIMMER_END - SCAN_END, ease: 'none' }, SCAN_END)

        const head = q('[data-a-head]')
        tl.fromTo(head, { yPercent: 110 }, { yPercent: 0, duration: 0.07, stagger: 0.02, ease: 'power3.out' }, 0.01)
        q('[data-a-line]').forEach((el, i, all) => {
          const at = 0.05 + (i / Math.max(all.length, 1)) * (SCAN_END - 0.1)
          tl.fromTo(el, { yPercent: 105, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.07, ease: 'power3.out' }, at)
        })
        q('[data-a-fact]').forEach((el, i) => {
          tl.fromTo(el, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.06, ease: 'power3.out' }, SCAN_END - 0.06 + i * 0.035)
        })
        tl.fromTo(q('[data-a-tool]'), { opacity: 0 }, { opacity: 1, duration: 0.05 }, SHIMMER_END - 0.06)

        const exitAt = holdEnd('about') - 0.03
        tl.to(root.querySelector('[data-a-copy]'), { opacity: 0, y: -50, duration: 0.06, ease: 'power2.in' }, exitAt)
      }}
    >
      <div className="relative h-full w-full">
        {webgl && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] md:hidden"
            style={{ background: 'linear-gradient(to top, var(--base) 55%, transparent)' }}
          />
        )}
        <div
          data-a-copy
          className={
            webgl
              ? 'absolute inset-x-[var(--gutter)] bottom-[calc(var(--gutter)+2.5rem)] flex flex-col gap-8 md:bottom-auto md:top-1/2 md:w-[min(44vw,40rem)] md:-translate-y-1/2'
              : 'mx-auto grid max-w-[80rem] gap-12 px-[var(--gutter)] py-[16vh] md:grid-cols-[1fr_0.9fr] md:items-center'
          }
        >
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-5">
              <span className="line-mask block">
                <span data-a-head className="mono dim block">
                  (02) {about.kicker}
                </span>
              </span>
              <h2 className="display display-m">
                <span className="line-mask block">
                  <span data-a-head className="block">
                    {about.heading}
                  </span>
                </span>
              </h2>
            </div>

            <SplitLines text={about.bio} className="body-copy max-w-[36rem]" lineAttr="data-a-line" />

            <dl className="grid max-w-[36rem] grid-cols-3 gap-5 border-t border-[var(--line)] pt-6">
              {about.facts.map((f) => (
                <div key={f.label} data-a-fact className="flex flex-col gap-2">
                  <dt className="mono mono-sm dimmer order-2 normal-case tracking-[0.04em]">{f.label}</dt>
                  <dd className="display display-s order-1">{f.value}</dd>
                </div>
              ))}
            </dl>

            {webgl && (
              <div data-a-tool className="flex items-center gap-3">
                <span className="mono mono-sm dimmer">Render</span>
                <div role="group" aria-label="Portrait colour" className="flex rounded-full border border-[var(--line)] p-[3px]">
                  {[
                    { v: false, l: 'Photo' },
                    { v: true, l: 'Spectral' },
                  ].map((o) => (
                    <button
                      key={o.l}
                      type="button"
                      aria-pressed={duotone === o.v}
                      onClick={() => set({ duotone: o.v })}
                      className="mono mono-sm rounded-full px-3 py-1 transition-colors duration-500"
                      style={{
                        background: duotone === o.v ? 'rgba(124,92,255,.22)' : 'transparent',
                        color: duotone === o.v ? 'var(--ink)' : 'var(--ink-3)',
                      }}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!webgl && (
            <figure className="relative mx-auto w-full max-w-[30rem]">
              <div
                aria-hidden="true"
                className="absolute inset-[12%] rounded-full"
                style={{ background: 'radial-gradient(closest-side, rgba(124,92,255,.38), transparent)', filter: 'blur(40px)' }}
              />
              <img
                src={site.portrait.still}
                alt={site.portrait.alt}
                width={1054}
                height={1066}
                className="relative block h-auto w-full"
                style={{
                  maskImage: 'linear-gradient(to bottom, black 70%, transparent)',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent)',
                  filter: 'drop-shadow(0 0 30px rgba(124,92,255,.25))',
                }}
              />
            </figure>
          )}
        </div>
        {webgl && <img src={site.portrait.still} alt={site.portrait.alt} className="sr-only" />}
      </div>
    </Section>
  )
}
