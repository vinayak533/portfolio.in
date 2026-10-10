import '@fontsource-variable/inter/opsz.css'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { assistant } from '../../assistant'
import { projects } from '../../content'
import { toPlainText } from '../../core/markdown'
import { lockScroll, scrollToSection } from '../../core/scroll'
import { useStore } from '../../store/useStore'
import { useResumeUrl } from '../useResumeUrl'
import { Markdown } from './Markdown'
import { Robot, type Mood } from './Robot'
import { useChat, type ChatMessage } from './useChat'

export interface ChatPanelProps {
  id: string
  open: boolean
  onClose: (restoreFocus: boolean) => void
}

/** The face that goes with an answer. */
function moodFor(m: Extract<ChatMessage, { role: 'assistant' }>): Mood {
  if (!m.known) return 'sad'
  if (m.topic === 'thanks') return 'angel'
  if (m.topic === 'greeting' || m.topic === 'bye') return 'wink'
  return 'happy'
}

/**
 * Phones (narrow, or short like a phone on its side) get a full-screen sheet
 * instead of the floating panel: modal, page scroll locked, focus kept inside.
 * Keep in step with the matching media queries in chat.css.
 */
const SHEET_QUERY = '(max-width: 640px), (max-height: 500px)'
const MAX_INPUT_HEIGHT = 140

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
 * The conversation panel: header, message log, composer. Answers come from the
 * local engine (src/core/assistant.ts) through useChat. A floating panel above
 * the launcher on larger screens; a full-screen sheet on phones that follows
 * the visual viewport, so the on-screen keyboard never covers the input.
 */
