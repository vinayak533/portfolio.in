/**
 * The chat assistant's answer engine. No language model: a question is matched
 * against topics built from src/content.ts and the knowledge in src/assistant.ts,
 * and answered only with what those say. Anything it can't ground there gets an
 * honest "not something I have details on" and the way to ask directly.
 *
 * Pure: no DOM, no network, deterministic. Tested by scripts/assistant.test.mjs.
 */
import { about, captionParts, contact, experience, projects, site, type Project, type Role } from '../content'
import { assistant, type Certification, type Doc, type FaqEntry, type MoreProject, type ProjectExtra } from '../assistant'
import { toPlainText } from './markdown'

export interface AskContext {
  /** Project the previous reply was about, so "what stack did it use?" works. */
  project?: string
  /** The previous reply's topic, for "tell me more". */
  topic?: string
  /** Résumé URL once it is known to be served, else null / undefined. */
  resume?: string | null
  /** For the local-time line; defaults to now. */
  now?: Date
}

export interface Reply {
  /** Markdown. */
  text: string
  topic: string
  /** Set when the reply is about one project: the next question can say "it". */
  project?: string
  /** Follow-up questions offered as chips. */
  suggestions: string[]
  /** False when nothing in the knowledge base matched (the honest fallback). */
  known: boolean
  /** What the engine did to answer, as tool-call steps: shown as the "thinking" trace. */
  trace: TraceStep[]
}

/** One step of the reasoning trace, e.g. { tool: 'read_source', detail: 'Loom.ai case study' }. */
export interface TraceStep {
  tool: 'classify_intent' | 'search_knowledge' | 'read_source' | 'check_grounding' | 'compose_answer'
  detail: string
}

/** A reply before its trace is written, with what was asked and what was read to answer it. */
type Draft = Omit<Reply, 'trace'> & { intent?: string; sources?: string[]; missed?: boolean }

/* ------------------------------------------------------------------ text */

const STOP = new Set(
  'a an the is are was were be been am do doe does did has have had of to in on at for with about and or but by from as into me my i you your he him his she her they them their we us our what which who whom whose when where why how can could would should will shall may might must please tell show give let want like this that these those it its there here any some much many more most just also so very really ok okay vinayak kv k v s'.split(
    ' ',
  ),
)

/** Folds plurals and -ing / -ed forms together ("deployed", "deploys" → "deploy"). Crude, but applied to both sides. */
const stem = (w: string) => {
  let t = w
  if (t.length > 4 && t.endsWith('ies')) t = `${t.slice(0, -3)}y`
  else if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1)
  if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3)
  else if (t.length > 5 && t.endsWith('ed')) t = t.slice(0, -2)
  return t
}

/** Lower-case, accent-free, punctuation-free, lightly stemmed words. */
export function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(stem)
}

interface Question {
  raw: string
  w: string[]
  /** Words that carry meaning (no stop words). */
  content: string[]
}

const question = (raw: string): Question => {
  const w = words(raw)
  return { raw, w, content: w.filter((t) => !STOP.has(t)) }
}

/** True when `phrase` (already split into words) occurs as a run of words in `w`. */
function contains(w: string[], phrase: string[]) {
  if (!phrase.length || phrase.length > w.length) return false
  outer: for (let i = 0; i <= w.length - phrase.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (w[i + j] !== phrase[j]) continue outer
    return true
  }
  return false
}

