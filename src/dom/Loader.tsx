import { useEffect, useRef, useState } from 'react'
import { damp, gsap, onTick, ScrollTrigger } from '../core/clock'
import { lockScroll } from '../core/scroll'
import { signals, useStore } from '../store/useStore'
import { site } from '../content'

/**
 * The loader is a curtain split along a single glowing line. The counter eases
 * toward real progress (fonts, portrait sampling, shader compilation); the
 * hero photograph waits behind it. On completion the line flares
 * and the curtain parts from the centre while the camera pushes in: no cut.
 */
export function Loader() {
  const root = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const line = useRef<HTMLDivElement>(null)
  const count = useRef<HTMLSpanElement>(null)
  const meta = useRef<HTMLDivElement>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    lockScroll(true)
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
      // Static / reduced-motion: no curtain choreography, just a short fade.
      if (useStore.getState().mode === 'static') {
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
        return
      }
      const tl = gsap.timeline({
        onComplete: () => {
          set({ introDone: true })
          lockScroll(false)
          ScrollTrigger.refresh()
          setGone(true)
        },
      })
      tl.to(count.current, { yPercent: -110, duration: 0.9, ease: 'power3.in' }, 0)
        .to(meta.current, { opacity: 0, duration: 0.5, ease: 'power2.out' }, 0)
        .to(line.current, { scaleY: 3, opacity: 1, duration: 0.5, ease: 'power3.in' }, 0.35)
        .to(top.current, { yPercent: -100, duration: 1.7, ease: 'power3.inOut' }, 0.75)
        .to(bottom.current, { yPercent: 100, duration: 1.7, ease: 'power3.inOut' }, 0.75)
        .to(line.current, { opacity: 0, scaleX: 1.4, duration: 1.1, ease: 'power2.out' }, 0.95)
        .to(signals, { intro: 1, duration: 3.2, ease: 'expo.out' }, 0.7)
    }

    const stop = onTick((_, dt) => {
      const target = useStore.getState().loadProgress
      shown = useStore.getState().mode === 'static' ? target : damp(shown, target, target >= 1 ? 5 : 2.4, dt)
      if (target >= 1 && shown > 0.996) shown = 1
      signals.load = shown
      const n = Math.round(shown * 100)
      if (count.current) count.current.textContent = String(n).padStart(3, '0')
      if (line.current) line.current.style.transform = `scaleX(${0.04 + shown * 0.96})`
      const isStatic = useStore.getState().mode === 'static'
      const minTime = isStatic || performance.now() - born > 1300
      if (shown >= 1 && minTime) exit()
      // Hard ceiling: never hold a visitor hostage to a slow asset.
      if (performance.now() - born > (isStatic ? 3000 : 12000)) exit()
    })

    return () => {
      stop()
    }
  }, [])

  if (gone) return null
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
