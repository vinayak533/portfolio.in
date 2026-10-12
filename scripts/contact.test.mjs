// Tests for the contact endpoint (server/contact.ts) with Resend stubbed out.
// Run: npm run test:contact (Node 22.18+ / 23.6+, which run TypeScript natively).
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'

// The server imports `./x.js` (what Vercel's compiled output needs); point those at the .ts sources.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try { return await next(specifier, context) }
        catch (err) {
          if (specifier.startsWith('.') && specifier.endsWith('.js')) return next(specifier.slice(0, -3) + '.ts', context)
          throw err
        }
      }`),
)

const { handleContact } = await import('../server/contact.ts')

const ENV = { RESEND_API_KEY: 're_test_key' }
const VALID = { name: 'Ann Lee', email: 'Ann@Example.com', subject: 'A project', message: 'Hello <b>there</b>, a real message.', elapsed: 5000 }
let ip = 0
const post = (body, headers = {}) =>
  new Request('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${++ip}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

/** Replaces fetch for one call; returns what the handler sent. */
function stubFetch(respond) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) })
    return respond()
  }
  return calls
}

test('delivers a valid message through Resend and reports success', async () => {
  const calls = stubFetch(() => Response.json({ id: 'email_123' }))
  const res = await handleContact(post(VALID), ENV)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })

  assert.equal(calls.length, 1)
  const { url, init, body } = calls[0]
  assert.equal(url, 'https://api.resend.com/emails')
  assert.equal(init.headers.authorization, 'Bearer re_test_key')
  assert.deepEqual(body.to, ['vinayakkvjob@gmail.com'])
  assert.equal(body.from, 'Portfolio contact <onboarding@resend.dev>')
  assert.equal(body.reply_to, 'ann@example.com')
  assert.equal(body.subject, 'Portfolio: A project')
  for (const part of ['Ann Lee', 'ann@example.com', 'A project', 'Submitted:', 'IST', 'Hello <b>there</b>']) assert.ok(body.text.includes(part), part)
  assert.ok(body.html.includes('Hello &lt;b&gt;there&lt;/b&gt;'), 'HTML body is escaped')
  assert.ok(!body.html.includes('<b>there'), 'no raw visitor HTML')
})

test('uses CONTACT_TO_EMAIL and CONTACT_FROM_EMAIL when set', async () => {
  const calls = stubFetch(() => Response.json({ id: 'email_1' }))
  await handleContact(post(VALID), { ...ENV, CONTACT_TO_EMAIL: 'me@site.dev', CONTACT_FROM_EMAIL: 'Site <hi@site.dev>' })
  assert.deepEqual(calls[0].body.to, ['me@site.dev'])
  assert.equal(calls[0].body.from, 'Site <hi@site.dev>')
})

test('reports failure when Resend rejects the message', async () => {
  stubFetch(() => Response.json({ name: 'validation_error', message: 'bad from' }, { status: 422 }))
  const res = await handleContact(post(VALID), ENV)
  assert.equal(res.status, 502)
  assert.equal((await res.json()).ok, false)
})

test('reports failure when Resend answers 200 without an id', async () => {
  stubFetch(() => Response.json({}))
  assert.equal((await handleContact(post(VALID), ENV)).status, 502)
})

test('reports failure when Resend is unreachable', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }
  assert.equal((await handleContact(post(VALID), ENV)).status, 502)
})

test('refuses to pretend without an API key', async () => {
  const calls = stubFetch(() => Response.json({ id: 'x' }))
  const res = await handleContact(post(VALID), {})
  assert.equal(res.status, 503)
  assert.equal(calls.length, 0)
})

test('rejects bad input before calling the provider', async () => {
  const calls = stubFetch(() => Response.json({ id: 'x' }))
  const cases = [
    [post({ ...VALID, email: 'not-an-email' }), 422],
    [post({ ...VALID, name: '' }), 422],
    [post({ ...VALID, message: 'x'.repeat(5001) }), 422],
    [post({ ...VALID, company: 'Acme' }), 400], // honeypot
    [post({ ...VALID, elapsed: 300 }), 400], // too fast
    [post({ ...VALID, elapsed: undefined }), 400],
    [post('{broken'), 400],
    [post('[1,2]'), 400],
    [post(VALID, { 'content-type': 'text/plain' }), 415],
    [post({ ...VALID, message: 'x'.repeat(17_000) }), 413],
    [new Request('http://localhost/api/contact'), 405],
  ]
  for (const [req, status] of cases) assert.equal((await handleContact(req, ENV)).status, status)
  assert.equal(calls.length, 0)

  const res = await handleContact(post({ ...VALID, email: 'nope', subject: '' }), ENV)
  const data = await res.json()
  assert.ok(data.fields.email && data.fields.subject && !data.fields.name)
})

test('folds header-like input in single-line fields', async () => {
  const calls = stubFetch(() => Response.json({ id: 'x' }))
  await handleContact(post({ ...VALID, subject: 'Hi\r\nBcc: someone@else.com' }), ENV)
  assert.equal(calls[0].body.subject, 'Portfolio: Hi Bcc: someone@else.com')
})

test('rate-limits one address to 5 messages per window', async () => {
  stubFetch(() => Response.json({ id: 'x' }))
  const statuses = []
  for (let i = 0; i < 7; i++) statuses.push((await handleContact(post(VALID, { 'x-forwarded-for': '203.0.113.9' }), ENV)).status)
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429])
  const limited = await handleContact(post(VALID, { 'x-forwarded-for': '203.0.113.9' }), ENV)
  assert.ok(Number(limited.headers.get('retry-after')) > 0)
})
