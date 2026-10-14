/**
 * The console's interaction engine: the command registry, command parsing and completion, and the
 * resolver that turns any input into a view of the knowledge graph (src/core/graph.ts).
 *
 * Resolution order, first match wins:
 *   1. command  — input starting with "/" (/project loom, /tech fastapi)
 *   2. entity   — the whole input names a node exactly ("loom", "fastapi", "rag")
 *   3. context  — a follow-up about the node on screen ("which projects use it?")
 *   4. intent   — the rule-based question engine (src/core/assistant.ts), whose topics map to views;
 *                 it marks its own follow-ups ("what stack does it use?") as context
 *   5. fallback — nothing matched: say so, and show the nearest names in the index
 *
 * No language model, no randomness, no network: the same input and context always resolve the same
 * way. Tested by scripts/console.test.mjs.
 */
import { assistant } from '../assistant'
import { experience } from '../content'
import { answer, unstretch, vocabulary, words, type AskContext, type Reply } from './assistant'
import {
  capabilitiesOf,
  commandFor,
  evidenceFor,
  findArg,
  graph,
  kindCode,
  lookup,
  nearest,
  projectsUsing,
  relatedProjects,
  rolesUsing,
  techForCapability,
  techOf,
  usage,
  usedWith,
  type GraphNode,
  type NodeKind,
} from './graph'

/* --------------------------------------------------------------- registry */

export type ArgKind = 'project' | 'arch' | 'tech' | 'capability' | 'role' | 'filter'

export interface Command {
  name: string
  aliases?: string[]
  arg?: { kind: ArgKind; required: boolean; hint: string }
  summary: string
  group: 'Explore' | 'Inspect' | 'Session'
}

export const COMMANDS: Command[] = [
  { name: 'about', summary: 'Who he is, what he has shipped, education and awards', group: 'Explore' },
  { name: 'projects', arg: { kind: 'filter', required: false, hint: 'technology or capability' }, summary: 'All his projects, or only those using one technology or skill', group: 'Explore' },
  { name: 'agents', summary: 'His work with AI agents, across projects and jobs', group: 'Explore' },
  { name: 'stack', summary: 'Every technology he uses, and how often', group: 'Explore' },
  { name: 'experience', aliases: ['roles', 'work'], arg: { kind: 'role', required: false, hint: 'company' }, summary: 'His jobs, newest first, and what he did in each', group: 'Explore' },
  { name: 'certs', aliases: ['certifications'], summary: 'His certificates, with links to verify them', group: 'Explore' },
  { name: 'contact', summary: 'Email, GitHub, LinkedIn and the contact form', group: 'Explore' },
  { name: 'project', aliases: ['p'], arg: { kind: 'project', required: true, hint: 'name' }, summary: 'One project in depth: the problem, how it works, links', group: 'Inspect' },
  { name: 'arch', aliases: ['architecture'], arg: { kind: 'arch', required: true, hint: 'project' }, summary: 'How a project is built, step by step', group: 'Inspect' },
  { name: 'tech', aliases: ['t'], arg: { kind: 'tech', required: true, hint: 'name' }, summary: 'Where he has used a technology', group: 'Inspect' },
  { name: 'capability', aliases: ['cap'], arg: { kind: 'capability', required: true, hint: 'name' }, summary: 'A skill, and the work that proves it', group: 'Inspect' },
  { name: 'map', summary: 'Jump to the graph', group: 'Session' },
  { name: 'back', summary: 'Go back to the previous answer', group: 'Session' },
  { name: 'home', aliases: ['clear'], summary: 'Start a new conversation', group: 'Session' },
  { name: 'help', aliases: ['?'], summary: 'Everything you can ask or type here', group: 'Session' },
]

const commandByName = new Map(COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])].map((n) => [n, c] as const)))

/** "/project lo" → { name: 'project', command, arg: 'lo', spaced: true }. Null unless it starts with "/". */
export function parseCommand(input: string) {
  const m = input.trimStart().match(/^\/(\S*)(\s+)?([\s\S]*)$/)
  if (!m) return null
  const name = m[1].toLowerCase()
  return { name, command: commandByName.get(name), arg: (m[3] ?? '').trim(), spaced: Boolean(m[2]) }
}

