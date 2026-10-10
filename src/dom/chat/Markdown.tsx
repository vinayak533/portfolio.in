import { Fragment, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { parseBlocks, parseInline, type Inline } from '../../core/markdown'

/**
 * Renders the parsed Markdown (src/core/markdown.ts) as React elements: text
 * stays text, and only allow-listed link targets become links. Same-page
 * anchors go to `onAnchor` instead of the browser.
 */
export function Markdown({ src, onAnchor }: { src: string; onAnchor?: (id: string) => void }) {
  const render = (xs: Inline[], key: string): ReactNode[] =>
    xs.map((x, n) => {
      const k = `${key}-${n}`
      switch (x.kind) {
        case 'text':
          return <Fragment key={k}>{x.text}</Fragment>
        case 'code':
          return <code key={k}>{x.text}</code>
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
