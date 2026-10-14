import { useEffect, useState, type CSSProperties } from 'react'
import { assistant } from '../../assistant'
import { projects } from '../../content'
import type { Resolution } from '../../core/console'
import { evidenceFor, graph, projectsUsing, relatedProjects, type GraphNode } from '../../core/graph'

/** A picture an answer can end with: a frame from a project's reel, a project screenshot, a certificate. Never a photo of him (his request). */
export interface Pic {
  src: string
  alt: string
  caption: string
  /** The project it shows, so the viewer can open its case study or ask about it. */
  project?: string
}

/** A project's picture: the frame its reel starts on (on this page), else its screenshot. */
function posterOf(id: string): Pic | null {
  const p = projects.find((x) => x.id === id)
  if (p?.media?.poster) return { src: p.media.poster, alt: `${p.title}: a frame from its demo reel`, caption: p.title, project: id }
  const n = graph.project(id)
  return n?.image ? { src: n.image.src, alt: n.image.alt, caption: n.label, project: id } : null
}
const posters = (ids: string[]) => ids.map(posterOf).filter((x): x is Pic => Boolean(x))
const flagship = () => graph.of('project').filter((p) => p.flagship).map((p) => p.id)
const certPics = (ids?: string[]) =>
  assistant.certifications.filter((c) => c.image && (!ids || ids.includes(c.id))).map((c) => ({ src: c.image!.src, alt: c.image!.alt, caption: c.title }))

/** Answers about him and his work in general end with his flagship projects; about his learning, with his certificates. */
const WORK_TOPICS = new Set(['about', 'why-hire', 'current-role', 'experience', 'level', 'team', 'projects', 'highlight', 'ai-experience', 'compare', 'skills', 'tech'])
const LEARNING_TOPICS = new Set(['certifications', 'education', 'achievements'])

/**
 * The pictures an answer ends with, at most four, never one the answer already shows. Only real
 * pictures of what the answer is about: reel frames, screenshots, certificates. Never a photo of him.
 */
export function picturesFor(res: Resolution): Pic[] {
  const v = res.view
  if (!v) return []
  const nodes = (ns: GraphNode[]) => posters(ns.filter((n) => n.kind === 'project').map((n) => (n as { id: string }).id))
  let out: Pic[] = []
  switch (v.kind) {
    case 'project':
    case 'arch': {
      const own = posterOf(v.id)
      const p = graph.project(v.id)
      out = [own, ...(p ? nodes(relatedProjects(p.key).map((r) => r.node)) : [])].filter((x): x is Pic => Boolean(x))
      // The project view already shows its screenshot at the top.
      if (v.kind === 'project' && p?.image) out = out.filter((x) => x.src !== p.image!.src)
      break
    }
    case 'tech':
      out = nodes(projectsUsing(v.key).map((u) => u.node))
      break
    case 'capability':
      out = nodes(evidenceFor(`capability:${v.id}`).projects.map((u) => u.node))
      break
    case 'projects': {
      const f = v.filter ? graph.node(v.filter) : undefined
      out = f ? nodes((f.kind === 'tech' ? projectsUsing(f.key) : evidenceFor(f.key).projects).map((u) => u.node)) : posters(projects.map((p) => p.id))
      break
    }
    case 'experience':
    case 'stack':
    case 'profile':
      out = posters(flagship())
      break
    case 'certs':
      out = certPics()
      break
    case 'answer': {
      const r = v.reply
      if (!r.known) break
      const t = r.topic
      if (r.project) out = posters([r.project])
      else if (t.startsWith('cert:')) out = certPics([t.slice(5)])
      else if (LEARNING_TOPICS.has(t)) out = certPics()
      else if (WORK_TOPICS.has(t)) out = posters(flagship())
      out = out.filter((p) => !r.text.includes(p.src))
      break
    }
  }
  const seen = new Set<string>()
  return out.filter((p) => !seen.has(p.src) && seen.add(p.src)).slice(0, 4)
}