export function ChatPanel({ id, open, onClose }: ChatPanelProps) {
  const resume = useResumeUrl()
  const { messages, pending, announcement, send, stop, retry, reset } = useChat(resume)
  const sheet = useMedia(SHEET_QUERY)
  const isTouch = useStore((s) => s.isTouch)
  const reducedMotion = useStore((s) => s.reducedMotion)
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState('')
  const [atBottom, setAtBottom] = useState(true)
  const titleId = `${id}-title`
  const inputId = `${id}-input`
  const hintId = `${id}-hint`
  const lastIndex = messages.length - 1
  const last = messages[lastIndex]

  // The header robot reacts to each answer for a moment, then settles.
  const [reaction, setReaction] = useState<Mood | null>(null)
  useEffect(() => {
    if (last?.role !== 'assistant') return setReaction(null)
    setReaction(moodFor(last))
    const t = window.setTimeout(() => setReaction(null), 2400)
    return () => window.clearTimeout(t)
  }, [last])
  const headerMood: Mood = pending ? 'thinking' : (reaction ?? (last?.role === 'user' && last.state === 'failed' ? 'sad' : 'neutral'))

  // The empty state says hello with a wink.
  const [greeted, setGreeted] = useState(false)
  useEffect(() => {
    if (!open || greeted) return
    const t = window.setTimeout(() => setGreeted(true), 1400)
    return () => window.clearTimeout(t)
  }, [open, greeted])

  /** Focus the input, except on touch screens where that would throw up the keyboard unasked. */
  const focusComposer = useCallback(() => {
    if (isTouch) root.current?.focus({ preventScroll: true })
    else input.current?.focus({ preventScroll: true })
  }, [isTouch])

  // Opening moves focus in; closing cancels a pending answer (it can be retried).
  useEffect(() => {
    if (open) focusComposer()
    else stop()
  }, [open, focusComposer, stop])

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
      const s = scroller.current
      if (s && s.scrollHeight - s.scrollTop - s.clientHeight < 80) s.scrollTop = s.scrollHeight
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

  // Follow the conversation. A long answer is shown from its question down, not scrolled past.
  const seen = useRef(0)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const added = messages.length > seen.current
    seen.current = messages.length
    if (!added && !pending) return
    const behavior: ScrollBehavior = reducedMotion ? 'auto' : 'smooth'
    const last = messages[messages.length - 1]
    if (added && last?.role === 'assistant') {
      const node = el.querySelector<HTMLElement>(`[data-id="${last.id}"]`)
      const question = node?.previousElementSibling as HTMLElement | null
      if (node && node.offsetHeight > el.clientHeight * 0.6) {
        el.scrollTo({ top: (question ?? node).offsetTop - 12, behavior })
        return
      }
    }
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [messages, pending, reducedMotion])

  // Grow the input with its text, up to a cap.
  useLayoutEffect(() => {
    const t = input.current
    if (!t) return
    t.style.height = 'auto'
    t.style.height = `${Math.min(t.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [draft])

  const submit = () => {
    if (send(draft)) setDraft('')
  }

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line; never mid-composition (IME).
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    submit()
  }

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose(true)
      return
    }
    // As a sheet the panel is modal: Tab cycles inside it.
    if (e.key !== 'Tab' || !sheet || !root.current) return
    const f = [...root.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, [tabindex="0"]')].filter(
      (n) => n.offsetParent !== null,
    )
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
  const onAnchor = (target: string) => {
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
  }

  const newChat = () => {
    reset()
    setDraft('')
    focusComposer()
  }

  const nearLimit = draft.length > assistant.maxLength - 60

  return (
    <div
      ref={root}
      id={id}
      className={`chat-panel${sheet ? ' is-sheet' : ''}`}
      data-state={open ? 'open' : 'closed'}
      role="dialog"
      aria-modal={sheet || undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      inert={!open}
      onKeyDown={onPanelKey}
    >
      <header className="chat-head">
        <Avatar mood={headerMood} live={open} />
        <div className="chat-head-text">
          <h2 id={titleId} className="chat-title">
            {assistant.name}
          </h2>
          <p className="chat-status">
            <span className="chat-status-dot" aria-hidden="true" />
            {assistant.status}
          </p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="chat-icon-btn" onClick={newChat} aria-label="Start a new chat" title="New chat">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.75h3.75"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <button type="button" className="chat-icon-btn" onClick={() => onClose(true)} aria-label="Close chat" title="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </header>

      <div
        ref={scroller}
        className="chat-scroll"
        data-lenis-prevent
        onScroll={(e) => {
          const s = e.currentTarget
          setAtBottom(s.scrollHeight - s.scrollTop - s.clientHeight < 48)
        }}
      >
        {messages.length === 0 ? (
          <div className="chat-intro">
            <Avatar large mood={greeted ? 'happy' : 'wink'} live={open} />
            <p className="chat-intro-title">{assistant.greeting.title}</p>
            <p className="chat-intro-body">{assistant.greeting.body}</p>
            <ul className="chat-starters" aria-label="Suggested questions">
              {assistant.starters.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      if (send(s)) focusComposer()
                    }}
                  >
                    <span>{s}</span>
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                      <path d="M3.5 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="chat-log" aria-label="Conversation">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <li key={m.id} data-id={m.id} className="chat-msg chat-msg--user">
                  <span className="sr-only">You said: </span>
                  <p className="chat-bubble">{m.text}</p>
                  {m.state && (
                    <p className="chat-note">
                      {m.state === 'stopped' ? 'Stopped.' : 'Something went wrong.'}
                      {i === lastIndex && !pending && (
                        <button type="button" className="chat-note-btn" onClick={() => retry(m.id)}>
                          Retry
                        </button>
                      )}
                    </p>
                  )}
                </li>
              ) : (
                <li key={m.id} data-id={m.id} className="chat-msg chat-msg--bot">
                  <Avatar small mood={moodFor(m)} />
                  <div className="chat-msg-body">
                    <span className="sr-only">{assistant.name} said: </span>
                    <div className="chat-md">
                      <Markdown src={m.text} onAnchor={onAnchor} />
                    </div>
                    <div className="chat-actions">
                      <CopyButton text={m.text} />
                    </div>
                    {i === lastIndex && !pending && m.suggestions.length > 0 && (
                      <ul className="chat-suggest" aria-label="Suggested follow-ups">
                        {m.suggestions.map((s) => (
                          <li key={s}>
                            <button type="button" onClick={() => send(s)}>
                              {s}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ),
            )}
            {pending && (
              <li className="chat-msg chat-msg--bot chat-thinking">
                <Avatar small mood="thinking" />
                <p className="chat-thinking-label">
                  <span className="chat-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  Thinking…
                </p>
              </li>
            )}
          </ol>
        )}
      </div>

      {!atBottom && messages.length > 0 && (
        <button
          type="button"
          className="chat-jump"
          aria-label="Scroll to the latest message"
          onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' })}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M8 3.5v9M4 8.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Your question
        </label>
        <textarea
          ref={input}
          id={inputId}
          className="chat-input"
          rows={1}
          value={draft}
          maxLength={assistant.maxLength}
          placeholder={assistant.placeholder}
          enterKeyHint="send"
          autoComplete="off"
          aria-describedby={hintId}
          data-lenis-prevent
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKey}
        />
        {pending ? (
          <button type="button" className="chat-send chat-send--stop" onClick={stop} aria-label="Stop answering">
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="chat-send" disabled={!draft.trim()} aria-label="Send">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M8 13V3.5M3.75 7.5 8 3.25l4.25 4.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>
      <p className="chat-foot" id={hintId}>
        {nearLimit ? (
          <span aria-live="polite">
            {draft.length} / {assistant.maxLength} characters
          </span>
        ) : (
          <>
            Answers come only from this portfolio.
            {!isTouch && <span className="chat-foot-keys"> Enter to send.</span>}
          </>
        )}
      </p>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  )
}

function Avatar({ small, large, mood, live }: { small?: boolean; large?: boolean; mood?: Mood; live?: boolean }) {
  return (
    <span className={`chat-avatar${small ? ' chat-avatar--sm' : ''}${large ? ' chat-avatar--lg' : ''}`} aria-hidden="true">
      <Robot mood={mood} live={live} />
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (state === 'idle') return
    const t = window.setTimeout(() => setState('idle'), 1800)
    return () => window.clearTimeout(t)
  }, [state])

  const copy = async () => {
    const plain = toPlainText(text)
    try {
      await navigator.clipboard.writeText(plain)
      setState('copied')
    } catch {
      // No async clipboard (insecure context, permissions): the selection fallback.
      const area = document.createElement('textarea')
      area.value = plain
      area.setAttribute('readonly', '')
      area.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
      document.body.appendChild(area)
      area.select()
      let ok = false
      try {
        ok = document.execCommand('copy')
      } catch {
        ok = false
      }
      area.remove()
      setState(ok ? 'copied' : 'failed')
    }
  }

  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'
  return (
    <button type="button" className="chat-action" onClick={copy} data-state={state} aria-label={state === 'idle' ? 'Copy answer' : label}>
      {state === 'copied' ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <rect x="5.25" y="5.25" width="8" height="8" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10.75 3.25v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )}
      <span aria-hidden="true">{label}</span>
    </button>
  )
}
