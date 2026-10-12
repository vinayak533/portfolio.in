import { useEffect, useRef, useState } from 'react'
import { site } from '../content'
import { introHtml } from '../hero/introCopy'
import { playIntro } from '../hero/introFx'
import { useStore } from '../store/useStore'
import '@fontsource/instrument-serif/latin-400-italic.css'

/**
 * The hero's only copy: the name, a hairline, the tagline and the role, bottom-left (hero.css .hero-intro).
 * With WebGL it is part of the first paint (index.html, over the hero's poster); without, it fades up as the
 * curtain lifts. It leaves with the first scroll (transition.ts sets --hero-intro on every [data-hero-intro]).
 *
 * With WebGL the robot is drawn on a fixed canvas over the whole page (robot.css), and on phones its stage
 * reaches down under the copy, so the copy is drawn in two parts that share one layout: the scrim, in the
 * hero under that canvas (it darkens the landscape only, never the stage or the robot), and the text, in a
 * fixed layer just above the canvas (App.tsx). Without WebGL (a still, or reduced motion) there is no
 * canvas over the page: one block in the hero does both.
 */
type Part = 'scrim' | 'text' | 'both'

function useIntroOn() {
  const loaded = useStore((s) => s.loaded)
  const webgl = useStore((s) => s.mode === 'webgl')
  // WebGL: real text over the hero's poster from the first paint (it is part of the first frame, not an
  // entrance). Static: once the curtain has lifted.
  const [on, setOn] = useState(webgl)
  useEffect(() => {
    if (loaded) setOn(true)
  }, [loaded])
  return on
}

export function HeroCopy({ part }: { part: Part }) {
  const on = useIntroOn()
  const scrim = part === 'scrim'
  const ref = useRef<HTMLDivElement>(null)
  // The entrance (src/hero/introFx.ts) plays with the text, once it is on; the scrim's copy is never seen.
  useEffect(() => {
    if (on && !scrim) playIntro(ref.current)
  }, [on, scrim])
  // The same markup as the pre-painted copy (src/hero/introCopy.ts), so the scrim's lays out like the text's.
  const [html] = useState(() => ({ __html: introHtml(site, !scrim) }))
  return (
    <div
      ref={ref}
      className={`hero-intro hero-intro--${part}`}
      data-hero-intro
      data-on={on || undefined}
      aria-hidden={scrim || undefined}
      dangerouslySetInnerHTML={html}
    />
  )
}

/**
 * The text's layer over the robot's canvas (WebGL only): as tall as the hero's stage (100svh), so the text
 * lands exactly on its scrim (both lay out from the same fixed geometry, hero.css .hero-intro).
 *
 * It is the copy index.html painted before any script (vite.config.ts heroBoot, outside the app's root),
 * adopted rather than drawn again, so the page's largest paint is never replaced. It painted with its own
 * scrim (nothing was over the page yet); from here the scrim is the hero's, under the robot's canvas, and
 * this becomes the text alone (the same box: nothing moves). Without it (it is missing), the layer draws it.
 */
export function HeroCopyLayer() {
  const [boot] = useState(() => document.getElementById('hero-copy'))
  useEffect(() => {
    boot?.querySelector('.hero-intro')?.classList.replace('hero-intro--both', 'hero-intro--text')
  }, [boot])
  if (boot) return null
  return (
    <div className="hero-copy-layer">
      <HeroCopy part="text" />
    </div>
  )
}

/** Without WebGL the copy is the hero's own (it fades with the hero): the pre-painted one gives way to it. */
export function dropBootCopy() {
  document.getElementById('hero-copy')?.remove()
}