/** The tag over a reply: an emoji and what it is about. */
export function tagFor(res: Resolution): readonly [string, string] {
  const v = res.view
  if (!v) return ['💬', 'Answer']
  if (v.kind === 'answer') {
    const tags = assistant.topicTags
    if (!v.reply.known) return tags.unknown
    const t = v.reply.topic
    const hit = tags[t] ?? Object.entries(tags).find(([k]) => k.endsWith(':') && t.startsWith(k))?.[1]
    return hit ?? ['💬', 'Answer']
  }
  const f = res.focus ? graph.node(res.focus) : undefined
  const tags: Record<string, readonly [string, string]> = {
    project: ['🚀', 'Project'],
    arch: ['🧩', 'Architecture'],
    tech: ['🛠️', 'Technology'],
    capability: ['🧠', 'Capability'],
    projects: ['🗂️', f ? `Projects · ${f.short}` : 'Projects'],
    stack: ['🧰', 'Stack'],
    experience: ['💼', 'Experience'],
    profile: ['👋', 'Profile'],
    certs: ['🏅', 'Certifications'],
    contact: ['✉️', 'Contact'],
    help: ['💡', 'Help'],
    none: ['🤔', 'Not found'],
    home: ['💬', 'Start'],
  }
  return tags[v.kind]
}

/** The closing line: a smile and a few friendly words. Adds no facts. */
function closing(res: Resolution): [string, string] {
  const v = res.view!
  const f = res.focus ? graph.node(res.focus) : undefined
  const name = f?.short ?? 'it'
  switch (v.kind) {
    case 'project':
      return ['😊', `That’s ${name} at a glance. Happy to go deeper on any part of it.`]
    case 'arch':
      return ['🧩', `That’s how ${name} fits together, stage by stage.`]
    case 'tech':
      return ['🙂', `That’s everywhere ${name} shows up in his work.`]
    case 'capability':
      return ['😊', 'That’s the evidence, straight from the projects.']
    case 'projects':
      return ['🙂', 'Pick any one and I’ll walk you through it.']
    case 'stack':
      return ['😄', 'That’s the whole toolbox. Tap any bar to see where it’s used.']
    case 'experience':
      return ['🚀', 'That’s the journey so far.']
    case 'profile':
      return ['👋', 'Nice to meet you. That’s Vinayak in brief.']
    case 'certs':
      return ['🎓', 'Tap View on any certificate to see it.']
    case 'contact':
      return ['😊', 'He’d love to hear from you.']
    case 'help':
      return ['💡', 'Type / any time to see these again.']
    case 'none':
      return ['😅', 'I couldn’t find that one. One of the suggestions might be close.']
    case 'answer':
      return v.reply.known ? ['😊', 'Hope that helps!'] : ['🙏', 'That one isn’t in my notes, so I won’t guess. Try a suggestion below.']
    default:
      return ['🙂', '']
  }
}

/**
 * How an answer ends: the pictures that go with it, a smile, and what you can do with it (copy,
 * a thumbs up or down kept in this tab, ask again).
 */