/* ------------------------------------------------------------------ views */

export type View =
  | { kind: 'home' }
  | { kind: 'help' }
  | { kind: 'profile' }
  | { kind: 'stack' }
  | { kind: 'certs' }
  | { kind: 'contact' }
  | { kind: 'projects'; filter?: string }
  | { kind: 'project'; id: string }
  | { kind: 'arch'; id: string }
  | { kind: 'tech'; key: string }
  | { kind: 'capability'; id: string }
  | { kind: 'experience'; role?: string }
  | { kind: 'answer'; reply: Reply }
  /** Nothing to show for the input: why, and what is close. */
  | { kind: 'none'; title: string; reason: string; candidates: GraphNode[]; text?: string }

export type Route = 'command' | 'entity' | 'context' | 'intent' | 'fallback'

/** A next step: an input to run, as the console would type it. */
export interface Action {
  label: string
  run: string
}

export interface Resolution {
  input: string
  route: Route
  /** The rule that matched, in a few words ("/project", "contact", "tech · FastAPI"). */
  rule: string
  view?: View
  /** A session action, performed by the interface instead of showing a view. */
  act?: 'map' | 'back' | 'home'
  /** The graph node the view is about: lit on the map, and "it" in the next question. */
  focus?: string
  /** What the answer was read from. */
  sources: string[]
  next: Action[]
  /** The question engine's topic, carried for its follow-ups ("the second one"). */
  topic?: string
}

export interface ConsoleContext {
  /** Node key of the view on screen. */
  focus?: string
  /** The question engine's last topic. */
  topic?: string
  resume?: string | null
  now?: Date
}

/* ---------------------------------------------------------------- helpers */

const node = (key?: string) => (key ? graph.node(key) : undefined)
const act = (label: string, run: string): Action => ({ label, run })
const nodeAct = (v: GraphNode): Action => act(v.short, commandFor(v))
/** Actions without blanks or repeats, at most `max`. */
function uniqueActs(as: (Action | null | undefined | false | 0)[], max = 5): Action[] {
  const out: Action[] = []
  for (const a of as) if (a && !out.some((o) => o.run === a.run)) out.push(a)
  return out.slice(0, max)
}
const archProjects = () => graph.of('project').filter((p) => graph.architecture(p.id))
const KIND_NAMES: Record<ArgKind, NodeKind[]> = {
  project: ['project'],
  arch: ['project'],
  tech: ['tech', 'capability'],
  capability: ['capability'],
  role: ['role'],
  filter: ['tech', 'capability'],
}
const kindWord = (k: ArgKind) => ({ project: 'project', arch: 'project', tech: 'technology', capability: 'capability', role: 'role', filter: 'technology or capability' })[k]

/** The view that shows a node. */
function viewOf(v: GraphNode): View {
  switch (v.kind) {
    case 'project':
      return { kind: 'project', id: v.id }
    case 'tech':
      return { kind: 'tech', key: v.key }
    case 'capability':
      return { kind: 'capability', id: v.id }
    case 'role':
      return { kind: 'experience', role: v.key }
  }
}

function sourcesOf(view: View): string[] {
  const v = view.kind === 'project' || view.kind === 'arch' ? graph.project(view.id) : undefined
  switch (view.kind) {
    case 'project':
      if (!v) return []
      return [
        v.onPage ? `${v.label} case study` : `${v.label} repository`,
        ...(assistant.projectExtras[v.id]?.details || assistant.projectExtras[v.id]?.metrics ? [`${v.label} build notes`] : []),
        'knowledge graph',
      ]
    case 'arch':
      return v ? [`${v.label} ${graph.architecture(v.id)?.source.label.toLowerCase() ?? 'notes'}`] : []
    case 'tech':
    case 'capability':
    case 'projects':
      return ['knowledge graph']
    case 'stack':
      return ['Skills', 'knowledge graph']
    case 'experience':
      return ['Experience']
    case 'profile':
      return ['Profile', 'Achievements', 'Education']
    case 'certs':
      return ['Certifications']
    case 'contact':
      return ['Contact details']
    case 'answer':
      return view.reply.trace.filter((s) => s.tool === 'read_source').map((s) => s.detail)
    default:
      return []
  }
}

