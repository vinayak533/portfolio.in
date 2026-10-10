/**
 * The Markdown subset chat answers use, parsed into plain data that
 * src/dom/chat/Markdown.tsx renders as React elements. No HTML string is ever
 * produced, so text can't turn into markup. Supported: paragraphs, line breaks,
 * - / 1. lists, # headings (shown as bold lines), ``` fences, `code`, **bold**,
 * *italic* / _italic_ and [links](…). Links survive only for https:, http:,
 * mailto: and same-page #anchors; any other target renders as plain text.
 * No DOM here: tested by scripts/assistant.test.mjs.
 */

export type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'h'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'code'; lang: string; text: string }

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong' | 'em'; children: Inline[] }
  | { kind: 'link'; href: string; to: LinkKind; children: Inline[] }

export type LinkKind = 'external' | 'mail' | 'anchor'

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
const FENCE = /^\s*```\s*([\w+-]*)\s*$/

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', lines: para })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(FENCE)
    if (fence) {
      flush()
      const code: string[] = []
      while (++i < lines.length && !FENCE.test(lines[i])) code.push(lines[i])
      blocks.push({ kind: 'code', lang: fence[1], text: code.join('\n') })
      continue
    }
    const item = line.match(BULLET) ?? line.match(NUMBERED)
    if (item) {
      flush()
      const kind = BULLET.test(line) ? 'ul' : 'ol'
      const last = blocks[blocks.length - 1]
      if (last?.kind === kind) last.items.push(item[1])
      else blocks.push({ kind, items: [item[1]] })
      continue
    }
    const heading = line.match(HEADING)
    if (heading) {
      flush()
      blocks.push({ kind: 'h', text: heading[1] })
      continue
    }
    if (!line.trim()) flush()
    else para.push(line.trim())
  }
  flush()
  return blocks
}

/** The link's kind if its target is allowed, else null. */
export function linkKind(href: string): LinkKind | null {
  if (/^https?:\/\/\S+$/i.test(href)) return 'external'
  if (/^mailto:\S+$/i.test(href)) return 'mail'
  if (/^#[\w-]+$/.test(href)) return 'anchor'
  return null
}

// Leftmost token first: `code`, [label](href), **bold**, *italic*, _italic_.
const INLINE = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\*(?!\s)([^*\n]+?)\*|(?<!\w)_(?!\s)([^_\n]+?)_(?!\w)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0
    if (start > at) out.push({ kind: 'text', text: text.slice(at, start) })
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] })
    else if (m[2] !== undefined) {
      const to = linkKind(m[3])
      const children = parseInline(m[2])
      // A disallowed target keeps only its label.
      if (to) out.push({ kind: 'link', href: m[3], to, children })
      else out.push(...children)
    } else if (m[4] !== undefined) out.push({ kind: 'strong', children: parseInline(m[4]) })
    else out.push({ kind: 'em', children: parseInline(m[5] ?? m[6]) })
    at = start + m[0].length
  }
  if (at < text.length) out.push({ kind: 'text', text: text.slice(at) })
  return out
}

/** Markdown reduced to readable plain text, for copying and screen-reader announcements. */
export function toPlainText(src: string): string {
  const flat = (xs: Inline[]): string => xs.map((x) => ('children' in x ? flat(x.children) : x.text)).join('')
  return parseBlocks(src)
    .map((b) => {
      if (b.kind === 'code') return b.text
      if (b.kind === 'p') return b.lines.map((l) => flat(parseInline(l))).join('\n')
      if (b.kind === 'h') return flat(parseInline(b.text))
      return b.items.map((it, i) => `${b.kind === 'ol' ? `${i + 1}.` : '•'} ${flat(parseInline(it))}`).join('\n')
    })
    .join('\n\n')
}
