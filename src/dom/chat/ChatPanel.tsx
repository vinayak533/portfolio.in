import '@fontsource/orbitron/latin-500.css'
import '@fontsource/orbitron/latin-700.css'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { assistant } from '../../assistant'
import { projects } from '../../content'
import { describe, resolve, ROUTE_LABEL, type Resolution, type View } from '../../core/console'
import { commandFor, graph } from '../../core/graph'
import { lockScroll, scrollToSection } from '../../core/scroll'
import { useStore } from '../../store/useStore'
import { useResumeUrl } from '../useResumeUrl'
import { CommandLine } from './CommandLine'
import { KnowledgeMap } from './KnowledgeMap'
import { Robot, type Mood } from './Robot'
import { useConsole, type Entry } from './useConsole'
import { ViewPane, type Phase, type ViewActions } from './Views'

export interface ChatPanelProps {
  id: string
  open: boolean
  onClose: (restoreFocus: boolean) => void
}

/**
 * Phones (narrow, or short like a phone on its side) get a full-screen sheet: modal, page scroll
 * locked, focus kept inside. Wide screens get the two-pane console (map beside the view); between
 * the two, one pane with the map as an overlay. Keep in step with the media queries in chat.css.
 */
const SHEET_QUERY = '(max-width: 640px), (max-height: 500px)'
const WIDE_QUERY = '(min-width: 1024px) and (min-height: 560px)'

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

/** Where the view sits in the index, as a path: "~/projects/loom/arch". */
function pathOf(v?: View, focus?: string): string[] {
  if (!v) return []
  const id = focus ? graph.node(focus)?.id : undefined
  switch (v.kind) {
    case 'project':
      return ['projects', v.id]
    case 'arch':
      return ['projects', v.id, 'arch']
    case 'tech':
      return ['stack', id ?? '']
    case 'capability':
      return ['capabilities', v.id]
    case 'projects':
      return id ? ['projects', `?${id}`] : ['projects']
    case 'experience':
      return id ? ['experience', id] : ['experience']
    case 'profile':
      return ['about']
    case 'answer':
      return ['answers', v.reply.topic.replace(/:/g, '/')]
    case 'none':
      return ['no-match']
    default:
      return [v.kind]
  }
}

/**
 * Ask Vinayak, as a console over the index of Vinayak's work. One command line (questions or
 * /commands, with a palette and a preview), one view at a time (a project, a technology, a
 * capability, an architecture, an answer…), a relation map that lights up what the view is about,
 * and a trail of everything run, which Esc walks back through. Answers resolve locally and
 * synchronously (src/core/console.ts); the status bar shows how, and how long it took.
 */
