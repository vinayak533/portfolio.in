import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { assistant } from '../../assistant'
import { contact, experience, site } from '../../content'
import { COMMANDS, stats, type Action, type Resolution, type View } from '../../core/console'
import {
  capabilitiesOf,
  capabilitiesUsing,
  commandFor,
  evidenceFor,
  graph,
  projectsUsing,
  relatedProjects,
  rolesUsing,
  techForCapability,
  techOf,
  usage,
  usedWith,
  type CapabilityNode,
  type GraphNode,
  type ProjectNode,
  type TechNode,
} from '../../core/graph'
import { closeOpenMarks, streamChunks, toPlainText } from '../../core/markdown'
import { InlineMarkdown, Markdown } from './Markdown'
import { Robot } from './Robot'
import { SignOff, type Pic } from './SignOff'
import { Work, planWork } from './Work'

/** What every view can do: run an input, put one in the command line, light a node on the map, follow a page link. */
export interface ViewActions {
  run: (input: string) => void
  fill: (input: string) => void
  probe: (key: string | null) => void
  onAnchor: (id: string) => void
  /** Open pictures in the viewer, at `i`. */
  view: (pics: Pic[], i: number) => void
  resume: string | null
}

const Actions = createContext<ViewActions>({ run: () => {}, fill: () => {}, probe: () => {}, onAnchor: () => {}, view: () => {}, resume: null })
const useActions = () => useContext(Actions)

/* ----------------------------------------------------------------- pieces */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** A view's heading: a quiet line of context, the title, and a line under it. */
function Head({ meta, title, sub }: { meta?: (string | false | undefined)[]; title: string; sub?: ReactNode }) {
  const m = meta?.filter(Boolean) as string[] | undefined
  return (
    <header className="cx-vhead">
      {m && m.length > 0 && <p className="cx-kicker">{m.join(' · ')}</p>}
      <h3 className="cx-title">{title}</h3>
      {sub && <p className="cx-sub">{sub}</p>}
    </header>
  )
}

/** A titled section of a view. */
function Sec({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="cx-sec">
      <h4 className="cx-sec-h">
        <span className="cx-sec-t">{title}</span>
        {aside && <span className="cx-sec-aside">{aside}</span>}
      </h4>
      {children}
    </section>
  )
}

/** Props that make an element light its node on the map while pointed at or focused. */
function useProbe(key: string) {
  const { probe } = useActions()
  return {
    onMouseEnter: () => probe(key),
    onMouseLeave: () => probe(null),
    onFocus: () => probe(key),
    onBlur: () => probe(null),
  }
}

/** A node as a chip: opens it, and lights it on the map first. */
function Chip({ node, count, note }: { node: GraphNode; count?: number; note?: string }) {
  const { run } = useActions()
  const probe = useProbe(node.key)
  return (
    <button type="button" className="cx-chip" data-kind={node.kind} title={`${commandFor(node)}${note ? ` · as “${note}”` : ''}`} onClick={() => run(commandFor(node))} {...probe}>
      <span>{node.short}</span>
      {count !== undefined && <span className="cx-chip-n">{count}</span>}
    </button>
  )
}

/** A node as a list row: name, a line about it. */
function NodeRow({ node, line, meta, style }: { node: GraphNode; line?: ReactNode; meta?: ReactNode; style?: CSSProperties }) {
  const { run } = useActions()
  const probe = useProbe(node.key)
  return (
    <li style={style}>
      <button type="button" className="cx-row" data-kind={node.kind} onClick={() => run(commandFor(node))} {...probe}>
        <span className="cx-row-main">
          <span className="cx-row-title">{node.label}</span>
          {line && <span className="cx-row-line">{line}</span>}
        </span>
        {meta && <span className="cx-row-meta">{meta}</span>}
      </button>
    </li>
  )
}

/** A picture in a reply: a project's screenshot, the stack. */
function Figure({ image }: { image: { alt: string; src: string } }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <figure className="cx-figure">
      <img src={image.src} alt={image.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </figure>
  )
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
      <span className="cx-ext" aria-hidden="true">
        ↗
      </span>
    </a>
  )
}

function CopyText({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = window.setTimeout(() => setState('idle'), 1800)
    return () => window.clearTimeout(t)
  }, [state])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <button type="button" className="cx-btn" onClick={copy} data-state={state} aria-label={state === 'idle' ? label : state === 'copied' ? 'Copied' : 'Copy failed'}>
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  )
}

/* ------------------------------------------------------------------ views */

/** Ease-out count from 0, once per page load (later first screens show the numbers at rest). */
let counted = false
function useCountUp(to: number, ms = 800) {
  const [n, setN] = useState(() => (counted || matchMedia('(prefers-reduced-motion: reduce)').matches ? to : 0))
  useEffect(() => {
    if (n === to) return
    const t0 = performance.now()
    // A timer, not requestAnimationFrame, which the WebGL page can starve.
    const id = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      setN(Math.round(to * (1 - (1 - k) ** 3)))
      if (k >= 1) {
        window.clearInterval(id)
        counted = true
      }
    }, 16)
    return () => window.clearInterval(id)
    // Runs once: the count starts from where the first render left it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return n
}

