import { useLayoutEffect, useRef } from 'react'
import { SplitText } from '../../core/clock'
import { useStore } from '../../store/useStore'

interface Props {
  text: string
  as?: 'p' | 'span' | 'div' | 'h2' | 'h3'
  className?: string
  /** Attribute stamped on every rendered line so a parent timeline can find them. */
  lineAttr?: string
}

/**
 * Splits text into masked lines at the real rendered width. Re-splits when
 * fonts land or the viewport width changes (store.layoutKey), before parent
 * timelines rebuild, so reveals always follow true line breaks.
 */
export function SplitLines({ text, as: Tag = 'p', className = '', lineAttr = 'data-line' }: Props) {
  const ref = useRef<HTMLParagraphElement>(null)
  const layoutKey = useStore((s) => s.layoutKey)
  const mode = useStore((s) => s.mode)

  useLayoutEffect(() => {
    if (mode !== 'webgl' || !ref.current) return
    const split = SplitText.create(ref.current, { type: 'lines', mask: 'lines', linesClass: 'split-line' })
    split.lines.forEach((l) => l.setAttribute(lineAttr, ''))
    return () => split.revert()
  }, [layoutKey, text, lineAttr, mode])

  return (
    <Tag ref={ref as React.RefObject<never>} className={className}>
      {text}
    </Tag>
  )
}
