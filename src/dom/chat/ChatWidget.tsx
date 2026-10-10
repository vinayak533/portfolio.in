import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type CSSProperties, type RefObject } from 'react'
import { useStore } from '../../store/useStore'
import { assistant } from '../../assistant'
import type { ChatPanelProps } from './ChatPanel'
import { Robot, type Mood } from './Robot'
import './chat.css'

type PanelModule = { ChatPanel: ComponentType<ChatPanelProps> }

// The panel (engine, Markdown, Inter) loads on first use, or once the page is idle.
let panelModule: Promise<PanelModule> | null = null
const loadPanel = () => {
  panelModule ??= import('./ChatPanel').catch((err) => {
    panelModule = null // Let the next click try again.
    throw err
  })
  return panelModule
}

const NUDGE_KEY = 'chat-nudged'
/** Faces the launcher pulls now and then while idle, in turn. */
const PLAYFUL: Mood[] = ['happy', 'wink', 'surprised', 'happy', 'angel']
const PLAY_EVERY_MS = 14_000
const PLAY_HOLD_MS = 1800
/** With no pointer, key, touch or scroll activity for this long, the robot dozes off. */
const SLEEP_AFTER_MS = 45_000
const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

/** Page controls that sit in (or scroll to rest in) the launcher's corner. */
const CORNER_CONTROLS = '.works-details, .ct-top'
/** Of those, the ones the launcher steps beside rather than above (rising would cover Works' tagline). */
const SIDE_CONTROLS = '.works-details'
const CORNER_GAP = 12

type Offset = { lift: number; shift: number }
const NO_OFFSET: Offset = { lift: 0, shift: 0 }

/**
 * How far (px) the launcher has to move to clear any corner control that is
 * showing right now. Over Contact's "Back to top" it rises; next to Works'
 * Details button (WebGL layout) it steps left and sits beside it, so the
 * project tagline above stays clear. Measured, not inferred from the current
 * section: Details fades in before the section index changes. `rest` marks the
 * launcher's resting corner.
 */
function useCornerLift(enabled: boolean, rest: RefObject<HTMLElement | null>, size: () => number) {
  const [offset, setOffset] = useState<Offset>(NO_OFFSET)
  useEffect(() => {
    if (!enabled) {
      setOffset(NO_OFFSET)
      return
    }
    let raf = 0
    const check = () => {
      raf = 0
      const anchor = rest.current?.getBoundingClientRect()
      if (!anchor) return
      const s = size()
      const left = anchor.right - s - 8
      const right = anchor.right + 8
      let need = 0
      let side: DOMRect | null = null
      for (const el of document.querySelectorAll<HTMLElement>(CORNER_CONTROLS)) {
        const r = el.getBoundingClientRect()
        if (!r.width || r.right < left || r.left > right) continue
        if (r.bottom < anchor.bottom - s - CORNER_GAP || r.top > anchor.bottom + CORNER_GAP) continue
        const shown = el.checkVisibility
          ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
          : getComputedStyle(el).opacity !== '0' && getComputedStyle(el).visibility !== 'hidden'
        if (!shown) continue
        if (el.matches(SIDE_CONTROLS)) side = r
        else need = Math.max(need, anchor.bottom - r.top + CORNER_GAP)
      }
      if (side) {
        // Centred on the control's row, just left of it.
        const lift = Math.round(anchor.bottom - (side.top + side.height / 2) - s / 2)
        const shift = Math.round(anchor.right - side.left + CORNER_GAP)
        setOffset((o) => (o.lift === lift && o.shift === shift ? o : { lift, shift }))
        return
      }
      // Never climb more than a third of the screen.
      const lift = Math.round(Math.min(need, window.innerHeight / 3))
      setOffset((o) => (o.lift === lift && o.shift === 0 ? o : { lift, shift: 0 }))
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    check()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // Details fades in and out with GSAP after scrolling stops.
    const poll = window.setInterval(() => !document.hidden && schedule(), 600)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.clearInterval(poll)
    }
  }, [enabled, rest, size])
  return offset
}

