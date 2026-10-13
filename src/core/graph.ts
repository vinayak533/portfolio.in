/**
 * The console's knowledge graph: Vinayak's projects, the technologies they name, the capabilities
 * they show and the roles he held, built from src/content.ts and src/assistant.ts and nothing else.
 *
 * Every edge carries the fact behind it (`via`): a tag exactly as the project writes it, or a
 * capability's `why`. No edge is inferred: a project uses a technology only when its own tags,
 * stack or role details name it.
 *
 * Pure: no DOM, no network, deterministic. Tested by scripts/console.test.mjs.
 */
import { captionParts, experience, projects, type Role } from '../content'
import { assistant, type Architecture, type Capability, type ChatImage, type Doc } from '../assistant'
import { words } from './assistant'

export type NodeKind = 'project' | 'tech' | 'capability' | 'role'

interface NodeBase {
  key: string
  id: string
  /** Full name. */
  label: string
  /** For the relation map. */
  short: string
  /** Names it answers to (label and id included), as written. */
  aliases: string[]
}

export interface ProjectNode extends NodeBase {
  kind: 'project'
  /** 1-based position in the index. */
  n: number
  tagline: string
  year?: string
  role?: string
  /** Has a case study on the page (#work-<id>). */
  onPage: boolean
  flagship: boolean
  minor: boolean
  /** Markdown. */
  overview?: string
  problem?: string
  approach: string[]
  facts: { value: string; label: string }[]
  metrics: string[]
  links: Doc[]
  image?: ChatImage
}

export interface TechNode extends NodeBase {
  kind: 'tech'
  group: string
  /** Listed among his skills. */
  skill: boolean
}

export interface CapabilityNode extends NodeBase {
  kind: 'capability'
  summary: string
}

export interface RoleNode extends NodeBase {
  kind: 'role'
  role: Role
  where?: string
  headline?: string
  details: string[]
}

export type GraphNode = ProjectNode | TechNode | CapabilityNode | RoleNode

export interface Edge {
  from: string
  to: string
  /** The fact behind the edge: tag(s) as written, or why. */
  via: string
}

/* ---------------------------------------------------------------- helpers */

/** "Next.js" → "next-js": the id a command takes. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\+\+/g, 'pp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** A phrase as matching sees it. */
export const norm = (s: string) => words(s).join(' ')

const canon = (tag: string) => assistant.techCanon[tag] ?? [tag]

/* ------------------------------------------------------------------ build */

const nodes = new Map<string, GraphNode>()
const edges: Edge[] = []
const edgeIndex = new Map<string, Edge>()

function addEdge(from: string, to: string, via: string) {
  const id = `${from}>${to}`
  const e = edgeIndex.get(id)
  if (e) {
    if (!e.via.split(' · ').includes(via)) e.via = `${e.via} · ${via}`
    return
  }
  const edge = { from, to, via }
  edgeIndex.set(id, edge)
  edges.push(edge)
}

// Technologies: skills first (they carry the groups), then everything projects and roles name.
const skillGroupOf = new Map<string, string>()
for (const g of assistant.skillGroups) {
  for (const item of g.items) {
    if (assistant.skillCapabilities[item]) continue
    for (const name of canon(item)) if (!skillGroupOf.has(name.toLowerCase())) skillGroupOf.set(name.toLowerCase(), g.label)
  }
}

function techKey(name: string) {
  const key = `tech:${slug(name)}`
  if (!nodes.has(key)) {
    const skill = skillGroupOf.has(name.toLowerCase())
    nodes.set(key, {
      kind: 'tech',
      key,
      id: slug(name),
      label: name,
      short: name,
      aliases: [name, ...(assistant.techAliases[name] ?? [])],
      group: skillGroupOf.get(name.toLowerCase()) ?? assistant.techGroups[name] ?? 'Other',
      skill,
    })
  }
  return key
}