export function SignOff({
  res,
  copyText,
  onRetry,
  onView,
  animated,
  brief = false,
}: {
  res: Resolution
  /** Stopped early: only the actions, no pictures or closing line. */
  brief?: boolean
  copyText: () => string
  onRetry?: () => void
  onView: (pics: Pic[], i: number) => void
  animated: boolean
}) {
  const [pics] = useState(() => (brief ? [] : picturesFor(res)))
  const [emoji, line] = closing(res)
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [vote, setVote] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (copied === 'idle') return
    const t = window.setTimeout(() => setCopied('idle'), 1600)
    return () => window.clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText())
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  return (
    <div className="cx-sign" data-animated={animated || undefined}>
      {pics.length > 0 && (
        <ul className="cx-pics" data-count={pics.length} aria-label="Pictures">
          {pics.map((p, i) => (
            <li key={p.src} style={{ '--i': i } as CSSProperties}>
              <button type="button" className="cx-pic" onClick={() => onView(pics, i)} aria-label={`View picture: ${p.alt}`}>
                <img src={p.src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                <span className="cx-pic-cap">{p.caption}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {line && !brief && (
        <p className="cx-sign-line">
          <span className="cx-sign-emoji" aria-hidden="true">
            {emoji}
          </span>
          {line}
        </p>
      )}
      <div className="cx-acts" role="group" aria-label="Answer actions">
        <button type="button" className="cx-act" onClick={copy} aria-label={copied === 'ok' ? 'Copied' : 'Copy the answer'} title="Copy">
          {copied === 'ok' ? (
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <rect x="5" y="5" width="8.5" height="8.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10.5 3.2V3a.8.8 0 0 0-.8-.8H3.6A1.4 1.4 0 0 0 2.2 3.6v6.1a.8.8 0 0 0 .8.8h.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          )}
        </button>
        <button type="button" className="cx-act" aria-pressed={vote === 'up'} onClick={() => setVote(vote === 'up' ? null : 'up')} aria-label="Good answer" title="Good answer">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="M5 7v6.5H2.8V7zM5 7l2.6-4.6c.9 0 1.6.8 1.4 1.7L8.6 6.3h3.8c.9 0 1.5.8 1.3 1.7l-1 4.4c-.2.7-.8 1.1-1.5 1.1H5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="cx-act" aria-pressed={vote === 'down'} onClick={() => setVote(vote === 'down' ? null : 'down')} aria-label="Not helpful" title="Not helpful">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" style={{ transform: 'scaleY(-1)' }}>
            <path d="M5 7v6.5H2.8V7zM5 7l2.6-4.6c.9 0 1.6.8 1.4 1.7L8.6 6.3h3.8c.9 0 1.5.8 1.3 1.7l-1 4.4c-.2.7-.8 1.1-1.5 1.1H5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
        </button>
        {onRetry && (
          <button type="button" className="cx-act" onClick={onRetry} aria-label="Ask again" title="Ask again">
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <span className="cx-acts-note" aria-live="polite">
          {copied === 'ok' ? 'Copied ✓' : copied === 'fail' ? 'Couldn’t copy' : vote === 'up' ? 'Glad it helped 💛' : vote === 'down' ? 'Thanks, noted. Email him for more 🙏' : ''}
        </span>
      </div>
    </div>
  )
}

/** A picture, large, over the panel: arrows move between them, Esc or a click outside closes. */
export function Lightbox({
  pics,
  index,
  onIndex,
  onClose,
  onCaseStudy,
  onAsk,
}: {
  pics: Pic[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  onCaseStudy: (id: string) => void
  onAsk: (id: string) => void
}) {
  const p = pics[index]
  const n = pics.length
  const onPage = p.project ? projects.some((x) => x.id === p.project) : false
  return (
    <div
      className="cx-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={p.alt}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && n > 1) onIndex((index + 1) % n)
        else if (e.key === 'ArrowLeft' && n > 1) onIndex((index - 1 + n) % n)
        else return
        e.preventDefault()
      }}
    >
      <figure className="cx-lb-fig" onClick={(e) => e.stopPropagation()} key={p.src}>
        <img src={p.src} alt={p.alt} referrerPolicy="no-referrer" />
        <figcaption>
          <span className="cx-lb-cap">
            {p.caption}
            {n > 1 && (
              <span className="cx-lb-n">
                {index + 1} / {n}
              </span>
            )}
          </span>
          {p.project && (
            <span className="cx-lb-acts">
              <button type="button" className="cx-btn" onClick={() => onAsk(p.project!)}>
                Ask about it
              </button>
              {onPage && (
                <button type="button" className="cx-btn cx-btn--hot" onClick={() => onCaseStudy(p.project!)}>
                  Open the case study
                </button>
              )}
            </span>
          )}
        </figcaption>
      </figure>
      {n > 1 && (
        <>
          <button type="button" className="cx-lb-nav cx-lb-nav--prev" aria-label="Previous picture" onClick={(e) => (e.stopPropagation(), onIndex((index - 1 + n) % n))}>
            ‹
          </button>
          <button type="button" className="cx-lb-nav cx-lb-nav--next" aria-label="Next picture" onClick={(e) => (e.stopPropagation(), onIndex((index + 1) % n))}>
            ›
          </button>
        </>
      )}
      <button type="button" className="cx-lb-x" aria-label="Close the picture" onClick={onClose} autoFocus>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
      </button>
    </div>
  )
}
