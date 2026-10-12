import { useEffect, useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import { CustomEase } from 'gsap/CustomEase'
import { Section } from '../Section'
import { signals, useStore } from '../../store/useStore'
import { easeInOutCubic, gsap, ScrollTrigger, smoothstep, SplitText } from '../../core/clock'
import { scrollToSection } from '../../core/scroll'
import type { Abyss } from '../contact/abyss'
import { ContactForm } from '../contact/ContactForm'
import { contact } from '../../content'
import { useResumeUrl } from '../useResumeUrl'
import '@fontsource-variable/inter/opsz.css'
import './contact.css'

const EMAIL = contact.email

const EASE = CustomEase.create('ct-out', '0.16,1,0.3,1')
const docTop = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY

/**
 * Act V, the deepest point. Almost black and very quiet: one headline, the
 * address, two links, and a single soft light that follows the pointer.
 * In the WebGL layout the section underlaps the end of Experience: as that
 * hand-off scrolls, the 3D world lifts and dims, the dark settles in beneath
 * it, and the type rises once it has.
 */
export function Contact() {
  const mode = useStore((s) => s.mode)
  const isTouch = useStore((s) => s.isTouch)
  const reduced = useStore((s) => s.reducedMotion)
  const layoutKey = useStore((s) => s.layoutKey)
  const webgl = mode === 'webgl'

  const root = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const email = useRef<HTMLAnchorElement>(null)
  const lamp = useRef<HTMLDivElement>(null)
  const glow = useRef<HTMLDivElement>(null)
  const snow = useRef<HTMLCanvasElement>(null)
  const abyss = useRef<Abyss | null>(null)
  const want = useRef({ run: false, cover: webgl ? 0 : 1, lit: false })
  const played = useRef(false)
  const [near, setNear] = useState(false)
  const [entered, setEntered] = useState(false)
  const lit = entered || reduced
  const resume = useResumeUrl()
  const links = resume ? [...contact.links, { label: 'Résumé (PDF)', href: resume }] : contact.links

  // The font and the light load only once the section is within a couple of screens.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '200% 0px' })
    io.observe(root.current!)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!near) return
    let cancelled = false
    import('../contact/abyss').then(({ createAbyss }) => {
      if (cancelled || !root.current || !lamp.current || !glow.current) return
      const a = createAbyss(root.current, lamp.current, glow.current, snow.current, {
        touch: isTouch,
        still: reduced,
        anchor: () => email.current,
      })
      a.setCover(want.current.cover)
      a.setLit(want.current.lit)
      a.setRunning(want.current.run)
      abyss.current = a
    })
    return () => {
      cancelled = true
      abyss.current?.destroy()
      abyss.current = null
    }
  }, [near, isTouch, reduced])

  useEffect(() => {
    want.current.lit = lit
    abyss.current?.setLit(lit)
  }, [lit])

  const setRunning = (on: boolean) => {
    want.current.run = on
    abyss.current?.setRunning(on)
  }
  const setCover = (c: number) => {
    want.current.cover = c
    abyss.current?.setCover(c)
  }

  useGSAP(
    () => {
      const el = root.current!
      const section = el.closest('section')!
      let tl: gsap.core.Timeline | null = null

      // One entrance, played once: the headline's lines rise out of their masks, then the rest fades in.
      if (!reduced && !played.current) {
        const split = SplitText.create(title.current!, { type: 'lines', mask: 'lines', linesClass: 'ct-line' })
        const fades = el.querySelectorAll('[data-ct-fade]')
        gsap.set(split.lines, { yPercent: 110 })
        gsap.set(fades, { opacity: 0, y: 12 })
        tl = gsap.timeline({
          paused: true,
          defaults: { ease: EASE },
          onComplete: () => {
            split.revert()
            gsap.set(fades, { clearProps: 'transform' })
          },
        })
        tl.to(split.lines, { yPercent: 0, duration: 1.1, stagger: 0.08 }, 0)
        tl.to(fades, { opacity: 1, y: 0, duration: 0.8, stagger: 0.08 }, 0.42)
      }

      let unsub: (() => void) | null = null
      const enter = () => {
        if (played.current || unsub) return
        // Hold the sequence until the loader has handed over (deep links, reloads at the end).
        const go = () => {
          played.current = true
          tl?.play(0)
          setEntered(true)
        }
        if (useStore.getState().loaded) go()
        else unsub = useStore.subscribe((s) => s.loaded && (unsub?.(), (unsub = null), go()))
      }

      // Keyboard users tabbing into the section are taken there. In the WebGL
      // layout the hand-off plays the entrance on arrival; wait a frame so the
      // browser's own focus scroll does not cancel the journey.
      let arrived = false
      const onFocus = () => {
        if (arrived) return
        if (webgl) requestAnimationFrame(() => scrollToSection('contact'))
        else enter()
      }
      el.addEventListener('focusin', onFocus)

      if (webgl) {
        // The section sits under Experience's hand-off, so "in view" is that hand-off's progress, not an IntersectionObserver.
        let stage: HTMLElement | null = null
        let past = false
        const handoff = (p: number) => {
          // The navigation follows the hand-off's midpoint (Contact's own progress only starts after it).
          if (p >= 0.5 !== past) {
            past = p >= 0.5
            useStore.getState().set({ section: past ? 'contact' : 'experience' })
          }
          const cover = smoothstep(0, 0.8, p)
          backdrop.current!.style.opacity = String(cover)
          setCover(cover)
          // The world behind lifts and dims as the dark settles underneath.
          stage ??= document.querySelector<HTMLElement>('[data-stage]')
          if (stage) {
            stage.style.transform = p > 0 ? `translate3d(0, ${(-8 * easeInOutCubic(p)).toFixed(3)}vh, 0)` : ''
            stage.style.opacity = p > 0 ? String(1 - 0.55 * smoothstep(0, 0.75, p)) : ''
          }
          signals.contactCovers = cover >= 0.999
          setRunning(p > 0.3)
          arrived = p >= 0.55
          if (arrived) enter()
        }
        const st = ScrollTrigger.create({
          trigger: section,
          start: () => docTop(section),
          end: () => docTop(section) + window.innerHeight,
          onUpdate: (self) => handoff(self.progress),
          onRefresh: (self) => handoff(self.progress),
        })
        // Rebuilt mid-page (resize, fonts): start from where the scroll actually is.
        handoff(st.progress)
        return () => {
          el.removeEventListener('focusin', onFocus)
          unsub?.()
          signals.contactCovers = false
          if (stage) Object.assign(stage.style, { transform: '', opacity: '' })
        }
      }

      backdrop.current!.style.opacity = '1'
      setCover(1)
      const io = new IntersectionObserver(
        ([e]) => {
          setRunning(e.isIntersecting)
          arrived = e.isIntersecting
          if (e.intersectionRatio >= 0.25) enter()
        },
        { threshold: [0, 0.25] },
      )
      io.observe(el)
      return () => {
        el.removeEventListener('focusin', onFocus)
        unsub?.()
        io.disconnect()
      }
    },
    { scope: root, dependencies: [webgl, reduced, layoutKey], revertOnUpdate: true },
  )

  return (
    <Section id="contact" title="Contact" underlap={webgl}>
      <div
        ref={root}
        className={`ct${near ? ' is-near' : ''}`}
        onFocus={(e) => e.target instanceof HTMLElement && e.target.matches(':focus-visible') && abyss.current?.focusOn(e.target)}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          if ((e.target as Element).closest('a, button')) abyss.current?.tapAt(e.clientX, e.clientY)
        }}
      >
        <div ref={backdrop} className="ct-backdrop" aria-hidden="true" style={{ opacity: webgl ? 0 : 1 }} />
        {!reduced && <canvas ref={snow} className="ct-snow" aria-hidden="true" />}

        <div className="ct-frame">
          <div className="ct-main">
            <div className="ct-head">
              <h2 ref={title} className="ct-title">
                {contact.heading}
              </h2>
            </div>

            <div className="ct-aside">
              <p className="ct-lede" data-ct-fade>
                {contact.lede}
              </p>

              <div className="ct-email" data-ct-fade>
                <a
                  ref={email}
                  className="ct-email-link"
                  href={`mailto:${EMAIL}`}
                  onPointerEnter={() => abyss.current?.setBoost(true)}
                  onPointerLeave={() => abyss.current?.setBoost(false)}
                  onFocus={() => abyss.current?.setBoost(true)}
                  onBlur={() => abyss.current?.setBoost(false)}
                >
                  {EMAIL}
                </a>
              </div>

              <ul className="ct-links" aria-label="Elsewhere">
                {links.map((l) => (
                  <li key={l.label} data-ct-fade>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="ct-link">
                      <span>{l.label}</span>
                      <span className="ct-arrow" aria-hidden="true">
                        ↗
                      </span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="ct-form" data-ct-fade>
              <ContactForm email={EMAIL} />
            </div>
          </div>

          <footer className="ct-foot" data-ct-fade>
            <div className="ct-sign">
              <p className="ct-sign-name">Vinayak K V</p>
              <p>AI/ML Engineer, Kochi, India</p>
            </div>
            <p className="ct-motto">Building AI that works.</p>
            <a
              href="#hero"
              className="ct-top"
              onClick={(e) => {
                e.preventDefault()
                scrollToSection('hero')
              }}
            >
              Back to top
            </a>
          </footer>
        </div>

        <div ref={glow} className="ct-glow" aria-hidden="true" />
        <div ref={lamp} className="ct-lamp" aria-hidden="true" />
      </div>
    </Section>
  )
}
