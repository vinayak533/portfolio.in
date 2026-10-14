/**
 * The hero's last-resort tier (HERO_SPEC.md "Tiers"): a pre-rendered loop of the hero itself (public/hero/loop-*,
 * captured from the real scene by scripts/hero-loop.mjs) in the poster's place, so the hero costs a video's
 * decode instead of two WebGL scenes. Taken only where nothing else holds:
 *
 * - WebGL, but even LOW cannot keep a steady 30 (the engine says so: RobotOptions.onStruggling). The loop
 *   covers the hero while it rests at the top and the live scene sleeps under it (no robot frame, no
 *   landscape: stageCues.loop). The scroll's hand-off is still the live scene: as the hero starts to move the
 *   scene wakes and crossfades back over the loop (the poster's 300 ms), and after a moment back at rest the
 *   loop covers it again. The docked head is the engine's, drawn only when it changes.
 * - No WebGL, or a software renderer (main.tsx: static mode), without reduced motion: the loop is the hero.
 *
 * Never with reduced motion, Save-Data or ?freeze. The copy is the real DOM text over it either way.
 */
import { onTick } from '../core/clock'
import { labOff } from '../core/perfLab'
import { stageCues } from './robot/dom'
import { heroScroll } from './motion'
import { FROZEN } from './freeze'

/** The loops per framing (the posters' framings: Hero.tsx POSTER). H.264 first: hardware-decoded nearly everywhere. */
export const LOOP = {
  phone: '/hero/loop-phone',
  tablet: '/hero/loop-tablet',
  desktop: '/hero/loop-desktop',
}

/** The hero counts as at rest below this scroll progress (the hand-off has not begun to show). */
const REST = 0.002
/** How long it must rest before the loop covers the live scene again (ms). */
const SETTLE_MS = 1200
/** The crossfade (the poster's: hero.css --dur-swap). */
const FADE_MS = 300

/** A software renderer (WebGL with no GPU behind it): the hero is better as its loop. */
export const softwareRenderer = (gpu: string) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)

/** Whether the loop may play at all on this visit. */
export function loopAllowed(): boolean {
  if (FROZEN || labOff('loop')) return false
  const nav = navigator as Navigator & { connection?: { saveData?: boolean } }
  if (nav.connection?.saveData) return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function framing() {
  if (window.matchMedia('(max-width: 767px)').matches) return LOOP.phone
  if (window.matchMedia('(orientation: portrait)').matches) return LOOP.tablet
  return LOOP.desktop
}

export interface LoopHandle {
  dispose(): void
}

/**
 * Starts the loop in `host` (.hero-cinematic). `live`: a WebGL scene is under it (it covers only at rest, and
 * the scene sleeps meanwhile); otherwise it is the hero whenever the hero can be seen.
 */
export function startLoop(host: HTMLElement, live: boolean): LoopHandle | null {
  if (!loopAllowed()) return null
  const video = document.createElement('video')
  video.className = 'hero-loop'
  video.muted = true
  video.defaultMuted = true
  video.loop = true
  video.playsInline = true
  video.preload = 'auto'
  video.disablePictureInPicture = true
  video.setAttribute('muted', '')
  video.setAttribute('playsinline', '')
  video.setAttribute('aria-hidden', 'true')
  video.setAttribute('disableremoteplayback', '')
  video.tabIndex = -1
  // Its first frame is the poster's (the same framing).
  const poster = host.querySelector<HTMLImageElement>('.hero-poster img')
  if (poster?.currentSrc) video.poster = poster.currentSrc
  const base = framing()
  for (const [ext, type] of [
    ['mp4', 'video/mp4; codecs="avc1.640028"'],
    ['webm', 'video/webm; codecs="vp9"'],
  ]) {
    const s = document.createElement('source')
    s.src = `${base}.${ext}`
    s.type = type
    video.appendChild(s)
  }
  // Over the poster and the stage, under the grain (and the vignette, the scrim and the copy).
  host.insertBefore(video, host.querySelector('.hero-grain'))

  let disposed = false
  let playable = false
  let covering = false
  let restMs = 0
  let hideTimer = 0
  let coverTimer = 0

  /** Resolves to the refusal's name, '' when it plays ('AbortError': paused again before it started, harmless). */
  const play = () => video.play().then(() => '', (e: unknown) => (e instanceof DOMException ? e.name : 'Error'))

  function cover() {
    if (covering || disposed) return
    covering = true
    window.clearTimeout(hideTimer)
    void play()
    host.setAttribute('data-loop', '')
    document.documentElement.setAttribute('data-hero-loop', '')
    // Once it is opaque, the live scene under it sleeps.
    window.clearTimeout(coverTimer)
    coverTimer = window.setTimeout(() => (stageCues.loop = covering), FADE_MS)
  }

  function uncover() {
    if (!covering) return
    covering = false
    window.clearTimeout(coverTimer)
    // The scene wakes first: its next frame is drawn while the loop fades off it.
    stageCues.loop = false
    host.removeAttribute('data-loop')
    document.documentElement.removeAttribute('data-hero-loop')
    hideTimer = window.setTimeout(() => !covering && video.pause(), FADE_MS + 50)
  }

  const onPlaying = () => {
    if (playable) return
    playable = true
    if (!live) cover()
    // (Under a live scene it waits, paused, for the hero to rest.)
    else if (!covering) video.pause()
  }
  video.addEventListener('playing', onPlaying)
  // A loop that cannot play (no codec it can decode, autoplay refused: a battery saver) leaves the hero as it was.
  const fail = () => dispose()
  video.lastElementChild?.addEventListener('error', fail)
  video.addEventListener('error', fail)
  void play().then((refused) => refused && refused !== 'AbortError' && dispose())

  // With a live scene: cover at rest, wake the scene as the hand-off begins.
  const stopTick = live
    ? onTick((_t, dt) => {
        if (!playable) return
        const rest = heroScroll.p <= REST && !document.hidden
        if (!rest) {
          restMs = 0
          uncover()
          return
        }
        restMs += dt * 1000
        if (!covering && restMs >= SETTLE_MS) cover()
      })
    : () => {}

  // Never decoding off screen.
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) video.pause()
    else if (covering) void play()
  })
  io.observe(host)

  function dispose() {
    if (disposed) return
    disposed = true
    stopTick()
    io.disconnect()
    uncover()
    window.clearTimeout(hideTimer)
    window.clearTimeout(coverTimer)
    video.removeEventListener('playing', onPlaying)
    video.pause()
    video.removeAttribute('src')
    video.replaceChildren()
    video.load()
    video.remove()
  }

  return { dispose }
}