export function ChatPanel({ id, open, onClose }: ChatPanelProps) {
  const resume = useResumeUrl()
  const isTouch = useStore((s) => s.isTouch)
  const sheet = useMedia(SHEET_QUERY)
  const wide = useMedia(WIDE_QUERY) && !sheet
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [mapProbe, setMapProbe] = useState<string | null>(null)
  const [palProbe, setPalProbe] = useState<string | null>(null)
  const titleId = `${id}-title`

  // /map: show the map (an overlay on narrow screens) and move focus into it once it has rendered.
  const [mapFocus, setMapFocus] = useState(0)
  const focusMap = useCallback(() => {
    setMapOpen(true)
    setMapFocus((n) => n + 1)
  }, [])
  useEffect(() => {
    if (mapFocus) root.current?.querySelector<HTMLElement>('.cx-map [tabindex="0"]')?.focus({ preventScroll: true })
  }, [mapFocus])
  const session = useConsole(resume, focusMap)
  const cur = session.current
  const focus = cur?.res.focus
  const probe = palProbe ?? mapProbe

  /** Focus the command line, except on touch screens where that would throw up the keyboard unasked. */
  const focusLine = useCallback(() => {
    if (isTouch) root.current?.focus({ preventScroll: true })
    else input.current?.focus({ preventScroll: true })
  }, [isTouch])

  const run = useCallback(
    (text: string) => {
      const ok = session.run(text)
      if (ok && !/^\/map\b/i.test(text.trim())) {
        setMapOpen(false)
        setMapProbe(null)
        focusLine()
      }
      return ok
    },
    [session, focusLine],
  )

  const fill = useCallback((text: string) => {
    setDraft(text)
    input.current?.focus({ preventScroll: true })
  }, [])

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

  // Keep the sheet inside the visual viewport, which shrinks when the keyboard opens.
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

  // Each view starts at its top.
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [cur?.id])

  // A new response arrives animated (thinking, then streaming); one reopened from the trail, or any
  // under reduced motion, is shown whole.
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const seen = useRef(new Set<string>())
  const animate = Boolean(cur) && !reduced && !seen.current.has(cur!.id)
  useEffect(() => {
    if (cur) seen.current.add(cur.id)
  }, [cur])
  const [phase, setPhase] = useState<Phase>('done')

  // The robot thinks while a response is on its way, reacts once it is in, then settles: pleased by
  // a match, sorry about a miss.
  const [reaction, setReaction] = useState<Mood | null>(null)
  useEffect(() => {
    if (!cur || phase !== 'done') return setReaction(null)
    setReaction(cur.res.route === 'fallback' ? 'sad' : 'happy')
    const t = window.setTimeout(() => setReaction(null), 1600)
    return () => window.clearTimeout(t)
  }, [cur, phase])
  const mood: Mood = phase !== 'done' ? 'thinking' : (reaction ?? 'neutral')

  // What the line would resolve to if run now: plain questions are previewed in the status bar.
  const live = useMemo<Resolution | null>(() => {
    const t = draft.trim()
    if (!t || t.startsWith('/')) return null
    return resolve(t, session.context())
    // `cur` is listed because the view on screen is the context the draft resolves in.
  }, [draft, cur, session])

  /** Escape, once the command line has nothing to close: the map overlay, then back a view, then close. */
  const escape = useCallback(() => {
    if (mapOpen && !wide) {
      setMapOpen(false)
      focusLine()
      return
    }
    if (session.back()) return
    onClose(true)
  }, [mapOpen, wide, session, onClose, focusLine])

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      escape()
      return
    }
    // As a sheet the panel is modal: Tab cycles inside it.
    if (e.key !== 'Tab' || !sheet || !root.current) return
    const f = [...root.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex="0"]')].filter((n) => n.offsetParent !== null)
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

  // Links inside views: #work-<id> opens that case study, #<section> scrolls there.
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

  const actions = useMemo<ViewActions>(() => ({ run, fill, probe: setPalProbe, onAnchor, resume }), [run, fill, onAnchor, resume])
  const path = pathOf(cur?.res.view, focus)
  const showSide = wide || mapOpen

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
        {/* The one robot in the panel: a system mark that reacts to each resolution. */}
        <span className="cx-mark" aria-hidden="true">
          <Robot mood={mood} live={open} />
        </span>
        <h2 id={titleId} className="cx-brand">
          {assistant.name}
        </h2>
        <p className="cx-path" aria-label={`Location: ${path.length ? path.join(', ') : 'start'}`}>
          <span aria-hidden="true">~</span>
          {path.map((p, i) => (
            <span key={i} aria-hidden="true">
              /{p}
            </span>
          ))}
        </p>
        <div className="cx-head-acts">
          {cur && (
            <button type="button" className="cx-icon" onClick={() => session.back()} aria-label="Back to the previous view" title="Back (Esc)">
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <path d="M9.5 3.5 5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {!wide && (
            <button type="button" className="cx-icon cx-icon--text" aria-pressed={mapOpen} onClick={() => (mapOpen ? escape() : setMapOpen(true))} title="Relation map (/map)">
              Map
            </button>
          )}
          {session.entries.length > 0 && (
            <button
              type="button"
              className="cx-icon"
              onClick={() => {
                session.home()
                setDraft('')
                focusLine()
              }}
              aria-label="Back to the start and clear the trail"
              title="Clear the trail (/home)"
            >
              <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                <path d="M3 8a5 5 0 1 0 1.5-3.55M3 3v2.5h2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <button type="button" className="cx-icon" onClick={() => onClose(true)} aria-label="Close" title="Close">
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        </div>
        {/* A hairline that sweeps once per resolution. */}
        <span key={cur?.id ?? 'home'} className="cx-scan" aria-hidden="true" />
      </header>

      <div className="cx-body">
        {showSide && (
          <aside className="cx-side" aria-label="Relation map and trail" data-lenis-prevent>
            <KnowledgeMap focus={focus} probe={probe} onProbe={setMapProbe} onSelect={(n) => run(commandFor(n))} />
            <Trail entries={session.entries} cursor={session.cursor} goto={session.goto} />
          </aside>
        )}
        <div ref={scroller} className="cx-main" data-lenis-prevent hidden={!wide && mapOpen}>
          {cur && (
            <p className="cx-query">
              <span className="cx-prompt" aria-hidden="true">
                ›
              </span>
              <span className="cx-query-text">{cur.input}</span>
              <span className="cx-route" data-route={cur.res.route}>
                {ROUTE_LABEL[cur.res.route]}
              </span>
            </p>
          )}
          <ViewPane key={cur?.id ?? 'home'} res={cur?.res ?? null} actions={actions} animate={animate} onPhase={setPhase} />
        </div>
      </div>

      <CommandLine
        inputRef={input}
        value={draft}
        onChange={setDraft}
        onRun={run}
        context={session.context}
        onHover={setPalProbe}
        recall={session.recall}
        onEscape={escape}
      />

      <footer className="cx-status">
        <Status live={live} cur={cur} draft={draft} />
        <span className="cx-status-keys" aria-hidden="true">
          <kbd>/</kbd> commands <kbd>↑</kbd> history <kbd>Esc</kbd> back
        </span>
      </footer>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {session.announcement}
      </div>
    </div>
  )
}

