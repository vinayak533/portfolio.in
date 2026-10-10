import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { sections, site } from '../content'
import { useStore } from '../store/useStore'
import { scrollToSection } from '../core/scroll'
import { writeLitePreference } from '../core/quality'
import { gsap } from '../core/clock'
import { useResumeUrl } from './useResumeUrl'

/**
 * Fixed chrome: mark, centred pill navigation with a sliding indicator, lite-mode switch.
 * Below md the pill gives way to a Menu button with the same links (plus the résumé).
 */
export function Hud() {
  const section = useStore((s) => s.section)
  const loaded = useStore((s) => s.loaded)
  const mode = useStore((s) => s.mode)
  const lite = useStore((s) => s.lite)
  const layoutKey = useStore((s) => s.layoutKey)
  const set = useStore((s) => s.set)
  const root = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLOListElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0 })
  const index = sections.findIndex((s) => s.id === section)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuBtn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const resume = useResumeUrl()

  // Menu: Esc closes and returns focus; a press anywhere outside closes it.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      menuBtn.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !menuBtn.current?.contains(t)) setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!loaded) return
    gsap.fromTo(
      root.current!.querySelectorAll('[data-hud]'),
      { opacity: 0, y: -14 },
      { opacity: 1, y: 0, duration: 1.6, ease: 'expo.out', stagger: 0.07, delay: mode === 'webgl' ? 1.4 : 0.1 },
    )
  }, [loaded, mode])

  // Slide the indicator under the active link.
  useLayoutEffect(() => {
    const ol = pill.current
    const a = ol?.querySelectorAll('a')[index] as HTMLElement | undefined
    if (!ol || !a) return
    setIndicator({ left: a.offsetLeft, width: a.offsetWidth })
  }, [index, layoutKey])

  const toggleLite = () => {
    writeLitePreference(!lite)
    set({ lite: !lite })
  }

  return (
    <div ref={root} className="pointer-events-none fixed inset-x-0 top-0 z-[100]">
      <header className="relative flex items-center justify-between p-[var(--gutter)]">
        <a
          data-hud
          href="#hero"
          onClick={(e) => {
            e.preventDefault()
            scrollToSection('hero')
          }}
          className="pointer-events-auto mono opacity-0"
          aria-label={`${site.name}, back to top`}
        >
          {site.mark}
        </a>

        <nav aria-label="Sections" data-hud className="pointer-events-auto absolute left-1/2 top-[var(--gutter)] hidden -translate-x-1/2 opacity-0 md:block">
          <ol ref={pill} className="nav-pill">
            <li aria-hidden="true" role="presentation" className="nav-pill-indicator" style={{ left: indicator.left, width: indicator.width }} />
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    scrollToSection(s.id)
                  }}
                  aria-current={s.id === section ? 'true' : undefined}
                >
                  {s.id === 'hero' ? 'Home' : s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex items-center gap-5">
          <span data-hud className="mono dim opacity-0 md:hidden" aria-hidden="true">
            {String(index + 1).padStart(2, '0')} / {String(sections.length).padStart(2, '0')}
          </span>
          <button
            ref={menuBtn}
            data-hud
            type="button"
            className="hud-menu-btn pointer-events-auto mono opacity-0 md:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
          {mode === 'webgl' && (
            <button
              data-hud
              type="button"
              onClick={toggleLite}
              aria-pressed={lite}
              className="pointer-events-auto mono mono-sm flex items-center gap-2 opacity-0"
              title="Lighter 3D for slower machines"
            >
              <span className="dimmer hidden sm:inline">Lite</span>
              <span
                className="relative inline-block h-[14px] w-[26px] rounded-full border border-[var(--line)] transition-colors duration-500"
                style={{ background: lite ? 'rgba(124,92,255,.35)' : 'transparent' }}
              >
                <span className="absolute top-[2px] h-[8px] w-[8px] rounded-full bg-[var(--ink)] transition-all duration-500" style={{ left: lite ? 14 : 3 }} />
              </span>
              <span className="sr-only">Lite mode</span>
            </button>
          )}
        </div>

        <div ref={menu} id={menuId} className="hud-menu pointer-events-auto md:hidden" hidden={!menuOpen}>
          <nav aria-label="Sections">
            <ul>
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={s.id === section ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      setMenuOpen(false)
                      scrollToSection(s.id)
                    }}
                  >
                    {s.id === 'hero' ? 'Home' : s.label}
                  </a>
                </li>
              ))}
              {resume && (
                <li>
                  <a href={resume} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
                    Résumé <span className="sr-only">(PDF, opens in a new tab)</span>
                  </a>
                </li>
              )}
            </ul>
          </nav>
        </div>
      </header>
    </div>
  )
}
