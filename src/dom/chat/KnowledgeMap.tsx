import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react'
import { capabilitiesOf, evidenceFor, graph, neighbors, projectsUsing, techOf, type GraphNode } from '../../core/graph'

type Column = { id: 'capability' | 'project' | 'tech'; label: string; nodes: GraphNode[] }

/**
 * What the graph shows, fixed so nothing jumps when a node is picked: every capability, the projects
 * that are not minor, and the technologies two or more of those projects use.
 */
function columns(): Column[] {
  const projects = graph.of('project').filter((p) => !p.minor)
  const shown = new Set(projects.map((p) => p.key))
  const tech = graph.of('tech').filter((t) => projectsUsing(t.key).filter((p) => shown.has(p.node.key)).length >= 2)
  return [
    { id: 'capability', label: 'Capabilities', nodes: graph.of('capability') },
    { id: 'project', label: 'Projects', nodes: projects },
    { id: 'tech', label: 'Technology', nodes: tech },
  ]
}
const COLUMNS = columns()
const VISIBLE = new Set(COLUMNS.flatMap((c) => c.nodes.map((n) => n.key)))
/** The drawn edges: capability → project and project → technology, between shown nodes. */
const EDGES = graph.edges.filter(
  (e) => VISIBLE.has(e.from) && VISIBLE.has(e.to) && ((e.from.startsWith('capability:') && e.to.startsWith('project:')) || (e.from.startsWith('project:') && e.to.startsWith('tech:'))),
)

/**
 * What lights up with a node: for a project, the capabilities and technologies it connects to; for
 * a capability or technology, the projects that show or use it (the reverse view). Roles reach
 * the projects and technologies they name.
 */
function relatedTo(key: string): Set<string> {
  const near = neighbors(key)
  const want = key.startsWith('project:') ? ['capability:', 'tech:'] : ['project:', 'tech:']
  return new Set([...near].filter((k) => want.some((w) => k.startsWith(w))))
}

interface Line {
  id: string
  from: string
  to: string
  x1: number
  y1: number
  x2: number
  y2: number
}

/** A soft S-curve between two points, drawn from the first. */
function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(12, Math.abs(x2 - x1) * 0.5) * Math.sign(x2 - x1 || 1)
  const f = (n: number) => n.toFixed(1)
  return `M${f(x1)} ${f(y1)}C${f(x1 + dx)} ${f(y1)} ${f(x2 - dx)} ${f(y2)} ${f(x2)} ${f(y2)}`
}

export interface KnowledgeMapProps {
  /** The node picked by a click (or the one the chat is about): locked until reset. */
  selected: string | null
  /** A node pointed at elsewhere (a chip in an answer, a palette entry): previewed, lighter. */
  probe?: string | null
  onSelect: (key: string | null) => void
  /** A node was clicked (`click`), or the card's "Ask about this" was pressed (`follow`). */
  onAsk: (node: GraphNode, how: 'click' | 'follow') => void
}

/**
 * The graph: capabilities → projects → technology, with the index's edges drawn between them.
 * At rest everything is dim. Pointing at a node previews its connections; clicking locks them in
 * (violet, glowing, a pulse travelling out along each edge), asks about a project in the chat and
 * opens a small card. Clicking it again, clicking empty space or Esc resets. Arrow keys move
 * through the nodes (the graph is one tab stop) and Enter picks one.
 */
