import { lazy, Suspense, useEffect } from 'react'
import { useStore } from './store/useStore'
import { initScroll } from './core/scroll'
import { initPointer } from './core/pointer'
import { ScrollTrigger } from './core/clock'
import { timeout, track } from './core/loading'
import { about } from './content'
import { Loader } from './dom/Loader'
import { Cursor } from './dom/Cursor'
import { Hud } from './dom/Hud'
import { dropBootCopy, HeroCopyLayer } from './dom/HeroCopy'
import { Hero } from './dom/sections/Hero'
import { About } from './dom/sections/About'
import { Works } from './dom/sections/Works'
import { Experience } from './dom/sections/Experience'
import { Contact } from './dom/sections/Contact'
import { CaseStudy } from './dom/CaseStudy'
import { ChatWidget } from './dom/chat/ChatWidget'

const Stage = lazy(() => import('./gl/Stage'))

export function App() {
  const mode = useStore((s) => s.mode)
  const isTouch = useStore((s) => s.isTouch)

  useEffect(() => {
    const stopScroll = initScroll(mode === 'webgl')
    const stopPointer = initPointer()

    track(
      'fonts',
      Promise.race([
        Promise.all([
          document.fonts.load('600 1em "Bricolage Grotesque"'),
          document.fonts.load('400 1em "Bricolage Grotesque"'),
          document.fonts.load('400 1em "JetBrains Mono"'),
          document.fonts.load('500 1em "Space Grotesk Variable"'),
          document.fonts.load('italic 400 1em "Instrument Serif"'),
        ]),
        timeout(4000),
      ]),
    ).then(() => {
      useStore.getState().set({ layoutKey: useStore.getState().layoutKey + 1 })
      ScrollTrigger.refresh()
    })

    // The hero's poster (its first paint, and the whole hero without WebGL).
    const poster = document.querySelector<HTMLImageElement>('.hero-poster img')
    track('hero', Promise.race([poster?.decode().catch(() => {}) ?? Promise.resolve(), timeout(5000)]))

    if (mode === 'static') {
      dropBootCopy()
      const img = new Image()
      img.src = `${about.photo.base}-${about.photo.widths[0]}.webp`
      track('still', Promise.race([img.decode().catch(() => {}), timeout(4000)]))
      document.body.classList.add('static-grain')
    }

    // Re-split text when the width actually changes (not on mobile URL-bar height jitter).
    let lastW = window.innerWidth
    let timer = 0
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (window.innerWidth === lastW) return
        lastW = window.innerWidth
        useStore.getState().set({ layoutKey: useStore.getState().layoutKey + 1 })
        ScrollTrigger.refresh()
      }, 220)
    }
    window.addEventListener('resize', onResize)
    return () => {
      stopScroll()
      stopPointer()
      window.removeEventListener('resize', onResize)
    }
  }, [mode])

  return (
    <>
      <a className="sr-only-focusable mono fixed left-4 top-4 z-[200] bg-[var(--base)] px-3 py-2" href="#about">
        Skip to content
      </a>
      {mode === 'webgl' && (
        <Suspense fallback={null}>
          <Stage />
        </Suspense>
      )}
      <Hud />
      {/* The hero's copy, over the robot's fixed canvas (src/dom/HeroCopy.tsx). */}
      {mode === 'webgl' && <HeroCopyLayer />}
      <main id="main" className="relative z-10">
        <Hero />
        {/* Portal target: the hero transition only fades this wrapper in as About arrives. */}
        <div data-hero-portal-target>
          <About />
        </div>
        <Works />
        <Experience />
        <Contact />
      </main>
      <ChatWidget />
      <CaseStudy />
      {!isTouch && <Cursor />}
      <Loader />
    </>
  )
}
