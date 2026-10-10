// Tests for the chat assistant's answer engine (src/core/assistant.ts) and its
// Markdown parser (src/core/markdown.ts). No DOM, no network.
// Run: npm run test:assistant (Node 22.18+ / 23.6+, which run TypeScript natively).
import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'

// src/ imports are extensionless (Vite style); resolve them to the .ts sources.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        try { return await next(specifier, context) }
        catch (err) {
          if (specifier.startsWith('.') && !/\\.[cm]?[jt]sx?$/.test(specifier)) return next(specifier + '.ts', context)
          throw err
        }
      }`),
)

// An owner-written FAQ entry, added before the engine indexes the FAQ at load.
const { assistant } = await import('../src/assistant.ts')
assistant.faq.push({
  ask: ['notice period', 'When can he start?'],
  answer: 'Test answer: **two weeks**.',
  suggestions: ['How can I contact him?'],
})

const { answer } = await import('../src/core/assistant.ts')
const { parseBlocks, parseInline, linkKind, toPlainText } = await import('../src/core/markdown.ts')
const { contact, experience, projects, site } = await import('../src/content.ts')

/** Asks a sequence of questions, carrying context the way the chat does. */
function converse(...questions) {
  let ctx = {}
  return questions.map((q) => {
    const r = answer(q, ctx)
    ctx = { project: r.project, topic: r.topic }
    return r
  })
}

test('every starter prompt gets a real answer', () => {
  for (const s of assistant.starters) {
    const r = answer(s)
    assert.ok(r.known, `starter "${s}" fell through to the fallback`)
    assert.ok(r.text.length > 20, s)
  }
})

test('every suggested follow-up (two levels deep) is itself answerable', () => {
  const seen = new Set()
  let frontier = [...assistant.starters, ...projects.map((p) => `Tell me about ${p.title}`)]
  for (let depth = 0; depth < 3; depth++) {
    const next = []
    for (const q of frontier) {
      if (seen.has(q)) continue
      seen.add(q)
      const r = answer(q)
      assert.ok(r.known, `"${q}" is offered as a suggestion but isn't answerable`)
      next.push(...r.suggestions)
    }
    frontier = next
  }
  assert.ok(seen.size > 20, `explored ${seen.size} questions`)
})

test('routes the common questions to the right topic', () => {
  const cases = {
    'Who is Vinayak?': 'about',
    'What projects has he built?': 'projects',
    'What is his tech stack?': 'skills',
    'What experience does he have?': 'experience',
    'What does he do at AMnova?': 'current-role',
    'How do I contact him?': 'contact',
    'Where is he based?': 'location',
    'Is he open to new roles?': 'availability',
    'Can I see his resume?': 'resume',
    'Are you an AI?': 'self',
    'How was this site built?': 'site',
    'hello': 'greeting',
    'thanks!': 'thanks',
    'Is there a live demo?': 'links',
  }
  for (const [q, topic] of Object.entries(cases)) assert.equal(answer(q).topic, topic, q)
})

test('answers each project by name, alias and ordinal', () => {
  for (const p of projects) {
    const r = answer(`Tell me about ${p.title}`)
    assert.equal(r.project, p.id, p.title)
    assert.ok(r.text.includes(p.tagline), `${p.title} overview uses its tagline`)
    assert.ok(r.text.includes(`#work-${p.id}`), `${p.title} links its case study`)
  }
  assert.equal(answer('how does aria work?').project, 'bank-churn')
  assert.equal(answer('lazy hire').project, 'lazyhire')
  assert.equal(answer('the second one', { topic: 'projects' }).project, projects[1].id)
})

test('follow-ups about "it" stay on the project just discussed', () => {
  const [, stack, links, more] = converse('Tell me about LazyHire', 'what stack did it use?', 'is it on github?', 'tell me more')
  const p = projects.find((x) => x.id === 'lazyhire')
  assert.equal(stack.topic, 'project:lazyhire')
  for (const t of p.tags) assert.ok(stack.text.includes(t), `stack lists ${t}`)
  assert.ok(links.text.includes(p.links[0].href), 'links answer has the repo')
  assert.ok(more.text.includes(p.problem), 'deep dive includes the problem')
})

test('"his tech stack" after a project is about Vinayak, not the project', () => {
  const [, r] = converse('Tell me about Loom.ai', 'what is his tech stack?')
  assert.equal(r.topic, 'skills')
})

test('compares two projects named together', () => {
  const r = answer('compare Loom.ai and PredictLab')
  assert.equal(r.topic, 'compare')
  assert.ok(r.text.includes('Loom.ai') && r.text.includes('PredictLab'))
})

test('skill questions are answered from evidence on the site', () => {
  const py = answer('Does he know Python?')
  assert.ok(py.known && py.text.startsWith('Yes'), py.text)
  assert.ok(py.text.includes('Amdox'), 'cites where Python appears')

  const rag = answer('Has he built RAG systems?')
  assert.ok(rag.text.startsWith('Yes'), rag.text)
  assert.ok(rag.text.includes('Loom.ai'), rag.text)

  const k8s = answer('Does he know Kubernetes?')
  assert.match(k8s.text, /isn’t mentioned/)
  assert.ok(k8s.text.includes(contact.email), 'points to email')
})

