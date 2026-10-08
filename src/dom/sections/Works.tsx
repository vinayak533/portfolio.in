import { useEffect, useRef } from 'react'
import { Section } from '../Section'
import { projects } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { gsap, onTick } from '../../core/clock'
import { holdEnd, worksTrack } from '../../core/timeline'
import { ProjectTitle } from '../ui/ProjectTitle'

export function Works() {
  const mode = useStore((s) => s.mode)
  const focused = useStore((s) => s.focusedWork)
  const set = useStore((s) => s.set)
  const webgl = mode === 'webgl'
  const titleRef = useRef<HTMLDivElement>(null)
  const active = projects[focused]

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


  const open = (i: number) => set({ openWork: i })

  if (!webgl) {
    return (
      <Section id="works" title="Works">
        <div className="mx-auto max-w-[80rem] px-[var(--gutter)] py-[16vh]">
          <h2 className="mono dim">(03) Works</h2>
          <ol className="mt-14 flex flex-col gap-14">
            {projects.map((p, i) => (
              <li key={p.id} className="flex flex-col gap-5">
                {/* The reel is the whole card; its story lives behind Details. */}
                <button
                  type="button"
                  onClick={() => open(i)}
                  className="relative aspect-video w-full overflow-hidden bg-[var(--base)]"
                  style={{ boxShadow: '0 0 0 1px var(--line)' }}
                  aria-label={`Details: ${p.title}`}
                >
                  {p.media?.poster && <img className="h-full w-full object-cover" src={p.media.poster} alt="" loading="lazy" decoding="async" />}
                </button>
                <div className="flex items-end justify-between gap-6">
                  <div className="flex items-baseline gap-5">
                    <span className="mono dimmer">{String(i + 1).padStart(2, '0')}</span>
                    <h3 className="work-title-s">
                      <ProjectTitle project={p} />
                    </h3>
                  </div>
                  <button type="button" onClick={() => open(i)} className="details-btn shrink-0" aria-label={`Details: ${p.title}`}>
                    Details <span aria-hidden="true">→</span>
                  </button>
                </div>
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
        <div data-w-in className="absolute left-[var(--gutter)] top-[calc(var(--gutter)+3.4rem)]">
          <h2 className="mono dim">(03) Works</h2>
        </div>

        {/* Active exhibit's name, on the bottom margin under the reels. Its story is behind Details. */}
        <div data-w-in className="works-title-row absolute bottom-[var(--gutter)] left-[var(--gutter)] right-[var(--gutter)] flex flex-col gap-4 md:right-auto">
          <div ref={titleRef} className="flex items-end gap-5" aria-live="polite">
            <span className="line-mask">
              <span data-roll className="mono dim block whitespace-nowrap">
                {String(focused + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}
              </span>
            </span>
            <h3 className="work-title line-mask">
              <span data-roll className="block">
                <ProjectTitle project={active} />
              </span>
            </h3>
          </div>
        </div>


        {/* Wide screens show Details under each exhibit instead (WorksGallery). */}
        <button
          data-w-in
          type="button"
          onClick={() => open(focused)}
          className="works-details details-btn absolute bottom-[var(--gutter)] right-[var(--gutter)]"
          aria-label={`Details: ${active.title}`}
        >
          Details <span aria-hidden="true">→</span>
        </button>
      </div>
    </Section>
  )
}