/** Where to go from a view: its nearest neighbours in the graph, then the broader indexes. */
export function nextFor(view: View): Action[] {
  switch (view.kind) {
    case 'home':
      return assistant.console.entry.map((c) => act(c.slice(1), c))
    case 'project': {
      const p = graph.project(view.id)
      if (!p) return []
      const tech = techOf(p.key)
        .map((t) => t.node)
        .sort((a, b) => usage(b.key) - usage(a.key))
      const rel = relatedProjects(p.key, 1)[0]
      return uniqueActs([
        graph.architecture(p.id) && act('Architecture', `/arch ${p.id}`),
        tech[0] && nodeAct(tech[0]),
        tech[1] && nodeAct(tech[1]),
        capabilitiesOf(p.key)[0] && nodeAct(capabilitiesOf(p.key)[0].node),
        rel && nodeAct(rel.node),
      ])
    }
    case 'arch': {
      const p = graph.project(view.id)
      if (!p) return []
      const others = archProjects().filter((x) => x.id !== p.id)
      const after = others.find((x) => x.n > p.n) ?? others[0]
      return uniqueActs([act('Project', `/project ${p.id}`), ...techOf(p.key).slice(0, 2).map((t) => nodeAct(t.node)), after && act(`${after.short} architecture`, `/arch ${after.id}`)])
    }
    case 'tech': {
      const t = node(view.key)
      if (!t) return []
      const users = projectsUsing(t.key)
      return uniqueActs([
        users[0] && nodeAct(users[0].node),
        users.length > 1 && act(`All ${users.length} projects`, `/projects ${t.id}`),
        usedWith(t.key)[0] && nodeAct(usedWith(t.key)[0].node),
        rolesUsing(t.key)[0] && act('Experience', `/experience ${rolesUsing(t.key)[0].node.id}`),
        act('Stack', '/stack'),
      ])
    }
    case 'capability': {
      const key = `capability:${view.id}`
      const ev = evidenceFor(key)
      const caps = graph.of('capability')
      const after = caps[(caps.findIndex((c) => c.key === key) + 1) % caps.length]
      return uniqueActs([...ev.projects.slice(0, 2).map((p) => nodeAct(p.node)), techForCapability(key)[0] && nodeAct(techForCapability(key)[0].node), after && nodeAct(after)])
    }
    case 'projects': {
      const f = node(view.filter)
      if (f) {
        const first = (f.kind === 'tech' ? projectsUsing(f.key) : evidenceFor(f.key).projects)[0]
        return uniqueActs([first && nodeAct(first.node), nodeAct(f), act('All projects', '/projects')])
      }
      return uniqueActs([act('Loom.ai', '/project loom'), act('Agents', '/agents'), act('Stack', '/stack')])
    }
    case 'stack':
      return [act('FastAPI', '/tech fastapi'), act('LangGraph', '/tech langgraph'), act('Projects', '/projects')]
    case 'experience':
      return [act('Agents', '/agents'), act('MLOps', '/capability mlops'), act('How many years of experience does he have?', 'How many years of experience does he have?'), act('Contact', '/contact')]
    case 'profile':
      return [act('Projects', '/projects'), act('Experience', '/experience'), act('Why should I hire him?', 'Why should I hire him?'), act('Contact', '/contact')]
    case 'contact':
      return [act('Is he available?', 'Is he available?'), act('Profile', '/about'), act('Projects', '/projects')]
    case 'certs':
      return [act('Show his AWS certificate', 'Show his AWS certificate'), act('Achievements', 'What are his achievements?'), act('Profile', '/about')]
    case 'help':
      return [act('Projects', '/projects'), act('Agents', '/agents'), act('Stack', '/stack')]
    case 'answer': {
      const p = view.reply.project ? graph.project(view.reply.project) : undefined
      return uniqueActs([p && act(`${p.short}`, `/project ${p.id}`), ...view.reply.suggestions.map((s) => act(s, s))], 4)
    }
    case 'none':
      // Nothing close: offer questions that are known to resolve, rather than a dead end.
      return uniqueActs([
        ...view.candidates.slice(0, 3).map(nodeAct),
        ...(view.candidates.length ? [] : assistant.console.examples.slice(0, 2).map((q) => act(q, q))),
        act('Help', '/help'),
      ])
  }
}