// Projects: the page's five, then the ones only the assistant knows.
let n = 0
for (const p of projects) {
  const x = assistant.projectExtras[p.id] ?? {}
  const { lead, body } = captionParts(p.caption)
  const key = `project:${p.id}`
  nodes.set(key, {
    kind: 'project',
    key,
    id: p.id,
    n: ++n,
    label: p.title,
    short: assistant.mapNames[p.id] ?? p.title,
    aliases: [p.title, p.id.replace(/-/g, ' '), ...(assistant.projectAliases[p.id] ?? [])],
    tagline: p.tagline,
    year: p.year,
    role: p.role,
    onPage: true,
    flagship: Boolean(x.flagship),
    minor: false,
    overview: [lead, body].filter(Boolean).join(' '),
    problem: p.problem,
    approach: [...p.approach, ...(x.details ?? [])],
    facts: p.facts,
    metrics: x.metrics ?? [],
    links: [...(p.links ?? []), ...(x.docs ?? [])],
    image: x.image,
  })
  for (const tag of [...p.tags, ...(x.stack ?? [])]) for (const name of canon(tag)) addEdge(key, techKey(name), tag)
}
for (const m of assistant.moreProjects) {
  const key = `project:${m.id}`
  nodes.set(key, {
    kind: 'project',
    key,
    id: m.id,
    n: ++n,
    label: m.title,
    short: assistant.mapNames[m.id] ?? m.title,
    aliases: [m.title, m.id.replace(/-/g, ' '), ...m.aliases],
    tagline: m.tagline,
    year: m.year,
    onPage: false,
    flagship: Boolean(m.flagship),
    minor: Boolean(m.minor),
    approach: m.details ?? [],
    facts: [],
    metrics: [],
    links: [{ label: 'GitHub', href: m.href }],
  })
  for (const tag of m.stack) for (const name of canon(tag)) addEdge(key, techKey(name), tag)
}

// Roles, newest first, with the technologies their details name.
for (const r of experience) {
  const info = assistant.roles[r.company]
  const key = `role:${slug(r.company)}`
  nodes.set(key, {
    kind: 'role',
    key,
    id: slug(r.company),
    label: r.company,
    short: r.company.split(' ')[0],
    aliases: [r.company, r.company.split(' ')[0]],
    role: r,
    where: info?.where,
    headline: info?.headline,
    details: info?.details ?? [r.summary],
  })
  for (const name of info?.stack ?? []) for (const c of canon(name)) addEdge(key, techKey(c), name)
}

// Every listed skill is a technology node, used by a project or not.
for (const g of assistant.skillGroups) for (const item of g.items) if (!assistant.skillCapabilities[item]) for (const c of canon(item)) techKey(c)

// Capabilities, and the projects and roles that show them.
for (const c of assistant.capabilities) {
  const key = `capability:${c.id}`
  const fromSkills = Object.entries(assistant.skillCapabilities)
    .filter(([, id]) => id === c.id)
    .map(([skill]) => skill)
  nodes.set(key, { kind: 'capability', key, id: c.id, label: c.title, short: c.short, aliases: [c.title, c.short, c.id.replace(/-/g, ' '), ...c.aliases, ...fromSkills], summary: c.summary })
  for (const p of c.projects) addEdge(key, `project:${p.id}`, p.why)
  for (const r of c.roles ?? []) addEdge(key, `role:${slug(r.company)}`, r.why)
}

const archByProject = new Map(assistant.architectures.map((a) => [a.project, a]))
const capById = new Map<string, Capability>(assistant.capabilities.map((c) => [c.id, c]))

/* ---------------------------------------------------------------- queries */

const KIND_ORDER: NodeKind[] = ['project', 'capability', 'tech', 'role']

export const graph = {
  nodes: [...nodes.values()],
  edges: edges as readonly Edge[],
  node: (key: string) => nodes.get(key),
  of<K extends NodeKind>(kind: K) {
    return [...nodes.values()].filter((v): v is Extract<GraphNode, { kind: K }> => v.kind === kind)
  },
  project: (id: string) => nodes.get(`project:${id}`) as ProjectNode | undefined,
  capability: (id: string) => capById.get(id),
  architecture: (projectId: string): Architecture | undefined => archByProject.get(projectId),
}

const out = (key: string) => edges.filter((e) => e.from === key)
const into = (key: string) => edges.filter((e) => e.to === key)
const ofKind = (key: string, kind: NodeKind) => key.startsWith(`${kind}:`)

export interface Linked<N extends GraphNode = GraphNode> {
  node: N
  via: string
}

const linked = <N extends GraphNode>(es: Edge[], side: 'from' | 'to') =>
  es.map((e) => ({ node: nodes.get(e[side]) as N, via: e.via })).filter((l) => l.node)

/** The technologies a project or role names, in the order it names them. */
export const techOf = (key: string) => linked<TechNode>(out(key).filter((e) => ofKind(e.to, 'tech')), 'to')

