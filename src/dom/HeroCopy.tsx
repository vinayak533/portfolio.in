import { useEffect, useRef, useState } from 'react'
import { site } from '../content'
import { useStore } from '../store/useStore'
import '@fontsource/instrument-serif/latin-400-italic.css'

/**
 * The hero's only copy: the name, a hairline, the tagline and the role, bottom-left (hero.css .hero-intro).
 * It fades up once the load sequence is over and leaves with the first scroll (transition.ts sets
 * --hero-intro on every [data-hero-intro]).
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
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!loaded) return
    // After the load sequence (the header's fade starts at 3.2 s, Hud.tsx); without WebGL at once.
    const id = window.setTimeout(() => setOn(true), webgl ? 3600 : 0)
    return () => window.clearTimeout(id)
  }, [loaded, webgl])
  return on
}

export function HeroCopy({ part }: { part: Part }) {
  const on = useIntroOn()
  const scrim = part === 'scrim'
  return (
    <div className={`hero-intro hero-intro--${part}`} data-hero-intro data-on={on || undefined} aria-hidden={scrim || undefined}>
      {scrim ? (
        <div className="hero-intro__name">Vinayak</div>
      ) : (
        <h1 className="hero-intro__name">
          Vinayak<span className="sr-only"> K V</span>
        </h1>
      )}
      <span className="hero-intro__rule" aria-hidden="true" />
      <p className="hero-intro__tagline">{site.tagline}</p>
      <p className="hero-intro__role">{site.role}</p>
    </div>
  )
}

/**
 * The text's layer over the robot's canvas (WebGL only). As tall as the hero's stage (100svh) and given the
 * engine's stage layout (--robot-x, --dais-w, which it writes on the stage), so the text lands exactly on
 * its scrim.
 */
export function HeroCopyLayer() {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const stage = document.querySelector<HTMLElement>('#hero .hero-stage')
    const el = layer.current
    if (!stage || !el) return
    const copy = () => {
      for (const prop of ['--robot-x', '--dais-w']) {
        // (The stage's style changes every scroll frame: write only what moved.)
        const v = stage.style.getPropertyValue(prop)
        if (v === el.style.getPropertyValue(prop)) continue
        if (v) el.style.setProperty(prop, v)
        else el.style.removeProperty(prop)
      }
    }
    copy()
    const mo = new MutationObserver(copy)
    mo.observe(stage, { attributes: true, attributeFilter: ['style'] })
    return () => mo.disconnect()
  }, [])
  return (
    <div ref={layer} className="hero-copy-layer">
      <HeroCopy part="text" />
    </div>
  )
}
