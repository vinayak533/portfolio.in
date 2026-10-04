import { useRef, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, ScrollTrigger } from '../core/clock'
import { sectionHeights } from '../theme'
import { signals, useStore } from '../store/useStore'
import type { SectionId } from '../content'

interface Props {
  id: SectionId
  title: string
  children: ReactNode
  className?: string
  /**
   * Builds the section's scroll-scrubbed choreography. The timeline is
   * normalised to a duration of 1 = the whole section, so positions read as
   * fractions of section progress.
   */
  choreography?: (tl: gsap.core.Timeline, root: HTMLElement) => void
}

/**
 * A tall scroll track with a sticky, full-viewport stage inside. Its local
 * progress feeds the global camera parameter and its own GSAP timeline, so DOM
 * and WebGL move off the exact same number.
 */
export function Section({ id, title, children, className = '', choreography }: Props) {
  const ref = useRef<HTMLElement>(null)
  const mode = useStore((s) => s.mode)
  const webgl = mode === 'webgl'
  const layoutKey = useStore((s) => s.layoutKey)

  useGSAP(
    () => {
      const root = ref.current!
      if (!webgl) {
        // Static layout: only track which section is in view for the HUD.
        ScrollTrigger.create({
          trigger: root,
          start: 'top center',
          end: 'bottom center',
          onToggle: (self) => self.isActive && useStore.getState().set({ section: id }),
        })
        return
      }
      const last = id === 'contact'
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: last ? 'bottom bottom' : 'bottom top',
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            signals.progress[id] = self.progress
          },
          onToggle: (self) => {
            if (self.isActive) useStore.getState().set({ section: id })
          },
        },
      })
      choreography?.(tl, root)
      tl.set({}, {}, 1) // pin the timeline length to exactly 1
    },
    { scope: ref, dependencies: [webgl, layoutKey], revertOnUpdate: true },
  )

  return (
    <section
      id={id}
      ref={ref}
      aria-label={title}
      className={`relative ${className}`}
      style={webgl ? { height: `${sectionHeights[id]}vh` } : undefined}
    >
      <div className={webgl ? 'sticky top-0 h-[100svh] w-full overflow-hidden' : 'relative w-full'}>{children}</div>
    </section>
  )
}
