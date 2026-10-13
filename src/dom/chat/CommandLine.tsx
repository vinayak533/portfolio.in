import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { assistant } from '../../assistant'
import { complete, preview, type Completion, type ConsoleContext } from '../../core/console'

interface CommandLineProps {
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  onChange: (value: string) => void
  /** Runs an input; true when it ran. */
  onRun: (input: string) => boolean
  /** The context the preview resolves in (the view on screen). */
  context: () => ConsoleContext
  /** The node a highlighted palette entry opens, lit on the map. */
  onHover: (key: string | null) => void
  /** Earlier inputs, 0 = the last one. */
  recall: (at: number) => string | undefined
  /** Escape with nothing left to close here: the panel goes back a view, or closes. */
  onEscape: () => void
}

/**
 * The command line. Plain words are questions; "/" opens the palette: every command with what it
 * does, then (after a space) its arguments. ↑ / ↓ move through the palette, or through earlier
 * inputs when it is closed; Tab completes; Enter runs; Escape closes the palette, then clears the
 * line, then hands over to the panel. The highlighted entry is previewed before it runs.
 */
export function CommandLine({ inputRef, value, onChange, onRun, context, onHover, recall, onEscape }: CommandLineProps) {
  const listId = useId()
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [hist, setHist] = useState(-1)
  const list = useRef<HTMLUListElement>(null)

  const items = useMemo(() => complete(value), [value])
  const open = Boolean(items) && !dismissed
  const item: Completion | undefined = open ? items![Math.min(active, items!.length - 1)] : undefined

  // A new query starts at the top of the list.
  useEffect(() => setActive(0), [items])
  useEffect(() => {
    onHover(item?.focus ?? null)
  }, [item, onHover])
  useEffect(() => {
    if (!open) return
    // Scroll the list alone: scrollIntoView would move the view behind the palette too.
    const ul = list.current
    const li = ul?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!ul || !li) return
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight
  }, [active, open])

  const change = (v: string) => {
    setDismissed(false)
    setHist(-1)
    onChange(v)
  }

  const pick = (c: Completion) => {
    if (!c.ready) {
      change(c.value)
      inputRef.current?.focus()
      return
    }
    if (onRun(c.value)) change('')
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    const n = open ? items!.length : 0
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        if (n) {
          setActive((a) => (Math.min(a, n - 1) + step + n) % n)
          return
        }
        if (open) return
        // Shell-style history: ↑ older, ↓ newer, back to an empty line.
        const at = hist - step
        if (at < -1) return
        const v = at === -1 ? '' : recall(at)
        if (v === undefined) return
        setHist(at)
        // A recalled command keeps the palette shut, so ↑ / ↓ keep walking the history; typing reopens it.
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
        e.preventDefault()
        if (item) return pick(item)
        if (onRun(value)) change('')
        return
      case 'Escape':
        e.stopPropagation()
        if (open) return setDismissed(true)
        if (value) return change('')
        onEscape()
    }
  }

  const pv = useMemo(() => {
    if (!item) return null
    // Not runnable yet: say what it needs.
    if (!item.ready) return { title: `${item.label} ${item.hint ?? ''}`.trim(), lines: [item.detail, `Tab or ↵ to add the ${item.hint?.replace(/[<>]/g, '') ?? 'argument'}`] }
    return preview(item.value, context())
  }, [item, context])

  const optionId = (i: number) => `${listId}-o${i}`

  return (
    <div className="cx-cmd">
      {open && (
        <div className="cx-palette" data-lenis-prevent>
          <p className="cx-pal-head" aria-hidden="true">
            <span>{value.includes(' ') ? 'Arguments' : 'Commands'}</span>
            <span className="cx-keys">
              <kbd>↑</kbd>
              <kbd>↓</kbd> select <kbd>Tab</kbd> complete <kbd>↵</kbd> run <kbd>Esc</kbd> close
            </span>
          </p>
          {items!.length ? (
            <ul ref={list} id={listId} className="cx-pal-list" role="listbox" aria-label={value.includes(' ') ? 'Arguments' : 'Commands'}>
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
                  {c.hint && <span className="cx-pal-hint">{c.hint}</span>}
                  <span className="cx-pal-detail">{c.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cx-pal-empty" role="status">
              No command “{value.trim()}”. Enter shows the closest ones.
            </p>
          )}
          {pv && (
            <div className="cx-pal-preview" aria-live="polite">
              <p className="cx-pal-preview-title">
                <span aria-hidden="true">→</span> {pv.title}
              </p>
              {pv.lines.filter(Boolean).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          )}
        </div>
      )}
      <form
        className="cx-line"
        onSubmit={(e) => {
          e.preventDefault()
          if (item) pick(item)
          else if (onRun(value)) change('')
        }}
      >
        <span className="cx-prompt" aria-hidden="true">
          ›
        </span>
        <label className="sr-only" htmlFor={`${listId}-input`}>
          Ask a question or type a command
        </label>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          className="cx-input"
          type="text"
          role="combobox"
          aria-expanded={open && Boolean(items?.length)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={item && items?.length ? optionId(items.indexOf(item)) : undefined}
          value={value}
          maxLength={assistant.maxLength}
          placeholder={assistant.console.placeholder}
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKey}
        />
        <button type="submit" className="cx-run" disabled={!value.trim()} aria-label="Run">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M12.5 3.5v4.25a2 2 0 0 1-2 2H3.5M6.5 6.75 3.5 9.75l3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}
