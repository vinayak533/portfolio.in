import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Section } from '../Section'
import { about } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { holdEnd } from '../../core/timeline'
import { onTick } from '../../core/clock'
import '@fontsource-variable/space-grotesk/index.css'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import './about.css'

/**
 * The portrait scan and exit stay on the scroll-scrubbed
 * timeline. The copy instead plays in on time once the About stage arrives
 * (a CSS stagger keyed off `is-in`), and resets if you scroll back into the
 * hero. The kicker ([data-a-head]) arrives with the hero's camera as it leaves
 * the cloud bank (src/hero/transition.ts).
 */
const SCAN_END = 0.46
const SHIMMER_END = 0.6

/** Reveal order: the accent line of the heading lands last. */
const ORDER = { lead: 0, body: 1, accent: 2 } as const
const reveal = (i: number) => ({ '--i': i }) as CSSProperties

export function About() {
  const mode = useStore((s) => s.mode)
  const lite = useStore((s) => s.lite)
  const webgl = mode === 'webgl'
  const panel = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)

  // Phones: the portrait sits in the top-right corner beside the headline, never
  // under the copy. The slot is that corner; the 3D portrait fits itself into it and the
  // scrim starts at its bottom edge. Offsets, not rects, so the exit's transform
  // never skews the measurement.
  useEffect(() => {
    const s = slot.current
    const st = stage.current
    if (!webgl || !s || !st) return
    const measure = () => {
      if (!s.offsetHeight || !st.offsetHeight) {
        signals.aboutSlot = null
        st.style.removeProperty('--about-slot-end')
        return
      }
      const box = s.offsetParent as HTMLElement
      const top = box.offsetTop + s.offsetTop
      const left = box.offsetLeft + s.offsetLeft
      const W = st.offsetWidth
      const H = st.offsetHeight
      signals.aboutSlot = {
        x: (left + s.offsetWidth / 2) / W,
        y: (top + s.offsetHeight / 2) / H,
        w: s.offsetWidth / W,
        h: s.offsetHeight / H,
      }
      st.style.setProperty('--about-slot-end', `${top + s.offsetHeight}px`)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(s)
    ro.observe(st)
    return () => {
      ro.disconnect()
      signals.aboutSlot = null
    }
  }, [webgl])

  useEffect(() => {
    if (webgl) {
      let state = false
      return onTick(() => {
        const p = signals.progress.about
        const next = p > 0.01 ? true : p <= 0 ? false : state
        if (next !== state) setEntered((state = next))
      })
    }
    const el = panel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setEntered(true), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [webgl])

  return (
    <Section
      id="about"
      title="About Me"
      choreography={(tl, root) => {
        tl.fromTo(signals, { scan: 0 }, { scan: 1, duration: SCAN_END, ease: 'none' }, 0)
        tl.fromTo(signals, { shimmer: 0 }, { shimmer: 1, duration: SHIMMER_END - SCAN_END, ease: 'none' }, SCAN_END)

        const exitAt = holdEnd('about') - 0.03
        tl.to(root.querySelector('[data-a-copy]'), { opacity: 0, y: -50, duration: 0.06, ease: 'power2.in' }, exitAt)
      }}
    >
      <div ref={stage} className="relative h-full w-full">
        {webgl && <div aria-hidden="true" className="about-scrim" />}
        <div
          data-a-copy
          className={`about-layout ${webgl ? 'about-layout--immersive' : 'about-layout--static'}${lite ? ' is-lite' : ''}`}
          data-lenis-prevent={webgl ? '' : undefined}
        >
          <div ref={panel} className={`about-panel${entered ? ' is-in' : ''}`}>
            {webgl && <div ref={slot} aria-hidden="true" className="about-portrait-slot" />}
            <span data-a-head className="about-kicker">
              <span aria-hidden="true" className="about-index">02</span>
              <span aria-hidden="true" className="about-kicker-rule" />
              {about.kicker}
            </span>

            <h2 className="about-heading">
              <span className="about-reveal about-heading-lead" style={reveal(ORDER.lead)}>
                {about.heading[0]}
              </span>{' '}
              <span className="about-reveal about-heading-line" style={reveal(ORDER.accent)}>
                <em className="about-heading-accent">{about.heading[1]}</em>
              </span>
            </h2>

            <p className="about-reveal about-body" style={reveal(ORDER.body)}>
              {about.body}
            </p>
          </div>

          {!webgl && (
            <figure className="about-portrait">
              <div aria-hidden="true" className="about-portrait-glow" />
              <PortraitPicture alt={photo.alt} lazy />
            </figure>
          )}
        </div>
        {webgl && <SharpPortrait />}
      </div>
    </Section>
  )
}

const { photo } = about
const srcset = (ext: string) => photo.widths.map((w) => `${photo.base}-${w}.${ext} ${w}w`).join(', ')
/** Phones: the content width; wider: the portrait's half of the screen. */
const SIZES = '(max-width: 767px) 92vw, 42vw'

/** The cutout's sharp renditions (scripts/prepare-about.mjs): AVIF, then WebP (both keep the alpha). */
function PortraitPicture({ alt, lazy, onLoad }: { alt: string; lazy?: boolean; onLoad?: () => void }) {
  const img = useRef<HTMLImageElement>(null)
  // A cached photo can be complete before React attaches onLoad.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth) onLoad?.()
  }, [onLoad])
  return (
    <picture>
      <source type="image/avif" srcSet={srcset('avif')} sizes={SIZES} />
      <source type="image/webp" srcSet={srcset('webp')} sizes={SIZES} />
      <img
        ref={img}
        src={`${photo.base}-${photo.widths[0]}.webp`}
        width={photo.width}
        height={photo.height}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        decoding="async"
        onLoad={onLoad}
      />
    </picture>
  )
}