test('the skills list only names what the site evidences', () => {
  const r = answer('What are his skills?')
  for (const g of assistant.skillGroups) {
    for (const item of g.items) {
      if (!r.text.includes(item)) continue
      const named = JSON.stringify({ projects, experience, intro: site.intro })
      assert.ok(named.includes(item), `${item} is listed as a skill but appears nowhere in content.ts`)
    }
  }
})

test("questions the site can't answer get an honest refusal, not a guess", () => {
  for (const q of ['What is his salary expectation?', 'Where did he study?', 'What is his notice period at the moment?', 'Is he open to relocation?', 'What is his phone number?']) {
    const r = answer(q)
    if (r.topic.startsWith('faq:')) continue // The test FAQ covers notice period.
    assert.match(r.text, /doesn’t cover|won’t guess/, q)
    assert.ok(r.text.includes(contact.email), q)
  }
  const off = answer('What is the weather in Paris?')
  assert.equal(off.known, false)
  assert.equal(off.topic, 'fallback')
  assert.match(off.text, /rather not guess/)
})

test('accuracy questions say the metric is not reported instead of inventing one', () => {
  const r = answer('What accuracy does the churn model get?')
  assert.equal(r.project, 'bank-churn')
  assert.match(r.text, /doesn’t report other metrics/)
  assert.doesNotMatch(r.text, /\d+(\.\d+)?\s*%/, 'no invented percentage')
})

test('every external link in an answer comes from content.ts', () => {
  const allowed = new Set([...contact.links.map((l) => l.href), ...projects.flatMap((p) => (p.links ?? []).map((l) => l.href))])
  const questions = [...assistant.starters, ...projects.flatMap((p) => [`Tell me about ${p.title}`, `Is ${p.title} on GitHub?`, `Tell me more about ${p.title}`]), 'Is there a live demo?', 'resume']
  for (const q of questions) {
    for (const [, href] of answer(q).text.matchAll(/\]\((https?:[^)]+)\)/g)) assert.ok(allowed.has(href), `${q}: ${href}`)
  }
})

test('the résumé link appears only once the file is known to be served', () => {
  assert.doesNotMatch(answer('resume').text, /\/resume\.pdf/)
  assert.match(answer('resume', { resume: '/resume.pdf' }).text, /\]\(\/resume\.pdf\)/)
})

test("the owner's FAQ answers take priority, by phrase or close paraphrase", () => {
  assert.equal(answer('what is his notice period?').text, 'Test answer: **two weeks**.')
  assert.equal(answer('when can he start working?').text, 'Test answer: **two weeks**.')
})

test('handles empty, overlong and hostile input', () => {
  assert.equal(answer('   ').topic, 'empty')
  assert.ok(answer('x'.repeat(50_000)).text.length < 2000, 'overlong input is truncated, not echoed')
  const r = answer('Does he know <img src=x onerror=alert(1)>?')
  assert.doesNotMatch(r.text, /[<>]/, 'visitor text is never echoed with markup')
  const md = answer('does he know [click](javascript:alert(1))')
  for (const block of parseBlocks(md.text)) {
    if (block.kind !== 'p') continue
    for (const line of block.lines) assert.ok(!JSON.stringify(parseInline(line)).includes('javascript:'), line)
  }
})

test('markdown: blocks and inline marks', () => {
  const blocks = parseBlocks('**Title**\n\n- one\n- two\n\n1. a\n2. b\n\n```py\nprint(1)\n```\nline one\nline two')
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ['p', 'ul', 'ol', 'code', 'p'],
  )
  assert.deepEqual(blocks[1].items, ['one', 'two'])
  assert.equal(blocks[3].lang, 'py')
  assert.equal(blocks[3].text, 'print(1)')
  assert.deepEqual(blocks[4].lines, ['line one', 'line two'])

  assert.deepEqual(parseInline('a **b** *c* `d` [e](https://x.dev)'), [
    { kind: 'text', text: 'a ' },
    { kind: 'strong', children: [{ kind: 'text', text: 'b' }] },
    { kind: 'text', text: ' ' },
    { kind: 'em', children: [{ kind: 'text', text: 'c' }] },
    { kind: 'text', text: ' ' },
    { kind: 'code', text: 'd' },
    { kind: 'text', text: ' ' },
    { kind: 'link', href: 'https://x.dev', to: 'external', children: [{ kind: 'text', text: 'e' }] },
  ])
})

test('markdown: only safe link targets become links', () => {
  assert.equal(linkKind('https://github.com/x'), 'external')
  assert.equal(linkKind('mailto:a@example.com'), 'mail')
  assert.equal(linkKind('#works'), 'anchor')
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '/relative', '//evil.example', '#a b']) {
    assert.equal(linkKind(bad), null, bad)
  }
  assert.deepEqual(parseInline('[x](javascript:alert(1))'), [{ kind: 'text', text: 'x' }, { kind: 'text', text: ')' }])
  // Raw HTML is just text.
  assert.deepEqual(parseInline('<script>alert(1)</script>'), [{ kind: 'text', text: '<script>alert(1)</script>' }])
})

test('markdown: plain text for copying and announcements', () => {
  assert.equal(toPlainText('**Hi** [there](https://x.dev)\n\n- a\n- b'), 'Hi there\n\n• a\n• b')
})
