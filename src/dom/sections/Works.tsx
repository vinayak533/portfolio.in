import { useEffect, useRef } from 'react'
import { Section } from '../Section'
import { projects } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { gsap, onTick } from '../../core/clock'
import { holdEnd, worksTrack } from '../../core/timeline'
import { scrollToY } from '../../core/scroll'
import { sectionHeights } from '../../theme'

/** Scroll position that centres exhibit i (inverse of worksTrack). */
function scrollForWork(i: number) {
  const el = document.getElementById('works')
  if (!el) return 0
  const n = projects.length
  const p = 0.03 + (i / (n - 1)) * (holdEnd('works') - 0.06)
  const top = el.getBoundingClientRect().top + window.scrollY
  return top + p * (sectionHeights.works / 100) * window.innerHeight
}

export function Works() {
  const mode = useStore((s) => s.mode)
  const focused = useStore((s) => s.focusedWork)
  const hovered = useStore((s) => s.hoveredWork)
  const set = useStore((s) => s.set)
  const webgl = mode === 'webgl'
  const titleRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const active = projects[focused]
  const showDetail = hovered !== null || !webgl

  // Which exhibit is centred, from the same progress the camera uses.
  useEffect(() => {
    if (!webgl) return
    return onTick(() => {
      const { k } = worksTrack(signals.progress.works)
      const i = Math.max(0, Math.min(projects.length - 1, Math.round(k)))
      if (useStore.getState().focusedWork !== i) useStore.getState().set({ focusedWork: i })
    })
  }, [webgl])

  useEffect(() => {
    if (!titleRef.current) return
    gsap.fromTo(
      titleRef.current.querySelectorAll('[data-roll]'),
      { yPercent: 105 },
      { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.05 },
    )
  }, [focused])

  useEffect(() => {
    if (!detailRef.current) return
    gsap.to(detailRef.current, { opacity: showDetail ? 1 : 0, y: showDetail ? 0 : 12, duration: 0.8, ease: 'expo.out' })
  }, [showDetail, focused])

  const open = (i: number) => set({ openWork: i })

  if (!webgl) {
    return (
      <Section id="works" title="Works">
        <div className="mx-auto max-w-[80rem] px-[var(--gutter)] py-[16vh]">
          <span className="mono dim">(03) Works</span>
          <h2 className="display display-m mt-5">Five systems, running live.</h2>
          <ol className="mt-14 flex flex-col">
            {projects.map((p, i) => (
              <li key={p.id} className="border-t border-[var(--line)]">
                <button type="button" onClick={() => open(i)} className="group grid w-full grid-cols-[3rem_1fr] gap-6 py-8 text-left md:grid-cols-[5rem_1fr_1fr]">
                  <span className="mono dimmer">{String(i + 1).padStart(2, '0')}</span>
                  <span className="display display-s">{p.title}</span>
                  <span className="body-copy col-start-2 md:col-start-3">{p.tagline}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </Section>
    )
  }

  return (
    <Section
      id="works"
      title="Works"
      choreography={(tl, root) => {
        tl.fromTo(root.querySelectorAll('[data-w-in]'), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.05, stagger: 0.01, ease: 'power3.out' }, 0)
        tl.to(root.querySelectorAll('[data-w-in]'), { opacity: 0, y: -30, duration: 0.04, ease: 'power2.in' }, holdEnd('works') - 0.02)
      }}
    >
      <div className="relative h-full w-full">
        <div data-w-in className="absolute left-[var(--gutter)] top-[calc(var(--gutter)+3.4rem)] flex flex-col gap-3">
          <span className="mono dim">(03) Works</span>
          <h2 className="display-s max-w-[18rem]">Five systems, running live.</h2>
        </div>

        {/* Active exhibit: title always, tagline + stack on hover / focus */}
        <div data-w-in className="absolute bottom-[var(--gutter)] left-[var(--gutter)] right-[var(--gutter)] flex flex-col gap-4 md:right-auto md:max-w-[42rem]">
          <div ref={titleRef} className="flex items-end gap-5" aria-live="polite">
            <span className="line-mask">
              <span data-roll className="mono dim block whitespace-nowrap">
                {String(focused + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}
              </span>
            </span>
            <h3 className="display display-l line-mask">
              <span data-roll className="block">
                {active.title}
              </span>
            </h3>
          </div>
          <div ref={detailRef} className="flex flex-col gap-4 opacity-0">
            <p className="body-copy max-w-[34rem]">{active.tagline}</p>
            <ul className="flex flex-wrap gap-2" aria-label="Stack">
              {active.tags.map((t) => (
                <li key={t} className="chip">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Keyboard / index navigation */}
        <nav data-w-in data-work-nav aria-label="Projects" className="absolute bottom-[calc(var(--gutter)+2.6rem)] right-[var(--gutter)] hidden md:block">
          <ol className="flex flex-col items-end gap-1">
            {projects.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  data-cursor="view"
                  data-cursor-label="Open"
                  onFocus={() => {
                    scrollToY(scrollForWork(i))
                    set({ hoveredWork: i })
                  }}
                  onBlur={() => set({ hoveredWork: null })}
                  onMouseEnter={() => set({ hoveredWork: i })}
                  onMouseLeave={() => set({ hoveredWork: null })}
                  onClick={() => open(i)}
                  className="mono flex items-center gap-3 py-1 transition-colors duration-500"
                  style={{ color: i === focused ? 'var(--ink)' : 'var(--ink-3)' }}
                  aria-label={`Open case study: ${p.title}, ${p.tagline}`}
                >
                  <span>{p.title}</span>
                  <span className="inline-block h-px transition-all duration-700" style={{ width: i === focused ? 28 : 10, background: i === focused ? 'var(--accent)' : 'var(--line)' }} />
                  <span>{String(i + 1).padStart(2, '0')}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <button
          data-w-in
          type="button"
          onClick={() => open(focused)}
          className="mono absolute bottom-[var(--gutter)] right-[var(--gutter)] flex items-center gap-2 md:hidden"
        >
          Open case study <span className="accent">→</span>
        </button>
      </div>
    </Section>
  )
}
