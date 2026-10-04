import { useEffect, useRef, type ReactNode } from 'react'
import { gsap } from '../../core/clock'

interface Props {
  children: ReactNode
  /** Fraction of the pointer offset the element follows. */
  strength?: number
  /** Extra hit radius around the element, in px. */
  radius?: number
  className?: string
}

/** Pulls its child toward the pointer when nearby, releases with a weighted ease. */
export function Magnetic({ children, strength = 0.35, radius = 60, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current!
    if (window.matchMedia('(pointer: coarse)').matches) return
    const inner = el.firstElementChild as HTMLElement | null
    const xTo = gsap.quickTo(el, 'x', { duration: 0.9, ease: 'expo.out' })
    const yTo = gsap.quickTo(el, 'y', { duration: 0.9, ease: 'expo.out' })
    const ixTo = inner ? gsap.quickTo(inner, 'x', { duration: 0.9, ease: 'expo.out' }) : null
    const iyTo = inner ? gsap.quickTo(inner, 'y', { duration: 0.9, ease: 'expo.out' }) : null

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2 - (gsap.getProperty(el, 'x') as number)
      const cy = r.top + r.height / 2 - (gsap.getProperty(el, 'y') as number)
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      const inside = Math.abs(dx) < r.width / 2 + radius && Math.abs(dy) < r.height / 2 + radius
      if (inside) {
        xTo(dx * strength)
        yTo(dy * strength)
        ixTo?.(dx * strength * 0.35)
        iyTo?.(dy * strength * 0.35)
      } else {
        xTo(0)
        yTo(0)
        ixTo?.(0)
        iyTo?.(0)
      }
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [strength, radius])

  return (
    <div ref={ref} className={`inline-block will-change-transform ${className}`}>
      {children}
    </div>
  )
}