/** Projects that name a technology, in index order. */
export const projectsUsing = (techKey: string) =>
  linked<ProjectNode>(into(techKey).filter((e) => ofKind(e.from, 'project')), 'from').sort((a, b) => a.node.n - b.node.n)

/** Roles whose details name a technology, newest first. */
export const rolesUsing = (techKey: string) => linked<RoleNode>(into(techKey).filter((e) => ofKind(e.from, 'role')), 'from')

/** The capabilities a project or role shows, with why. */
export const capabilitiesOf = (key: string) => linked<CapabilityNode>(into(key).filter((e) => ofKind(e.from, 'capability')), 'from')

/** A capability's projects and roles, with why. */
export const evidenceFor = (capKey: string) => {
  const es = out(capKey)
  return {
    projects: linked<ProjectNode>(es.filter((e) => ofKind(e.to, 'project')), 'to'),
    roles: linked<RoleNode>(es.filter((e) => ofKind(e.to, 'role')), 'to'),
  }
}

/** Every node one edge away, either direction. */
export function neighbors(key: string): Set<string> {
  const s = new Set<string>()
  for (const e of edges) {
    if (e.from === key) s.add(e.to)
    else if (e.to === key) s.add(e.from)
  }
  return s
}

/** How many projects use a technology. */
export const usage = (techKey: string) => projectsUsing(techKey).length

export interface Counted<N extends GraphNode = GraphNode> {
  node: N
  count: number
}

const ranked = <N extends GraphNode>(counts: Map<string, number>, order: (k: string) => number) =>
  [...counts.entries()]
    .map(([k, count]) => ({ node: nodes.get(k) as N, count }))
    .sort((a, b) => b.count - a.count || order(a.node.key) - order(b.node.key))

const indexOf = new Map([...nodes.keys()].map((k, i) => [k, i]))
const byIndex = (k: string) => indexOf.get(k) ?? 0

/** Technologies used alongside this one, by how many projects share them. */
export function usedWith(techKey: string): Counted<TechNode>[] {
  const counts = new Map<string, number>()
  for (const { node } of projectsUsing(techKey)) {
    for (const t of techOf(node.key)) if (t.node.key !== techKey) counts.set(t.node.key, (counts.get(t.node.key) ?? 0) + 1)
  }
  return ranked<TechNode>(counts, byIndex)
}

/** The technologies a capability's projects use, by how many of them use each. */
export function techForCapability(capKey: string): Counted<TechNode>[] {
  const counts = new Map<string, number>()
  for (const { node } of evidenceFor(capKey).projects) for (const t of techOf(node.key)) counts.set(t.node.key, (counts.get(t.node.key) ?? 0) + 1)
  return ranked<TechNode>(counts, byIndex)
}

/** Capabilities whose projects use this technology, by how many of those projects. */
export function capabilitiesUsing(techKey: string): Counted<CapabilityNode>[] {
  const users = new Set(projectsUsing(techKey).map((p) => p.node.key))
  const counts = new Map<string, number>()
  for (const c of graph.of('capability')) {
    const hits = evidenceFor(c.key).projects.filter((p) => users.has(p.node.key)).length
    if (hits) counts.set(c.key, hits)
  }
  return ranked<CapabilityNode>(counts, byIndex)
}

export interface Related {
  node: ProjectNode
  tech: TechNode[]
  capabilities: CapabilityNode[]
  score: number
}