type Keys = string[][]
/** Key phrases split into words; duplicates (e.g. "project" and "projects") count once. */
const keys = (...phrases: string[]): Keys => {
  const seen = new Set<string>()
  return phrases.map(words).filter((p) => {
    const id = p.join(' ')
    if (!p.length || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Sum of the lengths of every key phrase found: longer, more specific phrases count for more. */
const score = (q: Question, k: Keys) => k.reduce((s, p) => (contains(q.w, p) ? s + p.length : s), 0)

/* ---------------------------------------------------------------- helpers */

const projectById = new Map(projects.map((p) => [p.id, p]))
const moreById = new Map(assistant.moreProjects.map((p) => [p.id, p]))
const caseStudy = (p: Project) => `[Open the ${p.title} case study](#work-${p.id})`
const list = (items: string[]) => items.map((i) => `- ${i}`).join('\n')
const mail = `[${contact.email}](mailto:${contact.email})`
const link = (label: string) => contact.links.find((l) => l.label === label)
const image = (i: { alt: string; src: string }) => `![${i.alt}](${i.src})`
const docLinks = (docs: Doc[]) => docs.map((d) => `[${d.label}](${d.href})`).join(' · ')

const extra = (p: Project): ProjectExtra => assistant.projectExtras[p.id] ?? {}
const repo = (p: Project) => p.links?.find((l) => l.label === 'GitHub')?.href
/** The project's name, linked to its repository when it has one. */
const named = (p: Project) => (repo(p) ? `[**${p.title}**](${repo(p)})` : `**${p.title}**`)
const namedMore = (m: MoreProject) => `[**${m.title}**](${m.href})`

/** Echoed visitor text, stripped of anything Markdown would act on. */
const plain = (s: string) => s.replace(/[^\p{L}\p{N} .+#/-]/gu, '').replace(/\s+/g, ' ').trim()

const currentRole = experience.find((r) => /present/i.test(r.end)) ?? experience[0]
const earlierRoles = experience.filter((r) => r !== currentRole)
const roleLine = (r: Role) => `**${r.title}**, ${r.company} (${r.start} – ${r.end})`
const roleInfo = (r: Role) => assistant.roles[r.company]

/** "remote, or in Bangalore, Kochi or Hyderabad" */
const workPlaces = (() => {
  const [first, ...rest] = assistant.profile.workLocations
  const cities = rest.length > 1 ? `${rest.slice(0, -1).join(', ')} or ${rest[rest.length - 1]}` : rest[0]
  return cities ? `${first}, or in ${cities}` : first
})()

const contactBlock = list([
  `**Email:** ${mail}`,
  ...contact.links.map((l) => `**${l.label}:** [${l.href.replace(/^https?:\/\/(www\.)?/, '')}](${l.href})`),
])

/** Every sentence the assistant knows about Vinayak's work, with where it came from. */
interface Evidence {
  source: string
  /** A project in content.ts, so the next question can say "it". */
  project?: string
  /** The project's title, for a "Tell me about …" follow-up. */
  title?: string
  text: string
  w: string[]
}

const sentences = (s: string) =>
  s
    .replace(/\n/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"*])/)
    .map((t) => t.trim())
    .filter(Boolean)

const corpus: Evidence[] = [
  ...projects.flatMap((p) => {
    const { lead, body } = captionParts(p.caption)
    const x = extra(p)
    const texts = [
      p.tagline,
      lead,
      ...sentences(body),
      ...sentences(p.summary),
      ...sentences(p.problem),
      ...p.approach.flatMap(sentences),
      ...(x.details ?? []).flatMap(sentences),
      ...(x.metrics ?? []),
    ]
    return [
      ...texts.filter(Boolean).map((text) => ({ source: p.title, project: p.id, title: p.title, text })),
      { source: p.title, project: p.id, title: p.title, text: `Stack: ${[...p.tags, ...(x.stack ?? [])].join(', ')}.` },
    ]
  }),
  // Roles before the projects the page doesn't show: on a tie, work evidence is listed first.
  ...experience.flatMap((r) =>
    [r.summary, ...(roleInfo(r)?.details ?? [])].map((text) => ({ source: `${r.company} (${r.title})`, text })),
  ),
  ...assistant.moreProjects.flatMap((m) =>
    [m.tagline, ...(m.details ?? []).flatMap(sentences), `Stack: ${m.stack.join(', ')}.`].map((text) => ({ source: m.title, title: m.title, text })),
  ),
  ...assistant.skillGroups.map((g) => ({ source: 'Skills', text: `${g.label}: ${g.items.join(', ')}.` })),
  ...assistant.achievements.map((text) => ({ source: 'Achievements', text })),
  ...assistant.certifications.map((c) => ({ source: `${c.issuer} certificate`, text: `Certified: ${c.title}, ${c.issuer}${c.date ? ` (${c.date})` : ''}. ${c.covers}` })),
  ...assistant.education.map((text) => ({ source: 'Education', text })),
  { source: 'Intro', text: site.intro },
  { source: 'About', text: about.body },
].map((e) => ({ ...e, w: words(e.text) }))

/**
 * Evidence for a term (and its synonyms): the most telling sentence from each
 * source, ranked by how many of the terms it mentions (the term itself counts double).
 */
function evidence(terms: string[]): Evidence[] {
  const phrases = terms.map(words).filter((p) => p.length)
  const best = new Map<string, { e: Evidence; s: number }>()
  for (const e of corpus) {
    const s = phrases.reduce((n, p, i) => (contains(e.w, p) ? n + (i === 0 ? 2 : 1) : n), 0)
    if (s && s > (best.get(e.source)?.s ?? 0)) best.set(e.source, { e, s })
  }
  return [...best.values()].sort((a, b) => b.s - a.s).map((b) => b.e)
}

const clip = (s: string, max = 220) => {
  const t = s.replace(/\*\*/g, '')
  return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`
}

/** Tag names exactly as the site writes them, for display. */
const allTags = [...new Set([...projects.flatMap((p) => [...p.tags, ...(extra(p).stack ?? [])]), ...assistant.moreProjects.flatMap((m) => m.stack)])]
const knownNames = [...allTags, ...assistant.skillGroups.flatMap((g) => g.items)]

/* --------------------------------------------------------------- projects */

const projectKeys = new Map<string, Keys>(
  projects.map((p) => [p.id, keys(p.title, p.id.replace(/-/g, ' '), ...(assistant.projectAliases[p.id] ?? []))]),
)
const moreKeys = assistant.moreProjects.map((m) => ({ m, k: keys(m.title, ...m.aliases) }))

const ORDINALS: [Keys, (n: number) => number][] = [
  [keys('first', '1st', 'top one'), () => 0],
  [keys('second', '2nd'), () => 1],
  [keys('third', '3rd'), () => 2],
  [keys('fourth', '4th'), () => 3],
  [keys('fifth', '5th'), () => 4],
  [keys('last one', 'last project', 'final one'), (n) => n - 1],
]

function mentionedProjects(q: Question, ctx: AskContext): Project[] {
  const hits = projects
    .map((p) => ({ p, s: score(q, projectKeys.get(p.id)!) }))
    .filter((h) => h.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((h) => h.p)
  if (hits.length) return hits
  // "the second one", "the last project", but only while talking about projects.
  const aboutProjects = contains(q.w, ['project']) || contains(q.w, ['one']) || ctx.topic === 'projects'
  if (!aboutProjects) return []
  for (const [k, at] of ORDINALS) if (score(q, k)) return [projects[at(projects.length)]].filter(Boolean)
  return []
}

/** A project the page doesn't show, named outright. */
function mentionedMore(q: Question): MoreProject | null {
  let best: MoreProject | null = null
  let top = 0
  for (const { m, k } of moreKeys) {
    const s = score(q, k)
    if (s > top) {
      top = s
      best = m
    }
  }
  return best
}

type Facet = 'overview' | 'stack' | 'how' | 'problem' | 'results' | 'links' | 'role' | 'more'

/** In tie-break order: the broad "stack" words (model, use) come last. */
const FACETS: [Facet, Keys][] = [
  ['links', keys('link', 'github', 'repo', 'repository', 'source code', 'code', 'demo', 'live', 'url', 'try it', 'see it', 'website', 'doc', 'docs', 'documentation')],
  ['how', keys('how does it work', 'how it work', 'how doe', 'how did', 'how was', 'how is', 'approach', 'architecture', 'pipeline', 'under the hood', 'implementation', 'implemented', 'design', 'feature')],
  ['problem', keys('problem', 'why', 'motivation', 'purpose', 'goal', 'solve', 'what for', 'point of', 'use case')],
  ['results', keys('result', 'metric', 'number', 'impact', 'outcome', 'performance', 'stat', 'scale', 'accuracy', 'benchmark', 'at a glance', 'latency', 'auc')],
  ['role', keys('role', 'solo', 'team', 'who built', 'alone', 'contribution', 'his part', 'did he build', 'original', 'open source', 'credit', 'own work', 'his own', 'himself', 'from scratch', 'tutorial')],
  ['more', keys('more', 'detail', 'deeper', 'elaborate', 'explain', 'expand', 'deep dive', 'case study', 'everything', 'full story')],
  ['overview', keys('look like', 'screenshot', 'screen shot', 'interface', 'picture', 'image')],
  ['stack', keys('stack', 'tech stack', 'tech', 'technology', 'built with', 'made with', 'tool', 'framework', 'language', 'library', 'model', 'what does it use', 'what did it use', 'use', 'used', 'using')],
]

function facetOf(q: Question): Facet | null {
  let best: Facet | null = null
  let top = 0
  for (const [f, k] of FACETS) {
    const s = score(q, k)
    if (s > top) {
      top = s
      best = f
    }
  }
  return best
}

const METRIC_WORDS = keys('accuracy', 'benchmark', 'f1', 'auc', 'precision', 'recall', 'latency', 'roc')

function projectReply(p: Project, facet: Facet, q: Question): Draft {
  const { lead, body } = captionParts(p.caption)
  const x = extra(p)
  const others = projects.filter((o) => o.id !== p.id)
  const base = { topic: `project:${p.id}`, project: p.id, known: true }
  const facts = list([...(x.metrics ?? []), ...p.facts.map((f) => `**${f.value}**: ${f.label}`)])
  const links = p.links?.length ? list([...p.links.map((l) => `[${l.label}](${l.href})`), ...(x.docs ?? []).map((d) => `[${d.label}](${d.href})`)]) : ''
  const docs = x.docs?.length ? `**Docs:** ${docLinks(x.docs)}` : ''
  const meta = `*${p.role} · ${p.year}*`
  const stack = [...p.tags, ...(x.stack ?? []).filter((s) => !p.tags.includes(s))]

  switch (facet) {
    case 'stack':
      return {
        ...base,
        text: `${named(p)} is built with:\n\n${list(stack.map((t) => `**${t}**`))}\n\n${meta}`,
        suggestions: [`How does ${p.title} work?`, `Is ${p.title} on GitHub?`, 'What’s his tech stack?'],
      }
    case 'how':
      return {
        ...base,
        text: [`**How ${p.title} works**`, list([...p.approach, ...(x.details ?? [])]), docs, caseStudy(p)].filter(Boolean).join('\n\n'),
        suggestions: [`What problem does ${p.title} solve?`, `What stack does ${p.title} use?`, `Tell me about ${others[0].title}`],
      }
    case 'problem':
      return {
        ...base,
        text: `**The problem:** ${p.problem}\n\n**What ${p.title} does:** ${p.summary}`,
        suggestions: [`How does ${p.title} work?`, `What stack does ${p.title} use?`],
      }
    case 'results': {
      const askedMetric = METRIC_WORDS.some((k) => contains(q.w, k))
      const note = askedMetric && !x.metrics?.length ? '\n\nI don’t have other metrics such as accuracy for it; Vinayak can share those directly.' : ''
      return {
        ...base,
        text: `**${p.title} at a glance**\n\n${facts}${note}`,
        suggestions: [`How does ${p.title} work?`, `Is ${p.title} on GitHub?`],
      }
    }
    case 'links':
      return {
        ...base,
        text: links
          ? `**${p.title} links**\n\n${links}\n\n${caseStudy(p)}`
          : `There’s no public link for **${p.title}**. ${caseStudy(p)}, or ask Vinayak at ${mail}.`,
        suggestions: [`How does ${p.title} work?`, 'Show me his projects'],
      }
    case 'role':
      return {
        ...base,
        text: `${named(p)}: ${p.role}, ${p.year}.${lead ? `\n\n${lead}` : ''}${p.id === 'health' ? `\n\n${body}` : ''}`,
        suggestions: [`How does ${p.title} work?`, `What stack does ${p.title} use?`],
      }
    case 'more':
      return {
        ...base,
        text: [
          `${named(p)}: ${p.summary}`,
          `**The problem:** ${p.problem}`,
          `**Approach**\n\n${list([...p.approach, ...(x.details ?? [])])}`,
          `**At a glance**\n\n${facts}`,
          links ? `**Links**\n\n${links}` : '',
          caseStudy(p),
        ]
          .filter(Boolean)
          .join('\n\n'),
        suggestions: [`Tell me about ${others[0].title}`, 'Show me his projects', 'How can I contact him?'],
      }
    default:
      return {
        ...base,
        text: [
          `${named(p)}: ${p.tagline}`,
          x.image ? image(x.image) : '',
          `${lead ? `${lead} ` : ''}${body}`,
          `${meta} · ${stack.join(', ')}`,
          caseStudy(p),
        ]
          .filter(Boolean)
          .join('\n\n'),
        suggestions: [`How does ${p.title} work?`, p.links?.length ? `Is ${p.title} on GitHub?` : `What stack does ${p.title} use?`, 'Show me his projects'],
      }
  }
}

function moreReply(m: MoreProject): Draft {
  return {
    text: [`${namedMore(m)}${m.year ? ` (${m.year})` : ''}: ${m.tagline}`, m.details?.length ? list(m.details) : '', `*Stack:* ${m.stack.join(', ')}`]
      .filter(Boolean)
      .join('\n\n'),
    topic: `more:${m.id}`,
    suggestions: m.flagship ? ['Show me his best project', 'Why should I hire him?'] : ['Show me his projects', 'Show me his best project'],
    known: true,
  }
}

function compareReply(ps: Project[]): Draft {
  return {
    text: `${ps
      .map((p) => `${named(p)} (${p.year}, ${p.role.toLowerCase()}): ${p.tagline}\n\n*Stack:* ${p.tags.join(', ')}`)
      .join('\n\n')}\n\nAsk about either one for the details.`,
    topic: 'compare',
    suggestions: ps.map((p) => `How does ${p.title} work?`).slice(0, 3),
    known: true,
  }
}

/* ---------------------------------------------------------- certifications */

/** Words that make a question about a credential rather than a skill or a project. */
const CERT_WORDS = keys('certificate', 'certification', 'cert', 'certified', 'badge', 'credential', 'course', 'courses')
const certKeys = assistant.certifications.map((c) => ({ c, k: keys(c.title, ...c.keys) }))
const certLine = (c: Certification) =>
  `**${c.title}**: ${c.issuer}${c.date ? `, ${c.date}` : ''}${c.verify?.length ? ` · ${docLinks(c.verify)}` : ''}`

/**
 * The certificates a question asks about: the best-matching one, or all that tie for best
 * ("IBM certificates", "SQL certification"). Null unless it names a credential and something matches.
 */
function mentionedCerts(q: Question): Certification[] | null {
  if (!CERT_WORDS.some((k) => contains(q.w, k))) return null
  let top = 0
  let hits: Certification[] = []
  for (const { c, k } of certKeys) {
    const s = score(q, k)
    if (s > top) {
      top = s
      hits = [c]
    } else if (s && s === top) hits.push(c)
  }
  return hits.length ? hits : null
}

function certReply(c: Certification): Draft {
  return {
    text: [
      `**${c.title}**, ${c.issuer}${c.date ? ` · ${c.date}` : ''}`,
      image(c.image),
      c.covers,
      c.verify?.length ? `**Verify:** ${docLinks(c.verify)}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    topic: `cert:${c.id}`,
    suggestions: ['Show all his certifications', 'What are his achievements?'],
    known: true,
    intent: `certificate · ${c.title}`,
    sources: [`${c.issuer} certificate`],
  }
}

function certListReply(cs: Certification[], heading: string): Draft {
  const example = cs.find((c) => c.id === 'aws-genai') ?? cs[0]
  return {
    text: [
      `**${heading}**`,
      list(cs.map(certLine)),
      `Ask to see any one of them, for example “Show his ${example.issuer.split(' ')[0]} certificate”.`,
    ].join('\n\n'),
    topic: 'certifications',
    suggestions: ['Show his AWS certificate', 'Show his HackerRank SQL certificate', 'Show his TensorFlow certificate'],
    known: true,
  }
}

/* ------------------------------------------------------------------ tech */

const ASK_TECH =
  /\b(?:know|knows|use|uses|used|using|work(?:ed|s)? with|experience (?:with|in|using)|experienced (?:with|in)|familiar with|good (?:at|with)|skilled (?:at|in|with)|proficient (?:in|with)|expert (?:in|at|with)|knowledge of|worked on)\s+(.+)$/i

/** "Does he know Python?" → "Python"; null when the question isn't of that shape. */
function askedTech(raw: string): string | null {
  const m = raw.replace(/[?!.]+\s*$/, '').match(ASK_TECH)
  if (!m) return null
  const term = plain(
    m[1]
      .replace(/\b(any|the|a|an)\s+/gi, '')
      .replace(/\s+(before|too|at all|also|much|well|tools?|frameworks?|systems?|apps?|applications?|pipelines?|models?|projects?)$/i, ''),
  )
  // "know about his projects", "know where he lives": a question, not a skill.
  if (/^(about|how|what|where|when|why|who|if|whether|more|his|him|he|me|you|your|this|that|it)\b/i.test(term)) return null
  const content = words(term).filter((w) => !STOP.has(w))
  if (!content.length || content.length > 4) return null
  return term
}

function techReply(term: string): Draft {
  const key = words(term).join(' ')
  const display = knownNames.find((t) => words(t).join(' ') === key) ?? (term.length <= 4 ? term.toUpperCase() : term[0].toUpperCase() + term.slice(1))
  const terms = [term, ...(assistant.techSynonyms[term.toLowerCase()] ?? assistant.techSynonyms[key] ?? [])]
  const found = evidence(terms)
  if (!found.length) {
    const related = assistant.relatedSkills[term.toLowerCase()] ?? assistant.relatedSkills[key]
    const closest = related ? ` The closest thing he works with is **${related}**.` : ''
    return {
      text: `**${display}** isn’t mentioned in anything I know about his work, so I won’t claim it.${closest} Vinayak can answer that directly at ${mail}.`,
      topic: 'tech',
      suggestions: ['What’s his tech stack?', 'Show me his projects'],
      known: true,
      intent: `skill check · ${display}`,
      missed: true,
    }
  }
  const top = found.slice(0, 3)
  const first = top.find((e) => e.title)
  return {
    text: `Yes. **${display}** shows up in his work:\n\n${list(top.map((e) => `**${e.source}**: ${clip(e.text)}`))}`,
    topic: 'tech',
    project: top.find((e) => e.project)?.project,
    suggestions: [first ? `Tell me about ${first.title}` : 'Show me his projects', 'What’s his tech stack?'],
    known: true,
    intent: `skill check · ${display}`,
    sources: found.map((e) => e.source),
  }
}

/** A tag named outright ("LangGraph?"), when nothing more specific matched. */
function namedTag(q: Question): string | null {
  for (const t of allTags) if (contains(q.w, words(t))) return t
  for (const s of Object.keys(assistant.techSynonyms)) if (contains(q.w, words(s))) return s
  return null
}

/* ----------------------------------------------------------------- topics */

interface Topic {
  id: string
  keys: Keys
  /** Added to the score, to rank broad topics below specific ones. */
  bias?: number
  reply: (q: Question, ctx: AskContext) => Omit<Draft, 'topic' | 'known'> & { topic?: string }
}

const flagship = [
  ...projects.filter((p) => extra(p).flagship).map((p) => `${named(p)}: ${p.tagline}`),
  ...assistant.moreProjects.filter((m) => m.flagship).map((m) => `${namedMore(m)}: ${m.tagline}`),
]
const otherProjects = [
  ...projects.filter((p) => !extra(p).flagship).map((p) => `${named(p)}: ${p.tagline}`),
  ...assistant.moreProjects.filter((m) => !m.flagship && !m.minor).map((m) => `${namedMore(m)}: ${m.tagline}`),
]
/** Small apps and notebooks: one line of names. */
const minorProjects = assistant.moreProjects.filter((m) => m.minor).map((m) => `[${m.title}](${m.href})`)

const loom = projectById.get('loom')
const lazyhire = projectById.get('lazyhire')
const predictlab = projectById.get('predictlab')
const inforge = moreById.get('inforge')
const stockAgents = moreById.get('stock')
const nameOf = (p?: Project) => (p ? named(p) : '')
const nameOfMore = (m?: MoreProject) => (m ? namedMore(m) : '')
const COUNT = ['none', 'one', 'two', 'three', 'four']
/** "a, b and c" */
const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? ''))

const TOPICS: Topic[] = [
  {
    id: 'greeting',
    keys: keys('hi', 'hello', 'hey', 'hiya', 'heya', 'yo', 'namaste', 'good morning', 'good afternoon', 'good evening', 'sup', 'greetings'),
    bias: -0.5,
    reply: () => ({
      text: `Hi! I can tell you about Vinayak’s projects, experience and skills, or how to get in touch. What would you like to know?`,
      suggestions: assistant.starters.slice(0, 3),
    }),
  },
  {
    id: 'how-are-you',
    keys: keys('how are you', 'how are you doing', 'how is it going', 'what up'),
    reply: () => ({
      text: 'Doing well, thanks for asking. What would you like to know about Vinayak?',
      suggestions: assistant.starters.slice(0, 3),
    }),
  },
  {
    id: 'thanks',
    keys: keys('thanks', 'thank you', 'thx', 'ty', 'cheers', 'appreciate', 'great', 'awesome', 'cool', 'nice', 'perfect', 'helpful'),
    bias: -0.5,
    reply: () => ({
      text: 'Glad to help. Anything else you’d like to know about his work?',
      suggestions: ['Show me his projects', 'How can I contact him?'],
    }),
  },
  {
    id: 'bye',
    keys: keys('bye', 'goodbye', 'see you', 'see ya', 'that all'),
    bias: -0.5,
    reply: () => ({
      text: `Thanks for stopping by. To talk to Vinayak directly, email ${mail}.`,
      suggestions: [],
    }),
  },
  {
    id: 'self',
    keys: keys('are you', 'who are you', 'what are you', 'are you a bot', 'are you ai', 'are you human', 'are you real', 'are you vinayak', 'is this vinayak', 'am i talking to', 'talking to vinayak', 'how do you work', 'chatgpt', 'gpt', 'language model', 'llm powered', 'your name', 'bot', 'assistant'),
    reply: () => ({
      text: `${assistant.self}\n\nFor a real conversation, email him at ${mail}.`,
      suggestions: assistant.starters.slice(0, 3),
    }),
  },
  {
    id: 'off-topic',
    keys: keys('ignore previous', 'ignore your', 'ignore all', 'ignore the above', 'system prompt', 'your prompt', 'your instruction', 'your rules', 'reveal your', 'pretend', 'role play', 'roleplay', 'act as', 'jailbreak', 'homework', 'assignment', 'write me', 'write code for me', 'write an essay', 'write a poem', 'write a story', 'fix my code', 'debug my', 'help me with my', 'translate'),
    bias: 1.5,
    reply: () => ({
      text: 'I’m here to talk about Vinayak’s work, so I’ll leave that one. Happy to go deeper on any of his projects.',
      suggestions: ['Show me his best project', 'Show me his projects'],
    }),
  },
  {
    id: 'about',
    keys: keys('who is', 'who is he', 'about him', 'about vinayak', 'tell me about', 'introduce', 'introduction', 'background', 'bio', 'summary', 'profile', 'overview', 'what does he do', 'what doe he do', 'work on', 'what is he', 'yourself', 'himself', 'vinayak', '30 second', 'in short', 'elevator pitch'),
    bias: -0.25,
    reply: () => ({
      text: [
        `**${site.name}** is an ${site.role} at **${currentRole.company}** in ${site.location}.`,
        image(assistant.images.profile),
        assistant.profile.pitch,
        list(assistant.profile.proof),
        '*Want to see his best project?*',
      ].join('\n\n'),
      suggestions: ['Show me his best project', 'Why should I hire him?', 'What’s his experience?'],
    }),
  },
  {
    id: 'why-hire',
    keys: keys('why should i hire', 'why should we hire', 'why hire', 'why him', 'what makes him', 'stand out', 'good fit', 'good candidate', 'convince me', 'sell me', 'unique', 'different from'),
    bias: 1,
    reply: () => ({
      text: [
        'Three reasons:',
        list([
          `**He ships production agents at work.** His multi-agent LLM pipeline at ${currentRole.company} cut manual store-audit turnaround by **80%**.`,
          `**He builds systems that are honest by design:** answers that cite their sources or abstain (${nameOf(loom)}), zero-fabrication CV guardrails (${nameOf(lazyhire)}) and a local fallback for every LLM call (${nameOfMore(inforge)}).`,
          `**Strong fundamentals:** top 2% globally in LeetCode Weekly Contest 487, and a co-authored research preprint (${nameOf(predictlab)}).`,
        ]),
        `He’s open to ${assistant.profile.openTo}: ${workPlaces}.`,
        contactBlock,
      ].join('\n\n'),
      suggestions: ['Show me his best project', 'What’s his LLM/agent experience?'],
    }),
  },
  {
    id: 'ai-experience',
    keys: keys('llm agent experience', 'llm experience', 'agent experience', 'ai experience', 'genai', 'gen ai', 'generative ai', 'agentic', 'agent system', 'agent systems', 'llm work', 'llm application', 'multi agent'),
    bias: 1,
    reply: () => ({
      text: [
        `**At work:** he owns the AI/LLM track at ${currentRole.company}, where his multi-agent LLM pipeline (Python, LangChain, FastAPI) cut manual store-audit turnaround by **80%**.`,
        '**In his own builds:**',
        list(
          [
            loom && `${named(loom)}: a coding agent in a real E2B Linux sandbox; LangGraph routes across 8 models with provider fallback, and prompt caching cut median time to first token from 8.9 s to 5.0 s.`,
            inforge && `${namedMore(inforge)}: 8 pipeline agents turn a CSV into a full analysis; every LLM call has a local fallback.`,
            lazyhire && `${named(lazyhire)}: guarded CV tailoring that rejects anything not traceable to the source CV.`,
            stockAgents && `${namedMore(stockAgents)}: CrewAI agents turning live market data into a Buy, Sell or Hold rationale.`,
          ].filter((s): s is string => Boolean(s)),
        ),
        `**Toolkit:** ${assistant.skillGroups.find((g) => g.label === 'LLMs and agents')?.items.join(', ')}.`,
        '*Want the architecture behind Loom.ai?*',
      ].join('\n\n'),
      suggestions: ['How does Loom.ai work?', 'Why should I hire him?'],
    }),
  },
  {
    id: 'current-role',
    keys: keys('current job', 'current role', 'currently', 'do at', 'at amnova', 'work at', 'works at', 'working at', 'where does he work', 'employer', 'company', 'job title', 'position', 'job', 'amnova', 'amnova technologies'),
    reply: () => {
      const info = roleInfo(currentRole)
      return {
        text: `He’s an **${currentRole.title}** at ${currentRole.company}${info ? ` in ${info.where}` : ''}, since ${currentRole.start}.\n\n${info ? list(info.details) : currentRole.summary}`,
        suggestions: ['What’s his experience?', 'Show me his projects'],
      }
    },
  },
  {
    id: 'experience',
    keys: keys('experience', 'work experience', 'work history', 'career', 'internship', 'intern', 'previous', 'previous company', 'past company', 'companies he worked', 'past roles', 'where has he worked', 'worked at', 'employment', 'roles', 'role'),
    reply: () => ({
      text: `**Experience**\n\n${list(experience.map((r) => `${roleLine(r)}${roleInfo(r) ? `, ${roleInfo(r).where}: ${roleInfo(r).headline}` : `: ${r.summary}`}`))}\n\n[See the Experience section](#experience)`,
      suggestions: ['What does he do at AMnova?', 'What’s his LLM/agent experience?', 'What’s his tech stack?'],
    }),
  },
  {
    id: 'level',
    keys: keys('experience level', 'how experienced', 'year of experience', 'years of experience', 'how many year', 'how long', 'senior', 'junior', 'fresher', 'entry level', 'seniority', 'mid level'),
    bias: 1,
    reply: () => ({
      text: [
        `He’s been an **${currentRole.title}** at ${currentRole.company} since **${currentRole.start}**, after ${earlierRoles.length === 1 ? 'an internship' : `${COUNT[earlierRoles.length] ?? earlierRoles.length} internships`}: ${earlierRoles.map((r) => `${r.title} at ${r.company} (${r.start} – ${r.end})`).join(' and ')}.`,
        `Alongside that is a portfolio of shipped systems, including ${andList([nameOf(loom), nameOf(lazyhire), nameOfMore(inforge)].filter(Boolean))}.`,
      ].join('\n\n'),
      suggestions: ['What’s his experience?', 'Show me his best project'],
    }),
  },
  ...earlierRoles.map<Topic>((r) => ({
    id: `role:${r.company}`,
    keys: keys(r.company, r.company.split(' ')[0]),
    bias: 1,
    reply: () => {
      const info = roleInfo(r)
      return {
        text: `${roleLine(r)}${info ? `, ${info.where}` : ''}:\n\n${info ? list(info.details) : r.summary}`,
        suggestions: ['What’s his experience?', 'Show me his projects'],
      }
    },
  })),
  {
    id: 'projects',
    keys: keys('project', 'projects', 'portfolio', 'what has he built', 'what did he build', 'built', 'build', 'made', 'created', 'showcase', 'side project', 'app', 'apps', 'what else', 'repo', 'repos', 'repositories'),
    reply: () => ({
      text: [
        `**Flagship**\n\n${list(flagship)}`,
        `**More**\n\n${list(otherProjects)}`,
        minorProjects.length ? `**Smaller ML apps and notebooks:** ${minorProjects.join(' · ')}` : '',
        `He has **${assistant.repos.count} public repositories**: [see them all](${assistant.repos.href}). Ask about any project, or [browse the Works section](#works).`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      suggestions: projects.slice(0, 2).map((p) => `Tell me about ${p.title}`).concat(inforge ? [`Tell me about ${inforge.title}`] : []),
    }),
  },
  {
    id: 'links',
    keys: keys('demo', 'demos', 'live demo', 'try', 'try it', 'source code', 'code', 'links', 'deployed', 'hosted'),
    reply: () => ({
      text: `**Project links**\n\n${list(
        projects.map((p) => `**${p.title}**: ${p.links?.length ? p.links.map((l) => `[${l.label}](${l.href})`).join(' · ') : 'no public link'}`),
      )}\n\nAll his public code is on [GitHub](${link('GitHub')?.href ?? '#contact'}).`,
      suggestions: ['Tell me about PredictLab', 'Show me his projects'],
    }),
  },
  {
    id: 'highlight',
    keys: keys('best project', 'favorite', 'favourite', 'most impressive', 'flagship', 'proudest', 'standout', 'biggest', 'strongest', 'recommend', 'which one should i look at', 'best work'),
    bias: 1,
    reply: () => {
      const p = loom ?? projects[0]
      const x = extra(p)
      return {
        topic: `project:${p.id}`,
        project: p.id,
        text: [
          `${named(p)} is his flagship: ${p.tagline}`,
          x.image ? image(x.image) : '',
          list(x.metrics ?? p.facts.map((f) => `**${f.value}**: ${f.label}`)),
          [x.docs?.[0] ? `[${x.docs[0].label}](${x.docs[0].href})` : '', caseStudy(p)].filter(Boolean).join(' · '),
          `*Want the architecture behind ${p.title}?*`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        suggestions: [`How does ${p.title} work?`, 'Show me his projects'],
      }
    },
  },
  {
    id: 'skills',
    keys: keys('skill', 'skills', 'tech stack', 'stack', 'technologies', 'technology', 'tools', 'languages', 'frameworks', 'expertise', 'good at', 'strength', 'proficient', 'specialize', 'specialise', 'specialty', 'what can he do'),
    reply: () => ({
      text: [
        '**His stack**',
        image(assistant.images.stack),
        list(assistant.skillGroups.map((g) => `**${g.label}**: ${g.items.join(', ')}`)),
        'Ask “does he know …?” about anything specific.',
      ].join('\n\n'),
      suggestions: ['Does he know LangGraph?', 'Has he built RAG systems?', 'Show me his projects'],
    }),
  },
  {
    id: 'achievements',
    keys: keys('achievement', 'award', 'hackerrank', 'orchestrate', 'finalist', 'competition', 'hackathon', 'won', 'win', 'accomplishment', 'recognition', 'leetcode', 'contest', 'rank', 'ranking', 'competitive programming', 'research', 'paper', 'preprint', 'publication', 'published', 'zenodo'),
    bias: 0.5,
    reply: () => ({
      text: `**Achievements**\n\n${list(assistant.achievements)}`,
      suggestions: ['Show all his certifications', 'Where did he study?', 'Tell me about PredictLab'],
    }),
  },
  {
    id: 'certifications',
    keys: keys('certification', 'certifications', 'certificate', 'certificates', 'certified', 'cert', 'certs', 'badge', 'badges', 'credential', 'credentials', 'licenses', 'licence'),
    bias: 0.75,
    reply: () => certListReply(assistant.certifications, `Certifications (${assistant.certifications.length})`),
  },
  {
    id: 'education',
    keys: keys('education', 'degree', 'college', 'university', 'graduate', 'graduation', 'bca', 'bachelor', 'masters', 'studied', 'did he study', 'study at', 'where did he study', 'school', 'qualification', 'course', 'avodha'),
    bias: 0.5,
    reply: () => ({
      text: `**Education**\n\n${list(assistant.education)}\n\nAlongside these he holds **${assistant.certifications.length} certifications**, from IBM, AWS, Anthropic, HackerRank and others.`,
      suggestions: ['Show all his certifications', 'What are his achievements?', 'What’s his experience?'],
    }),
  },
  {
    id: 'contact',
    keys: keys('contact', 'email', 'mail', 'reach', 'get in touch', 'touch', 'message him', 'talk to him', 'connect', 'linkedin', 'github', 'social', 'hire him', 'how to hire'),
    reply: (_q, ctx) => ({
      text: `${contactBlock}${ctx.resume ? `\n- **Résumé:** [PDF](${ctx.resume})` : ''}\n\nOr use the [form in the Contact section](#contact).`,
      suggestions: ['Is he available?', 'What’s his experience?'],
    }),
  },
  {
    id: 'resume',
    keys: keys('resume', 'cv', 'curriculum vitae', 'download'),
    bias: 0.5,
    reply: (_q, ctx) => ({
      text: ctx.resume
        ? `Here’s his résumé: [download the PDF](${ctx.resume}).`
        : `His résumé isn’t posted on the site yet. Ask Vinayak for it at ${mail}, or see his [LinkedIn](${link('LinkedIn')?.href ?? '#contact'}).`,
      suggestions: ['What’s his experience?', 'How can I contact him?'],
    }),
  },
  {
    id: 'availability',
    keys: keys('available', 'availability', 'open to', 'looking for', 'job search', 'opportunity', 'opportunities', 'hiring', 'hire', 'freelance', 'open for work', 'new role', 'new roles', 'job change', 'relocate', 'relocation', 'remote', 'remotely', 'onsite', 'on site', 'hybrid', 'work from home', 'wfh', 'bangalore', 'bengaluru', 'hyderabad'),
    reply: () => ({
      text: `Yes. He’s open to **${assistant.profile.openTo}**: ${workPlaces}.\n\n${contactBlock}`,
      suggestions: ['Why should I hire him?', 'What’s his tech stack?'],
    }),
  },
  {
    id: 'location',
    keys: keys('where', 'located', 'location', 'based', 'live in', 'where doe he live', 'city', 'country', 'timezone', 'time zone', 'local time', 'time there', 'kochi', 'kerala', 'india'),
    reply: (_q, ctx) => {
      let time = ''
      try {
        time = new Intl.DateTimeFormat('en-US', { timeZone: site.timezone, hour: 'numeric', minute: '2-digit' }).format(ctx.now ?? new Date())
      } catch {
        // An unknown time zone just drops the clock line.
      }
      return {
        text: `He’s based in **${site.location}** (${site.timezoneLabel}).${time ? ` It’s ${time} there right now.` : ''}\n\nHe’s open to roles that are ${workPlaces}.`,
        suggestions: ['How can I contact him?'],
      }
    },
  },
  {
    id: 'site',
    keys: keys('this site', 'this website', 'this portfolio', 'site built', 'website built', 'portfolio built', 'how was this made', 'how is this made', 'three js', 'threejs', 'webgl', 'animation', 'design of'),
    bias: 0.5,
    reply: () => ({
      text: assistant.site,
      suggestions: ['Show me his projects', 'What’s his tech stack?'],
    }),
  },
  ...assistant.notCovered.map<Topic>((n) => ({
    id: `not-covered:${n.label}`,
    keys: keys(...n.keys),
    // Naming one of these ("open to relocation?") should beat the broader topic it sits in.
    bias: 1.5,
    reply: () => ({
      text: n.direct
        ? `Vinayak prefers to discuss his ${n.label} directly: ${mail}.`
        : `That’s not something I have details on (${n.label}), so I won’t guess. Best to ask Vinayak directly at ${mail}.`,
      suggestions: ['How can I contact him?', 'What’s his experience?'],
    }),
  })),
]

/* -------------------------------------------------------------------- faq */

const faqKeys = assistant.faq.map((f) => ({ f, k: keys(...f.ask), sets: f.ask.map((a) => new Set(words(a).filter((w) => !STOP.has(w)))) }))

/** Phrase hits count fully; otherwise a close paraphrase of an example question counts. */
function faqScore(q: Question, entry: (typeof faqKeys)[number]) {
  let s = score(q, entry.k) * 2
  const mine = new Set(q.content)
  for (const set of entry.sets) {
    if (set.size < 2) continue
    let shared = 0
    for (const w of set) if (mine.has(w)) shared++
    if (shared >= 2 && shared / set.size >= 0.6) s = Math.max(s, shared * 1.5)
  }
  return s
}

const faqReply = (f: FaqEntry): Draft => ({
  text: f.answer,
  topic: `faq:${f.ask[0]}`,
  suggestions: f.suggestions ?? [],
  known: true,
})

/* ------------------------------------------------------------------ entry */

const PRONOUN = keys('it', 'its', 'that', 'that one', 'this one', 'the project', 'the app')
const PERSON = keys('he', 'his', 'him', 'vinayak')
const MORE = keys('tell me more', 'more', 'go on', 'continue', 'elaborate', 'more detail', 'details', 'deeper', 'expand')

export function fallback(): Draft {
  return {
    text: `That’s not something I have details on, and I’d rather not guess. Best to ask Vinayak directly at ${mail}.\n\nI can tell you about his **projects**, **experience**, **skills** or **how to reach him**.`,
    topic: 'fallback',
    suggestions: assistant.starters.slice(0, 3),
    known: false,
    intent: 'no match',
    missed: true,
  }
}

/** What each topic reads to answer, for the trace. Small talk reads nothing. */
const TOPIC_SOURCES: Record<string, string[]> = {
  self: ['About this assistant'],
  about: ['Profile', `${currentRole.company} role`, 'Achievements'],
  'why-hire': [`${currentRole.company} role`, 'Flagship projects', 'Achievements'],
  'ai-experience': [`${currentRole.company} role`, 'Loom.ai', 'InForge-AI', 'Skills'],
  'current-role': [`${currentRole.company} role`],
  experience: experience.map((r) => `${r.company} role`),
  level: ['Experience', 'Flagship projects'],
  projects: ['Projects', 'GitHub repositories'],
  links: ['Project links'],
  highlight: ['Loom.ai case study', 'Loom.ai docs'],
  skills: ['Skills'],
  achievements: ['Achievements'],
  certifications: ['Certifications'],
  education: ['Education', 'Certifications'],
  contact: ['Contact details'],
  resume: ['Contact details'],
  availability: ['Profile', 'Contact details'],
  location: ['Profile'],
  site: ['How this site is built'],
  ...Object.fromEntries(earlierRoles.map((r) => [`role:${r.company}`, [`${r.company} role`]])),
}

/** Topic ids whose name alone wouldn't say what was asked. */
const INTENT_LABEL: Record<string, string> = {
  highlight: 'best project',
  'ai-experience': 'LLM / agent experience',
  level: 'experience level',
  'why-hire': 'why hire him',
  self: 'about this assistant',
  'off-topic': 'off-topic · steer back',
  site: 'how this site is built',
}

/** "current-role" → "current role", "not-covered:salary" → "private · salary". */
const intentOf = (id: string) =>
  INTENT_LABEL[id] ?? (id.startsWith('not-covered:') ? `private · ${id.slice(12)}` : id.replace(/-/g, ' ').replace(':', ' · '))

/** The draft's steps as tool calls: what was asked, what was read, how it was checked, what was written. */
function traceOf(d: Draft): TraceStep[] {
  const steps: TraceStep[] = [{ tool: 'classify_intent', detail: d.intent ?? intentOf(d.topic) }]
  const sources = d.sources ?? []
  if (sources.length) {
    steps.push({ tool: 'search_knowledge', detail: `${sources.length} source${sources.length === 1 ? '' : 's'} matched` })
    for (const s of sources.slice(0, 3)) steps.push({ tool: 'read_source', detail: s })
    steps.push({ tool: 'check_grounding', detail: 'every claim traced to a source' })
  } else if (d.missed) {
    steps.push({ tool: 'search_knowledge', detail: 'nothing matched' })
    steps.push({ tool: 'check_grounding', detail: 'no source, so no guessing' })
  }
  const n = toPlainText(d.text).split(/\s+/).filter(Boolean).length
  steps.push({ tool: 'compose_answer', detail: `${n} word${n === 1 ? '' : 's'}` })
  return steps
}

/** Answers one question. `ctx` carries what the conversation was last about. */
export function answer(input: string, ctx: AskContext = {}): Reply {
  const d = route(input, ctx)
  return { text: d.text, topic: d.topic, project: d.project, suggestions: d.suggestions, known: d.known, trace: traceOf(d) }
}

/** A project's reply, with what it read: the case study, plus the build notes when there are any. */
function aboutProject(p: Project, facet: Facet, q: Question): Draft {
  const x = extra(p)
  return {
    ...projectReply(p, facet, q),
    intent: `project · ${p.title}${facet === 'overview' ? '' : ` · ${facet}`}`,
    sources: [`${p.title} case study`, ...(x.details || x.metrics ? [`${p.title} build notes`] : []), ...(x.docs ? [`${p.title} docs`] : [])],
  }
}

function route(input: string, ctx: AskContext): Draft {
  const q = question(input.slice(0, assistant.maxLength))
  if (!q.w.length) {
    return { text: 'Ask me anything about Vinayak’s work.', topic: 'empty', suggestions: assistant.starters, known: true }
  }

  // 1. The owner's own answers come first.
  let bestFaq: (typeof faqKeys)[number] | null = null
  let faqTop = 0
  for (const e of faqKeys) {
    const s = faqScore(q, e)
    if (s > faqTop) {
      faqTop = s
      bestFaq = e
    }
  }
  if (bestFaq && faqTop >= 1) return { ...faqReply(bestFaq.f), intent: 'owner FAQ', sources: ['Vinayak’s own answers'] }

  // A certificate asked for by issuer or subject ("his AWS certificate", "IBM courses").
  const certs = mentionedCerts(q)
  if (certs?.length === 1) return certReply(certs[0])
  if (certs) {
    return {
      ...certListReply(certs, `${certs.length} matching certifications`),
      intent: 'certifications · filtered',
      sources: [...new Set(certs.map((c) => `${c.issuer} certificate`))],
    }
  }

  // 2. A project named outright (or "the second one"), then one the page doesn't show.
  const mentioned = mentionedProjects(q, ctx)
  const facet = facetOf(q)
  if (mentioned.length > 1) {
    const ps = mentioned.slice(0, 3)
    return { ...compareReply(ps), intent: `compare · ${ps.map((p) => p.title).join(' vs ')}`, sources: ps.map((p) => `${p.title} case study`) }
  }
  if (mentioned.length === 1) return aboutProject(mentioned[0], facet ?? 'overview', q)
  const more = mentionedMore(q)
  if (more) return { ...moreReply(more), intent: `project · ${more.title}`, sources: [`${more.title} repository`] }

  // 3. "Does he know X?"
  const tech = askedTech(q.raw)
  if (tech) return techReply(tech)

  // 4. Follow-ups about the project just discussed: "what stack did it use?", "tell me more".
  // A bare "github?" follows on; "his tech stack" is about Vinayak, not the project.
  const last = ctx.project ? projectById.get(ctx.project) : undefined
  const wantsMore = MORE.some((p) => contains(q.w, p)) && q.content.length <= 2
  const followUp = PRONOUN.some((p) => contains(q.w, p)) || (q.content.length <= 2 && !PERSON.some((p) => contains(q.w, p)))
  if (last && facet && followUp) return aboutProject(last, facet, q)
  if (last && wantsMore) return aboutProject(last, 'more', q)
  if (wantsMore) {
    return {
      intent: 'follow-up · needs a subject',
      text: 'Happy to go deeper. What would you like more on?',
      topic: 'more',
      suggestions: ctx.topic === 'projects' ? projects.slice(0, 3).map((p) => `Tell me about ${p.title}`) : assistant.starters.slice(0, 3),
      known: true,
    }
  }

  // 5. Everything else: the best-scoring topic.
  let best: Topic | null = null
  let top = 0
  for (const t of TOPICS) {
    const s = score(q, t.keys)
    if (!s) continue
    const biased = s + (t.bias ?? 0)
    if (biased > top) {
      top = biased
      best = t
    }
  }

  // A tool or library named on its own ("LangGraph?") beats a weak topic match.
  const tag = namedTag(q)
  if (tag && top < 2) return techReply(tag)

  if (best && top > 0) {
    const r = best.reply(q, ctx)
    return { known: true, sources: TOPIC_SOURCES[best.id], ...r, intent: intentOf(best.id), topic: r.topic ?? best.id }
  }
  return fallback()
}