export function KnowledgeMap({ selected, probe, onSelect, onAsk }: KnowledgeMapProps) {
  const root = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Bumped on every click, so the pulse replays even when the same node is picked again from the chat.
  const [pulse, setPulse] = useState(0)

  const lit = hover ?? probe ?? selected
  const locked = Boolean(selected) && lit === selected
  const near = useMemo(() => (lit ? relatedTo(lit) : new Set<string>()), [lit])

  // Edge geometry comes from where the labels actually are, measured after layout and on resize.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => {
      const box = el.getBoundingClientRect()
      if (!box.width) return
      const at = new Map<string, DOMRect>()
      for (const b of el.querySelectorAll<HTMLElement>('[data-key]')) at.set(b.dataset.key!, b.getBoundingClientRect())
      const out: Line[] = []
      for (const e of EDGES) {
        const a = at.get(e.from)
        const b = at.get(e.to)
        if (!a || !b) continue
        out.push({
          id: `${e.from}>${e.to}`,
          from: e.from,
          to: e.to,
          x1: a.right - box.left + 4,
          y1: a.top + a.height / 2 - box.top,
          x2: b.left - box.left - 4,
          y2: b.top + b.height / 2 - box.top,
        })
      }
      setLines(out)
      setSize({ w: box.width, h: el.scrollHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const state = (key: string) => (!lit ? undefined : key === lit ? 'on' : near.has(key) ? 'near' : 'off')
  const litLines = lit ? lines.filter((l) => (l.from === lit && near.has(l.to)) || (l.to === lit && near.has(l.from))) : []
  // A node out of the graph (a minor project, a role) still lights what it connects to; edges then
  // run between those neighbours, from the project side.
  const hidden = lit && !VISIBLE.has(lit)
  const shownLines = hidden ? lines.filter((l) => near.has(l.from) && near.has(l.to)) : litLines

  // One tab stop: the selected node if shown, else the first project.
  const stop = (selected && VISIBLE.has(selected) ? selected : COLUMNS[1].nodes[0]?.key) ?? ''

  const pick = (n: GraphNode) => {
    if (selected === n.key) {
      onSelect(null)
      return
    }
    onSelect(n.key)
    setPulse((p) => p + 1)
    onAsk(n, 'click')
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && (selected || hover)) {
      e.stopPropagation()
      setHover(null)
      onSelect(null)
      return
    }
    const target = e.target as HTMLElement
    const key = target.dataset.key
    if (!key) return
    const ci = COLUMNS.findIndex((c) => c.nodes.some((n) => n.key === key))
    const ri = COLUMNS[ci].nodes.findIndex((n) => n.key === key)
    let next: GraphNode | undefined
    if (e.key === 'ArrowDown') next = COLUMNS[ci].nodes[ri + 1]
    else if (e.key === 'ArrowUp') next = COLUMNS[ci].nodes[ri - 1]
    else if (e.key === 'Home') next = COLUMNS[ci].nodes[0]
    else if (e.key === 'End') next = COLUMNS[ci].nodes[COLUMNS[ci].nodes.length - 1]
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const to = COLUMNS[ci + (e.key === 'ArrowRight' ? 1 : -1)]
      // Prefer a connected node in the next column; else the one at the same height.
      const linked = to?.nodes.find((n) => relatedTo(key).has(n.key))
      if (to) next = linked ?? to.nodes[Math.min(to.nodes.length - 1, Math.round((ri / Math.max(1, COLUMNS[ci].nodes.length - 1)) * (to.nodes.length - 1)))]
    } else return
    e.preventDefault()
    if (next) root.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`)?.focus()
  }

  // A click on the graph's empty space resets it.
  const onBackground = (e: MouseEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).closest('button') && selected) onSelect(null)
  }

  const card = selected ? graph.node(selected) : undefined

  return (
    <div className="cx-graph" data-lit={lit ? (locked ? 'lock' : 'peek') : undefined}>
      <div className="cx-graph-scroll" onClick={onBackground} data-lenis-prevent>
        <div ref={root} className="cx-map" role="group" aria-label="Graph of capabilities, projects and technology" onKeyDown={onKey} onMouseLeave={() => setHover(null)}>
          <svg className="cx-map-edges" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden="true">
            <g className="cx-edges-base">
              {lines.map((l) => (
                <path key={l.id} d={curve(l.x1, l.y1, l.x2, l.y2)} />
              ))}
            </g>
            <defs>
              {shownLines.map((l, i) => {
                // The gradient runs out from the lit node: violet at it, lilac midway, mint at the far end.
                const rev = l.to === lit
                return (
                  <linearGradient key={l.id} id={`cx-eg-${i}`} gradientUnits="userSpaceOnUse" x1={rev ? l.x2 : l.x1} y1={rev ? l.y2 : l.y1} x2={rev ? l.x1 : l.x2} y2={rev ? l.y1 : l.y2}>
                    <stop offset="0" stopColor="#8b5cf6" />
                    <stop offset="0.55" stopColor="#c084fc" />
                    <stop offset="1" stopColor="#7ee2b8" />
                  </linearGradient>
                )
              })}
            </defs>
            <g className="cx-edges-lit">
              {shownLines.map((l, i) => {
                const rev = l.to === lit
                const d = rev ? curve(l.x2, l.y2, l.x1, l.y1) : curve(l.x1, l.y1, l.x2, l.y2)
                return (
                  <g key={l.id}>
                    <path d={d} stroke={`url(#cx-eg-${i})`} className="cx-edge" />
                    {locked && <path key={`p${pulse}`} d={d} pathLength={1} className="cx-pulse" style={{ '--i': i } as CSSProperties} />}
                  </g>
                )
              })}
            </g>
          </svg>
          {COLUMNS.map((c) => (
            <div key={c.id} className="cx-map-col" data-col={c.id}>
              <p className="cx-map-head">{c.label}</p>
              <ul>
                {c.nodes.map((n) => (
                  <li key={n.key}>
                    <button
                      type="button"
                      data-key={n.key}
                      data-state={state(n.key)}
                      aria-pressed={n.key === selected}
                      tabIndex={n.key === stop ? 0 : -1}
                      title={n.label}
                      onClick={() => pick(n)}
                      onMouseEnter={() => setHover(n.key)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={(e) => e.currentTarget.matches(':focus-visible') && setHover(n.key)}
                      onBlur={() => setHover(null)}
                    >
                      <span className="cx-map-dot" aria-hidden="true" />
                      <span className="cx-map-label">{n.short}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      {card && card.kind !== 'role' && <DetailCard key={card.key} node={card} onClose={() => onSelect(null)} onAsk={() => onAsk(card, 'follow')} onPick={(k) => onSelect(k)} />}
    </div>
  )
}

const plain = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')

/** The picked node in a few lines: what it is, what it connects to, and a question to ask about it. */
function DetailCard({ node, onClose, onAsk, onPick }: { node: GraphNode; onClose: () => void; onAsk: () => void; onPick: (key: string) => void }) {
  const line =
    node.kind === 'project'
      ? plain(node.tagline)
      : node.kind === 'capability'
        ? node.summary
        : node.kind === 'tech'
          ? `${node.group} · used in ${projectsUsing(node.key).length} project${projectsUsing(node.key).length === 1 ? '' : 's'}`
          : ''
  const chips =
    node.kind === 'project'
      ? techOf(node.key).map((t) => t.node)
      : node.kind === 'capability'
        ? evidenceFor(node.key).projects.map((p) => p.node)
        : projectsUsing(node.key).map((p) => p.node)
  const caps = node.kind === 'project' ? capabilitiesOf(node.key).length : 0
  const max = 8
  return (
    <section className="cx-card" aria-label={`${node.label}: details`}>
      <div className="cx-card-top">
        <p className="cx-card-kind">{node.kind === 'project' ? (caps ? `Project · ${caps} capabilit${caps === 1 ? 'y' : 'ies'}` : 'Project') : node.kind === 'tech' ? 'Technology' : 'Capability'}</p>
        <button type="button" className="cx-card-x" onClick={onClose} aria-label="Clear the selection">
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
        </button>
      </div>
      <h3 className="cx-card-title">{node.label}</h3>
      {line && <p className="cx-card-line">{line}</p>}
      {chips.length > 0 && (
        <ul className="cx-card-chips" aria-label={node.kind === 'project' ? 'Technologies' : 'Projects'}>
          {chips.slice(0, max).map((c) => (
            <li key={c.key}>
              <button type="button" onClick={() => onPick(c.key)}>
                {c.short}
              </button>
            </li>
          ))}
          {chips.length > max && <li className="cx-card-more">+{chips.length - max}</li>}
        </ul>
      )}
      <button type="button" className="cx-card-ask" onClick={onAsk}>
        Ask about this
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  )
}