/** True while a form field elsewhere on the page has focus (on phones the launcher then steps aside). */
function useFieldFocus(root: RefObject<HTMLElement | null>) {
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    const update = () => {
      const el = document.activeElement as HTMLElement | null
      const field = !!el?.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable="true"]')
      setFocused(field && !root.current?.contains(el))
    }
    // On focusout the next element isn't focused yet: look again a frame later.
    let raf = 0
    const later = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', later)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', later)
    }
  }, [root])
  return focused
}

/**
 * The launcher robot's mood: happy while hovered or focused, a wink on the
 * once-per-visit hello, a playful face every so often, and asleep after a
 * quiet spell (it wakes up surprised). Reduced motion keeps it neutral.
 */
function useLauncherMood(active: boolean, engaged: boolean, nudge: boolean, reduced: boolean): Mood {
  const [idle, setIdle] = useState<Mood>('neutral')
  const [asleep, setAsleep] = useState(false)

  useEffect(() => {
    if (!active || reduced) return
    let last = Date.now()
    let sleeping = false
    let wake = 0
    const onActivity = () => {
      last = Date.now()
      if (!sleeping) return
      sleeping = false
      setAsleep(false)
      setIdle('surprised')
      window.clearTimeout(wake)
      wake = window.setTimeout(() => setIdle('neutral'), 1100)
    }
    for (const e of ACTIVITY) window.addEventListener(e, onActivity, { passive: true })
    const check = window.setInterval(() => {
      if (!sleeping && Date.now() - last > SLEEP_AFTER_MS) {
        sleeping = true
        setAsleep(true)
      }
    }, 3000)
    return () => {
      for (const e of ACTIVITY) window.removeEventListener(e, onActivity)
      window.clearInterval(check)
      window.clearTimeout(wake)
      setAsleep(false)
      setIdle('neutral')
    }
  }, [active, reduced])

  useEffect(() => {
    if (!active || reduced || asleep) return
    let i = 0
    let back = 0
    const play = window.setInterval(() => {
      if (document.hidden) return
      setIdle(PLAYFUL[i++ % PLAYFUL.length])
      window.clearTimeout(back)
      back = window.setTimeout(() => setIdle('neutral'), PLAY_HOLD_MS)
    }, PLAY_EVERY_MS)
    return () => {
      window.clearInterval(play)
      window.clearTimeout(back)
    }
  }, [active, reduced, asleep])

  if (engaged) return 'happy'
  if (nudge) return 'wink'
  if (asleep) return 'sleepy'
  return idle
}

/**
 * Bottom-right launcher for the portfolio assistant. Appears once the intro has
 * finished, steps out of the way while a case study is open, and lifts above
 * Works' Details button on the screens where that button sits in this corner.
 */
