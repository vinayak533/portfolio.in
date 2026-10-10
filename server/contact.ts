/**
 * POST /api/contact: validates a contact-form submission and delivers it
 * through Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 *
 * Web-standard Request in, Response out, so the same handler runs as a Vercel
 * Function (api/contact.ts) and inside the Vite dev server (vite.config.ts).
 * Secrets come in through `env` and never leave the server.
 */
import {
  cleanContact,
  MIN_FILL_MS,
  validateContact,
  type ContactPayload,
  type ContactResponse,
  type ContactValues,
} from '../src/core/contact.js'
import { contact } from '../src/content.js'

export interface ContactEnv {
  /** Resend API key (server-only). Required. */
  RESEND_API_KEY?: string
  /** Inbox that receives submissions. */
  CONTACT_TO_EMAIL?: string
  /** Sender on a domain verified in Resend, e.g. `Portfolio <contact@yourdomain.com>`. */
  CONTACT_FROM_EMAIL?: string
}

/** The address the site shows, so a visitor's message lands where they expect it to. */
const DEFAULT_TO = contact.email
/** Resend's shared test sender: it only delivers to the Resend account owner's own address. */
const DEFAULT_FROM = 'Portfolio contact <onboarding@resend.dev>'
const MAX_BODY_BYTES = 16 * 1024
const PROVIDER_TIMEOUT_MS = 10_000

/** Per-IP limit: RATE_MAX submissions per RATE_WINDOW_MS. */
const RATE_MAX = 5
const RATE_WINDOW_MS = 10 * 60 * 1000
/**
 * In memory, so it is per server instance: it holds while a Vercel Function
 * stays warm and resets on a cold start. A cheap first line, not a guarantee.
 */
const hits = new Map<string, number[]>()

function json(status: number, body: ContactResponse, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

const fail = (status: number, error: string, extra?: Partial<Extract<ContactResponse, { ok: false }>>, headers?: Record<string, string>) =>
  json(status, { ok: false, error, ...extra }, headers)

function clientIp(request: Request) {
  const h = request.headers
  return (h.get('x-vercel-forwarded-for') ?? h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
}

/** Returns the seconds to wait when `ip` is over the limit, else 0 (and counts this attempt). */
function rateLimited(ip: string, now = Date.now()) {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX) {
    hits.set(ip, recent)
    return Math.ceil((RATE_WINDOW_MS - (now - recent[0])) / 1000)
  }
  recent.push(now)
  hits.set(ip, recent)
  // Keep the map from growing without bound on a long-lived instance.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(k)
  }
  return 0
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function composeEmail(v: ContactValues, at: Date) {
  const when = `${at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST (${at.toISOString()})`
  const text = [
    'New message from your portfolio contact form.',
    '',
    `Name:      ${v.name}`,
    `Email:     ${v.email}`,
    `Subject:   ${v.subject}`,
    `Submitted: ${when}`,
    '',
    v.message,
    '',
    '-- Reply to this email to answer the sender directly.',
  ].join('\n')

  const row = (k: string, val: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#6b6880;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:4px 0;color:#111">${val}</td></tr>`
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5fa;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.5">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6e3f0;border-radius:10px;padding:24px">
<p style="margin:0 0 16px;color:#6b6880;font-size:13px">New message from your portfolio contact form</p>
<table role="presentation" style="border-collapse:collapse;margin:0 0 20px">
${row('Name', escapeHtml(v.name))}
${row('Email', `<a href="mailto:${escapeHtml(v.email)}" style="color:#5b3fe0">${escapeHtml(v.email)}</a>`)}
${row('Subject', escapeHtml(v.subject))}
${row('Submitted', escapeHtml(when))}
</table>
<div style="border-top:1px solid #e6e3f0;padding-top:16px;color:#111;white-space:pre-wrap">${escapeHtml(v.message)}</div>
<p style="margin:20px 0 0;color:#6b6880;font-size:13px">Reply to this email to answer ${escapeHtml(v.name)} directly.</p>
</div></body></html>`

  return { text, html }
}

export async function handleContact(request: Request, env: ContactEnv): Promise<Response> {
  if (request.method !== 'POST') return fail(405, 'Method not allowed.', undefined, { allow: 'POST' })
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return fail(415, 'Expected a JSON body.')
  }
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return fail(413, 'That message is too long.')

  const wait = rateLimited(clientIp(request))
  if (wait) {
    return fail(429, 'Too many messages in a short time. Please try again in a few minutes.', undefined, { 'retry-after': String(wait) })
  }

  let payload: Partial<ContactPayload>
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return fail(413, 'That message is too long.')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    payload = parsed as Partial<ContactPayload>
  } catch {
    return fail(400, 'The request could not be read.')
  }

  // Spam checks. Rejected openly (never a fake success), worded for the rare human who trips them.
  if (typeof payload.company === 'string' && payload.company.trim() !== '') {
    return fail(400, 'This message was flagged as automated. Please email me directly instead.')
  }
  if (typeof payload.elapsed !== 'number' || payload.elapsed < MIN_FILL_MS) {
    return fail(400, 'That was quicker than expected. Please wait a moment and send again.')
  }

  const values = cleanContact(payload)
  const fields = validateContact(values)
  if (Object.keys(fields).length) return fail(422, 'Please check the highlighted fields.', { fields })

  const apiKey = env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set: cannot deliver messages.')
    return fail(503, 'The contact form isn’t available right now.')
  }

  const { text, html } = composeEmail(values, new Date())
  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL?.trim() || DEFAULT_FROM,
        to: [env.CONTACT_TO_EMAIL?.trim() || DEFAULT_TO],
        // The visitor is the reply-to, never the sender: no spoofing.
        reply_to: values.email,
        subject: `Portfolio: ${values.subject}`,
        text,
        html,
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    })
  } catch (err) {
    console.error('[contact] Resend request failed:', err)
    return fail(502, 'The message couldn’t be sent. Please try again.')
  }

  const result = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null
  if (!res.ok || !result?.id) {
    console.error(`[contact] Resend rejected the message (${res.status}):`, result?.name ?? '', result?.message ?? '')
    return fail(502, 'The message couldn’t be sent. Please try again.')
  }
  return json(200, { ok: true })
}
