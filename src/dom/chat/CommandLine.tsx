import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { assistant } from '../../assistant'
import { complete, type Completion } from '../../core/console'

interface CommandLineProps {
  inputRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
  /** Runs an input; true when it ran. */
  onRun: (input: string) => boolean
  /** The node a highlighted dropdown entry opens, previewed on the graph. */
  onHover: (key: string | null) => void
  /** Earlier inputs, 0 = the last one. */
  recall: (at: number) => string | undefined
  /** Escape with nothing left to close here: the panel goes back, or closes. */
  onEscape: () => void
  /** An answer is still arriving: the send button becomes Stop. */
  busy: boolean
  onStop: () => void
}

/** The textarea grows with its text up to this many pixels, then scrolls. */
const MAX_HEIGHT = 168

/**
 * The composer. Plain words are questions: Enter sends, Shift+Enter starts a new line. Typing "/"
 * opens a dropdown of commands, each with what it does in a few words; after a space, its
 * options. ↑ / ↓ move through the dropdown, or (on a one-line draft) through earlier questions;
 * Tab completes; Escape closes the dropdown, then clears the draft, then hands over to the panel.
 */
export function CommandLine({ inputRef, value, onChange, onRun, onHover, recall, onEscape, busy, onStop }: CommandLineProps) {
  const listId = useId()
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [hist, setHist] = useState(-1)
  const list = useRef<HTMLUListElement>(null)

  const items = useMemo(() => complete(value), [value])
  const open = Boolean(items?.length) && !dismissed
  const item: Completion | undefined = open ? items![Math.min(active, items!.length - 1)] : undefined

  // A new query starts at the top of the list.
  useEffect(() => setActive(0), [items])
  useEffect(() => {
    onHover(item?.focus ?? null)
  }, [item, onHover])
  useEffect(() => {
    if (!open) return
    // Scroll the list alone: scrollIntoView would move the thread behind it too.
    const ul = list.current
    const li = ul?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!ul || !li) return
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight
  }, [active, open])

  // Grow with the text.
  useLayoutEffect(() => {
    const ta = inputRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT)}px`
    ta.style.overflowY = ta.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [value, inputRef])

  const change = (v: string) => {
    setDismissed(false)
    setHist(-1)
    onChange(v)
  }

  const send = (text: string) => {
    if (busy) return
    if (onRun(text)) change('')
  }

  const pick = (c: Completion) => {
    if (!c.ready) {
      change(c.value)
      inputRef.current?.focus()
      return
    }
    send(c.value)
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    const n = open ? items!.length : 0
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const step = e.key === 'ArrowDown' ? 1 : -1
        if (n) {
          e.preventDefault()
          setActive((a) => (Math.min(a, n - 1) + step + n) % n)
          return
        }
        // History only on a one-line draft, so the arrows still move between lines of a longer one.
        if (value.includes('\n')) return
        const at = hist - step
        if (at < -1) return
        const v = at === -1 ? '' : recall(at)
        if (v === undefined) return
        e.preventDefault()
        setHist(at)
        // A recalled command keeps the dropdown shut, so ↑ / ↓ keep walking the history; typing reopens it.
        setDismissed(at !== -1)
        onChange(v)
        return
      }
      case 'Tab':
        if (!item) return
        e.preventDefault()
        change(item.ready && item.kind === 'command' && item.value === value ? `${item.value} ` : item.value)
        return
      case 'Enter':
        if (e.shiftKey) return
        e.preventDefault()
        if (item) return pick(item)
        send(value)
        return
      case 'Escape':
        e.stopPropagation()
        if (open) return setDismissed(true)
        if (value) return change('')
        onEscape()
    }
  }

  const optionId = (i: number) => `${listId}-o${i}`
  const empty = !value.trim()

  return (
    <div className="cx-cmd">
      {open && (
        <div className="cx-palette" data-lenis-prevent>
          <ul ref={list} id={listId} className="cx-pal-list" role="listbox" aria-label={value.includes(' ') ? 'Options' : 'Commands'}>
            {items!.map((c, i) => (
              <li
                key={c.value}
                id={optionId(i)}
                role="option"
                aria-selected={c === item}
                className="cx-pal-item"
                data-kind={c.kind}
                onMouseMove={() => i !== active && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
              >
                <span className="cx-pal-label">{c.label}</span>
                <span className="cx-pal-detail">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        className="cx-line"
        data-busy={busy || undefined}
        onSubmit={(e) => {
          e.preventDefault()
          if (busy) return onStop()
          if (item) pick(item)
          else send(value)
        }}
      >
        <label className="sr-only" htmlFor={`${listId}-input`}>
          Ask a question, or type / for commands
        </label>
        <span className="cx-prompt" aria-hidden="true">
          ❯
        </span>
        <textarea
          ref={inputRef}
          id={`${listId}-input`}
          className="cx-input"
          rows={1}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={item && items?.length ? optionId(items.indexOf(item)) : undefined}
          value={value}
          maxLength={assistant.maxLength}
          placeholder={assistant.console.placeholder}
          enterKeyHint="send"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKey}
        />
        {/* The commands, one click away: puts "/" in the composer, which opens the dropdown. */}
        <button
          type="button"
          className="cx-slash"
          aria-label="Show commands"
          title="Commands (/)"
          aria-pressed={value.startsWith('/')}
          onClick={() => {
            change(value.startsWith('/') ? '' : '/')
            inputRef.current?.focus()
          }}
        >
          /
        </button>
        {busy ? (
          <button type="submit" className="cx-send cx-send--stop" aria-label="Stop the answer">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="4" y="4" width="8" height="8" rx="1.6" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button type="submit" className="cx-send" disabled={empty} aria-label="Send">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M10 15.5v-11M5 9l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>
      <p className="cx-hints" aria-hidden="true">
        {busy ? (
          <span className="cx-hint cx-hint--busy">
            <kbd>esc</kbd> to interrupt
          </span>
        ) : (
          <>
            <span className="cx-hint">
              <kbd>↵</kbd> send
            </span>
            <span className="cx-hint cx-hint--wide">
              <kbd>⇧ ↵</kbd> new line
            </span>
            <span className="cx-hint">
              <kbd>/</kbd> commands
            </span>
            <span className="cx-hint cx-hint--wide">
              <kbd>↑</kbd> history
            </span>
          </>
        )}
        <span className="cx-hint-r">Runs in your browser · nothing is sent</span>
      </p>
    </div>
  )
}
