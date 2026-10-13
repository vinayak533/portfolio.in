import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { evidenceFor, graph, neighbors, projectsUsing, techOf, usage, type GraphNode } from '../../core/graph'

interface KnowledgeMapProps {
  /** Node key of the view on screen. */
  focus?: string
  /** A node being pointed at (map, palette or a view's chip): lit instead of the focus, without navigating. */
  probe?: string | null
  onProbe: (key: string | null) => void
  onSelect: (node: GraphNode) => void
}

type Column = { id: 'capability' | 'project' | 'tech'; label: string; nodes: GraphNode[] }

/** Projects and technologies shown when nothing asks for more: the non-minor projects, and technologies two or more of them use. */
function columns(focus?: string): Column[] {
  const f = focus ? graph.node(focus) : undefined
  const near = f ? neighbors(f.key) : new Set<string>()
  const projects = graph.of('project').filter((p) => !p.minor || p.key === focus || near.has(p.key))
  const shown = new Set(projects.map((p) => p.key))
  // The focused project's whole stack is shown, as are the technologies a capability's projects use most.
  const extra = new Set<string>()
  if (f?.kind === 'project') for (const t of techOf(f.key)) extra.add(t.node.key)
  if (f?.kind === 'tech') extra.add(f.key)
  const tech = graph.of('tech').filter((t) => extra.has(t.key) || projectsUsing(t.key).filter((p) => shown.has(p.node.key)).length >= 2)
  return [
    { id: 'capability', label: 'Capabilities', nodes: graph.of('capability') },
    { id: 'project', label: 'Projects', nodes: projects },
    { id: 'tech', label: 'Technology', nodes: tech },
  ]
}

interface Line {
  id: string
  d: string
  from: string
  to: string
}

/**
 * The relation map: capabilities → projects → technologies, with the graph's edges drawn between
 * them. The node on screen and its neighbours light up; pointing at (or focusing) any node lights
 * its neighbourhood instead, so "which projects use FastAPI?" can be seen before it is asked.
 * Selecting a node opens it. Arrow keys move through the map; it is one tab stop.
 */
export function KnowledgeMap({ focus, probe, onProbe, onSelect }: KnowledgeMapProps) {
  const cols = useMemo(() => columns(focus), [focus])
  const root = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const visible = useMemo(() => new Set(cols.flatMap((c) => c.nodes.map((n) => n.key))), [cols])
  const lit = probe ?? focus
  const near = useMemo(() => (lit ? neighbors(lit) : new Set<string>()), [lit])

  // The drawn edges: capability → project and project → technology, between visible nodes.
  const edges = useMemo(
    () =>
      graph.edges.filter(
        (e) => visible.has(e.from) && visible.has(e.to) && ((e.from.startsWith('capability:') && e.to.startsWith('project:')) || (e.from.startsWith('project:') && e.to.startsWith('tech:'))),
      ),
    [visible],
  )

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
      for (const e of edges) {
        const a = at.get(e.from)
        const b = at.get(e.to)
        if (!a || !b) continue
        const x1 = a.right - box.left + 3
        const y1 = a.top + a.height / 2 - box.top
        const x2 = b.left - box.left - 3
        const y2 = b.top + b.height / 2 - box.top
        const dx = Math.max(12, (x2 - x1) * 0.5)
        out.push({ id: `${e.from}>${e.to}`, from: e.from, to: e.to, d: `M${x1.toFixed(1)} ${y1.toFixed(1)}C${(x1 + dx).toFixed(1)} ${y1.toFixed(1)} ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}` })
      }
      setLines(out)
      setSize({ w: box.width, h: el.scrollHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [edges])

  const state = (key: string) => (!lit ? undefined : key === lit ? 'on' : near.has(key) ? 'near' : 'off')

  // One tab stop: the focused node if shown, else the first project.
  const stop = (focus && visible.has(focus) ? focus : cols[1].nodes[0]?.key) ?? ''

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const key = target.dataset.key
    if (!key) return
    const ci = cols.findIndex((c) => c.nodes.some((n) => n.key === key))
    const ri = cols[ci].nodes.findIndex((n) => n.key === key)
    let next: GraphNode | undefined
    if (e.key === 'ArrowDown') next = cols[ci].nodes[ri + 1]
    else if (e.key === 'ArrowUp') next = cols[ci].nodes[ri - 1]
    else if (e.key === 'Home') next = cols[ci].nodes[0]
    else if (e.key === 'End') next = cols[ci].nodes[cols[ci].nodes.length - 1]
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const to = cols[ci + (e.key === 'ArrowRight' ? 1 : -1)]
      if (to) next = to.nodes[Math.min(to.nodes.length - 1, Math.round((ri / Math.max(1, cols[ci].nodes.length - 1)) * (to.nodes.length - 1)))]
    } else return
    e.preventDefault()
    if (next) root.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(next.key)}"]`)?.focus()
  }

  const count = (n: GraphNode) =>
    n.kind === 'tech' ? usage(n.key) : n.kind === 'capability' ? evidenceFor(n.key).projects.length : n.kind === 'project' ? techOf(n.key).length : 0

  return (
    <div ref={root} className="cx-map" role="group" aria-label="Relation map: capabilities, projects and technologies" data-lit={lit ? '' : undefined} onKeyDown={onKey} onMouseLeave={() => onProbe(null)}>
      <svg className="cx-map-edges" width={size.w} height={size.h} viewBox={`0 0 ${size.w || 1} ${size.h || 1}`} aria-hidden="true">
        {lines.map((l) => (
          <path key={l.id} d={l.d} data-state={lit && (l.from === lit || l.to === lit) ? 'on' : undefined} />
        ))}
      </svg>
      {cols.map((c) => (
        <div key={c.id} className="cx-map-col" data-col={c.id}>
          <p className="cx-map-head">
            {c.label} <span>{String(c.nodes.length).padStart(2, '0')}</span>
          </p>
          <ul>
            {c.nodes.map((n) => (
              <li key={n.key}>
                <button
                  type="button"
                  data-key={n.key}
                  data-state={state(n.key)}
                  aria-current={n.key === focus ? 'true' : undefined}
                  tabIndex={n.key === stop ? 0 : -1}
                  title={n.label}
                  onClick={() => onSelect(n)}
                  onMouseEnter={() => onProbe(n.key)}
                  onFocus={() => onProbe(n.key)}
                  onBlur={() => onProbe(null)}
                >
                  <span className="cx-map-label">{n.short}</span>
                  <span className="cx-map-n" aria-hidden="true">
                    {count(n) || ''}
                  </span>
                  <span className="sr-only">, {n.kind === 'tech' ? `used in ${count(n)} projects` : n.kind === 'capability' ? `${count(n)} projects` : `${count(n)} technologies`}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
