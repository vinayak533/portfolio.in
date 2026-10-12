import { useEffect, useRef, useState } from 'react'
import { damp, gsap, onTick, ScrollTrigger } from '../core/clock'
import { lockScroll } from '../core/scroll'
import { signals, useStore } from '../store/useStore'
import { site } from '../content'

/**
 * Load progress (fonts, portrait sampling, shader compilation) and the first-run flags (`loaded`,
 * `introDone`, signals.intro) the rest of the page waits on.
 *
 * With WebGL there is no curtain: the hero is its own loading state (src/dom/sections/Hero.tsx shows a
 * pre-rendered poster of the scene at once, with its real text and the navigation live over it, and the
 * live scene crossfades in over it when its first frame is ready). The warm-up carries on underneath and
 * flags the page loaded when it is done (or after a hard ceiling), without ever holding the screen or the
 * scroll. Without WebGL (static / reduced motion) a plain curtain fades out once the still is ready.
 */
export function Loader() {
  const root = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLDivElement>(null)
  const count = useRef<HTMLSpanElement>(null)
  const meta = useRef<HTMLDivElement>(null)
  const [gone, setGone] = useState(false)

  const webgl = useStore((s) => s.mode === 'webgl')

  useEffect(() => {
    const curtain = useStore.getState().mode === 'static'
    if (curtain) lockScroll(true)
    window.scrollTo(0, 0)
    let shown = 0
    let exiting = false
    const born = performance.now()

    const exit = () => {
      if (exiting) return
      exiting = true
      stop()
      const set = useStore.getState().set
      set({ loaded: true })
      // WebGL: nothing on screen to take away; the hero's camera intro (behind the hero) still plays.
      if (!curtain) {
        set({ introDone: true })
        gsap.to(signals, { intro: 1, duration: 3.2, ease: 'expo.out' })
        ScrollTrigger.refresh()
        setGone(true)
        return
      }
      // Static / reduced motion: the curtain fades out, short.
      signals.intro = 1
      gsap.to(root.current, {
        opacity: 0,
        duration: 0.4,
        ease: 'power2.out',
        onComplete: () => {
          set({ introDone: true })
          lockScroll(false)
          ScrollTrigger.refresh()
          setGone(true)
        },
      })
    }

    const stop = onTick((_, dt) => {
      const target = useStore.getState().loadProgress
      shown = curtain ? target : damp(shown, target, target >= 1 ? 5 : 2.4, dt)
      if (target >= 1 && shown > 0.996) shown = 1
      signals.load = shown
      const n = Math.round(shown * 100)
      if (count.current) count.current.textContent = String(n).padStart(3, '0')
      if (!curtain) {
        // Hard ceiling: the rest of the page never waits long on a slow asset.
        if (target >= 1 || performance.now() - born > 8000) exit()
        return
      }
      if (line.current) line.current.style.transform = `scaleX(${0.04 + shown * 0.96})`
      if (shown >= 1) exit()
      // Hard ceiling: never hold a visitor hostage to a slow asset.
      if (performance.now() - born > 3000) exit()
    })

    return () => {
      stop()
    }
  }, [])

  if (gone || webgl) return null
  return (
    <div ref={root} className="pointer-events-none fixed inset-0 z-[150]" role="status" aria-live="polite" aria-label="Loading">
      <div ref={top} className="absolute inset-x-0 top-0 h-1/2 bg-[var(--base)]" />
      <div ref={bottom} className="absolute inset-x-0 bottom-0 h-1/2 bg-[var(--base)]" />
      <div
        ref={line}
        className="absolute left-0 right-0 top-1/2 h-px origin-center"
        style={{
          transform: 'scaleX(0.04)',
          background: 'linear-gradient(90deg, transparent, var(--accent) 18%, var(--ink) 50%, var(--accent) 82%, transparent)',
          boxShadow: '0 0 18px 1px var(--accent-glow)',
        }}
      />
      <div ref={meta} className="absolute inset-x-0 top-0 flex justify-between p-[var(--gutter)]">
        <span className="mono dim">{site.name}</span>
        <span className="mono dimmer">{site.role}</span>
      </div>
      <div className="absolute bottom-[var(--gutter)] left-[var(--gutter)] overflow-hidden">
        <span ref={count} className="display block text-[clamp(4rem,12vw,11rem)] tabular-nums leading-[0.82]">
          000
        </span>
      </div>
    </div>
  )
}