/** Other projects sharing technologies or capabilities with this one; a shared capability counts double. */
export function relatedProjects(projectKey: string, limit = 3): Related[] {
  const mine = new Set(techOf(projectKey).map((t) => t.node.key))
  const myCaps = new Set(capabilitiesOf(projectKey).map((c) => c.node.key))
  return graph
    .of('project')
    .filter((p) => p.key !== projectKey)
    .map((p) => {
      const tech = techOf(p.key).filter((t) => mine.has(t.node.key)).map((t) => t.node)
      const capabilities = capabilitiesOf(p.key).filter((c) => myCaps.has(c.node.key)).map((c) => c.node)
      return { node: p, tech, capabilities, score: tech.length + 2 * capabilities.length }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.node.n - b.node.n)
    .slice(0, limit)
}

/* ---------------------------------------------------------------- lookup */

const aliasIndex = new Map<string, string[]>()
for (const v of nodes.values()) {
  for (const a of v.aliases) {
    const k = norm(a)
    if (!k) continue
    const list = aliasIndex.get(k) ?? []
    if (!list.includes(v.key)) list.push(v.key)
    aliasIndex.set(k, list)
  }
}
const kindRank = (key: string) => KIND_ORDER.indexOf(key.split(':')[0] as NodeKind)

/** The node a whole phrase names exactly ("loom", "fastapi", "rag"). Projects win ties, then capabilities, technologies, roles. */
export function lookup(text: string, kinds: NodeKind[] = KIND_ORDER): GraphNode | null {
  const keys = (aliasIndex.get(norm(text)) ?? []).filter((k) => kinds.some((kind) => ofKind(k, kind)))
  keys.sort((a, b) => kindRank(a) - kindRank(b))
  return keys.length ? nodes.get(keys[0])! : null
}

/**
 * A command argument: an exact name, else the one node whose name starts with it ("/project lazy"),
 * else the one that contains it. Several candidates are returned, not guessed between.
 */
export function findArg(text: string, kinds: NodeKind[], only?: (n: GraphNode) => boolean): { node?: GraphNode; candidates: GraphNode[] } {
  const pool = graph.nodes.filter((v) => kinds.includes(v.kind) && (!only || only(v)))
  const q = norm(text)
  if (!q) return { candidates: pool }
  const exact = pool.filter((v) => v.aliases.some((a) => norm(a) === q) || v.id === slug(text))
  if (exact.length) return { node: exact[0], candidates: exact }
  const starts = pool.filter((v) => v.aliases.some((a) => norm(a).startsWith(q)) || v.id.startsWith(slug(text)))
  if (starts.length === 1) return { node: starts[0], candidates: starts }
  if (starts.length) return { candidates: starts }
  const has = pool.filter((v) => v.aliases.some((a) => norm(a).includes(q)))
  return has.length === 1 ? { node: has[0], candidates: has } : { candidates: has }
}

/** Edit distance, capped: anything over `max` is max + 1. */
export function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let low = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      low = Math.min(low, cur[j])
    }
    if (low > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

const STOP = new Set(['mean', 'life', 'thing', 'make', 'like', 'good', 'best', 'know', 'use', 'built', 'the', 'and', 'for', 'with', 'his', 'him', 'about', 'what', 'does', 'doe', 'how', 'who', 'show', 'tell', 'any', 'can', 'project', 'work'])

/**
 * Nodes whose names are close to the words of a question that matched nothing: a shared word, or
 * one a typo away ("langgrph"). For the honest "no match" view; never used to answer.
 */
export function nearest(text: string, limit = 4): GraphNode[] {
  const qs = words(text).filter((w) => w.length >= 3 && !STOP.has(w))
  if (!qs.length) return []
  const scored: { v: GraphNode; s: number }[] = []
  for (const v of nodes.values()) {
    const ws = new Set(v.aliases.flatMap((a) => words(a)).filter((w) => w.length >= 3))
    let s = 0
    for (const q of qs) {
      let best = 0
      for (const w of ws) {
        if (w === q) best = Math.max(best, 3)
        else if (q.length >= 4 && distance(q, w, q.length >= 7 ? 2 : 1) <= (q.length >= 7 ? 2 : 1)) best = Math.max(best, 2)
        else if (q.length >= 4 && w.startsWith(q)) best = Math.max(best, 1)
      }
      s += best
    }
    if (s) scored.push({ v, s })
  }
  return scored
    .sort((a, b) => b.s - a.s || kindRank(a.v.key) - kindRank(b.v.key) || byIndex(a.v.key) - byIndex(b.v.key))
    .slice(0, limit)
    .map((x) => x.v)
}

/** The command that opens a node. */
export function commandFor(v: GraphNode): string {
  switch (v.kind) {
    case 'project':
      return `/project ${v.id}`
    case 'tech':
      return `/tech ${v.id}`
    case 'capability':
      return v.id === 'agents' ? '/agents' : `/capability ${v.id}`
    case 'role':
      return `/experience ${v.id}`
  }
}

/** "PRJ", "TEC", "CAP", "ROL": the node's kind as the console labels it. */
export const kindCode = (kind: NodeKind) => ({ project: 'PRJ', tech: 'TEC', capability: 'CAP', role: 'ROL' })[kind]
