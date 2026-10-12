import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { sections } from '../content'
import { useStore } from '../store/useStore'
import { scrollToSection } from '../core/scroll'
import { gsap } from '../core/clock'
import { useResumeUrl } from './useResumeUrl'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource-variable/inter/opsz.css'

/**
 * Fixed chrome: the centred pill navigation with a sliding indicator (its Home item is the way back to
 * the top). Below md the pill gives way to the section count and a Menu button with the same links
 * (plus the résumé). Lite rendering is automatic (src/core/autoLite.ts): there is no switch.
 */
export function Hud() {
  const section = useStore((s) => s.section)
  const loaded = useStore((s) => s.loaded)
  const mode = useStore((s) => s.mode)
  const layoutKey = useStore((s) => s.layoutKey)
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

  // WebGL: the navigation is there and usable from the first paint, over the hero's poster (Hero.tsx).
  // Static: it fades in as the curtain lifts.
  const webgl = mode === 'webgl'
  useEffect(() => {
    if (!loaded || webgl) return
    gsap.fromTo(root.current!.querySelectorAll('[data-hud]'), { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 1.6, ease: 'expo.out', stagger: 0.07, delay: 0.1 })
  }, [loaded, webgl])
  const hidden = webgl ? '' : ' opacity-0'

  // Slide the indicator under the active link.
  useLayoutEffect(() => {
    const ol = pill.current
    const a = ol?.querySelectorAll('a')[index] as HTMLElement | undefined
    if (!ol || !a) return
    setIndicator({ left: a.offsetLeft, width: a.offsetWidth })
  }, [index, layoutKey])

  return (
    <div ref={root} className="pointer-events-none fixed inset-x-0 top-0 z-[100]">
      <header className="hud relative flex items-center justify-end">
        <nav aria-label="Sections" data-hud className={`pointer-events-auto absolute inset-y-0 left-1/2 hidden -translate-x-1/2 items-center md:flex${hidden}`}>
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
          <span data-hud className={`hud-count mono md:hidden${hidden}`} aria-hidden="true">
            {String(index + 1).padStart(2, '0')} / {String(sections.length).padStart(2, '0')}
          </span>
          <button
            ref={menuBtn}
            data-hud
            type="button"
            className={`hud-menu-btn pointer-events-auto mono md:hidden${hidden}`}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
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
