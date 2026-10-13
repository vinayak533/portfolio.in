import { Fragment, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { parseBlocks, parseInline, type Inline } from '../../core/markdown'

/**
 * Text as one span per word, keyed by position: as a streamed answer grows, the words already on
 * screen keep their elements and only the new ones mount, each fading in (.chat-tok in chat.css).
 */
function words(text: string, key: string): ReactNode[] {
  return text.split(/(\s+)/).map((w, i) => (!w || /^\s/.test(w) ? w : <span key={`${key}w${i}`} className="chat-tok">{w}</span>))
}

/** Inline Markdown (**bold**, `code`, links) as React elements. */
function renderInline(xs: Inline[], key: string, onAnchor?: (id: string) => void, stream = false): ReactNode[] {
  const render = (ys: Inline[], k: string) => renderInline(ys, k, onAnchor, stream)
  return xs.map((x, n) => {
    const k = `${key}-${n}`
    switch (x.kind) {
      case 'text':
        return <Fragment key={k}>{stream ? words(x.text, k) : x.text}</Fragment>
      case 'code':
        return (
          <code key={k} className={stream ? 'chat-tok' : undefined}>
            {x.text}
          </code>
        )
      case 'strong':
        return <strong key={k}>{render(x.children, k)}</strong>
      case 'em':
        return <em key={k}>{render(x.children, k)}</em>
      case 'link': {
        const label = render(x.children, k)
        if (x.to === 'anchor') {
          const onClick = (e: MouseEvent) => {
            if (!onAnchor) return
            e.preventDefault()
            onAnchor(x.href.slice(1))
          }
          return (
            <a key={k} href={x.href} onClick={onClick}>
              {label}
            </a>
          )
        }
        if (x.to === 'mail') {
          return (
            <a key={k} href={x.href}>
              {label}
            </a>
          )
        }
        return (
          <a key={k} href={x.href} target="_blank" rel="noopener noreferrer">
            {label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )
      }
    }
  })
}

/** One line of inline Markdown, without a block around it. */
export function InlineMarkdown({ text, onAnchor }: { text: string; onAnchor?: (id: string) => void }) {
  return <>{renderInline(parseInline(text), 'i', onAnchor)}</>
}

/**
 * Renders the parsed Markdown (src/core/markdown.ts) as React elements: text
 * stays text, and only allow-listed link targets become links. Same-page
 * anchors go to `onAnchor` instead of the browser. With `stream`, each word is its own element so
 * the words a streamed answer adds can fade in as they arrive.
 */
export function Markdown({ src, onAnchor, stream = false }: { src: string; onAnchor?: (id: string) => void; stream?: boolean }) {
  const render = (xs: Inline[], key: string): ReactNode[] => renderInline(xs, key, onAnchor, stream)
  const line = (text: string, key: string) => render(parseInline(text), key)

  return (
    <>
      {parseBlocks(src).map((b, i) => {
        // Block index, so each block's entrance can be staggered in CSS.
        const style = { '--i': Math.min(i, 8) } as CSSProperties
        switch (b.kind) {
          case 'p':
            return (
              <p key={i} style={style}>
                {b.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {line(l, `${i}-${j}`)}
                  </Fragment>
                ))}
              </p>
            )
          case 'h':
            return (
              <p key={i} style={style}>
                <strong>{line(b.text, `${i}`)}</strong>
              </p>
            )
          case 'img':
            return (
              <p key={i} style={style} className="chat-md-figure">
                <img src={b.src} alt={b.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              </p>
            )
          case 'code':
            return (
              <pre key={i} style={style} tabIndex={0} aria-label={b.lang ? `${b.lang} code` : 'Code'}>
                <code>{b.text}</code>
              </pre>
            )
          default: {
            const List = b.kind
            return (
              <List key={i} style={style}>
                {b.items.map((it, j) => (
                  <li key={j}>{line(it, `${i}-${j}`)}</li>
                ))}
              </List>
            )
          }
        }
      })}
    </>
  )
}
