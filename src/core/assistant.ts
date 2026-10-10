/**
 * The chat assistant's answer engine. No language model: a question is matched
 * against topics built from src/content.ts (plus the hand-written entries in
 * src/assistant.ts) and answered only with what those say. Anything it can't
 * ground there gets an honest "not covered here" and the way to ask directly.
 *
 * Pure: no DOM, no network, deterministic. Tested by scripts/assistant.test.mjs.
 */
import { about, captionParts, contact, experience, projects, site, type Project, type Role } from '../content'
import { assistant, type FaqEntry } from '../assistant'

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
}

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
const caseStudy = (p: Project) => `[Open the ${p.title} case study](#work-${p.id})`
const list = (items: string[]) => items.map((i) => `- ${i}`).join('\n')
const mail = `[${contact.email}](mailto:${contact.email})`
const link = (label: string) => contact.links.find((l) => l.label === label)

/** Echoed visitor text, stripped of anything Markdown would act on. */
const plain = (s: string) => s.replace(/[^\p{L}\p{N} .+#/-]/gu, '').replace(/\s+/g, ' ').trim()

const currentRole = experience.find((r) => /present/i.test(r.end)) ?? experience[0]
const roleLine = (r: Role) => `**${r.title}**, ${r.company} (${r.start} – ${r.end})`

/** Every sentence the site says about Vinayak's work, with where it came from. */
interface Evidence {
  source: string
  project?: string
  text: string
  w: string[]
}

const sentences = (s: string) =>
  s
    .replace(/\n/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/)
    .map((t) => t.trim())
    .filter(Boolean)

const corpus: Evidence[] = [
  ...projects.flatMap((p) => {
    const { lead, body } = captionParts(p.caption)
    const texts = [p.tagline, lead, ...sentences(body), ...sentences(p.summary), ...sentences(p.problem), ...p.approach.flatMap(sentences)]
    return [
      ...texts.filter(Boolean).map((text) => ({ source: p.title, project: p.id, text })),
      { source: p.title, project: p.id, text: `Stack: ${p.tags.join(', ')}.` },
    ]
  }),
  ...experience.map((r) => ({ source: `${r.company} (${r.title})`, text: r.summary })),
  { source: 'Intro', text: site.intro },
  { source: 'About', text: `${about.intro.before}${about.intro.name}${about.intro.after}` },
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
  return [...best.values()].map((b) => b.e)
}

const clip = (s: string, max = 220) => (s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, '')}…`)

/** Tag names exactly as the site writes them, for display. */
const allTags = [...new Set(projects.flatMap((p) => p.tags))]
const knownNames = [...allTags, ...assistant.skillGroups.flatMap((g) => g.items)]

/* --------------------------------------------------------------- projects */

const projectKeys = new Map<string, Keys>(
  projects.map((p) => [p.id, keys(p.title, p.id.replace(/-/g, ' '), ...(assistant.projectAliases[p.id] ?? []))]),
)

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

type Facet = 'overview' | 'stack' | 'how' | 'problem' | 'results' | 'links' | 'role' | 'more'

/** In tie-break order: the broad "stack" words (model, use) come last. */
const FACETS: [Facet, Keys][] = [
  ['links', keys('link', 'github', 'repo', 'repository', 'source code', 'code', 'demo', 'live', 'url', 'try it', 'see it', 'website')],
  ['how', keys('how does it work', 'how it work', 'how doe', 'how did', 'how was', 'how is', 'approach', 'architecture', 'pipeline', 'under the hood', 'implementation', 'implemented', 'design', 'feature')],
  ['problem', keys('problem', 'why', 'motivation', 'purpose', 'goal', 'solve', 'what for', 'point of', 'use case')],
  ['results', keys('result', 'metric', 'number', 'impact', 'outcome', 'performance', 'stat', 'scale', 'accuracy', 'benchmark', 'at a glance')],
  ['role', keys('role', 'solo', 'team', 'who built', 'alone', 'contribution', 'his part', 'did he build', 'original', 'open source', 'credit', 'own work', 'his own', 'himself', 'from scratch', 'tutorial')],
  ['more', keys('more', 'detail', 'deeper', 'elaborate', 'explain', 'expand', 'deep dive', 'case study', 'everything', 'full story')],
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

function projectReply(p: Project, facet: Facet, q: Question): Reply {
  const { lead, body } = captionParts(p.caption)
  const others = projects.filter((o) => o.id !== p.id)
  const base = { topic: `project:${p.id}`, project: p.id, known: true }
  const facts = list(p.facts.map((f) => `**${f.value}**: ${f.label}`))
  const links = p.links?.length ? list(p.links.map((l) => `[${l.label}](${l.href})`)) : ''
  const meta = `*${p.role} · ${p.year}*`

  switch (facet) {
    case 'stack':
      return {
        ...base,
        text: `**${p.title}** is built with:\n\n${list(p.tags.map((t) => `**${t}**`))}\n\n${meta}`,
        suggestions: [`How does ${p.title} work?`, `Is ${p.title} on GitHub?`, 'What’s his tech stack?'],
      }
    case 'how':
      return {
        ...base,
        text: `**How ${p.title} works**\n\n${list(p.approach)}\n\n${caseStudy(p)}`,
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
      const note = askedMetric ? '\n\nThe case study doesn’t report other metrics such as accuracy; Vinayak can share those directly.' : ''
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
          : `There’s no public link for **${p.title}** on this site. ${caseStudy(p)}, or ask Vinayak at ${mail}.`,
        suggestions: [`How does ${p.title} work?`, 'Show me his projects'],
      }
    case 'role':
      return {
        ...base,
        text: `**${p.title}**: ${p.role}, ${p.year}.${lead ? `\n\n${lead}` : ''}${p.id === 'health' ? `\n\n${body}` : ''}`,
        suggestions: [`How does ${p.title} work?`, `What stack does ${p.title} use?`],
      }
    case 'more':
      return {
        ...base,
        text: [
          `**${p.title}**: ${p.summary}`,
          `**The problem:** ${p.problem}`,
          `**Approach**\n\n${list(p.approach)}`,
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
        text: `**${p.title}**: ${p.tagline}\n\n${lead ? `${lead} ` : ''}${body}\n\n${meta} · ${p.tags.join(', ')}\n\n${caseStudy(p)}`,
        suggestions: [`How does ${p.title} work?`, p.links?.length ? `Is ${p.title} on GitHub?` : `What stack does ${p.title} use?`, 'Show me his projects'],
      }
  }
}

function compareReply(ps: Project[]): Reply {
  return {
    text: `${ps
      .map((p) => `**${p.title}** (${p.year}, ${p.role.toLowerCase()}): ${p.tagline}\n\n*Stack:* ${p.tags.join(', ')}`)
      .join('\n\n')}\n\nAsk about either one for the details.`,
    topic: 'compare',
    suggestions: ps.map((p) => `How does ${p.title} work?`).slice(0, 3),
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

function techReply(term: string): Reply {
  const key = words(term).join(' ')
  const display = knownNames.find((t) => words(t).join(' ') === key) ?? (term.length <= 4 ? term.toUpperCase() : term[0].toUpperCase() + term.slice(1))
  const terms = [term, ...(assistant.techSynonyms[term.toLowerCase()] ?? assistant.techSynonyms[key] ?? [])]
  const found = evidence(terms)
  if (!found.length) {
    return {
      text: `**${display}** isn’t mentioned in any of the projects or roles on this site, so I can’t say. Vinayak can answer that directly at ${mail}.`,
      topic: 'tech',
      suggestions: ['What’s his tech stack?', 'Show me his projects'],
      known: true,
    }
  }
  const top = found.slice(0, 3)
  const first = top.find((e) => e.project)
  return {
    text: `Yes. **${display}** shows up in his work:\n\n${list(top.map((e) => `**${e.source}**: ${clip(e.text)}`))}`,
    topic: 'tech',
    project: first?.project,
    suggestions: [first ? `Tell me about ${projectById.get(first.project!)!.title}` : 'Show me his projects', 'What’s his tech stack?'],
    known: true,
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
  reply: (q: Question, ctx: AskContext) => Omit<Reply, 'topic' | 'known'> & { topic?: string }
}

const hiringLine = `${site.availability}.`

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
    keys: keys('are you', 'who are you', 'what are you', 'are you a bot', 'are you ai', 'are you human', 'are you real', 'how do you work', 'chatgpt', 'gpt', 'language model', 'llm powered', 'your name', 'bot', 'assistant'),
    reply: () => ({
      text: assistant.self,
      suggestions: assistant.starters.slice(0, 3),
    }),
  },
  {
    id: 'about',
    keys: keys('who is', 'who is he', 'about him', 'about vinayak', 'tell me about', 'introduce', 'introduction', 'background', 'bio', 'summary', 'profile', 'overview', 'what does he do', 'what doe he do', 'work on', 'what is he', 'yourself', 'himself', 'vinayak'),
    bias: -0.25,
    reply: () => ({
      text: `**${site.name}** is an ${site.role} based in ${site.location}.\n\nIn his words: “${site.intro}”\n\nHe’s currently ${roleLine(currentRole)}. ${about.closing}\n\n*${hiringLine}*`,
      suggestions: ['Show me his projects', 'What’s his experience?', 'What’s his tech stack?'],
    }),
  },
  {
    id: 'current-role',
    keys: keys('current job', 'current role', 'currently', 'do at', 'at amnova', 'work at', 'works at', 'working at', 'where does he work', 'employer', 'company', 'job title', 'position', 'job', 'amnova', 'amnova technologies'),
    reply: () => ({
      text: `He’s ${roleLine(currentRole)}: ${currentRole.summary}`,
      suggestions: ['What’s his experience?', 'Show me his projects'],
    }),
  },
  {
    id: 'experience',
    keys: keys('experience', 'work experience', 'work history', 'career', 'internship', 'intern', 'previous', 'previous company', 'past company', 'companies he worked', 'past roles', 'where has he worked', 'worked at', 'year of experience', 'employment', 'roles', 'role'),
    reply: () => ({
      text: `**Experience**\n\n${list(experience.map((r) => `${roleLine(r)}: ${r.summary}`))}\n\n[See the Experience section](#experience)`,
      suggestions: ['What does he do at AMnova?', 'Show me his projects', 'What’s his tech stack?'],
    }),
  },
  ...experience
    .filter((r) => r !== currentRole)
    .map<Topic>((r) => ({
      id: `role:${r.company}`,
      keys: keys(r.company, r.company.split(' ')[0]),
      bias: 1,
      reply: () => ({
        text: `${roleLine(r)}: ${r.summary}`,
        suggestions: ['What’s his experience?', 'Show me his projects'],
      }),
    })),
  {
    id: 'projects',
    keys: keys('project', 'projects', 'portfolio', 'what has he built', 'what did he build', 'built', 'build', 'made', 'created', 'showcase', 'side project', 'app', 'apps', 'what else'),
    reply: () => ({
      text: `**Projects**\n\n${list(projects.map((p) => `**${p.title}** (${p.year}): ${p.tagline}`))}\n\nAsk about any of them, or [browse the Works section](#works).`,
      suggestions: projects.slice(0, 3).map((p) => `Tell me about ${p.title}`),
    }),
  },
  {
    id: 'links',
    keys: keys('demo', 'demos', 'live demo', 'try', 'try it', 'repos', 'repositories', 'source code', 'code', 'links', 'deployed', 'hosted'),
    reply: () => ({
      text: `**Project links**\n\n${list(
        projects.map((p) => `**${p.title}**: ${p.links?.length ? p.links.map((l) => `[${l.label}](${l.href})`).join(' · ') : 'no public link'}`),
      )}\n\nAll his public code is on [GitHub](${link('GitHub')?.href ?? '#contact'}).`,
      suggestions: ['Tell me about PredictLab', 'Show me his projects'],
    }),
  },
  {
    id: 'highlight',
    keys: keys('best project', 'favorite', 'favourite', 'most impressive', 'flagship', 'proudest', 'standout', 'biggest', 'strongest', 'recommend', 'which one should i look at'),
    bias: 1,
    reply: () => {
      const p = projects[0]
      return {
        topic: `project:${p.id}`,
        project: p.id,
        text: `If you only look at one, **${p.title}** is the largest build here: ${p.summary}\n\n${list(p.facts.map((f) => `**${f.value}**: ${f.label}`))}\n\n${caseStudy(p)}`,
        suggestions: [`How does ${p.title} work?`, 'Show me his projects'],
      }
    },
  },
  {
    id: 'skills',
    keys: keys('skill', 'skills', 'tech stack', 'stack', 'technologies', 'technology', 'tools', 'languages', 'frameworks', 'expertise', 'good at', 'strength', 'proficient', 'specialize', 'specialise', 'specialty', 'what can he do'),
    reply: () => {
      const evidenced = (name: string) => evidence([name]).length > 0
      const groups = assistant.skillGroups
        .map((g) => ({ ...g, items: g.items.filter(evidenced) }))
        .filter((g) => g.items.length)
      return {
        text: `**Skills, as used in his projects and roles**\n\n${list(groups.map((g) => `**${g.label}**: ${g.items.join(', ')}`))}\n\nAsk “does he know …?” about anything specific.`,
        suggestions: ['Does he know LangGraph?', 'Has he built RAG systems?', 'Show me his projects'],
      }
    },
  },
  {
    id: 'achievements',
    keys: keys('achievement', 'award', 'hackerrank', 'orchestrate', 'finalist', 'competition', 'hackathon', 'won', 'win', 'accomplishment', 'recognition'),
    bias: 0.5,
    reply: () => {
      const found = evidence(['finalist', 'hackerrank'])
      return {
        text: found.length
          ? `In his own words: “${found[0].text}”\n\nFor more detail on it, ask Vinayak at ${mail}.`
          : `This site doesn’t list awards. Vinayak can tell you more at ${mail}.`,
        suggestions: ['Show me his projects', 'What’s his experience?'],
      }
    },
  },
  {
    id: 'contact',
    keys: keys('contact', 'email', 'mail', 'reach', 'get in touch', 'touch', 'message him', 'talk to him', 'connect', 'linkedin', 'github', 'social', 'hire him', 'how to hire'),
    reply: (_q, ctx) => {
      const lines = [`**Email:** ${mail}`, ...contact.links.map((l) => `**${l.label}:** [${l.href.replace(/^https?:\/\/(www\.)?/, '')}](${l.href})`)]
      if (ctx.resume) lines.push(`**Résumé:** [PDF](${ctx.resume})`)
      return {
        text: `${list(lines)}\n\nOr use the [form in the Contact section](#contact). ${hiringLine}`,
        suggestions: ['Is he open to new roles?', 'Where is he based?'],
      }
    },
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
    keys: keys('available', 'availability', 'open to', 'looking for', 'job search', 'opportunity', 'opportunities', 'hiring', 'hire', 'freelance', 'open for work', 'new role', 'new roles', 'job change'),
    reply: () => ({
      text: `${hiringLine} He’s currently ${roleLine(currentRole)}.\n\nThe best way to start a conversation is email: ${mail}.`,
      suggestions: ['How can I contact him?', 'What’s his tech stack?'],
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
        text: `He’s based in **${site.location}** (${site.timezoneLabel}).${time ? ` It’s ${time} there right now.` : ''}`,
        suggestions: ['Is he open to new roles?', 'How can I contact him?'],
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
      text: `This site doesn’t cover ${n.label}, so I won’t guess. Vinayak can answer that directly at ${mail}.`,
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

const faqReply = (f: FaqEntry): Reply => ({
  text: f.answer,
  topic: `faq:${f.ask[0]}`,
  suggestions: f.suggestions ?? [],
  known: true,
})

/* ------------------------------------------------------------------ entry */

const PRONOUN = keys('it', 'its', 'that', 'that one', 'this one', 'the project', 'the app')
const PERSON = keys('he', 'his', 'him', 'vinayak')
const MORE = keys('tell me more', 'more', 'go on', 'continue', 'elaborate', 'more detail', 'details', 'deeper', 'expand')

export function fallback(): Reply {
  return {
    text: `I don’t have that in my notes about Vinayak, and I’d rather not guess. I can tell you about his **projects**, **experience**, **skills** or **how to reach him**. For anything else, email ${mail}.`,
    topic: 'fallback',
    suggestions: assistant.starters.slice(0, 3),
    known: false,
  }
}

/** Answers one question. `ctx` carries what the conversation was last about. */
export function answer(input: string, ctx: AskContext = {}): Reply {
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
  if (bestFaq && faqTop >= 1) return faqReply(bestFaq.f)

  // 2. A project named outright (or "the second one").
  const named = mentionedProjects(q, ctx)
  const facet = facetOf(q)
  if (named.length > 1) return compareReply(named.slice(0, 3))
  if (named.length === 1) return projectReply(named[0], facet ?? 'overview', q)

  // 3. "Does he know X?"
  const tech = askedTech(q.raw)
  if (tech) return techReply(tech)

  // 4. Follow-ups about the project just discussed: "what stack did it use?", "tell me more".
  // A bare "github?" follows on; "his tech stack" is about Vinayak, not the project.
  const last = ctx.project ? projectById.get(ctx.project) : undefined
  const more = MORE.some((p) => contains(q.w, p)) && q.content.length <= 2
  const followUp = PRONOUN.some((p) => contains(q.w, p)) || (q.content.length <= 2 && !PERSON.some((p) => contains(q.w, p)))
  if (last && facet && followUp) return projectReply(last, facet, q)
  if (last && more) return projectReply(last, 'more', q)
  if (more) {
    return {
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
    return { known: true, ...r, topic: r.topic ?? best.id }
  }
  return fallback()
}
