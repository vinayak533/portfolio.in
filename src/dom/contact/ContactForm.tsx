import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  CONTACT_ENDPOINT,
  cleanContact,
  contactFields,
  contactLimits,
  validateContact,
  validateContactField,
  type ContactErrors,
  type ContactField,
  type ContactResponse,
  type ContactValues,
} from '../../core/contact'

const EMPTY: ContactValues = { name: '', email: '', subject: '', message: '' }
const REQUEST_TIMEOUT_MS = 20_000

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent'; name: string } | { kind: 'error'; message: string }

/**
 * Name, email, subject and message, posted to /api/contact (server/contact.ts).
 * Success is only shown once the server reports that the email provider
 * accepted the message. On failure the text is kept so the visitor can retry.
 */
export function ContactForm({ email }: { email: string }) {
  const uid = useId()
  const id = (f: string) => `${uid}-${f}`
  const form = useRef<HTMLFormElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const shownAt = useRef(Date.now())
  const inFlight = useRef(false)
  const [values, setValues] = useState<ContactValues>(EMPTY)
  const [errors, setErrors] = useState<ContactErrors>({})
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({})
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const sending = status.kind === 'sending'

  // Sent replaces the form (and the focused button) with a note: move focus onto it.
  // On error focus stays on the button, so retrying is one key away; the alert is announced.
  useEffect(() => {
    if (status.kind === 'sent') statusRef.current?.focus({ preventScroll: true })
  }, [status])

  const update = (f: ContactField, v: string) => {
    setValues((s) => ({ ...s, [f]: v }))
    // Once a field has shown an error, re-check it live so the message clears as soon as it is fixed.
    if (touched[f]) setErrors((e) => ({ ...e, [f]: validateContactField(f, cleanContact({ ...values, [f]: v })[f]) }))
  }

  const blur = (f: ContactField) => {
    if (!values[f]) return // Leaving an empty field is not an error yet; submitting is.
    setTouched((t) => ({ ...t, [f]: true }))
    setErrors((e) => ({ ...e, [f]: validateContactField(f, cleanContact(values)[f]) }))
  }

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (inFlight.current) return

    const clean = cleanContact(values)
    const found = validateContact(clean)
    setErrors(found)
    setTouched({ name: true, email: true, subject: true, message: true })
    const first = contactFields.find((f) => found[f])
    if (first) {
      form.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus()
      return
    }

    inFlight.current = true
    setStatus({ kind: 'sending' })
    const honeypot = form.current?.querySelector<HTMLInputElement>('[name="company"]')?.value ?? ''
    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...clean, company: honeypot, elapsed: Date.now() - shownAt.current }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const data = (await res.json().catch(() => null)) as ContactResponse | null
      if (res.ok && data?.ok) {
        setStatus({ kind: 'sent', name: clean.name.split(' ')[0] })
        setValues(EMPTY)
        setErrors({})
        setTouched({})
        return
      }
      if (data && !data.ok && data.fields) setErrors(data.fields)
      setStatus({
        kind: 'error',
        message: data && !data.ok ? data.error : `The message couldn’t be sent (error ${res.status}). Please try again.`,
      })
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')
      setStatus({
        kind: 'error',
        message: timedOut
          ? 'The server took too long to answer. Please try again.'
          : 'Couldn’t reach the server. Check your connection and try again.',
      })
    } finally {
      inFlight.current = false
    }
  }

  const again = () => {
    shownAt.current = Date.now()
    setStatus({ kind: 'idle' })
    requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[name="name"]')?.focus())
  }

  if (status.kind === 'sent') {
    return (
      <div className="ctf-done" ref={statusRef} tabIndex={-1} role="status" aria-live="polite">
        <span className="ctf-done-mark" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="20" height="20">
            <path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="ctf-done-title">Message sent{status.name ? `, thanks ${status.name}` : ''}.</p>
        <p className="ctf-done-copy">I’ll reply to the email address you gave.</p>
        <button type="button" className="ctf-ghost" onClick={again}>
          Send another message
        </button>
      </div>
    )
  }

  const field = (f: ContactField, label: string, props: { type?: string; autoComplete: string; inputMode?: 'email' }) => {
    const err = touched[f] ? errors[f] : undefined
    return (
      <div className="ctf-field" data-invalid={err ? '' : undefined}>
        <label htmlFor={id(f)} className="ctf-label">
          {label}
          <span className="ctf-req" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id={id(f)}
          name={f}
          className="ctf-input"
          type={props.type ?? 'text'}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          spellCheck={f === 'email' ? false : undefined}
          required
          maxLength={contactLimits[f].max}
          value={values[f]}
          onChange={(e) => update(f, e.target.value)}
          onBlur={() => blur(f)}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? id(`${f}-err`) : undefined}
          data-cursor="hidden"
        />
        {err && (
          <p id={id(`${f}-err`)} className="ctf-error">
            {err}
          </p>
        )}
      </div>
    )
  }

  const messageErr = touched.message ? errors.message : undefined
  const left = contactLimits.message.max - values.message.length

  return (
    <form ref={form} className="ctf" noValidate onSubmit={submit} aria-busy={sending}>
      <div className="ctf-row">
        {field('name', 'Full name', { autoComplete: 'name' })}
        {field('email', 'Email address', { type: 'email', autoComplete: 'email', inputMode: 'email' })}
      </div>
      {field('subject', 'Subject', { autoComplete: 'off' })}

      <div className="ctf-field" data-invalid={messageErr ? '' : undefined}>
        <label htmlFor={id('message')} className="ctf-label">
          Message
          <span className="ctf-req" aria-hidden="true">
            *
          </span>
        </label>
        <textarea
          id={id('message')}
          name="message"
          className="ctf-input ctf-textarea"
          rows={5}
          required
          maxLength={contactLimits.message.max}
          value={values.message}
          onChange={(e) => update('message', e.target.value)}
          onBlur={() => blur('message')}
          aria-invalid={messageErr ? true : undefined}
          aria-describedby={[messageErr && id('message-err'), id('message-count')].filter(Boolean).join(' ')}
          data-cursor="hidden"
          data-lenis-prevent
        />
        <div className="ctf-meta">
          {messageErr ? (
            <p id={id('message-err')} className="ctf-error">
              {messageErr}
            </p>
          ) : (
            <span />
          )}
          <span id={id('message-count')} className="ctf-count" data-low={left < 200 || undefined}>
            <span className="sr-only">Characters left: </span>
            {left.toLocaleString('en')}
          </span>
        </div>
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots that fill every field give themselves away. */}
      <div className="ctf-trap" aria-hidden="true">
        <label htmlFor={id('company')}>Company</label>
        <input id={id('company')} name="company" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="ctf-actions">
        <button type="submit" className="ctf-submit" disabled={sending}>
          <span>{sending ? 'Sending…' : 'Send message'}</span>
          {sending ? (
            <span className="ctf-spinner" aria-hidden="true" />
          ) : (
            <svg className="ctf-submit-arrow" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 8h9.5M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      <span className="sr-only" role="status">
        {sending ? 'Sending your message…' : ''}
      </span>
      <div className="ctf-status" role="alert">
        {status.kind === 'error' && (
          <p className="ctf-fail">
            {status.message}{' '}
            <span className="ctf-fail-alt">
              You can also write to <a href={`mailto:${email}`}>{email}</a>.
            </span>
          </p>
        )}
      </div>
    </form>
  )
}
