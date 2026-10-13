import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { assistant } from '../../assistant'
import { contact, experience, site } from '../../content'
import { COMMANDS, nodeCode, preview, ROUTE_LABEL, stats, type Action, type Resolution, type Route, type View } from '../../core/console'
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

/** What every view can do: run an input, put one in the command line, light a node on the map, follow a page link. */
export interface ViewActions {
  run: (input: string) => void
  fill: (input: string) => void
  probe: (key: string | null) => void
  onAnchor: (id: string) => void
  resume: string | null
}

const Actions = createContext<ViewActions>({ run: () => {}, fill: () => {}, probe: () => {}, onAnchor: () => {}, resume: null })
const useActions = () => useContext(Actions)

/* ----------------------------------------------------------------- pieces */

const pad = (n: number) => String(n).padStart(2, '0')
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Head({ code, meta, title, sub }: { code: string; meta?: (string | false | undefined)[]; title: string; sub?: ReactNode }) {
  return (
    <header className="cx-vhead">
      <p className="cx-kicker">
        <span className="cx-code">{code}</span>
        {meta?.filter(Boolean).map((m) => (
          <span key={m as string}>{m}</span>
        ))}
      </p>
      <h3 className="cx-title">{title}</h3>
      {sub && <p className="cx-sub">{sub}</p>}
    </header>
  )
}

/** A numbered section (CSS counter). */
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