/** The status bar's left side: what the line would do, or how the view on screen was resolved. */
function Status({ live, cur, draft }: { live: Resolution | null; cur: Entry | null; draft: string }) {
  if (live) {
    return (
      <p className="cx-status-main" aria-live="off">
        <span className="cx-route" data-route={live.route}>
          {ROUTE_LABEL[live.route]}
        </span>
        <span className="cx-status-text">↵ {describe(live)}</span>
      </p>
    )
  }
  if (draft.trim().startsWith('/')) {
    return (
      <p className="cx-status-main">
        <span className="cx-route" data-route="command">
          CMD
        </span>
        <span className="cx-status-text">palette · Tab completes, ↵ runs</span>
      </p>
    )
  }
  if (cur) {
    return (
      <p className="cx-status-main">
        <span className="cx-status-text">
          {cur.res.rule} · <span className="cx-num">{cur.ms < 0.1 ? '<0.1' : cur.ms.toFixed(1)} ms</span>
          {cur.res.focus ? ` · ${cur.res.focus}` : ''}
        </span>
      </p>
    )
  }
  return (
    <p className="cx-status-main">
      <span className="cx-status-text">
        ready · {graph.nodes.length} nodes · {graph.edges.length} edges · local
      </span>
    </p>
  )
}

/** Everything run this session, oldest first; the view on screen is marked. Any entry can be reopened. */
function Trail({ entries, cursor, goto }: { entries: Entry[]; cursor: number; goto: (i: number) => void }) {
  const list = useRef<HTMLOListElement>(null)
  // Keep the current entry in view, scrolling only the list (never the map above it).
  useEffect(() => {
    const ol = list.current
    const li = ol?.querySelector<HTMLElement>('[aria-current="true"]')?.parentElement
    if (!ol || !li) return
    if (li.offsetTop < ol.scrollTop) ol.scrollTop = li.offsetTop
    else if (li.offsetTop + li.offsetHeight > ol.scrollTop + ol.clientHeight) ol.scrollTop = li.offsetTop + li.offsetHeight - ol.clientHeight
  }, [cursor, entries.length])
  return (
    <section className="cx-trail" aria-label="Trail">
      <p className="cx-map-head">
        Trail <span>{String(entries.length).padStart(2, '0')}</span>
      </p>
      {entries.length ? (
        <ol ref={list}>
          {entries.map((e, i) => (
            <li key={e.id}>
              <button type="button" aria-current={i === cursor ? 'true' : undefined} onClick={() => goto(i)}>
                <span className="cx-trail-in">{e.input}</span>
                <span className="cx-trail-out">{describe(e.res)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="cx-trail-empty">Everything you run is listed here. Esc walks back through it.</p>
      )}
    </section>
  )
}
