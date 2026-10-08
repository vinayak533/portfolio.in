import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { projects } from '../content'
import { signals, useStore } from '../store/useStore'
import { gsap } from '../core/clock'
import { lockScroll } from '../core/scroll'
import { exhibitRects } from '../core/registry'
import { handBackReel, mountReel, unmountReel } from '../core/reels'
import type { ProjectMedia } from '../content'

// The live media pulls in three.js; load it only when a case study opens.
const LiveScreen = lazy(() => import('./LiveScreen').then((m) => ({ default: m.LiveScreen })))

/**
 * Full-screen case study. The media block grows out of the exhibit's on-screen
 * rectangle (FLIP) and shrinks back into it on close, while the copy and the
 * backdrop fade around it. The main canvas pauses while fully covered.
 */
export function CaseStudy() {
  const openWork = useStore((s) => s.openWork)
  const [index, setIndex] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const media = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const closing = useRef(false)

  // Mount when a work is opened; switch content in place when already open.
  useEffect(() => {
    if (openWork === null) return
    if (index === null) {
      lastFocus.current = document.activeElement as HTMLElement
      setIndex(openWork)
    } else if (openWork !== index) {
      const tl = gsap.timeline()
      tl.to(content.current, { opacity: 0, y: 20, duration: 0.35, ease: 'power2.in' })
        .add(() => {
          setIndex(openWork)
          scroller.current?.scrollTo({ top: 0 })
        })
        .to(content.current, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' }, '+=0.05')
    }
  }, [openWork, index])

  // Opening choreography (runs once per mount).
  useLayoutEffect(() => {
    if (index === null || !media.current) return
    if (root.current?.dataset.open === '1') return
    root.current!.dataset.open = '1'
    lockScroll(true)
    const target = media.current.getBoundingClientRect()
    const from = exhibitRects[index]?.() ?? null
    const tl = gsap.timeline({
      onComplete: () => {
        signals.paused = true
        closeBtn.current?.focus({ preventScroll: true })
      },
    })
    tl.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: 'power2.out' }, 0)
    if (from && from.width > 10) {
      tl.fromTo(
        media.current,
        {
          x: from.left - target.left,
          y: from.top - target.top,
          scaleX: from.width / target.width,
          scaleY: from.height / target.height,
          transformOrigin: '0 0',
        },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 1.3, ease: 'expo.inOut' },
        0,
      )
    } else {
      tl.fromTo(media.current, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 1.1, ease: 'expo.out' }, 0)
    }
    tl.fromTo(
      content.current!.querySelectorAll('[data-cs-in]'),
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 1.2, ease: 'expo.out', stagger: 0.06 },
      0.55,
    )
  }, [index])

  const close = useCallback(() => {
    if (closing.current || index === null || !media.current) return
    closing.current = true
    signals.paused = false
    handBackReel()
    const current = media.current.getBoundingClientRect()
    const to = exhibitRects[index]?.() ?? null
    const tl = gsap.timeline({
      onComplete: () => {
        closing.current = false
        if (root.current) root.current.dataset.open = '0'
        setIndex(null)
        useStore.getState().set({ openWork: null })
        lockScroll(false)
        lastFocus.current?.focus?.({ preventScroll: true })
      },
    })
    scroller.current && (scroller.current.style.overflow = 'hidden')
    tl.to(content.current!.querySelectorAll('[data-cs-in]'), { opacity: 0, y: -20, duration: 0.45, ease: 'power2.in', stagger: 0.02 }, 0)
    const onScreen = to && to.width > 10 && to.right > 0 && to.left < window.innerWidth && to.bottom > 0 && to.top < window.innerHeight
    if (to && onScreen) {
      tl.to(
        media.current,
        {
          x: to.left - current.left + (gsap.getProperty(media.current, 'x') as number),
          y: to.top - current.top + (gsap.getProperty(media.current, 'y') as number),
          scaleX: to.width / (current.width / ((gsap.getProperty(media.current, 'scaleX') as number) || 1)),
          scaleY: to.height / (current.height / ((gsap.getProperty(media.current, 'scaleY') as number) || 1)),
          transformOrigin: '0 0',
          duration: 1.15,
          ease: 'expo.inOut',
        },
        0.15,
      )
    } else {
      tl.to(media.current, { opacity: 0, duration: 0.6 }, 0.15)
    }
    tl.to(backdrop.current, { opacity: 0, duration: 0.8, ease: 'power2.inOut' }, 0.45)
  }, [index])

  // Escape to close, focus trap inside the dialog.
  useEffect(() => {
    if (index === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'Tab' && root.current) {
        const f = root.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, close])

  if (index === null) return null
  const p = projects[index]
  const next = (index + 1) % projects.length

  return (
    <div ref={root} role="dialog" aria-modal="true" aria-labelledby="cs-title" className="fixed inset-0 z-[120]">
      <div ref={backdrop} className="absolute inset-0 bg-[var(--base)] opacity-0" />
      <div ref={scroller} data-lenis-prevent className="absolute inset-0 overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-10 flex items-center justify-between px-[var(--gutter)] py-5">
          <span data-cs-in className="mono dim">
            Case study {String(index + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}
          </span>
          <button
            ref={closeBtn}
            data-cs-in
            type="button"
            onClick={close}
            className="mono group flex items-center gap-3 py-2"
            aria-label="Close case study"
          >
            <span className="dim transition-colors duration-500 group-hover:text-[var(--ink)]">Close</span>
            <span className="relative inline-block h-3 w-3" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-px w-full rotate-45 bg-[var(--ink)] transition-transform duration-700 group-hover:rotate-[135deg]" />
              <span className="absolute left-0 top-1/2 h-px w-full -rotate-45 bg-[var(--ink)] transition-transform duration-700 group-hover:rotate-45" />
            </span>
          </button>
        </div>

        <div className="mx-auto w-full max-w-[72rem] px-[var(--gutter)] pb-[16vh]">
          <div ref={media} className="relative aspect-[16/10] w-full overflow-hidden rounded-[2px] will-change-transform" style={{ boxShadow: '0 0 0 1px var(--line), 0 40px 120px -40px rgba(124,92,255,.35)' }}>
            {p.media ? (
              /\.(mp4|webm)$/i.test(p.media.src) ? (
                <ReelView index={index} media={p.media} />
              ) : (
                <img className="h-full w-full object-cover" src={p.media.src} alt="" />
              )
            ) : (
              <Suspense fallback={<div className="h-full w-full bg-[var(--base)]" />}>
                <LiveScreen kind={p.visual} />
              </Suspense>
            )}
          </div>

          <div ref={content} className="mt-14 grid gap-14 md:grid-cols-[1.1fr_1fr] md:gap-20">
            <header className="flex flex-col gap-6">
              <h2 id="cs-title" data-cs-in className="display display-l">
                {p.title}
              </h2>
              <p data-cs-in className="display-s dim max-w-[32rem]">
                {p.tagline}
              </p>
            </header>
            <dl data-cs-in className="grid grid-cols-2 gap-x-8 gap-y-6 self-end border-t border-[var(--line)] pt-6">
              <div>
                <dt className="mono mono-sm dimmer">Year</dt>
                <dd className="mt-2">{p.year}</dd>
              </div>
              <div>
                <dt className="mono mono-sm dimmer">Role</dt>
                <dd className="mt-2">{p.role}</dd>
              </div>
              <div className="col-span-2">
                <dt className="mono mono-sm dimmer">Stack</dt>
                <dd className="mt-3 flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>

            <section data-cs-in className="flex flex-col gap-4 md:col-span-2 md:grid md:grid-cols-[1.1fr_1fr] md:gap-20">
              <h3 className="mono dim">Summary</h3>
              <p className="body-copy text-[var(--ink)]">{p.summary}</p>
            </section>
            <section data-cs-in className="flex flex-col gap-4 md:col-span-2 md:grid md:grid-cols-[1.1fr_1fr] md:gap-20">
              <h3 className="mono dim">Problem</h3>
              <p className="body-copy">{p.problem}</p>
            </section>
            <section data-cs-in className="flex flex-col gap-4 md:col-span-2 md:grid md:grid-cols-[1.1fr_1fr] md:gap-20">
              <h3 className="mono dim">Approach</h3>
              <ol className="flex flex-col gap-5">
                {p.approach.map((a, i) => (
                  <li key={i} className="body-copy grid grid-cols-[2.2rem_1fr]">
                    <span className="mono accent pt-1">{String(i + 1).padStart(2, '0')}</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section data-cs-in className="md:col-span-2">
              <h3 className="mono dim">At a glance</h3>
              <ul className="mt-6 grid gap-8 border-t border-[var(--line)] pt-8 sm:grid-cols-3">
                {p.facts.map((o) => (
                  <li key={o.label} className="flex flex-col gap-2">
                    <span className="display display-m">{o.value}</span>
                    <span className="mono mono-sm dimmer">{o.label}</span>
                  </li>
                ))}
              </ul>
            </section>
            {p.links && p.links.length > 0 && (
              <ul data-cs-in className="flex flex-wrap gap-6 md:col-span-2">
                {p.links.map((l) => (
                  <li key={l.href}>
                    <a className="mono border-b border-[var(--accent)] pb-1" href={l.href} target="_blank" rel="noreferrer">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <button
              data-cs-in
              type="button"
              onClick={() => useStore.getState().set({ openWork: next })}
              className="group flex items-end justify-between border-t border-[var(--line)] pt-8 text-left md:col-span-2"
            >
              <span className="flex flex-col gap-3">
                <span className="mono dimmer">Next exhibit</span>
                <span className="display display-m transition-colors duration-500 group-hover:text-[var(--accent)]">
                  {projects[next].title}
                </span>
              </span>
              <span className="mono dim pb-2">{String(next + 1).padStart(2, '0')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The case-study reel. The shared preview element moves in mid-play (see
 * core/reels), over the poster so there is never an empty frame.
 */
function ReelView({ index, media }: { index: number; media: ProjectMedia }) {
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    mountReel(index, host.current!)
    return unmountReel
  }, [index])
  return (
    <div
      ref={host}
      className="relative h-full w-full bg-[var(--base)] bg-cover bg-center"
      style={media.poster ? { backgroundImage: `url(${media.poster})` } : undefined}
    />
  )
}