const focusOf = (view: View): string | undefined => {
  switch (view.kind) {
    case 'project':
    case 'arch':
      return `project:${view.id}`
    case 'tech':
      return view.key
    case 'capability':
      return `capability:${view.id}`
    case 'experience':
      return view.role
    case 'projects':
      return view.filter
    case 'answer':
      return view.reply.project ? `project:${view.reply.project}` : undefined
    default:
      return undefined
  }
}

function done(input: string, route: Route, rule: string, view: View, topic?: string): Resolution {
  return { input, route, rule, view, focus: focusOf(view), sources: sourcesOf(view), next: nextFor(view), topic }
}

const none = (title: string, reason: string, candidates: GraphNode[], text?: string): View => ({ kind: 'none', title, reason, candidates, text })

/* --------------------------------------------------------------- commands */

function runCommand(input: string, c: Command, arg: string): Resolution {
  const rule = `/${c.name}`
  const go = (view: View) => done(input, 'command', rule, view)
  switch (c.name) {
    case 'about':
      return go({ kind: 'profile' })
    case 'agents':
      return go({ kind: 'capability', id: 'agents' })
    case 'stack':
      return go({ kind: 'stack' })
    case 'certs':
      return go({ kind: 'certs' })
    case 'contact':
      return go({ kind: 'contact' })
    case 'help':
      return go({ kind: 'help' })
    case 'map':
    case 'back':
    case 'home':
      return { input, route: 'command', rule, act: c.name as 'map' | 'back' | 'home', sources: [], next: [] }
  }

  const kind = c.arg!.kind
  if (!arg) {
    if (c.name === 'projects') return go({ kind: 'projects' })
    if (c.name === 'experience') return go({ kind: 'experience' })
    const pool = kind === 'arch' ? archProjects() : kind === 'tech' ? graph.of('tech') : graph.nodes.filter((v) => KIND_NAMES[kind].includes(v.kind))
    return go(none(`/${c.name} needs a ${kindWord(kind)}`, `Pick one below, or type it after the command: /${c.name} <${c.arg!.hint}>.`, pool))
  }

  const found = findArg(arg, KIND_NAMES[kind])
  if (!found.node) {
    const near = found.candidates.length ? found.candidates : nearest(arg, 6).filter((v) => KIND_NAMES[kind].includes(v.kind))
    const reason = found.candidates.length
      ? `“${arg}” matches ${found.candidates.length} names. Pick one.`
      : `Nothing in the index is called “${arg}”, so there is nothing to show.`
    return go(none(found.candidates.length ? 'Several matches' : `No ${kindWord(kind)} “${arg}”`, reason, near))
  }
  const v = found.node
  switch (c.name) {
    case 'projects':
      return go({ kind: 'projects', filter: v.key })
    case 'experience':
      return go({ kind: 'experience', role: v.key })
    case 'arch':
      if (graph.architecture(v.id)) return go({ kind: 'arch', id: v.id })
      return {
        ...go(none(`No architecture for ${v.label}`, `${v.label} has no documented architecture in the index, so none is drawn.`, archProjects())),
        focus: v.key,
      }
    default:
      return go(viewOf(v))
  }
}

/* -------------------------------------------------------------- questions */

