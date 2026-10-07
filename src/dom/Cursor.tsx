import { useEffect, useRef, useState } from 'react'
import { gsap } from '../core/clock'
import { useStore, type CursorState } from '../store/useStore'

const LABELS: Partial<Record<CursorState, string>> = { view: 'View', copy: 'Copy', drag: 'Drag' }

/**
 * Two-part cursor: a precise dot and a weighted ring that lags behind it.
 * DOM elements opt in with data-cursor="link|view|copy|tag"; anchors and buttons
 * are links by default. "tag" keeps the ring small and sets its label beside it. 3D objects set the state through the store.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const tag = useRef<HTMLSpanElement>(null)
  const glState = useStore((s) => s.cursor)
  const glLabel = useStore((s) => s.cursorLabel)
  const [domState, setDomState] = useState<CursorState | null>(null)
  const [domLabel, setDomLabel] = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    document.documentElement.classList.add('has-cursor')
    const dx = gsap.quickTo(dot.current, 'x', { duration: 0.12, ease: 'power3.out' })
    const dy = gsap.quickTo(dot.current, 'y', { duration: 0.12, ease: 'power3.out' })
    const rx = gsap.quickTo(ring.current, 'x', { duration: 0.6, ease: 'power3.out' })
    const ry = gsap.quickTo(ring.current, 'y', { duration: 0.6, ease: 'power3.out' })

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      dx(e.clientX)
      dy(e.clientY)
      rx(e.clientX)
      ry(e.clientY)
      setVisible(true)
    }
    // Labels can change while hovered (e.g. Copy -> Copied): watch the current target.
    const watch = new MutationObserver(([m]) => setDomLabel((m.target as HTMLElement).dataset.cursorLabel ?? ''))
    const over = (e: PointerEvent) => {
      const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-cursor], a, button, [role="button"], input, label')
      watch.disconnect()
      if (!el) {
        setDomState(null)
        setDomLabel('')
        return
      }
      const s = (el.dataset.cursor as CursorState) || 'link'
      setDomState(s)
      setDomLabel(el.dataset.cursorLabel ?? '')
      watch.observe(el, { attributes: true, attributeFilter: ['data-cursor-label'] })
    }
    const leave = () => setVisible(false)
    const down = () => gsap.to(ring.current, { scale: 0.82, duration: 0.25, ease: 'power3.out' })
    const up = () => gsap.to(ring.current, { scale: 1, duration: 0.6, ease: 'expo.out' })

    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerover', over, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      document.documentElement.classList.remove('has-cursor')
      watch.disconnect()
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerover', over)
      document.documentElement.removeEventListener('pointerleave', leave)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const state: CursorState = domState ?? glState
  const text = domLabel || glLabel || LABELS[state] || ''
  const big = state === 'view' || state === 'copy' || state === 'drag'
  const tagged = state === 'tag'

  useEffect(() => {
    const size = big ? 88 : state === 'link' ? 54 : tagged ? 22 : 34
    gsap.to(ring.current, {
      width: size,
      height: size,
      backgroundColor: big ? 'rgba(124,92,255,0.92)' : 'rgba(124,92,255,0)',
      borderColor: state === 'default' ? 'rgba(236,234,242,0.38)' : tagged ? 'rgba(154,130,255,0.75)' : 'rgba(124,92,255,0.9)',
      duration: 0.7,
      ease: 'expo.out',
    })
    gsap.to(dot.current, { scale: big ? 0 : state === 'link' ? 0.5 : tagged ? 0.6 : 1, duration: 0.5, ease: 'expo.out' })
    gsap.to(label.current, { opacity: big ? 1 : 0, scale: big ? 1 : 0.6, duration: 0.5, ease: 'expo.out' })
    gsap.to(tag.current, { opacity: tagged ? 1 : 0, x: tagged ? 0 : -6, duration: tagged ? 0.5 : 0.25, ease: 'expo.out' })
  }, [state, big, tagged])

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[300]"
      style={{ opacity: visible && state !== 'hidden' ? 1 : 0, transition: 'opacity .4s var(--ease-out)' }}
    >
      <div
        ref={ring}
        className="absolute left-0 top-0 flex items-center justify-center rounded-full border"
        style={{ width: 34, height: 34, translate: '-50% -50%', borderColor: 'rgba(236,234,242,0.38)', boxShadow: big ? '0 0 40px rgba(124,92,255,.45)' : 'none' }}
      >
        <span ref={label} className="mono mono-sm text-[var(--ink)] opacity-0">
          {big ? text : ''}
        </span>
        <span ref={tag} className="cursor-tag opacity-0">
          {tagged ? text : ''}
        </span>
      </div>
      <div
        ref={dot}
        className="absolute left-0 top-0 h-[6px] w-[6px] rounded-full bg-[var(--ink)]"
        style={{ translate: '-50% -50%', boxShadow: '0 0 12px rgba(236,234,242,.6)' }}
      />
    </div>
  )
}