function Pill({ value, plus, label }: { value: number; plus?: boolean; label: string }) {
  const n = useCountUp(value)
  return (
    <li className="cx-pill">
      <span className="cx-pill-n">
        {n}
        {plus && n === value ? '+' : ''}
      </span>{' '}
      {label}
    </li>
  )
}

const SUGGEST_ICONS: Record<string, ReactNode> = {
  grid: <path d="M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z" />,
  spark: <path d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4M5 5l2.2 2.2M12.8 12.8 15 15M15 5l-2.2 2.2M7.2 12.8 5 15" />,
  star: <path d="m10 2.8 2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5L2.8 8l5-.6z" />,
  mail: <path d="M3 5.5h14v9H3zM3.5 6l6.5 5 6.5-5" />,
}

const TIPS = [
  'Type / to see every command.',
  'Click any project in the graph to ask about it.',
  'Press Esc while I’m working to interrupt.',
  'Ask a follow-up like “how does it work?”',
  'Answers end with pictures whenever there are some.',
]

/** One tip at a time, changing every few seconds (fixed under reduced motion). */
function Tip() {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setI((n) => (n + 1) % TIPS.length), 4200)
    return () => window.clearInterval(t)
  }, [])
  return (
    <p className="cx-tip">
      <span className="cx-tip-k">Tip</span>
      <span className="cx-tip-t" key={i}>
        {TIPS[i]}
      </span>
    </p>
  )
}

/**
 * The first screen: a welcome box like a coding agent's (what this is, the index in a line), a
 * headline, his work in four numbers, and four numbered questions to start with.
 */
function Home() {
  const { run } = useActions()
  const c = assistant.console
  const s = stats()
  const counted = { Projects: s.projects, Technologies: s.tech, Capabilities: s.capabilities, Roles: s.roles }
  const [lead, rest] = c.headline.split(/,\s*/)
  return (
    <div className="cx-home">
      <div className="cx-welcome">
        <span className="cx-welcome-bot" aria-hidden="true">
          <Robot mood="happy" live />
        </span>
        <div className="cx-welcome-text">
          <p className="cx-welcome-t">
            <span className="cx-welcome-star" aria-hidden="true">
              ✻
            </span>{' '}
            Welcome to <strong>{assistant.name}</strong>
          </p>
          <p className="cx-welcome-l">
            <code>/help</code> for commands · <kbd>Ctrl</kbd> <kbd>K</kbd> to open or close
          </p>
          <p className="cx-welcome-l cx-welcome-l--dim">
            answers only from his projects, roles and skills · runs in your browser
          </p>
        </div>
      </div>
      <h3 className="cx-hero">
        {rest ? (
          <>
            {lead}, <em>{rest}</em>
          </>
        ) : (
          c.headline
        )}
      </h3>
      <p className="cx-lede">{c.lede}</p>
      <ul className="cx-pills" aria-label="His work in numbers">
        {c.pills.map((p) => (
          <Pill key={p.label} value={p.value ?? counted[p.label]} plus={p.plus} label={p.label} />
        ))}
      </ul>
      <p className="cx-try">Try asking</p>
      <ol className="cx-suggest" aria-label="Suggested questions">
        {c.suggestions.map((x, i) => (
          <li key={x.q} style={{ '--i': i } as CSSProperties}>
            <button type="button" onClick={() => run(x.q)}>
              <span className="cx-suggest-n" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="cx-suggest-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {SUGGEST_ICONS[x.icon]}
                </svg>
              </span>
              <span className="cx-suggest-q">{x.q}</span>
              <svg className="cx-suggest-go" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        ))}
      </ol>
      <Tip />
    </div>
  )
}

