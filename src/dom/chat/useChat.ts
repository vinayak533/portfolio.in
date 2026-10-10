import { useCallback, useEffect, useRef, useState } from 'react'
import { answer, type AskContext } from '../../core/assistant'
import { toPlainText } from '../../core/markdown'
import { assistant } from '../../assistant'

export type ChatMessage =
  | { id: string; role: 'user'; text: string; state?: 'stopped' | 'failed' }
  | { id: string; role: 'assistant'; text: string; topic: string; suggestions: string[]; known: boolean }

/**
 * The shortest time "Thinking…" stays up. Answers are computed locally in well
 * under a millisecond; without this the indicator would flash for one frame.
 * It delays only the indicator's hand-off, never the work.
 */
export const MIN_THINK_MS = 450

let seq = 0
const uid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * One conversation, held in memory only (nothing is stored or sent anywhere).
 * One question at a time: send() is refused while an answer is pending, so a
 * double Enter or a rapid second click can't duplicate a turn.
 */
export function useChat(resume: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  /** The user message being answered, or null. */
  const [pending, setPending] = useState<string | null>(null)
  /** Polite live-region text: each finished answer once, never per update. */
  const [announcement, setAnnouncement] = useState('')
  const timer = useRef(0)
  const busy = useRef(false)
  const context = useRef<AskContext>({})
  const resumeRef = useRef(resume)
  resumeRef.current = resume

  const settle = () => {
    window.clearTimeout(timer.current)
    timer.current = 0
    busy.current = false
    setPending(null)
  }

  const run = useCallback((id: string, text: string) => {
    busy.current = true
    setPending(id)
    const started = performance.now()
    let reply: ReturnType<typeof answer> | null = null
    try {
      reply = answer(text, { ...context.current, resume: resumeRef.current })
    } catch (err) {
      console.error('[chat] could not answer:', err)
    }
    timer.current = window.setTimeout(
      () => {
        settle()
        if (!reply) {
          setMessages((m) => m.map((x) => (x.id === id && x.role === 'user' ? { ...x, state: 'failed' } : x)))
          setAnnouncement('Something went wrong. You can retry.')
          return
        }
        // "It" in the next question means the project this answer was about (if any).
        context.current = { project: reply.project, topic: reply.topic }
        const r = reply
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: r.text, topic: r.topic, suggestions: r.suggestions, known: r.known }])
        setAnnouncement(toPlainText(r.text))
      },
      Math.max(0, MIN_THINK_MS - (performance.now() - started)),
    )
  }, [])

  /** Returns false when nothing was sent (empty, or an answer is still pending). */
  const send = useCallback(
    (raw: string) => {
      const text = raw.trim().slice(0, assistant.maxLength)
      if (!text || busy.current) return false
      const id = uid()
      setMessages((m) => [...m, { id, role: 'user', text }])
      setAnnouncement('')
      run(id, text)
      return true
    },
    [run],
  )

  /** Cancels the pending answer; the question stays, marked as stopped, with Retry. */
  const stop = useCallback(() => {
    if (!busy.current) return
    setMessages((m) => {
      const last = m[m.length - 1]
      return last?.role === 'user' ? [...m.slice(0, -1), { ...last, state: 'stopped' }] : m
    })
    settle()
    setAnnouncement('Stopped.')
  }, [])

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
    settle()
    context.current = {}
    setMessages([])
    setAnnouncement('New chat started.')
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { messages, pending, announcement, send, stop, retry, reset }
}
