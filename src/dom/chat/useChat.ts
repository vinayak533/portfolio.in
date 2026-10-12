import { useCallback, useEffect, useRef, useState } from 'react'
import { answer, type AskContext, type TraceStep } from '../../core/assistant'
import { closeOpenMarks, streamChunks, toPlainText } from '../../core/markdown'
import { assistant } from '../../assistant'

export type ChatMessage =
  | { id: string; role: 'user'; text: string; state?: 'stopped' | 'failed' }
  | {
      id: string
      role: 'assistant'
      text: string
      topic: string
      suggestions: string[]
      known: boolean
      /** The steps shown while thinking, kept so "Thought for …" can be opened again. */
      trace: TraceStep[]
      thoughtMs: number
      /** Stopped mid-answer: `text` is what had arrived by then. */
      stopped?: boolean
    }

/** The answer being worked out: its trace plays one step at a time. */
export interface Thinking {
  /** The user message being answered. */
  id: string
  trace: TraceStep[]
  /** performance.now() when it started. */
  started: number
  /** Time each step takes on screen; 0 shows them all at once. */
  stepMs: number
  /** Time until the answer starts to arrive. */
  total: number
}

/** The answer arriving chunk by chunk, like a model's tokens. */
export interface Stream {
  /** The assistant message being revealed. */
  id: string
  chunks: string[]
  shown: number
}

/**
 * The pace of an answer. Computed locally in well under a millisecond, it is
 * given the rhythm of a model that reasons and then writes: each step of its
 * trace takes STEP_MS, then the text streams at about STREAM_MS a word, sped
 * up so that no answer takes longer than STREAM_MAX_MS to arrive.
 */
const STEP_MS = 280
const SETTLE_MS = 260
const TICK_MS = 32
const STREAM_MS = 26
const STREAM_MAX_MS = 2600

let seq = 0
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

/** What a partly streamed answer shows: its chunks so far, with any open ** or ` closed. */
export const streamedText = (s: Stream) => closeOpenMarks(s.chunks.slice(0, s.shown).join(''))

/**
 * One conversation, held in memory only (nothing is stored or sent anywhere).
 * One question at a time: send() is refused while an answer is thinking or
 * streaming, so a double Enter or a rapid second click can't duplicate a turn.
 */
