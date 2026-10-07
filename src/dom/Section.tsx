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
  /**
   * WebGL layout only. The section starts underneath the previous section's
   * hand-off (its last 100vh) instead of after it: the stage pins while the
   * previous stage scrolls away over it. Progress starts once that hand-off
   * is over, so the camera blend between the two acts is unchanged.
   */
  underlap?: boolean
}

/**
 * A tall scroll track with a sticky, full-viewport stage inside. Its local
 * progress feeds the global camera parameter and its own GSAP timeline, so DOM
 * and WebGL move off the exact same number.
 */
export function Section({ id, title, children, className = '', choreography, underlap = false }: Props) {
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
          start: underlap ? () => root.getBoundingClientRect().top + window.scrollY + window.innerHeight : 'top top',
          end: last ? 'bottom bottom' : 'bottom top',
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            signals.progress[id] = self.progress
          },
          // onUpdate only fires on change: a rebuilt trigger (fonts, resize) must still
          // overwrite what the one it replaced left behind, or the camera jumps acts.
          onRefresh: (self) => {
            signals.progress[id] = self.progress
          },
          onToggle: (self) => {
            if (self.isActive) useStore.getState().set({ section: id })
          },
        },
      })
      choreography?.(tl, root)
      tl.set({}, {}, 1) // pin the timeline length to exactly 1
      return () => {
        signals.progress[id] = 0
      }
    },
    { scope: ref, dependencies: [webgl, layoutKey, underlap], revertOnUpdate: true },
  )

  if (webgl && underlap) {
    return (
      <section id={id} ref={ref} aria-label={title} className={`relative ${className}`} style={{ marginTop: '-100vh', zIndex: -1 }}>
        <div className="sticky top-0 min-h-[100svh] w-full overflow-hidden">{children}</div>
        {/* The previous section's hand-off scrolls past while the stage above stays pinned. */}
        <div aria-hidden="true" className="h-[100vh]" />
        <div aria-hidden="true" data-scroll-anchor={id} className="pointer-events-none absolute left-0 top-[100vh] h-px w-px" />
      </section>
    )
  }

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
