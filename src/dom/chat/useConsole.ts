import { useCallback, useRef, useState } from 'react'
import { describe, resolve, type Resolution } from '../../core/console'

/** One resolved input: what was typed (or clicked, as the command it stands for), and what it opened. */
export interface Entry {
  id: string
  input: string
  res: Resolution
  /** Measured time to resolve, in milliseconds. Nothing is delayed to look busy. */
  ms: number
}

/** Kept in memory only; the oldest entries drop off past this. */
const MAX_ENTRIES = 60

let seq = 0
/** Unique within a session, even across a hot reload that restarts `seq`. */
const uid = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * The console session: the trail of resolved inputs, which one is on screen, and the input history
 * for ↑ / ↓. Nothing is stored or sent anywhere. Each input resolves synchronously against the
 * local index (src/core/console.ts), in the context of the view on screen.
 */
export function useConsole(resume: string | null, onAct: (act: 'map') => void) {
  const [entries, setEntries] = useState<Entry[]>([])
  /** Index of the entry on screen; -1 is the first screen. */
  const [cursor, setCursor] = useState(-1)
  const [announcement, setAnnouncement] = useState('')
  const history = useRef<string[]>([])
  const state = useRef({ entries, cursor })
  state.current = { entries, cursor }

  const current = cursor >= 0 ? entries[cursor] : null

  /** The context a new input resolves in: the view on screen. */
  const context = useCallback(() => {
    const { entries: es, cursor: c } = state.current
    const on = c >= 0 ? es[c] : null
    return { focus: on?.res.focus, topic: on?.res.topic, resume, now: new Date() }
  }, [resume])

  const back = useCallback(() => {
    const c = state.current.cursor
    if (c < 0) return false
    setCursor(c - 1)
    const prev = c - 1 >= 0 ? state.current.entries[c - 1] : null
    setAnnouncement(prev ? `Back to ${describe(prev.res)}.` : 'Back to the start.')
    return true
  }, [])

  const home = useCallback(() => {
    setEntries([])
    setCursor(-1)
    setAnnouncement('Back to the start. Trail cleared.')
  }, [])

  /** Resolves and shows one input. Returns false for empty input. */
  const run = useCallback(
    (raw: string) => {
      const input = raw.trim()
      if (!input) return false
      const t0 = performance.now()
      const res = resolve(input, context())
      const ms = performance.now() - t0
      if (!res) return false
      const h = history.current
      if (h[h.length - 1] !== input) h.push(input)
      if (h.length > MAX_ENTRIES) h.shift()

      if (res.act) {
        if (res.act === 'back') back()
        else if (res.act === 'home') home()
        else onAct('map')
        return true
      }

      const entry: Entry = { id: uid(), input, res, ms }
      const next = [...state.current.entries, entry].slice(-MAX_ENTRIES)
      setEntries(next)
      setCursor(next.length - 1)
      setAnnouncement(`${res.route === 'fallback' ? 'No match' : 'Showing'} ${describe(res)}.`)
      return true
    },
    [context, back, home, onAct],
  )

  const goto = useCallback((i: number) => {
    const e = state.current.entries[i]
    if (!e) return
    setCursor(i)
    setAnnouncement(`Showing ${describe(e.res)}.`)
  }, [])

  /** Input history, newest last, for ↑ / ↓ in the command line. */
  const recall = useCallback((at: number) => history.current[history.current.length - 1 - at], [])

  return { entries, cursor, current, announcement, run, back, home, goto, recall, context }
}
