import { useEffect, useRef, useState } from 'react'
import type { TraceStep } from '../../core/assistant'
import { stats, type Resolution } from '../../core/console'
import { graph } from '../../core/graph'

/**
 * The work an answer takes, shown the way a coding agent shows it (Claude Code, Codex): a spinning
 * glyph and a shimmering verb with the seconds ticking, then each step as a tool call (Classify,
 * Search, Read, Verify, Write) landing one after another. Once the answer is in, it folds into one
 * line, "Worked for 1.9s · 5 steps", that opens to show the steps again.
 *
 * The steps are real: an answer's own trace (src/core/assistant.ts), or for a structured view what
 * the console matched and read (route, focus, sources). Only the pacing is staged; everything
 * resolves locally and at once. A turn's plan is seeded by its id, so it reads the same live and
 * later in the thread. Timers, not requestAnimationFrame, which the WebGL page can starve.
 */

export interface WorkStep {
  tool: string
  detail: string
  /** How long the step runs while the answer is being worked on. */
  ms: number
}
export interface WorkPlan {
  steps: WorkStep[]
  /** The verbs the header cycles through. */
  verbs: string[]
  total: number
}

const TOOL: Record<TraceStep['tool'], string> = {
  classify_intent: 'Classify',
  search_knowledge: 'Search',
  read_source: 'Read',
  check_grounding: 'Verify',
  compose_answer: 'Write',
}

/** What a structured view is, as the Write step names it. */
const WRITES: Record<string, string> = {
  project: 'project brief',
  arch: 'architecture walkthrough',
  tech: 'technology profile',
  capability: 'evidence summary',
  projects: 'project index',
  stack: 'stack chart',
  experience: 'career timeline',
  profile: 'profile card',
  certs: 'certificate list',
  contact: 'contact card',
  help: 'command reference',
}

const VERBS = [
  'Thinking',
  'Rummaging through projects',
  'Connecting the dots',
  'Cross-referencing',
  'Consulting the graph',
  'Pondering',
  'Untangling',
  'Synthesizing',
  'Percolating',
  'Reading the case studies',
]

/** A small seeded generator (xorshift over an FNV hash), so a turn's plan is stable. */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}

function stepsOf(res: Resolution): { tool: string; detail: string }[] {
  const v = res.view
  if (!v) return []
  if (v.kind === 'answer') return v.reply.trace.map((s) => ({ tool: TOOL[s.tool], detail: s.detail }))
  const f = res.focus ? graph.node(res.focus) : undefined
  const head = res.input.trim().split(/\s+/)[0]
  const classify =
    res.route === 'command'
      ? `command ${head}`
      : res.route === 'entity'
        ? `name match · ${f?.label ?? res.rule}`
        : res.route === 'context'
          ? `follow-up on ${f?.label ?? 'the last answer'}`
          : res.route === 'fallback'
            ? 'no intent matched'
            : res.rule
  const out = [{ tool: 'Classify', detail: classify }]
  if (v.kind === 'none') {
    out.push({ tool: 'Search', detail: v.candidates.length ? `no exact match · ${v.candidates.length} close name${v.candidates.length === 1 ? '' : 's'}` : 'nothing matched' })
    out.push({ tool: 'Verify', detail: 'no source, so no guessing' })
    return out
  }
  const s = stats()
  out.push({ tool: 'Search', detail: f ? `knowledge graph → ${f.label}` : `knowledge graph · ${s.projects} projects, ${s.tech} technologies` })
  for (const src of res.sources.filter((x) => x !== 'knowledge graph').slice(0, 3)) out.push({ tool: 'Read', detail: src })
  if (WRITES[v.kind]) out.push({ tool: 'Write', detail: WRITES[v.kind] })
  return out
}

/** The steps for a resolution, each with how long it runs. */
export function planWork(res: Resolution | null, seed: string): WorkPlan {
  if (!res) return { steps: [], verbs: [], total: 0 }
  const r = rng(seed)
  const steps = stepsOf(res).map((s) => ({ ...s, ms: Math.round((s.tool === 'Read' ? 340 : 230) + r() * 200) }))
  const pool = [...VERBS]
  const verbs = Array.from({ length: 3 }, () => pool.splice(Math.floor(r() * pool.length), 1)[0])
  return { steps, verbs, total: steps.reduce((a, s) => a + s.ms, 0) }
}

/** Claude Code's spinner: a dot that blooms into a star and back. */
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢']
const FRAME_MS = 110
const VERB_MS = 1300

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/**
 * The work for one turn. While `running`, it plays: steps land on their timings and `onDone` fires
 * after the last. Stopped early (running turns false first), it reads "Interrupted". Otherwise it
 * is the folded summary.
 */
export function Work({ plan, running, animated, onDone }: { plan: WorkPlan; running: boolean; animated: boolean; onDone?: () => void }) {
  const [elapsed, setElapsed] = useState(animated ? 0 : plan.total)
  const [open, setOpen] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    if (!running) return
    const t0 = performance.now() - elapsed
    const id = window.setInterval(() => {
      const e = performance.now() - t0
      setElapsed(Math.min(e, plan.total))
      if (e >= plan.total && !done.current) {
        done.current = true
        window.clearInterval(id)
        onDone?.()
      }
    }, 50)
    return () => window.clearInterval(id)
    // Runs while running; the start time is taken once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  if (!plan.steps.length) return null

  // How far through the steps the clock is.
  let active = 0
  let acc = 0
  for (; active < plan.steps.length; active++) {
    acc += plan.steps[active].ms
    if (elapsed < acc) break
  }

  if (running) {
    const glyph = FRAMES[Math.floor(elapsed / FRAME_MS) % FRAMES.length]
    const verb = plan.verbs[Math.floor(elapsed / VERB_MS) % plan.verbs.length]
    return (
      <div className="cx-work" data-live="" role="status" aria-label="Working on the answer">
        <p className="cx-work-head">
          <span className="cx-spin" aria-hidden="true">
            {glyph}
          </span>
          <span className="cx-shimmer" key={verb}>
            {verb}…
          </span>
          <span className="cx-work-meta">
            ({secs(elapsed)} · <kbd>esc</kbd> to interrupt)
          </span>
        </p>
        <Steps steps={plan.steps.slice(0, active + 1)} active={active} />
      </div>
    )
  }

  const interrupted = elapsed < plan.total
  const shown = interrupted ? plan.steps.slice(0, active + 1) : plan.steps
  return (
    <div className="cx-work" data-folded="" data-interrupted={interrupted || undefined}>
      <button type="button" className="cx-work-sum" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="cx-work-tick" aria-hidden="true">
          {interrupted ? '■' : '✓'}
        </span>
        {interrupted ? `Interrupted after ${secs(elapsed)}` : `Worked for ${secs(plan.total)}`}
        <span className="cx-work-n">
          · {shown.length} step{shown.length === 1 ? '' : 's'}
        </span>
        <svg className="cx-work-chev" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <Steps steps={shown} active={interrupted ? active : -1} />}
    </div>
  )
}

function Steps({ steps, active }: { steps: WorkStep[]; active: number }) {
  return (
    <ol className="cx-steps">
      {steps.map((s, i) => (
        <li key={i} data-state={i === active ? 'run' : 'done'}>
          <span className="cx-step-dot" aria-hidden="true" />
          <span className="cx-step-tool">{s.tool}</span>
          <span className="cx-step-detail">{s.detail}</span>
        </li>
      ))}
    </ol>
  )
}
