import { useRef, useState } from 'react'
import { Section } from '../Section'
import { contact, site } from '../../content'
import { useStore } from '../../store/useStore'
import { useLocalTime } from '../../core/time'
import { gsap } from '../../core/clock'
import { scrollToSection } from '../../core/scroll'
import { Magnetic } from '../ui/Magnetic'

export function Contact() {
  const mode = useStore((s) => s.mode)
  const webgl = mode === 'webgl'
  const time = useLocalTime()

  return (
    <Section
      id="contact"
      title="Contact"
      choreography={(tl, root) => {
        tl.fromTo(root.querySelectorAll('[data-c-line]'), { yPercent: 110 }, { yPercent: 0, duration: 0.3, stagger: 0.08, ease: 'expo.out' }, 0)
        tl.fromTo(root.querySelectorAll('[data-c-in]'), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.05, ease: 'power3.out' }, 0.2)
      }}
    >
      <div className={webgl ? 'relative flex h-full w-full flex-col justify-between px-[var(--gutter)] pb-[var(--gutter)] pt-[calc(var(--gutter)+4rem)]' : 'flex min-h-[100svh] flex-col justify-between px-[var(--gutter)] pb-[var(--gutter)] pt-[16vh]'}>
        <div className="flex flex-col gap-10">
          <span data-c-in className="mono dim">
            (05) Contact
          </span>
          <h2 className="display display-xl">
            {contact.heading.map((l, i) => (
              <span key={l} className="line-mask block">
                <span data-c-line className={`block ${i === 1 ? 'pl-[0.6em] md:pl-[1.2em]' : ''}`}>
                  {l}
                </span>
              </span>
            ))}
          </h2>
          <div data-c-in className="flex flex-col gap-8 md:flex-row md:items-center md:gap-14">
            <CopyEmail />
            <p className="body-copy max-w-[26rem]">{contact.lede}</p>
          </div>
        </div>

        <footer className="flex flex-col gap-8">
          <ul data-c-in className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Elsewhere">
            {contact.socials.map((s) => (
              <li key={s.label}>
                <Magnetic strength={0.25} radius={24}>
                  <a href={s.href} target="_blank" rel="noreferrer" className="mono group relative inline-block py-1">
                    <span>{s.label}</span>
                    <span className="absolute bottom-0 left-0 h-px w-full origin-right scale-x-0 bg-[var(--accent)] transition-transform duration-700 ease-[var(--ease-out)] group-hover:origin-left group-hover:scale-x-100 group-focus-visible:scale-x-100" />
                  </a>
                </Magnetic>
              </li>
            ))}
          </ul>
          <div data-c-in className="mono mono-sm flex flex-col gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <span className="dimmer">
              © {new Date().getFullYear()} {site.name}. {contact.footer}
            </span>
            <span className="flex items-center gap-3">
              <span className="glow-dot" aria-hidden="true" />
              <span className="dim">{site.location}</span>
              <time className="tabular-nums">
                {time} <span className="dimmer">{site.timezoneLabel}</span>
              </time>
            </span>
            <button type="button" onClick={() => scrollToSection('hero')} className="dim self-start transition-colors duration-500 hover:text-[var(--ink)] sm:self-auto">
              Back to top ↑
            </button>
          </div>
        </footer>
      </div>
    </Section>
  )
}

/** Magnetic email button: copies to clipboard with a roll + ring burst. */
function CopyEmail() {
  const [copied, setCopied] = useState(false)
  const roller = useRef<HTMLSpanElement>(null)
  const ring = useRef<HTMLSpanElement>(null)
  const timer = useRef(0)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contact.email)
    } catch {
      window.location.href = `mailto:${contact.email}`
      return
    }
    setCopied(true)
    gsap.to(roller.current, { yPercent: -50, duration: 0.8, ease: 'expo.out' })
    gsap.fromTo(ring.current, { scale: 0.6, opacity: 0.9 }, { scale: 2.4, opacity: 0, duration: 1.1, ease: 'expo.out' })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setCopied(false)
      gsap.to(roller.current, { yPercent: 0, duration: 0.8, ease: 'expo.out' })
    }, 2200)
  }

  return (
    <Magnetic strength={0.3} radius={50}>
      <button
        type="button"
        onClick={copy}
        data-cursor="copy"
        data-cursor-label={copied ? 'Done' : 'Copy'}
        aria-label={`Copy email address ${contact.email}`}
        className="group relative flex items-center gap-4 rounded-full border border-[var(--line)] px-7 py-5 transition-colors duration-700 hover:border-[var(--accent)]"
        style={{ boxShadow: '0 0 0 0 transparent' }}
      >
        <span ref={ring} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full border border-[var(--accent)] opacity-0" />
        <span className="glow-dot" aria-hidden="true" />
        <span className="relative block h-[1.4em] overflow-hidden">
          <span ref={roller} className="display-s flex flex-col">
            <span className="h-[1.4em] leading-[1.4em]">{contact.email}</span>
            <span className="accent h-[1.4em] leading-[1.4em]">Copied to clipboard</span>
          </span>
        </span>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Email address copied to clipboard' : ''}
        </span>
      </button>
    </Magnetic>
  )
}
