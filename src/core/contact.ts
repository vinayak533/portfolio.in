/**
 * Contact form rules, shared by the form (src/dom/contact/ContactForm.tsx) and
 * the server (server/contact.ts), so both validate exactly the same way.
 * No DOM and no Node APIs here.
 */

export const CONTACT_ENDPOINT = '/api/contact'

export const contactFields = ['name', 'email', 'subject', 'message'] as const
export type ContactField = (typeof contactFields)[number]
export type ContactValues = Record<ContactField, string>
export type ContactErrors = Partial<Record<ContactField, string>>

export const contactLimits: Record<ContactField, { min: number; max: number }> = {
  name: { min: 2, max: 100 },
  email: { min: 3, max: 254 },
  subject: { min: 2, max: 150 },
  message: { min: 10, max: 5000 },
}

/** What the form posts. `company` is the honeypot; `elapsed` is ms since the form appeared. */
export interface ContactPayload extends ContactValues {
  company?: string
  elapsed?: number
}

/** What the server answers. */
export type ContactResponse = { ok: true } | { ok: false; error: string; fields?: ContactErrors }

/** Submissions faster than this are treated as automated. */
export const MIN_FILL_MS = 2000

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/

// Control characters other than tab, line feed and carriage return.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/** Trims and strips control characters; single-line fields also fold newlines and runs of spaces. */
export function cleanContact(input: Partial<Record<ContactField, unknown>>): ContactValues {
  const line = (v: unknown) =>
    String(v ?? '')
      .replace(CONTROL, '')
      .replace(/\s+/g, ' ')
      .trim()
  return {
    name: line(input.name),
    email: line(input.email).toLowerCase(),
    subject: line(input.subject),
    message: String(input.message ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(CONTROL, '')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim(),
  }
}

export function validateContactField(field: ContactField, value: string): string | undefined {
  const { min, max } = contactLimits[field]
  if (!value) {
    return {
      name: 'Please enter your name.',
      email: 'Please enter your email address.',
      subject: 'Please add a subject.',
      message: 'Please write a message.',
    }[field]
  }
  if (field === 'email') return value.length > max || !EMAIL.test(value) ? 'Please enter a valid email address, like name@example.com.' : undefined
  if (value.length < min) return `Please use at least ${min} characters.`
  if (value.length > max) return `Please keep this under ${max.toLocaleString('en')} characters.`
  return undefined
}

export function validateContact(values: ContactValues): ContactErrors {
  const errors: ContactErrors = {}
  for (const f of contactFields) {
    const e = validateContactField(f, values[f])
    if (e) errors[f] = e
  }
  return errors
}