/**
 * The settled portrait, sharp: once every crystal has locked into the photo (the scan and the shimmer pass
 * done, no cursor scatter reaching it), the photo itself fades in over them (600 ms), on the box the 3D portrait
 * publishes each frame (signals.aboutPhoto), drawn by the browser at the screen's own resolution instead of
 * the scene's. It fades out (250 ms) the moment the crystals move again: the scan replaying, the cursor
 * scattering them, the scene not drawing.
 */
function SharpPortrait() {
  const box = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const onLoad = useRef(() => setLoaded(true)).current
  // The photo is fetched once the 3D portrait draws (About is on screen), not with the page: lazy loading alone
  // would start it at load, since this box sits in the pinned stage near the top of the page until then.
  const [near, setNear] = useState(false)

  useEffect(() => {
    if (near) return
    return onTick(() => {
      if (signals.aboutPhoto.frame > 0) setNear(true)
    })
  }, [near])

  useEffect(() => {
    if (!loaded) return
    let a = 0
    let shown = ''
    return onTick((_, dt) => {
      const el = box.current
      const host = el?.parentElement
      if (!el || !host) return
      const o = signals.aboutPhoto
      const want = o.settled && performance.now() - o.frame < 250 ? 1 : 0
      a = want > a ? Math.min(1, a + dt / 0.6) : Math.max(0, a - dt / 0.25)
      const opacity = a > 0 ? (a * a * (3 - 2 * a)).toFixed(3) : '0'
      if (el.style.opacity !== opacity) el.style.opacity = opacity
      if (a <= 0) return
      // Viewport px into the stage's own box (it is pinned at the top while About plays).
      const top = host.getBoundingClientRect().top
      const dpr = window.devicePixelRatio || 1
      const px = (v: number) => Math.round(v * dpr) / dpr
      const next = `${px(o.x)},${px(o.y - top)},${px(o.w)},${px(o.h)}`
      if (next === shown) return
      shown = next
      const [x, y, w, h] = next.split(',')
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.width = `${w}px`
      el.style.height = `${h}px`
    })
  }, [loaded])

  return (
    <div ref={box} className="about-sharp" style={{ opacity: 0 }}>
      {near && <PortraitPicture alt={photo.alt} lazy onLoad={onLoad} />}
    </div>
  )
}
