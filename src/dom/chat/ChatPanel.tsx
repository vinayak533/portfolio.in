// Claude-app typography: a reading serif for answers and headings, a crisp sans for the interface.
import '@fontsource-variable/dm-sans/opsz.css'
import '@fontsource-variable/source-serif-4/opsz.css'
import '@fontsource-variable/source-serif-4/opsz-italic.css'
// The agent's working trace and key hints are monospaced; the first screen's headline is a display serif.
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { assistant } from '../../assistant'
import { projects } from '../../content'
import { commandFor, graph, type GraphNode } from '../../core/graph'
import { lockScroll, scrollToSection } from '../../core/scroll'
import { useStore } from '../../store/useStore'
import { useResumeUrl } from '../useResumeUrl'
import { CommandLine } from './CommandLine'
import { KnowledgeMap } from './KnowledgeMap'
import { Robot, type Mood } from './Robot'
import { Lightbox, tagFor, type Pic } from './SignOff'
import { useConsole } from './useConsole'
import { ViewPane, type Phase, type ViewActions } from './Views'

export interface ChatPanelProps {
  id: string
  open: boolean
  onClose: (restoreFocus: boolean) => void
}

/**
 * Phones (narrow, or short like a phone on its side) get a full-screen sheet: modal, page scroll
 * locked, focus kept inside. From 900px the graph sits beside the chat; below that the chat is
 * on its own. Keep in step with the media queries in chat.css.
 */
/** How the robot takes an answer: pleased by a match, sorry about a miss. */
const moodOf = (route: string): Mood => (route === 'fallback' ? 'sad' : 'happy')

/** Whether the graph rail is open (wide layout), remembered in this browser. */
const RAIL_KEY = 'ask-vinayak:rail'
function readRail() {
  try {
    return localStorage.getItem(RAIL_KEY) !== 'off'
  } catch {
    return true
  }
}

const SHEET_QUERY = '(max-width: 640px), (max-height: 500px)'
const WIDE_QUERY = '(min-width: 900px) and (min-height: 560px)'

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

/**
 * Ask Vinayak: a chat over the index of Vinayak's work, beside a graph of it (capabilities →
 * projects → technology). Questions resolve locally and at once (src/core/console.ts); answers are
 * paced like a model's (Views.tsx). The graph and the chat work together: clicking a project asks
 * about it, and each answer lights up what it is about.
 */