/** A node as a list row: code, name, a line about it. */
function NodeRow({ node, line, meta, style }: { node: GraphNode; line?: ReactNode; meta?: ReactNode; style?: CSSProperties }) {
  const { run } = useActions()
  const probe = useProbe(node.key)
  return (
    <li style={style}>
      <button type="button" className="cx-row" data-kind={node.kind} onClick={() => run(commandFor(node))} {...probe}>
        <span className="cx-row-code">{nodeCode(node)}</span>
        <span className="cx-row-main">
          <span className="cx-row-title">{node.label}</span>
          {line && <span className="cx-row-line">{line}</span>}
        </span>
        {meta && <span className="cx-row-meta">{meta}</span>}
      </button>
    </li>
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

function Home() {
  const { run } = useActions()
  const c = assistant.console
  const s = stats()
  return (
    <div className="cx-home">
      <p className="cx-kicker">
        <span className="cx-code">{c.kicker}</span>
      </p>
      <h3 className="cx-statement">
        <span>{c.statement[0]}</span>
        <span className="cx-accent">{c.statement[1]}</span>
      </h3>
      <p className="cx-lede">{c.lede}</p>
      <dl className="cx-counts">
        {(
          [
            ['Projects', s.projects],
            ['Technologies', s.tech],
            ['Capabilities', s.capabilities],
            ['Roles', s.roles],
          ] as const
        ).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{pad(v)}</dd>
          </div>
        ))}
      </dl>
      <Sec title="Entry points">
        <ul className="cx-entry">
          {c.entry.map((cmd) => {
            const spec = COMMANDS.find((x) => `/${x.name}` === cmd)
            const pv = preview(cmd)
            return (
              <li key={cmd}>
                <button type="button" onClick={() => run(cmd)}>
                  <code>{cmd}</code>
                  <span className="cx-entry-text">
                    <span>{spec?.summary}</span>
                    {pv?.lines[pv.lines.length - 1] && <span className="cx-entry-pv">{pv.lines[pv.lines.length - 1]}</span>}
                  </span>
                  <span className="cx-enter" aria-hidden="true">
                    ↵
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Sec>
      <Sec title="Or ask">
        <ul className="cx-asks">
          {c.examples.map((q) => (
            <li key={q}>
              <button type="button" onClick={() => run(q)}>
                {q}
              </button>
            </li>
          ))}
        </ul>
      </Sec>
      <p className="cx-honest">{c.honesty}</p>
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
      <Head code={nodeCode(p)} meta={[p.year, p.role, p.flagship && 'flagship', p.onPage ? 'case study on this page' : 'on GitHub']} title={p.label} sub={<InlineMarkdown text={p.tagline} />} />
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
            <code>/arch {p.id}</code>
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
      <Head code={`ARC · ${nodeCode(p)}`} meta={[plural(a.stages.length, 'stage'), 'documented']} title={p.label} sub={a.title} />
      <ol className="cx-arch" aria-label={`${p.label}: ${a.title}`}>
        {a.stages.map((s, i) => (
          <li key={s.label} style={{ '--i': i } as CSSProperties}>
            <span className="cx-arch-n" aria-hidden="true">
              {pad(i + 1)}
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
      <Head code={nodeCode(t)} meta={[t.group, t.skill ? 'listed skill' : undefined]} title={t.label} sub={sub} />
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
      <Head code={nodeCode(c)} meta={[plural(ev.projects.length, 'project'), ev.roles.length > 0 && plural(ev.roles.length, 'role')]} title={c.label} sub={c.summary} />
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
        List these as projects <code>/projects {c.id}</code>
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
        <span className="cx-row-code">{nodeCode(node)}</span>
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
        <Head code="IDX · FILTER" meta={[f.kind === 'tech' ? 'technology' : 'capability']} title={`Projects · ${f.short}`} sub={`${plural(ps.length, 'project')} ${f.kind === 'tech' ? 'name' : 'show'} ${f.label}.`} />
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
      <Head code="IDX" meta={[plural(all.length, 'project')]} title="Projects" sub={`${all.filter((p) => p.onPage).length} have case studies on this page; the rest are on GitHub. Filter with /projects <technology>.`} />
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
      <Head code="IDX · TEC" meta={[plural(tech.length, 'technology', 'technologies'), plural(groups.length, 'group')]} title="Stack" sub="Every technology in his skills and projects. The bar is how many projects use it; an empty bar is a listed skill no project in the index names." />
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
      <Head code="EXP" meta={[plural(roles.length, 'role')]} title="Experience" sub="Newest first. Technologies are the ones each role’s details name." />
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
      <Head code="ID · 00" meta={[site.role, `${site.location} · ${site.timezoneLabel}`]} title={site.name} sub={assistant.profile.pitch} />
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
              <span className="cx-row-code">ROL 01</span>
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
      <Head code="IDX · CRT" meta={[plural(cs.length, 'certification')]} title="Certifications" sub="Newest first. Verify links appear only where they were checked to resolve to his certificate." />
      <ul className="cx-rows">
        {cs.map((c, i) => (
          <li key={c.id}>
            <div className="cx-row cx-row--static">
              <span className="cx-row-code">CRT {pad(i + 1)}</span>
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
      <Head code="CON" meta={['direct links']} title="Contact" sub="Genuine ways to reach Vinayak." />
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
    ['/', 'Open the command palette'],
    ['↑ ↓', 'Move in the palette, or through earlier inputs'],
    ['Tab', 'Complete the highlighted command'],
    ['↵', 'Run'],
    ['Esc', 'Close the palette, clear the line, go back, then close'],
    ['Ctrl K / ⌘K', 'Open or close the console from anywhere on the page'],
    ['← → ↑ ↓', 'Move through the relation map'],
  ]
  const routes: [Route, string][] = [
    ['command', 'Input starting with “/” runs that command.'],
    ['entity', 'A whole input that names a project, technology, capability or role opens it (“loom”, “fastapi”, “rag”).'],
    ['context', 'A follow-up about what is on screen: “which projects use it?”, “how does it work?”.'],
    ['intent', 'Keyword and synonym rules match the question to a curated answer or view.'],
    ['fallback', 'Nothing matched: it says so and lists the nearest names, rather than guessing.'],
  ]
  return (
    <>
      <Head code="SYS · HELP" meta={[plural(COMMANDS.length, 'command')]} title="Help" sub="Ask in plain words, or drive it with commands. Every click in a view runs the command shown in the trail, so the trail doubles as a reference." />
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
      <Sec title="How input resolves" aside="first match wins">
        <ol className="cx-routes">
          {routes.map(([k, v]) => (
            <li key={k}>
              <span className="cx-route" data-route={k}>
                {ROUTE_LABEL[k]}
              </span>
              <span>{v}</span>
            </li>
          ))}
        </ol>
        <p className="cx-note">No language model and no network: the same input on the same view always resolves the same way.</p>
      </Sec>
    </>
  )
}

/*
 * How a response arrives, the way Claude's do: a short beat of "thinking", then an answer's text
 * streams in a few words at a time and the "Next" actions follow once it is done. Structured views
 * (a project, the stack…) skip the stream and unfold section by section instead. Only the
 * presentation is paced: the status bar still shows the real resolve time, and reopening a view
 * from the trail shows it whole. Timers, not requestAnimationFrame, which the WebGL page can starve.
 */
export type Phase = 'thinking' | 'live' | 'done'

interface StreamState {
  /** Whether this view arrives animated at all (fixed for the view's lifetime). */
  animated: boolean
  phase: Phase
  /** The answer finished streaming (or the reader skipped ahead). */
  finish: () => void
}
const Stream = createContext<StreamState>({ animated: false, phase: 'done', finish: () => {} })

/** Chunks (words, or a whole link / bold span / image) per second, and the most a long answer may take. */
const STREAM_RATE = 34
const STREAM_MAX_MS = 3600
/** A list marker or heading mark on its own would render as a stray "-" until its words arrive. */
const BARE_MARK = /(^|\n)[^\S\n]*(?:[-*•]|\d+[.)]|#{1,6})[^\S\n]*$/

/** How long the "thinking" beat lasts: a little longer for a longer answer, never long. */
function thinkFor(res: Resolution | null): number {
  if (res?.view?.kind !== 'answer') return 420
  const n = toPlainText(res.view.reply.text).split(/\s+/).length
  return 380 + Math.min(n, 160) * 2
}

/** Claude's spark: rounded rays that turn and breathe while a response is on its way. */
function Spark({ className }: { className?: string }) {
  return (
    <svg className={`cx-spark${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="11" y="2" width="2" height={i % 2 ? 7 : 9} rx="1" transform={`rotate(${i * 45} 12 12)`} />
      ))}
    </svg>
  )
}

function Thinking() {
  return (
    <p className="cx-thinking" role="status">
      <Spark />
      <span className="cx-thinking-text">Thinking</span>
    </p>
  )
}

/** Reveals the answer chunk by chunk, following the bottom of the pane unless the reader scrolled up. */
function useStreamed(text: string) {
  const { animated, phase, finish } = useContext(Stream)
  const chunks = useRef(streamChunks(text)).current
  const [n, setN] = useState(() => (animated ? 0 : chunks.length))
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (phase !== 'live') return
    if (!chunks.length) return finish()
    const rate = Math.max(STREAM_RATE / 1000, chunks.length / STREAM_MAX_MS)
    const t0 = performance.now()
    const id = window.setInterval(() => {
      const t = performance.now() - t0
      // A slight wobble, so words land in uneven little bursts rather than on a metronome.
      const next = Math.min(chunks.length, Math.floor(t * rate + Math.sin(t / 110) * 1.4))
      setN((m) => Math.max(m, next))
      if (next >= chunks.length) {
        window.clearInterval(id)
        finish()
      }
    }, 32)
    return () => window.clearInterval(id)
  }, [phase, chunks, finish])

  // Stick to the bottom while text is arriving, unless the reader has scrolled up to read.
  const stick = useRef(true)
  useEffect(() => {
    const sc = box.current?.closest<HTMLElement>('.cx-main')
    if (!sc || !animated) return
    const on = () => {
      stick.current = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 48
    }
    sc.addEventListener('scroll', on, { passive: true })
    return () => sc.removeEventListener('scroll', on)
  }, [animated])
  useLayoutEffect(() => {
    const sc = box.current?.closest<HTMLElement>('.cx-main')
    if (sc && phase === 'live' && stick.current) sc.scrollTop = sc.scrollHeight
  }, [n, phase])

  const done = phase === 'done' || n >= chunks.length
  const shown = done ? text : closeOpenMarks(chunks.slice(0, n).join('')).replace(BARE_MARK, '$1')
  return { shown, box, live: !done, animated, skip: finish }
}

function Answer({ res }: { res: Resolution }) {
  const { onAnchor } = useActions()
  const reply = res.view?.kind === 'answer' ? res.view.reply : null
  const s = useStreamed(reply?.text ?? '')
  if (!reply) return null
  const tags = assistant.topicTags
  const tag = tags[reply.topic] ?? Object.entries(tags).find(([k]) => k.endsWith(':') && reply.topic.startsWith(k))?.[1]
  return (
    <>
      <Head code="ANS" meta={[tag ? `${tag[0]} ${tag[1]}` : undefined, plural(toPlainText(reply.text).split(/\s+/).filter(Boolean).length, 'word')]} title={tag?.[1] ?? 'Answer'} />
      <div
        ref={s.box}
        className="cx-md chat-md"
        data-streamed={s.animated || undefined}
        aria-busy={s.live || undefined}
        // Clicking a streaming answer (anywhere but a link) shows the rest at once.
        onClick={(e) => {
          if (s.live && !(e.target as HTMLElement).closest('a')) s.skip()
        }}
      >
        <Markdown src={s.shown} onAnchor={onAnchor} stream={s.animated} />
        {s.live && <Spark className="cx-spark--tail" />}
      </div>
    </>
  )
}

function None({ view }: { view: Extract<View, { kind: 'none' }> }) {
  const fallback = Boolean(view.text)
  return (
    <>
      <Head code={fallback ? 'NUL' : 'SYS'} meta={[fallback ? 'no rule matched' : undefined]} title={view.title} sub={view.reason} />
      {view.candidates.length > 0 && (
        <Sec title={fallback ? 'Closest names in the index' : 'Choose'} aside={`${view.candidates.length}`}>
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
            <a href={`mailto:${contact.email}`}>{contact.email}</a>. Or type <code>/</code> to see what the index covers.
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
    <nav className="cx-next" aria-label="Next">
      <p className="cx-next-h">Next</p>
      <ul>
        {next.map((a) => (
          <li key={a.run}>
            <button type="button" onClick={() => run(a.run)}>
              <span className="cx-next-label">{a.label}</span>
              {a.run.startsWith('/') && <code>{a.run}</code>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The view for a resolution (or the first screen), its provenance and where to go next. With
 * `animate`, it arrives the way a response does (see Stream above); `onPhase` reports each step.
 */
export function ViewPane({ res, actions, animate = false, onPhase }: { res: Resolution | null; actions: ViewActions; animate?: boolean; onPhase?: (p: Phase) => void }) {
  const [animated] = useState(() => animate && Boolean(res))
  const [phase, setPhase] = useState<Phase>(animated ? 'thinking' : 'done')
  const finish = useRef(() => setPhase('done')).current

  useEffect(() => {
    if (phase !== 'thinking') return
    const t = window.setTimeout(() => setPhase(res?.view?.kind === 'answer' ? 'live' : 'done'), thinkFor(res))
    return () => window.clearTimeout(t)
  }, [phase, res])
  useEffect(() => onPhase?.(phase), [phase, onPhase])

  return (
    <Actions.Provider value={actions}>
      <Stream.Provider value={{ animated, phase, finish }}>
        <article className="cx-view" data-kind={res?.view?.kind ?? 'home'} data-reveal={animated || undefined}>
          {phase === 'thinking' ? (
            <Thinking />
          ) : (
            <>
              {res ? <Body res={res} /> : <Home />}
              {phase === 'done' && res && res.sources.length > 0 && (
                <p className="cx-prov">
                  <span>Read from</span> {res.sources.slice(0, 4).join(' · ')}
                </p>
              )}
              {phase === 'done' && res && <Next next={res.next} />}
            </>
          )}
        </article>
      </Stream.Provider>
    </Actions.Provider>
  )
}