export function ChatWidget() {
  const introDone = useStore((s) => s.introDone)
  const caseStudyOpen = useStore((s) => s.openWork !== null)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const [open, setOpen] = useState(false)
  const [Panel, setPanel] = useState<ComponentType<ChatPanelProps> | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [nudge, setNudge] = useState(false)
  const [engaged, setEngaged] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const rest = useRef<HTMLSpanElement>(null)
  const launcherSize = useCallback(() => launcher.current?.offsetWidth ?? 56, [])
  const panelId = useId()

  const ensurePanel = useCallback(async () => {
    if (Panel) return true
    setLoading(true)
    try {
      const m = await loadPanel()
      setPanel(() => m.ChatPanel)
      setLoadFailed(false)
      return true
    } catch (err) {
      console.error('[chat] the chat panel failed to load:', err)
      setLoadFailed(true)
      return false
    } finally {
      setLoading(false)
    }
  }, [Panel])

  const toggle = async () => {
    setNudge(false)
    if (open) return setOpen(false)
    if (await ensurePanel()) setOpen(true)
  }

  const close = useCallback((restoreFocus: boolean) => {
    // Before the panel goes inert, so focus never sits inside a hidden dialog.
    if (restoreFocus) launcher.current?.focus({ preventScroll: true })
    setOpen(false)
  }, [])

  // Warm the panel chunk once the page has settled, so the first open is instant.
  useEffect(() => {
    if (!introDone) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    const handle = idle(() => void loadPanel().catch(() => {}))
    return () => cancel(handle)
  }, [introDone])

  // One gentle pulse, once per visit, a little after the launcher appears. Never with reduced motion.
  useEffect(() => {
    if (!introDone || reducedMotion) return
    let seen = false
    try {
      seen = sessionStorage.getItem(NUDGE_KEY) === '1'
    } catch {
      // Storage blocked: just nudge.
    }
    if (seen) return
    const t = window.setTimeout(() => {
      setNudge(true)
      try {
        sessionStorage.setItem(NUDGE_KEY, '1')
      } catch {
        // Ignore.
      }
    }, 6000)
    return () => window.clearTimeout(t)
  }, [introDone, reducedMotion])

  const { lift, shift } = useCornerLift(introDone && !caseStudyOpen, rest, launcherSize)
  const fieldFocused = useFieldFocus(root)
  const mood = useLauncherMood(introDone && !open && !caseStudyOpen, engaged, nudge, reducedMotion)

  if (!introDone) return null

  // While a case study covers the screen the whole widget hides (and leaves the tab order), keeping its conversation.

  return (
    <div
      ref={root}
      className="chat"
      data-hidden={caseStudyOpen || undefined}
      data-yield={(fieldFocused && !open) || undefined}
      style={lift || shift ? ({ '--chat-lift': `${lift}px`, '--chat-shift': `${shift}px` } as CSSProperties) : undefined}
      inert={caseStudyOpen}
    >
      {/* Where the launcher rests, unaffected by lift or animation: corner checks measure from here. */}
      <span ref={rest} className="chat-rest" aria-hidden="true" />
      {Panel && <Panel id={panelId} open={open} onClose={close} />}
      <div className="chat-launcher-wrap" data-open={open || undefined}>
        <button
          ref={launcher}
          type="button"
          className="chat-launcher"
          data-nudge={nudge || undefined}
          aria-label={open ? 'Close chat' : assistant.launcherLabel}
          aria-expanded={open}
          aria-controls={Panel ? panelId : undefined}
          aria-busy={loading || undefined}
          onClick={toggle}
          onPointerEnter={(e) => {
            void loadPanel().catch(() => {})
            if (e.pointerType === 'mouse') setEngaged(true)
          }}
          onPointerLeave={() => setEngaged(false)}
          onFocus={(e) => {
            void loadPanel().catch(() => {})
            if (e.currentTarget.matches(':focus-visible')) setEngaged(true)
          }}
          onBlur={() => setEngaged(false)}
          onAnimationEnd={(e) => e.animationName === 'robot-hop' && setNudge(false)}
        >
          <span className="chat-launcher-orb" aria-hidden="true" />
          <Robot className="chat-launcher-icon chat-launcher-icon--robot" mood={mood} live={!open} />
          <svg className="chat-launcher-icon chat-launcher-icon--close" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          {loading && <span className="chat-launcher-spinner" aria-hidden="true" />}
          <span className="chat-launcher-status" aria-hidden="true" />
        </button>
        <span className="chat-tooltip" aria-hidden="true">
          {loadFailed ? 'Couldn’t load the chat. Click to retry.' : assistant.launcherLabel}
        </span>
        {loadFailed && (
          <span className="sr-only" role="alert">
            The chat couldn’t load. Check your connection and try again.
          </span>
        )}
      </div>
    </div>
  )
}