export function ChatPanel({ id, open, onClose }: ChatPanelProps) {
  const resume = useResumeUrl()
  const isTouch = useStore((s) => s.isTouch)
  const sheet = useMedia(SHEET_QUERY)
  const wide = useMedia(WIDE_QUERY) && !sheet
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const [draft, setDraft] = useState('')
  const [probe, setProbe] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [rail, setRail] = useState(readRail)
  const [lightbox, setLightbox] = useState<{ pics: Pic[]; i: number } | null>(null)
  const titleId = `${id}-title`
  const toggleRail = useCallback(() => {
    setRail((r) => {
      try {
        localStorage.setItem(RAIL_KEY, r ? 'off' : 'on')
      } catch {
        /* private mode: the choice lasts this visit */
      }
      return !r
    })
  }, [])

  // /map: move focus into the graph (shown from 900px).
  const [mapFocus, setMapFocus] = useState(0)
  const focusMap = useCallback(() => setMapFocus((n) => n + 1), [])
  useEffect(() => {
    if (mapFocus) root.current?.querySelector<HTMLElement>('.cx-map [tabindex="0"]')?.focus({ preventScroll: true })
  }, [mapFocus])
  const session = useConsole(resume, focusMap)

  /** Focus the composer, except on touch screens where that would throw up the keyboard unasked. */
  const focusLine = useCallback(() => {
    if (isTouch) root.current?.focus({ preventScroll: true })
    else input.current?.focus({ preventScroll: true })
  }, [isTouch])

  // The newest response arrives animated (typing, then streaming); earlier turns, and every turn
  // under reduced motion, are shown whole.
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const seen = useRef(new Set<string>())
  const newest = session.entries[session.entries.length - 1]
  const animate = Boolean(newest) && !reduced && !seen.current.has(newest.id)
  useEffect(() => {
    if (newest) seen.current.add(newest.id)
  }, [newest])
  const [phase, setPhase] = useState<Phase>('done')
  const busy = phase !== 'done'

  // Each answer lights up what it is about on the graph (or clears it, for one about nothing in it).
  useEffect(() => {
    setSelected(newest?.res.focus ?? null)
  }, [newest])

  /** Runs an input; one still arriving is stopped first, so only one answer ever streams. */
  const run = useCallback(
    (text: string, display?: string) => {
      if (busy) stopRef.current?.()
      const ok = session.run(text, display)
      if (ok) {
        setProbe(null)
        if (!/^\/map\b/i.test(text.trim())) focusLine()
      }
      return ok
    },
    [session, focusLine, busy],
  )

  const fill = useCallback((text: string) => {
    setDraft(text)
    input.current?.focus({ preventScroll: true })
  }, [])

  /** The graph asks: a project click asks about it; the card's button asks the next question. */
  const ask = useCallback(
    (n: GraphNode, how: 'click' | 'follow') => {
      if (how === 'click') {
        if (n.kind === 'project') run(commandFor(n), `Tell me about ${n.label}`)
        return
      }
      if (n.kind === 'project') {
        if (graph.architecture(n.id)) run(`/arch ${n.id}`, `How does ${n.label} work?`)
        else fill(`About ${n.label}, `)
      } else if (n.kind === 'tech') run(commandFor(n), `Where has he used ${n.label}?`)
      else if (n.kind === 'capability') run(commandFor(n), `Show me his work on ${n.label.toLowerCase()}`)
    },
    [run, fill],
  )

  // Opening moves focus in.
  useEffect(() => {
    if (open) focusLine()
  }, [open, focusLine])

  // The sheet is modal: the page behind it must not scroll. Layout effect, so the lock is
  // released before anything that opens next (a case study) takes its own.
  useLayoutEffect(() => {
    if (!open || !sheet) return
    lockScroll(true)
    return () => lockScroll(false)
  }, [open, sheet])

  // Keep the sheet inside the visual viewport, which shrinks when the keyboard opens, so the
  // composer always sits just above it.
  useEffect(() => {
    const vv = window.visualViewport
    const el = root.current
    if (!open || !sheet || !vv || !el) return
    const sync = () => {
      el.style.setProperty('--chat-vvh', `${vv.height}px`)
      el.style.setProperty('--chat-vvt', `${vv.offsetTop}px`)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      el.style.removeProperty('--chat-vvh')
      el.style.removeProperty('--chat-vvt')
    }
  }, [open, sheet])

  // The thread: every question and its answer stay, oldest first. A new question scrolls up to the
  // top of the pane with its answer growing beneath it; Esc scrolls back to earlier turns. The last
  // turn is at least a pane tall, so it can sit at the top.
  useEffect(() => {
    const sc = scroller.current
    if (!sc) return
    const sync = () => sc.style.setProperty('--cx-main-h', `${sc.clientHeight}px`)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(sc)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    const sc = scroller.current
    if (!sc) return
    const turn = session.cursor >= 0 ? sc.querySelector<HTMLElement>(`[data-turn="${session.cursor}"]`) : null
    const top = turn ? turn.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 16 : 0
    sc.scrollTo({ top, behavior: reduced || !turn ? 'auto' : 'smooth' })
  }, [session.cursor, session.current?.id, reduced])

  // The header mark thinks while an answer is on its way, reacts once it is in (a smile for an
  // answer, sorry about a miss), then settles.
  const [reaction, setReaction] = useState<Mood | null>(null)
  useEffect(() => {
    if (!newest || busy) return setReaction(null)
    setReaction(moodOf(newest.res.route))
    const t = window.setTimeout(() => setReaction(null), 1600)
    return () => window.clearTimeout(t)
  }, [newest, busy])
  const mood: Mood = busy ? 'thinking' : (reaction ?? 'neutral')

  /** Escape, once the composer has nothing to close: the picture, an answer still arriving, the graph's selection, then back a turn, then close. */
  const escape = useCallback(() => {
    if (lightbox) {
      setLightbox(null)
      return
    }
    if (busy) {
      stopRef.current?.()
      return
    }
    if (selected) {
      setSelected(null)
      return
    }
    if (session.back()) return
    onClose(true)
  }, [lightbox, busy, selected, session, onClose])

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      escape()
      return
    }
    // As a sheet the panel is modal: Tab cycles inside it.
    if (e.key !== 'Tab' || !sheet || !root.current) return
    const f = [...root.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, [tabindex="0"]')].filter((n) => n.offsetParent !== null)
    if (!f.length) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Links inside answers: #work-<id> opens that case study, #<section> scrolls there.
  const onAnchor = useCallback(
    (target: string) => {
      if (sheet) {
        onClose(false)
        lockScroll(false)
      }
      const work = target.match(/^work-(.+)$/)
      if (work) {
        const i = projects.findIndex((p) => p.id === work[1])
        if (i >= 0) useStore.getState().set({ openWork: i })
        return
      }
      scrollToSection(target)
    },
    [sheet, onClose],
  )

  const view = useCallback((pics: Pic[], i: number) => setLightbox({ pics, i }), [])
  const actions = useMemo<ViewActions>(() => ({ run, fill, probe: setProbe, onAnchor, view, resume }), [run, fill, onAnchor, view, resume])
  const showRail = wide && rail
  const status = !busy ? 'Ready' : phase === 'thinking' ? 'Working…' : 'Writing…'

  return (
    <div
      ref={root}
      id={id}
      className={`chat-panel cx${sheet ? ' is-sheet' : ''}${wide ? ' is-wide' : ''}`}
      data-state={open ? 'open' : 'closed'}
      role="dialog"
      aria-modal={sheet || undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      inert={!open}
      onKeyDown={onPanelKey}
      // The 3D scenes behind keep picking under the panel; over it, the cursor is the page's own.
      data-cursor="default"
    >
      <header className="cx-head">
        {/* The one robot in the header: the logo mark, thinking while an answer arrives. */}
        <span className="cx-mark" aria-hidden="true">
          <Robot mood={mood} live={open} />
        </span>
        <div className="cx-head-id">
          <h2 id={titleId} className="cx-brand">
            {assistant.name}
          </h2>
          <p className="cx-state" data-state={busy ? 'busy' : 'idle'}>
            <i aria-hidden="true" />
            {status}
            <span className="cx-state-x"> · grounded in his work</span>
          </p>
        </div>
        <div className="cx-head-acts">
          {wide && (
            <button type="button" className="cx-icon" onClick={toggleRail} aria-pressed={rail} aria-label={rail ? 'Hide the graph' : 'Show the graph'} title={rail ? 'Hide the graph' : 'Show the graph'}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <rect x="2" y="2.5" width="12" height="11" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path d="M10 2.8v10.4" stroke="currentColor" strokeWidth="1.4" />
                {rail && <path d="M10.6 3.2h2.2a.9.9 0 0 1 .9.9v7.8a.9.9 0 0 1-.9.9h-2.2z" fill="currentColor" opacity="0.5" />}
              </svg>
            </button>
          )}
          {session.entries.length > 0 && (
            <button
              type="button"
              className="cx-icon"
              onClick={() => {
                stopRef.current?.()
                session.home()
                setDraft('')
                setSelected(null)
                focusLine()
              }}
              aria-label="New conversation"
              title="New conversation"
            >
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
          <button type="button" className="cx-icon" onClick={() => onClose(true)} aria-label="Close" title="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>
      </header>

      <div className="cx-body" data-rail={showRail ? 'on' : 'off'}>
        <div className="cx-chat">
          <div ref={scroller} className="cx-main" data-lenis-prevent>
            {session.entries.length ? (
              <ol className="cx-thread" aria-label="Conversation">
                {session.entries.map((e, i) => {
                  const last = i === session.entries.length - 1
                  const [emoji, tag] = tagFor(e.res)
                  return (
                    <li key={e.id} className="cx-turn" data-turn={i} data-last={last || undefined} aria-current={i === session.cursor ? 'true' : undefined}>
                      <div className="cx-ask">
                        <span className="cx-ask-glyph" aria-hidden="true">
                          ❯
                        </span>
                        <p className="cx-ask-text">
                          <span className="sr-only">You asked: </span>
                          {e.display ?? e.input}
                        </p>
                      </div>
                      <div className="cx-reply">
                        <div className="cx-reply-head">
                          {/* Each reply is signed by the robot: thinking while it arrives, then smiling (or sorry, for a miss). */}
                          <span className="cx-avatar" aria-hidden="true">
                            <Robot mood={last && busy ? 'thinking' : moodOf(e.res.route)} live={last} />
                          </span>
                          <span className="cx-reply-name">{assistant.name}</span>
                          <span className="cx-reply-tag">
                            <span aria-hidden="true">{emoji}</span> {tag}
                          </span>
                        </div>
                        <div className="cx-reply-body">
                          <span className="sr-only">Answer: </span>
                          <ViewPane
                            res={e.res}
                            actions={actions}
                            animate={last && animate}
                            onPhase={last ? setPhase : undefined}
                            stopRef={last ? stopRef : undefined}
                            showNext={last}
                            seed={e.id}
                            onRetry={() => run(e.input, e.display)}
                          />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <ViewPane key="home" res={null} actions={actions} onPhase={setPhase} />
            )}
          </div>
          <CommandLine
            inputRef={input}
            value={draft}
            onChange={setDraft}
            onRun={run}
            onHover={setProbe}
            recall={session.recall}
            onEscape={escape}
            busy={busy}
            onStop={() => stopRef.current?.()}
          />
        </div>
        {showRail && (
          <aside className="cx-side" aria-label="Graph of his work">
            <div className="cx-side-h">
              <p className="cx-side-t">Knowledge graph</p>
              <p className="cx-side-s">Click a project to ask about it</p>
            </div>
            <KnowledgeMap selected={selected} probe={probe} onSelect={setSelected} onAsk={ask} />
          </aside>
        )}
      </div>

      {lightbox && (
        <Lightbox
          pics={lightbox.pics}
          index={lightbox.i}
          onIndex={(i) => setLightbox({ ...lightbox, i })}
          onClose={() => {
            setLightbox(null)
            focusLine()
          }}
          onAsk={(pid) => {
            setLightbox(null)
            const n = graph.project(pid)
            if (n) run(commandFor(n), `Tell me about ${n.label}`)
          }}
          onCaseStudy={(pid) => {
            setLightbox(null)
            onAnchor(`work-${pid}`)
          }}
        />
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {session.announcement}
      </div>
    </div>
  )
}