function Project({ id }: { id: string }) {
  const { run, onAnchor } = useActions()
  const p = graph.project(id)
  if (!p) return null
  const tech = techOf(p.key)
  const caps = capabilitiesOf(p.key)
  const rel = relatedProjects(p.key)
  const arch = graph.architecture(p.id)
  return (
    <>
      <Head meta={[p.year, p.role, p.flagship && 'Flagship', p.onPage ? 'Case study on this page' : 'On GitHub']} title={p.label} sub={<InlineMarkdown text={p.tagline} />} />
      {p.image && <Figure image={p.image} />}
      {p.overview && (
        <p className="cx-prose">
          <InlineMarkdown text={p.overview} onAnchor={onAnchor} />
        </p>
      )}
      {p.problem && (
        <Sec title="Problem">
          <p className="cx-prose">{p.problem}</p>
        </Sec>
      )}
      {p.approach.length > 0 && (
        <Sec title={p.onPage ? 'Approach' : 'How it works'}>
          <ul className="cx-list">
            {p.approach.map((a, i) => (
              <li key={i}>
                <InlineMarkdown text={a} onAnchor={onAnchor} />
              </li>
            ))}
          </ul>
        </Sec>
      )}
      {(p.facts.length > 0 || p.metrics.length > 0) && (
        <Sec title="At a glance">
          {p.facts.length > 0 && (
            <dl className="cx-facts">
              {p.facts.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {p.metrics.length > 0 && (
            <ul className="cx-list cx-list--metric">
              {p.metrics.map((m) => (
                <li key={m}>
                  <InlineMarkdown text={m} />
                </li>
              ))}
            </ul>
          )}
        </Sec>
      )}
      <Sec title="Stack" aside={plural(tech.length, 'technology', 'technologies')}>
        <div className="cx-chips">
          {tech.map((t) => (
            <Chip key={t.node.key} node={t.node} count={usage(t.node.key)} note={t.via !== t.node.label ? t.via : undefined} />
          ))}
        </div>
        <p className="cx-note">Each count is how many projects in the index use it.</p>
      </Sec>
      {arch && (
        <Sec title="Architecture" aside={`${arch.stages.length} stages`}>
          <button type="button" className="cx-archlink" onClick={() => run(`/arch ${p.id}`)}>
            <span className="cx-archlink-flow">{arch.stages.map((s) => s.label).join('  →  ')}</span>
            <span className="cx-archlink-go">See the architecture →</span>
          </button>
        </Sec>
      )}
      {caps.length > 0 && (
        <Sec title="Capabilities shown">
          <ul className="cx-evidence">
            {caps.map((c) => (
              <li key={c.node.key}>
                <Chip node={c.node} />
                <p>
                  <InlineMarkdown text={c.via} />
                </p>
              </li>
            ))}
          </ul>
        </Sec>
      )}
      {rel.length > 0 && (
        <Sec title="Related">
          <ul className="cx-rows">
            {rel.map((r) => (
              <NodeRow
                key={r.node.key}
                node={r.node}
                line={`shares ${[...r.capabilities.map((c) => c.short), ...r.tech.map((t) => t.short)].join(', ')}`}
                meta={r.node.year}
              />
            ))}
          </ul>
        </Sec>
      )}
      <Sec title="Links">
        <ul className="cx-links">
          {p.links.map((l) => (
            <li key={l.href}>
              <Ext href={l.href}>{l.label}</Ext>
            </li>
          ))}
          {p.onPage && (
            <li>
              <a
                href={`#work-${p.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  onAnchor(`work-${p.id}`)
                }}
              >
                Open the case study
              </a>
            </li>
          )}
        </ul>
      </Sec>
    </>
  )
}

function Arch({ id }: { id: string }) {
  const { onAnchor } = useActions()
  const p = graph.project(id)
  const a = graph.architecture(id)
  if (!p || !a) return null
  const tech = techOf(p.key).map((t) => t.node)
  // A stage's technologies: the project's own, when the stage names them.
  const named = (label: string) => tech.filter((t) => label.toLowerCase().includes(t.label.toLowerCase()))
  return (
    <>
      <Head meta={[`${plural(a.stages.length, 'stage')}, as documented`]} title={p.label} sub={a.title} />
      <ol className="cx-arch" aria-label={`${p.label}: ${a.title}`}>
        {a.stages.map((s, i) => (
          <li key={s.label} style={{ '--i': i } as CSSProperties}>
            <span className="cx-arch-n" aria-hidden="true">
              {i + 1}
            </span>
            <div className="cx-arch-box">
              <p className="cx-arch-label">{s.label}</p>
              {s.detail && <p className="cx-arch-detail">{s.detail}</p>}
              {named(s.label).length > 0 && (
                <div className="cx-chips cx-chips--tight">
                  {named(s.label).map((t) => (
                    <Chip key={t.key} node={t} />
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {a.notes && (
        <Sec title="Notes">
          <ul className="cx-list">
            {a.notes.map((n) => (
              <li key={n}>
                <InlineMarkdown text={n} onAnchor={onAnchor} />
              </li>
            ))}
          </ul>
        </Sec>
      )}
      <Sec title="Source">
        <ul className="cx-links">
          <li>
            <Ext href={a.source.href}>{a.source.label}</Ext>
          </li>
        </ul>
        <p className="cx-note">Drawn only from what the project documents; nothing is added between the stages.</p>
      </Sec>
    </>
  )
}

function Tech({ techKey }: { techKey: string }) {
  const t = graph.node(techKey) as TechNode | undefined
  if (!t) return null
  const users = projectsUsing(t.key)
  const roles = rolesUsing(t.key)
  const caps = capabilitiesUsing(t.key)
  const withs = usedWith(t.key).slice(0, 10)
  const sub = users.length
    ? `Used in ${plural(users.length, 'project')}${roles.length ? ` and named in ${plural(roles.length, 'role')}` : ''}.`
    : roles.length
      ? `Named in ${plural(roles.length, 'role')}; no project in the index names it.`
      : `Listed under ${t.group} in his skills. No project or role in the index names it, so there is nothing more to show.`
  return (
    <>
      <Head meta={[t.group, t.skill ? 'Listed skill' : undefined]} title={t.label} sub={sub} />
      {users.length > 0 && (
        <Sec title="Used in" aside={`${users.length}`}>
          <ul className="cx-rows">
            {users.map((u) => (
              <NodeRow
                key={u.node.key}
                node={u.node}
                line={<InlineMarkdown text={u.node.tagline} />}
                meta={u.via !== t.label ? `as “${u.via}”` : u.node.year}
              />
            ))}
          </ul>
        </Sec>
      )}
      {roles.length > 0 && (
        <Sec title="In his roles">
          <ul className="cx-rows">
            {roles.map((r) => (
              <NodeRow key={r.node.key} node={r.node} line={`${r.node.role.title} · ${r.node.role.start} – ${r.node.role.end}`} />
            ))}
          </ul>
        </Sec>
      )}
      {caps.length > 0 && (
        <Sec title="Capabilities it serves">
          <div className="cx-chips">
            {caps.map((c) => (
              <Chip key={c.node.key} node={c.node} count={c.count} />
            ))}
          </div>
          <p className="cx-note">Counts are the projects showing that capability with {t.label}.</p>
        </Sec>
      )}
      {withs.length > 0 && (
        <Sec title="Used with">
          <div className="cx-chips">
            {withs.map((w) => (
              <Chip key={w.node.key} node={w.node} count={w.count} />
            ))}
          </div>
          <p className="cx-note">Counts are the projects using both.</p>
        </Sec>
      )}
    </>
  )
}

function Capability({ id }: { id: string }) {
  const { run } = useActions()
  const c = graph.node(`capability:${id}`) as CapabilityNode | undefined
  if (!c) return null
  const ev = evidenceFor(c.key)
  const tech = techForCapability(c.key).slice(0, 12)
  return (
    <>
      <Head meta={[plural(ev.projects.length, 'project'), ev.roles.length > 0 && plural(ev.roles.length, 'role')]} title={c.label} sub={c.summary} />
      <Sec title="Evidence" aside="from each project’s own text">
        <ul className="cx-evidence">
          {ev.projects.map((p) => (
            <EvidenceRow key={p.node.key} node={p.node} why={p.via} />
          ))}
        </ul>
      </Sec>
      {ev.roles.length > 0 && (
        <Sec title="In his roles">
          <ul className="cx-evidence">
            {ev.roles.map((r) => (
              <EvidenceRow key={r.node.key} node={r.node} why={r.via} />
            ))}
          </ul>
        </Sec>
      )}
      {tech.length > 0 && (
        <Sec title="Technologies" aside="by projects using each">
          <div className="cx-chips">
            {tech.map((t) => (
              <Chip key={t.node.key} node={t.node} count={t.count} />
            ))}
          </div>
        </Sec>
      )}
      <button type="button" className="cx-btn cx-btn--wide" onClick={() => run(`/projects ${c.id}`)}>
        List these as projects
      </button>
    </>
  )
}

function EvidenceRow({ node, why }: { node: GraphNode; why: string }) {
  const { run } = useActions()
  const probe = useProbe(node.key)
  return (
    <li>
      <button type="button" className="cx-ev" onClick={() => run(commandFor(node))} {...probe}>
        <span className="cx-ev-main">
          <span className="cx-row-title">{node.label}</span>
          <span className="cx-ev-why">
            <InlineMarkdown text={why} />
          </span>
        </span>
      </button>
    </li>
  )
}

function Projects({ filter }: { filter?: string }) {
  const { run } = useActions()
  const f = filter ? graph.node(filter) : undefined
  const all = graph.of('project')
  const rows = (ps: ProjectNode[]) =>
    ps.map((p, i) => (
      <NodeRow key={p.key} node={p} line={<InlineMarkdown text={p.tagline} />} meta={`${p.year ?? ''}${p.year ? ' · ' : ''}${techOf(p.key).length} tech`} style={{ '--i': Math.min(i, 10) } as CSSProperties} />
    ))
  if (f) {
    const ps = (f.kind === 'tech' ? projectsUsing(f.key) : evidenceFor(f.key).projects).map((x) => x.node)
    return (
      <>
        <Head meta={[f.kind === 'tech' ? 'Technology' : 'Capability']} title={`Projects with ${f.short}`} sub={`${plural(ps.length, 'project')} ${f.kind === 'tech' ? 'name' : 'show'} ${f.label}.`} />
        <div className="cx-filter">
          <Chip node={f} />
          <button type="button" className="cx-btn" onClick={() => run('/projects')}>
            Clear filter
          </button>
        </div>
        <ul className="cx-rows">{rows(ps)}</ul>
      </>
    )
  }
  const flagship = all.filter((p) => p.flagship)
  const onPage = all.filter((p) => p.onPage && !p.flagship)
  const more = all.filter((p) => !p.onPage && !p.flagship && !p.minor)
  const minor = all.filter((p) => p.minor)
  return (
    <>
      <Head meta={[plural(all.length, 'project')]} title="Projects" sub={`${all.filter((p) => p.onPage).length} have case studies on this page; the rest are on GitHub.`} />
      <Sec title="Flagship">
        <ul className="cx-rows">{rows(flagship)}</ul>
      </Sec>
      <Sec title="On this page">
        <ul className="cx-rows">{rows(onPage)}</ul>
      </Sec>
      <Sec title="More">
        <ul className="cx-rows">{rows(more)}</ul>
      </Sec>
      <Sec title="Smaller apps and notebooks">
        <ul className="cx-rows">{rows(minor)}</ul>
      </Sec>
      <p className="cx-note">
        {assistant.repos.count} public repositories in all: <Ext href={assistant.repos.href}>see them on GitHub</Ext>
      </p>
    </>
  )
}

function Stack() {
  const { run } = useActions()
  const tech = graph.of('tech')
  const order = [...assistant.skillGroups.map((g) => g.label), ...new Set(Object.values(assistant.techGroups))]
  const groups = [...new Set(order)].map((g) => ({ g, ts: tech.filter((t) => t.group === g).sort((a, b) => usage(b.key) - usage(a.key)) })).filter((x) => x.ts.length)
  const max = Math.max(...tech.map((t) => usage(t.key)))
  return (
    <>
      <Head meta={[plural(tech.length, 'technology', 'technologies'), plural(groups.length, 'group')]} title="Stack" sub="Every technology in his skills and projects. The bar is how many projects use it; an empty bar is a listed skill no project in the index names." />
      <Figure image={assistant.images.stack} />
      {groups.map(({ g, ts }) => (
        <Sec key={g} title={g} aside={`${ts.length}`}>
          <ul className="cx-bars">
            {ts.map((t) => (
              <StackRow key={t.key} t={t} max={max} onRun={run} />
            ))}
          </ul>
        </Sec>
      ))}
    </>
  )
}

function StackRow({ t, max, onRun }: { t: TechNode; max: number; onRun: (s: string) => void }) {
  const probe = useProbe(t.key)
  const u = usage(t.key)
  return (
    <li>
      <button type="button" onClick={() => onRun(commandFor(t))} data-zero={u === 0 || undefined} {...probe}>
        <span className="cx-bar-label">{t.label}</span>
        <span className="cx-bar" aria-hidden="true">
          <span style={{ width: `${(u / max) * 100}%` }} />
        </span>
        <span className="cx-bar-n">{u || '—'}</span>
        <span className="sr-only">{u ? `, used in ${plural(u, 'project')}` : ', listed skill'}</span>
      </button>
    </li>
  )
}

function Experience({ role }: { role?: string }) {
  const { onAnchor } = useActions()
  const list = useRef<HTMLOListElement>(null)
  const roles = graph.of('role')
  useEffect(() => {
    if (role) list.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' })
  }, [role])
  return (
    <>
      <Head meta={[plural(roles.length, 'role')]} title="Experience" sub="Newest first. Technologies are the ones each role’s details name." />
      <ol ref={list} className="cx-timeline">
        {roles.map((r) => {
          const tech = techOf(r.key)
          const caps = capabilitiesOf(r.key)
          return (
            <li key={r.key} data-active={r.key === role || undefined}>
              <p className="cx-tl-date">
                {r.role.start} – {r.role.end}
              </p>
              <h4 className="cx-tl-title">{r.role.title}</h4>
              <p className="cx-tl-co">
                {r.label}
                {r.where ? ` · ${r.where}` : ''}
              </p>
              <ul className="cx-list">
                {r.details.map((d) => (
                  <li key={d}>
                    <InlineMarkdown text={d} onAnchor={onAnchor} />
                  </li>
                ))}
              </ul>
              {(tech.length > 0 || caps.length > 0) && (
                <div className="cx-chips">
                  {caps.map((c) => (
                    <Chip key={c.node.key} node={c.node} />
                  ))}
                  {tech.map((t) => (
                    <Chip key={t.node.key} node={t.node} />
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

const workPlaces = (() => {
  const [first, ...rest] = assistant.profile.workLocations
  return rest.length ? `${first}, or in ${rest.slice(0, -1).join(', ')}${rest.length > 1 ? ' or ' : ''}${rest[rest.length - 1]}` : first
})()

function Profile() {
  const { run, onAnchor } = useActions()
  const now = experience.find((r) => /present/i.test(r.end)) ?? experience[0]
  return (
    <>
      <Head meta={[site.role, `${site.location} · ${site.timezoneLabel}`]} title={site.name} sub={assistant.profile.pitch} />
      <p className="cx-prose">
        <InlineMarkdown text={assistant.profile.positioning} />
      </p>
      <Sec title="Proof">
        <ul className="cx-list cx-list--metric">
          {assistant.profile.proof.map((p) => (
            <li key={p}>
              <InlineMarkdown text={p} />
            </li>
          ))}
        </ul>
      </Sec>
      <Sec title="Now">
        <ul className="cx-rows">
          <li>
            <button type="button" className="cx-row" onClick={() => run(`/experience ${graph.of('role')[0]?.id ?? ''}`)}>
              <span className="cx-row-main">
                <span className="cx-row-title">
                  {now.title}, {now.company}
                </span>
                <span className="cx-row-line">Since {now.start}</span>
              </span>
            </button>
          </li>
        </ul>
        <p className="cx-note">
          Open to {assistant.profile.openTo}: {workPlaces}.
        </p>
      </Sec>
      <Sec title="Education">
        <ul className="cx-list">
          {assistant.education.map((e) => (
            <li key={e}>
              <InlineMarkdown text={e} />
            </li>
          ))}
        </ul>
      </Sec>
      <Sec title="Achievements">
        <ul className="cx-list">
          {assistant.achievements.map((a) => (
            <li key={a}>
              <InlineMarkdown text={a} onAnchor={onAnchor} />
            </li>
          ))}
        </ul>
      </Sec>
    </>
  )
}

function Certs() {
  const { run } = useActions()
  const cs = assistant.certifications
  return (
    <>
      <Head meta={[plural(cs.length, 'certification')]} title="Certifications" sub="Newest first. Verify links appear only where they were checked to resolve to his certificate." />
      <ul className="cx-rows">
        {cs.map((c) => (
          <li key={c.id}>
            <div className="cx-row cx-row--static">
              <span className="cx-row-main">
                <span className="cx-row-title">{c.title}</span>
                <span className="cx-row-line">
                  {c.issuer}
                  {c.date ? ` · ${c.date}` : ''}
                </span>
                <span className="cx-row-acts">
                  <button type="button" className="cx-btn" onClick={() => run(`Show the ${c.title} certificate`)}>
                    View
                  </button>
                  {c.verify?.map((v) => (
                    <Ext key={v.href} href={v.href}>
                      {v.label}
                    </Ext>
                  ))}
                </span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function Contact() {
  const { onAnchor, resume } = useActions()
  const direct = assistant.notCovered.filter((n) => n.direct).map((n) => n.label)
  return (
    <>
      <Head title="Contact" sub="Genuine ways to reach Vinayak." />
      <div className="cx-mail">
        <a href={`mailto:${contact.email}`} className="cx-mail-addr">
          {contact.email}
        </a>
        <CopyText text={contact.email} label="Copy email address" />
      </div>
      <ul className="cx-links cx-links--big">
        {contact.links.map((l) => (
          <li key={l.href}>
            <Ext href={l.href}>
              {l.label} <span className="cx-link-host">{l.href.replace(/^https?:\/\/(www\.)?/, '')}</span>
            </Ext>
          </li>
        ))}
        {resume && (
          <li>
            <a href={resume} target="_blank" rel="noopener noreferrer">
              Résumé <span className="cx-link-host">PDF</span>
            </a>
          </li>
        )}
        <li>
          <a
            href="#contact"
            onClick={(e) => {
              e.preventDefault()
              onAnchor('contact')
            }}
          >
            Contact form <span className="cx-link-host">on this page</span>
          </a>
        </li>
      </ul>
      <Sec title="Availability">
        <p className="cx-prose">
          Open to {assistant.profile.openTo}: {workPlaces}.
        </p>
        <p className="cx-note">He prefers to discuss {direct.slice(0, -1).join(', ')} and {direct[direct.length - 1]} directly, by email.</p>
      </Sec>
    </>
  )
}

function Help() {
  const { fill, run } = useActions()
  const groups = [...new Set(COMMANDS.map((c) => c.group))]
  const keys: [string, string][] = [
    ['/', 'Show the commands'],
    ['↵', 'Send'],
    ['Shift ↵', 'New line'],
    ['↑ ↓', 'Move in the commands, or through earlier questions'],
    ['Esc', 'Close the commands, clear the draft, go back, then close'],
    ['Ctrl K / ⌘K', 'Open or close Ask Vinayak from anywhere on the page'],
    ['← → ↑ ↓', 'Move through the graph; Enter picks a node'],
  ]
  return (
    <>
      <Head title="Help" sub="Ask in plain words, click anything in the graph, or type / for commands." />
      {groups.map((g) => (
        <Sec key={g} title={g}>
          <ul className="cx-cmds">
            {COMMANDS.filter((c) => c.group === g).map((c) => (
              <li key={c.name}>
                <button type="button" onClick={() => (c.arg?.required ? fill(`/${c.name} `) : run(`/${c.name}`))}>
                  <code>
                    /{c.name}
                    {c.arg && <span className="cx-pal-hint"> {c.arg.required ? `<${c.arg.hint}>` : `[${c.arg.hint}]`}</span>}
                  </code>
                  <span>
                    {c.summary}
                    {c.aliases?.length ? <span className="cx-alias"> · also /{c.aliases.join(', /')}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Sec>
      ))}
      <Sec title="Keys">
        <dl className="cx-keytable">
          {keys.map(([k, v]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Sec>
    </>
  )
}

/*
 * How a response arrives, like a coding agent's: first the work (Work.tsx: a spinner, a verb, the
 * steps landing one by one), then the answer. An answer's text streams in a word at a time at a
 * medium, readable pace (STREAM_TOKENS_PER_SEC, a little jitter per word, a breath after each
 * sentence and line), each word fading in, a violet caret at its end. Structured views (a project,
 * the stack…) unfold block by block, REVEAL_MS apart. Then it signs off: pictures, a smile and
 * actions (SignOff.tsx). Everything resolves locally and at once; only the presentation is paced.
 * Earlier turns, and reduced motion, show whole. Timers, not requestAnimationFrame, which the WebGL
 * page can starve.
 */
export type Phase = 'thinking' | 'live' | 'done'

/** Words per second while an answer streams. The one knob for the pace. */
export const STREAM_TOKENS_PER_SEC = 22
/** Each word lands up to this much (ms) earlier or later than the even beat. */
const STREAM_JITTER_MS = 14
/** The extra breath (ms) after a sentence ends or a line breaks. */
const SENTENCE_PAUSE_MS: [number, number] = [160, 320]
/** Between the blocks of a structured view as it unfolds (ms). */
const REVEAL_MS = 190

const between = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo)
/** A chunk that ends a sentence or a line: a pause follows it. */
const ENDS_SENTENCE = /(?:[.?!…:]["'”’)\]*_]*\s*$)|\n/

interface StreamState {
  /** Whether this view arrives animated at all (fixed for the view's lifetime). */
  animated: boolean
  phase: Phase
  /** The reader stopped it: what has arrived stays, nothing more comes. */
  stopped: boolean
  /** The answer finished streaming. */
  finish: () => void
}
const Stream = createContext<StreamState>({ animated: false, phase: 'done', stopped: false, finish: () => {} })

/** A list marker or heading mark on its own would render as a stray "-" until its words arrive. */
const BARE_MARK = /(^|\n)[^\S\n]*(?:[-*•]|\d+[.)]|#{1,6})[^\S\n]*$/

/** Reveals the answer word by word, following the bottom of the thread unless the reader scrolled up. */
function useStreamed(text: string) {
  const { animated, phase, stopped, finish } = useContext(Stream)
  const chunks = useRef(streamChunks(text)).current
  const [n, setN] = useState(() => (animated ? 0 : chunks.length))
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'live') return
    if (!chunks.length) return finish()
    let i = 0
    let t = 0
    const beat = 1000 / STREAM_TOKENS_PER_SEC
    const step = () => {
      i += 1
      setN(i)
      if (i >= chunks.length) return finish()
      const pause = ENDS_SENTENCE.test(chunks[i - 1]) ? between(SENTENCE_PAUSE_MS) : 0
      t = window.setTimeout(step, Math.max(4, beat + (Math.random() * 2 - 1) * STREAM_JITTER_MS + pause))
    }
    t = window.setTimeout(step, beat)
    return () => window.clearTimeout(t)
  }, [phase, chunks, finish])

  // Follow the text as it grows, unless the reader has scrolled up to read; scrolling back down
  // to the end picks it up again.
  const stick = useRef(true)
  useEffect(() => {
    const sc = box.current?.closest<HTMLElement>('.cx-main')
    if (!sc || !animated) return
    const up = () => {
      stick.current = false
    }
    const onWheel = (e: WheelEvent) => e.deltaY < 0 && up()
    const onKey = (e: KeyboardEvent) => ['ArrowUp', 'PageUp', 'Home'].includes(e.key) && up()
    const onScroll = () => {
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 24) stick.current = true
    }
    sc.addEventListener('wheel', onWheel, { passive: true })
    sc.addEventListener('touchmove', up, { passive: true })
    sc.addEventListener('keydown', onKey)
    sc.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      sc.removeEventListener('wheel', onWheel)
      sc.removeEventListener('touchmove', up)
      sc.removeEventListener('keydown', onKey)
      sc.removeEventListener('scroll', onScroll)
    }
  }, [animated])
  useLayoutEffect(() => {
    const sc = box.current?.closest<HTMLElement>('.cx-main')
    if (!sc || phase !== 'live' || !stick.current) return
    const bottom = sc.scrollHeight - sc.clientHeight
    if (bottom - sc.scrollTop > 2) sc.scrollTo({ top: bottom, behavior: 'smooth' })
  }, [n, phase])

  const done = (phase === 'done' && !stopped) || n >= chunks.length
  const shown = done ? text : closeOpenMarks(chunks.slice(0, n).join('')).replace(BARE_MARK, '$1')
  return { shown, box, live: phase === 'live' && !done, animated, empty: stopped && n === 0 }
}

function Answer({ res }: { res: Resolution }) {
  const { onAnchor } = useActions()
  const reply = res.view?.kind === 'answer' ? res.view.reply : null
  const s = useStreamed(reply?.text ?? '')
  if (!reply) return null
  return (
    <div ref={s.box} className="cx-md chat-md" data-streamed={s.animated || undefined} data-live={s.live || undefined} aria-busy={s.live || undefined}>
      {s.empty ? <p className="cx-stopped">Stopped.</p> : <Markdown src={s.shown} onAnchor={onAnchor} stream={s.animated} />}
    </div>
  )
}

function None({ view }: { view: Extract<View, { kind: 'none' }> }) {
  const fallback = Boolean(view.text)
  return (
    <>
      <Head title={view.title} sub={view.reason} />
      {view.candidates.length > 0 && (
        <Sec title={fallback ? 'Did you mean' : 'Choose one'}>
          <ul className="cx-rows">
            {view.candidates.map((v) => (
              <NodeRow key={v.key} node={v} line={v.kind === 'project' ? <InlineMarkdown text={v.tagline} /> : v.kind === 'tech' ? v.group : v.kind === 'capability' ? v.summary : v.role.title} />
            ))}
          </ul>
        </Sec>
      )}
      {fallback && (
        <Sec title="Ask him directly">
          <p className="cx-prose">
            <a href={`mailto:${contact.email}`}>{contact.email}</a>. Or type / to see everything you can ask.
          </p>
        </Sec>
      )}
    </>
  )
}

function Body({ res }: { res: Resolution }) {
  const v = res.view!
  switch (v.kind) {
    case 'home':
      return <Home />
    case 'project':
      return <Project id={v.id} />
    case 'arch':
      return <Arch id={v.id} />
    case 'tech':
      return <Tech techKey={v.key} />
    case 'capability':
      return <Capability id={v.id} />
    case 'projects':
      return <Projects filter={v.filter} />
    case 'stack':
      return <Stack />
    case 'experience':
      return <Experience role={v.role} />
    case 'profile':
      return <Profile />
    case 'certs':
      return <Certs />
    case 'contact':
      return <Contact />
    case 'help':
      return <Help />
    case 'answer':
      return <Answer res={res} />
    case 'none':
      return <None view={v} />
  }
}

function Next({ next }: { next: Action[] }) {
  const { run } = useActions()
  if (!next.length) return null
  return (
    <nav className="cx-next" aria-label="Follow-up questions">
      <ul>
        {next.map((a) => (
          <li key={a.run}>
            <button type="button" onClick={() => run(a.run)}>
              {a.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The view for a resolution (or the first screen), the work behind it, how it signs off and where to
 * go next. With `animate`, it arrives the way a response does (see above); `onPhase` reports each
 * step, and `stopRef` is handed the function that stops it. `seed` keeps a turn's work the same live
 * and later. In the thread only the last turn offers follow-ups.
 */
export function ViewPane({
  res,
  actions,
  animate = false,
  onPhase,
  stopRef,
  showNext = true,
  seed = 'home',
  onRetry,
}: {
  res: Resolution | null
  actions: ViewActions
  animate?: boolean
  onPhase?: (p: Phase) => void
  stopRef?: { current: (() => void) | null }
  showNext?: boolean
  seed?: string
  onRetry?: () => void
}) {
  const [animated] = useState(() => animate && Boolean(res))
  const [phase, setPhase] = useState<Phase>(animated ? 'thinking' : 'done')
  const [stopped, setStopped] = useState<false | 'working' | 'writing'>(false)
  const finish = useRef(() => setPhase('done')).current
  const [plan] = useState(() => planWork(res, seed))
  const out = useRef<HTMLDivElement>(null)
  const isAnswer = res?.view?.kind === 'answer'
  const phaseNow = useRef(phase)
  phaseNow.current = phase

  useEffect(() => onPhase?.(phase), [phase, onPhase])

  // A structured view unfolds block by block, then it is done.
  useLayoutEffect(() => {
    if (phase !== 'live' || isAnswer || !out.current) return
    const kids = [...out.current.children] as HTMLElement[]
    kids.forEach((k, i) => k.style.setProperty('--d', `${i * REVEAL_MS}ms`))
    const t = window.setTimeout(finish, Math.max(0, kids.length - 1) * REVEAL_MS + 420)
    return () => window.clearTimeout(t)
  }, [phase, isAnswer, finish])

  // Stop: what has arrived stays (a structured view shows whole), nothing more comes. Stopped while
  // still working, no answer comes at all.
  useEffect(() => {
    if (!stopRef) return
    stopRef.current = () => {
      if (phaseNow.current === 'done') return
      setStopped(phaseNow.current === 'thinking' ? 'working' : 'writing')
      setPhase('done')
    }
    return () => {
      stopRef.current = null
    }
  }, [stopRef])

  const copyText = () => (res?.view?.kind === 'answer' ? toPlainText(res.view.reply.text) : (out.current?.innerText ?? ''))

  return (
    <Actions.Provider value={actions}>
      <Stream.Provider value={{ animated, phase, stopped: Boolean(stopped), finish }}>
        <article className="cx-view" data-kind={res?.view?.kind ?? 'home'}>
          {res && <Work plan={plan} running={phase === 'thinking'} animated={animated} onDone={() => setPhase('live')} />}
          {!res ? (
            <Home />
          ) : stopped === 'working' ? (
            <p className="cx-stopped">Stopped before answering.</p>
          ) : (
            phase !== 'thinking' && (
              <div ref={out} className="cx-out" data-reveal={(animated && !stopped && !isAnswer) || undefined}>
                <Body res={res} />
              </div>
            )
          )}
          {phase === 'done' && res && <SignOff res={res} animated={animated} brief={Boolean(stopped)} onRetry={onRetry} onView={actions.view} copyText={copyText} />}
          {phase === 'done' && res && showNext && !stopped && <Next next={res.next} />}
        </article>
      </Stream.Provider>
    </Actions.Provider>
  )
}
