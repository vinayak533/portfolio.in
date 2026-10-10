// Contact details must agree everywhere a visitor (or the form) can meet them.
// Run: npm run test:content (Node 22.18+ / 23.6+, which run TypeScript natively).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const { contact, projects } = await import('../src/content.ts')

/** Every source file a visitor's contact details could be hard-coded in. */
function sources(dir) {
  return readdirSync(new URL(dir, root)).flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(new URL(rel, root)).isDirectory()) return sources(rel)
    return /\.(tsx?|css|html)$/.test(name) ? [rel] : []
  })
}

test('index.html <noscript> carries the same email and links as src/content.ts', () => {
  const noscript = read('index.html').match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? ''
  assert.ok(noscript.includes(`mailto:${contact.email}`), 'noscript email')
  for (const l of contact.links) assert.ok(noscript.includes(`href="${l.href}"`), `noscript ${l.label}`)
})

test('no other email address is hard-coded anywhere in the site or server', () => {
  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
  // Besides the real one: Resend's shared sender, and placeholders in copy and comments.
  const allowed = (e) => e === contact.email || e === 'onboarding@resend.dev' || /@(example\.com|yourdomain\.com)$/.test(e)
  for (const file of ['index.html', ...sources('src'), ...sources('server'), ...sources('api')]) {
    for (const found of read(file).match(EMAIL) ?? []) assert.ok(allowed(found), `${file}: ${found}`)
  }
})

test("every project's GitHub link is on the profile linked from Contact", () => {
  const profile = contact.links.find((l) => l.label === 'GitHub')?.href
  assert.ok(profile, 'Contact links GitHub')
  for (const p of projects) {
    for (const l of p.links ?? []) {
      if (l.label === 'GitHub') assert.ok(l.href.startsWith(`${profile}/`), `${p.title}: ${l.href}`)
    }
  }
})