export function useChat(resume: string | null, reducedMotion: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [thinking, setThinking] = useState<Thinking | null>(null)
  const [stream, setStream] = useState<Stream | null>(null)
  /** Polite live-region text: each finished answer once, never per chunk. */
  const [announcement, setAnnouncement] = useState('')
  const timer = useRef(0)
  const ticker = useRef(0)
  const busy = useRef(false)
  const streamRef = useRef<Stream | null>(null)
  const context = useRef<AskContext>({})
  const resumeRef = useRef(resume)
  resumeRef.current = resume
  const reducedRef = useRef(reducedMotion)
  reducedRef.current = reducedMotion

  const clearTimers = () => {
    window.clearTimeout(timer.current)
    window.clearInterval(ticker.current)
    timer.current = 0
    ticker.current = 0
  }

  const setStreamBoth = (s: Stream | null) => {
    streamRef.current = s
    setStream(s)
  }

  /** The stream is done (or cut short): the message keeps `text`, chips and copy appear. */
  const endStream = useCallback((s: Stream, stopped: boolean) => {
    clearTimers()
    busy.current = false
    setStreamBoth(null)
    const full = s.chunks.join('')
    const text = stopped ? streamedText(s) : full
    setMessages((m) => m.map((x) => (x.id === s.id && x.role === 'assistant' ? { ...x, text, stopped: stopped || undefined } : x)))
    setAnnouncement(stopped ? 'Stopped.' : toPlainText(full))
  }, [])

  const startStream = useCallback(
    (id: string, text: string) => {
      const chunks = streamChunks(text)
      const s: Stream = { id, chunks, shown: 0 }
      if (reducedRef.current || chunks.length < 2) return endStream(s, false)
      setStreamBoth(s)
      const duration = Math.min(chunks.length * STREAM_MS, STREAM_MAX_MS)
      const perTick = Math.max(1, Math.round(chunks.length / (duration / TICK_MS)))
      ticker.current = window.setInterval(() => {
        const cur = streamRef.current
        if (!cur) return
        const next = { ...cur, shown: Math.min(cur.chunks.length, cur.shown + perTick) }
        if (next.shown >= next.chunks.length) endStream(next, false)
        else setStreamBoth(next)
      }, TICK_MS)
    },
    [endStream],
  )

  const run = useCallback(
    (id: string, text: string) => {
      busy.current = true
      setAnnouncement('Thinking…')
      let reply: ReturnType<typeof answer> | null = null
      try {
        reply = answer(text, { ...context.current, resume: resumeRef.current })
      } catch (err) {
        console.error('[chat] could not answer:', err)
      }
      const steps = reply?.trace.length ?? 1
      const stepMs = reducedRef.current ? 0 : STEP_MS
      const total = reducedRef.current ? 450 : steps * STEP_MS + SETTLE_MS
      setThinking({ id, trace: reply?.trace ?? [], started: performance.now(), stepMs, total })
      timer.current = window.setTimeout(() => {
        setThinking(null)
        if (!reply) {
          busy.current = false
          setMessages((m) => m.map((x) => (x.id === id && x.role === 'user' ? { ...x, state: 'failed' } : x)))
          setAnnouncement('Something went wrong. You can retry.')
          return
        }
        // "It" in the next question means the project this answer was about (if any).
        context.current = { project: reply.project, topic: reply.topic }
        const r = reply
        const mid = uid()
        setMessages((m) => [
          ...m,
          { id: mid, role: 'assistant', text: r.text, topic: r.topic, suggestions: r.suggestions, known: r.known, trace: r.trace, thoughtMs: total },
        ])
        startStream(mid, r.text)
      }, total)
    },
    [startStream],
  )

  /** Returns false when nothing was sent (empty, or an answer is still on its way). */
  const send = useCallback(
    (raw: string) => {
      const text = raw.trim().slice(0, assistant.maxLength)
      if (!text || busy.current) return false
      const id = uid()
      setMessages((m) => [...m, { id, role: 'user', text }])
      run(id, text)
      return true
    },
    [run],
  )

  /**
   * Stops the answer. While thinking, the question stays, marked as stopped, with Retry.
   * While streaming, the answer keeps what has arrived, or with `flush` (closing the panel)
   * arrives in full at once.
   */
  const stop = useCallback(
    (flush = false) => {
      if (!busy.current) return
      const s = streamRef.current
      if (s) return endStream(s, !flush)
      clearTimers()
      busy.current = false
      setThinking(null)
      setMessages((m) => {
        const last = m[m.length - 1]
        return last?.role === 'user' ? [...m.slice(0, -1), { ...last, state: 'stopped' }] : m
      })
      setAnnouncement('Stopped.')
    },
    [endStream],
  )

  /** Asks a stopped or failed question again, in place (no duplicate message). */
  const retry = useCallback(
    (id: string) => {
      if (busy.current) return
      const msg = messages.find((m) => m.id === id)
      if (!msg || msg.role !== 'user') return
      setMessages((m) => m.map((x) => (x.id === id && x.role === 'user' ? { id: x.id, role: 'user', text: x.text } : x)))
      run(id, msg.text)
    },
    [messages, run],
  )

  const reset = useCallback(() => {
    clearTimers()
    busy.current = false
    setThinking(null)
    setStreamBoth(null)
    context.current = {}
    setMessages([])
    setAnnouncement('New chat started.')
  }, [])

  useEffect(() => clearTimers, [])

  return { messages, thinking, stream, busy: Boolean(thinking || stream), announcement, send, stop, retry, reset }
}