const LEAD = /^(?:(?:show|open|inspect|view|explore|go to|take me to|tell me about|what is|what's|whats)\s+)?(?:me\s+)?(?:the\s+)?/i
const PRONOUN = /\b(it|its|it's|this|that|them|those)\b/i
const USE_WORDS = /\b(projects?|use[sd]?|using|built|where|which)\b/i
const ARCH_WORDS = /\b(diagram|architecture|arch|pipeline|flow|request path)\b/i

/** Topics of the question engine that have a structured view. */
function viewForReply(r: Reply): View | null {
  if (!r.known) return null
  if (r.topic === 'projects') return { kind: 'projects' }
  if (r.topic === 'skills') return { kind: 'stack' }
  if (r.topic === 'experience') return { kind: 'experience' }
  if (r.topic === 'current-role' || r.topic.startsWith('role:')) {
    const company = r.topic === 'current-role' ? experience.find((x) => /present/i.test(x.end))?.company : r.topic.slice(5)
    const v = company ? lookup(company, ['role']) : null
    return { kind: 'experience', role: v?.key }
  }
  if (r.topic === 'contact') return { kind: 'contact' }
  if (r.topic === 'about') return { kind: 'profile' }
  if (r.topic === 'ai-experience') return { kind: 'capability', id: 'agents' }
  if (r.topic.startsWith('project:') && r.project) {
    if (r.facet === 'how' && graph.architecture(r.project)) return { kind: 'arch', id: r.project }
    if (!r.facet || r.facet === 'overview' || r.facet === 'more') return { kind: 'project', id: r.project }
    return null
  }
  if (r.topic.startsWith('more:')) return { kind: 'project', id: r.topic.slice(5) }
  if (r.topic === 'tech' && r.term && !/isn’t mentioned/.test(r.text)) {
    const v = lookup(r.term, ['tech', 'capability'])
    if (v) return viewOf(v)
  }
  return null
}

function ask(input: string, ctx: ConsoleContext): Resolution {
  const f = node(ctx.focus)
  const engineCtx: AskContext = { topic: ctx.topic, resume: ctx.resume, now: ctx.now, project: f?.kind === 'project' && graph.project(f.id)?.onPage ? f.id : undefined }
  const reply = answer(input, engineCtx)
  // A reply that changes without the context was a follow-up on it.
  const contextual = Boolean(engineCtx.project || engineCtx.topic) && answer(input, { resume: ctx.resume, now: ctx.now }).topic !== reply.topic
  if (!reply.known) {
    const near = nearest(input)
    return {
      ...done(input, 'fallback', 'no rule matched', none('No match', `Nothing in the index answers “${input.trim().slice(0, 80)}”, and I don’t guess.`, near, reply.text)),
      topic: reply.topic,
    }
  }
  const view = viewForReply(reply) ?? { kind: 'answer', reply }
  const rule = reply.trace[0]?.detail ?? reply.topic
  return done(input, contextual ? 'context' : 'intent', rule, view, reply.topic)
}

/**
 * Resolves one input against the index. Null for empty input (nothing to run).
 * Pure: the same input and context give the same resolution.
 */
export function resolve(raw: string, ctx: ConsoleContext = {}, depth = 0): Resolution | null {
  const input = raw.trim().slice(0, assistant.maxLength)
  if (!input) return null

  // 1. Commands.
  const cmd = parseCommand(input)
  if (cmd) {
    if (cmd.command) return runCommand(input, cmd.command, cmd.arg)
    // A bare "/" asks what there is.
    if (!cmd.name) return runCommand(input, commandByName.get('help')!, '')
    const close = COMMANDS.filter((c) => [c.name, ...(c.aliases ?? [])].some((n) => n.startsWith(cmd.name.slice(0, 2)) && cmd.name.length > 0))
    return {
      input,
      route: 'command',
      rule: 'unknown command',
      view: none(`Unknown command /${cmd.name}`, 'Type / to see every command, or ask in plain words.', []),
      sources: [],
      next: uniqueActs([...close.slice(0, 3).map((c) => act(`/${c.name}`, c.arg?.required ? `/${c.name} ${defaultArg(c)}` : `/${c.name}`)), act('Help', '/help')]),
    }
  }

  // 2. A node named outright.
  const named = lookup(input.replace(LEAD, '').replace(/[?.!]+$/, ''))
  if (named) return done(input, 'entity', `${named.kind} · ${named.label}`, viewOf(named))

  // 3. Follow-ups about the technology, capability or project on screen.
  const f = node(ctx.focus)
  if (f && PRONOUN.test(input)) {
    if ((f.kind === 'tech' || f.kind === 'capability') && USE_WORDS.test(input)) return done(input, 'context', `${f.kind} on screen · ${f.label}`, viewOf(f))
    if (f.kind === 'project' && ARCH_WORDS.test(input) && graph.architecture(f.id)) return done(input, 'context', `architecture · ${f.label}`, { kind: 'arch', id: f.id })
  }

  // 4–5. The question engine, then the honest fallback.
  const res = ask(input, ctx)
  if (res.route !== 'fallback' || depth) return res

  // 6. Before giving up: the same input with misspelt words corrected ("projcts", "experiance").
  const fixed = correct(input)
  if (!fixed) return res
  const again = resolve(fixed, ctx, 1)
  return again && again.route !== 'fallback' ? { ...again, input, rule: `${again.rule} · read as “${fixed}”` } : res
}

/* ------------------------------------------------------------ typo repair */

/** Words worth correcting towards: everything a topic listens for, plus every name in the index. */
let known: Set<string> | null = null
const knownWords = () =>
  (known ??= new Set([...vocabulary, ...graph.nodes.flatMap((n) => words(n.label)), ...Object.keys(assistant.techAliases).flatMap(words)].filter((w) => w.length >= 3)))

/** Edit distance with adjacent swaps (optimal string alignment), stopping early past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      rowMin = Math.min(rowMin, d[i][j])
    }
    if (rowMin > max) return max + 1
  }
  return d[a.length][b.length]
}

/**
 * The input with each unknown word swapped for the closest known one: one edit for words of four or
 * five letters, two for longer ones, same first letter. Null when nothing changed.
 */
function correct(input: string): string | null {
  const dict = knownWords()
  let changed = false
  const out = words(unstretch(input)).map((w) => {
    if (w.length < 4 || dict.has(w) || /\d/.test(w)) return w
    const max = w.length >= 7 ? 2 : 1
    let best = ''
    let bestD = max + 1
    for (const k of dict) {
      if (k[0] !== w[0]) continue
      const dd = distance(w, k, max)
      if (dd < bestD || (dd === bestD && best && k.length > best.length)) {
        best = k
        bestD = dd
      }
    }
    if (!best || bestD > max) return w
    changed = true
    return best
  })
  return changed ? out.join(' ') : null
}

/** An example argument, for a command offered without one. */
const defaultArg = (c: Command) => (c.arg?.kind === 'tech' ? 'fastapi' : c.arg?.kind === 'capability' ? 'agents' : 'loom')

/* -------------------------------------------------------------- completion */

export interface Completion {
  /** The input Tab completes to, and Enter runs when `ready`. */
  value: string
  label: string
  /** Argument placeholder or a short fact. */
  hint?: string
  detail: string
  kind: 'command' | 'arg'
  /** Runs as is; otherwise Enter completes it and waits for an argument. */
  ready: boolean
  /** The node it opens, for the map. */
  focus?: string
}

const startsOrHas = (names: string[], q: string) => names.some((n) => n.startsWith(q)) ? 2 : names.some((n) => n.includes(q)) ? 1 : 0

/** Palette entries for input starting with "/"; null otherwise. Commands, then (after a space) arguments. */
export function complete(input: string): Completion[] | null {
  const cmd = parseCommand(input)
  if (!cmd) return null
  if (!cmd.spaced || !cmd.command) {
    if (cmd.spaced) return []
    const q = cmd.name
    return COMMANDS.map((c) => ({ c, s: q ? startsOrHas([c.name, ...(c.aliases ?? [])], q) : 1 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ c }) => ({
        value: c.arg?.required ? `/${c.name} ` : `/${c.name}`,
        label: `/${c.name}`,
        hint: c.arg ? `<${c.arg.hint}>` : undefined,
        detail: c.summary,
        kind: 'command' as const,
        ready: !c.arg?.required,
      }))
  }
  const c = cmd.command
  if (!c.arg) return [{ value: `/${c.name}`, label: `/${c.name}`, detail: c.summary, kind: 'command', ready: true }]
  const kinds = KIND_NAMES[c.arg.kind]
  let pool = graph.nodes.filter((v) => kinds.includes(v.kind))
  if (c.arg.kind === 'arch') pool = archProjects()
  if (c.arg.kind === 'tech') pool = pool.filter((v) => v.kind === 'tech').sort((a, b) => usage(b.key) - usage(a.key))
  if (c.arg.kind === 'filter') pool = [...graph.of('capability'), ...graph.of('tech').filter((t) => usage(t.key) > 0).sort((a, b) => usage(b.key) - usage(a.key))]
  const q = cmd.arg.toLowerCase()
  const items = (q ? pool.map((v) => ({ v, s: startsOrHas([v.id, ...v.aliases.map((a) => a.toLowerCase())], q) })).filter((x) => x.s).sort((a, b) => b.s - a.s).map((x) => x.v) : pool).slice(0, 40)
  return items.map((v) => ({
    value: `/${c.name} ${v.id}`,
    label: v.label,
    hint: argHint(v),
    detail: argDetail(v),
    kind: 'arg' as const,
    ready: true,
    focus: v.key,
  }))
}

function argHint(v: GraphNode) {
  switch (v.kind) {
    case 'project':
      return v.year ?? (v.minor ? 'small' : '')
    case 'tech': {
      const u = usage(v.key)
      return u ? `${u} project${u === 1 ? '' : 's'}` : 'skill'
    }
    case 'capability': {
      const e = evidenceFor(v.key)
      return `${e.projects.length} projects`
    }
    case 'role':
      return v.role.start
  }
}

function argDetail(v: GraphNode) {
  switch (v.kind) {
    case 'project':
      return v.tagline.replace(/\*\*/g, '')
    case 'tech':
      return v.group
    case 'capability':
      return v.summary
    case 'role':
      return `${v.role.title} · ${v.role.start} – ${v.role.end}`
  }
}

/* ---------------------------------------------------------------- preview */

/** What running an input would show, in a few words: shown before Enter. Null for nothing. */
export function describe(r: Resolution | null): string {
  if (!r) return ''
  if (r.act) return { map: 'focus the graph', back: 'go back one view', home: 'return to the start' }[r.act]
  const v = r.view!
  const f = node(r.focus)
  switch (v.kind) {
    case 'project':
      return `project · ${graph.project(v.id)?.label}`
    case 'arch':
      return `architecture · ${graph.project(v.id)?.label}`
    case 'tech':
    case 'capability':
      return `${f?.kind === 'tech' ? 'technology' : 'capability'} · ${f?.label}`
    case 'projects':
      return f ? `projects · filtered by ${f.label}` : 'project index'
    case 'experience':
      return f ? `experience · ${f.label}` : 'experience'
    case 'answer':
      return `answer · ${r.rule}`
    case 'none':
      return r.route === 'fallback' ? (v.candidates.length ? 'no match · nearest names' : 'no match') : v.title.toLowerCase()
    default:
      return v.kind === 'profile' ? 'profile' : v.kind === 'stack' ? 'technology index' : v.kind
  }
}

/** Counts for the first screen. */
export function stats() {
  return {
    projects: graph.of('project').length,
    tech: graph.of('tech').filter((t) => usage(t.key) > 0 || rolesUsing(t.key).length).length,
    capabilities: graph.of('capability').length,
    roles: graph.of('role').length,
  }
}

/** "PRJ 03" for a node: its kind and place in the index. */
export function nodeCode(v: GraphNode) {
  const list = graph.of(v.kind)
  return `${kindCode(v.kind)} ${String(list.findIndex((x) => x.key === v.key) + 1).padStart(2, '0')}`
}


export interface Preview {
  /** What it opens, as describe() says it. */
  title: string
  lines: string[]
}

const names = (vs: { node: GraphNode }[], max = 3) =>
  `${vs.slice(0, max).map((v) => v.node.short).join(', ')}${vs.length > max ? ` +${vs.length - max}` : ''}`

/** What running an input would open, in a line or two: the palette's preview, shown before Enter. */
export function preview(input: string, ctx: ConsoleContext = {}): Preview | null {
  const r = resolve(input, ctx)
  if (!r) return null
  const title = describe(r)
  if (r.act || !r.view) return { title, lines: [COMMANDS.find((c) => c.name === r.act)?.summary ?? ''] }
  const v = r.view
  const f = node(r.focus)
  switch (v.kind) {
    case 'project': {
      const p = graph.project(v.id)!
      const caps = capabilitiesOf(p.key)
      return {
        title,
        lines: [
          p.tagline.replace(/\*\*/g, ''),
          [p.year, `${techOf(p.key).length} technologies`, graph.architecture(p.id) && 'architecture', p.onPage && 'case study'].filter(Boolean).join(' · '),
          ...(caps.length ? [`shows ${names(caps)}`] : []),
        ],
      }
    }
    case 'arch': {
      const a = graph.architecture(v.id)!
      return { title, lines: [a.title, a.stages.map((s) => s.label).join(' → ')] }
    }
    case 'tech': {
      if (f?.kind !== 'tech') break
      const users = projectsUsing(f.key)
      return { title, lines: [`${f.group}${f.skill ? ' · listed skill' : ''}`, users.length ? `used in ${users.length}: ${names(users)}` : 'no project in the index names it'] }
    }
    case 'capability': {
      if (!f) break
      const e = evidenceFor(f.key)
      return { title, lines: [(f as { summary?: string }).summary ?? '', `${e.projects.length} projects${e.roles.length ? ` · ${e.roles.length} role${e.roles.length === 1 ? '' : 's'}` : ''}: ${names(e.projects)}`] }
    }
    case 'projects': {
      if (f) {
        const ps = f.kind === 'tech' ? projectsUsing(f.key) : evidenceFor(f.key).projects
        return { title, lines: [`${ps.length} project${ps.length === 1 ? '' : 's'}: ${names(ps, 4)}`] }
      }
      const all = graph.of('project')
      return { title, lines: [`${all.length} projects · ${all.filter((p) => p.onPage).length} with case studies on this page`] }
    }
    case 'stack': {
      const ts = graph.of('tech')
      return { title, lines: [`${ts.length} technologies in ${new Set(ts.map((t) => t.group)).size} groups`, `${ts.filter((t) => usage(t.key)).length} used in at least one project`] }
    }
    case 'experience':
      return { title, lines: experience.map((x) => `${x.title}, ${x.company} · ${x.start} – ${x.end}`) }
    case 'profile':
      return { title, lines: [assistant.profile.pitch] }
    case 'certs':
      return { title, lines: [`${assistant.certifications.length} certifications from ${[...new Set(assistant.certifications.map((c) => c.issuer.split(' ')[0]))].join(', ')}`] }
    case 'contact':
      return { title, lines: ['Email, GitHub, LinkedIn and the contact form'] }
    case 'help':
      return { title, lines: [`${COMMANDS.length} commands, keyboard shortcuts and how input is matched`] }
    case 'answer':
      return { title, lines: [`curated answer from ${r.sources.length ? r.sources.slice(0, 2).join(', ') : 'the knowledge base'}`] }
    case 'none':
      return { title, lines: [v.reason] }
  }
  return { title, lines: [] }
}

/** The route as the status bar labels it. */
export const ROUTE_LABEL: Record<Route, string> = { command: 'CMD', entity: 'ENTITY', context: 'CONTEXT', intent: 'INTENT', fallback: 'NO MATCH' }
