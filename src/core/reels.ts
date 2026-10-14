/**
 * Project reels. One muted, looping <video> per project, shared by the 3D
 * exhibit (as a texture) and the case study (in the DOM): opening a case study
 * continues the exact frame the exhibit was showing. Where the exhibit runs
 * the 720p file, the case study crossfades to 1080p once it is seeked into sync.
 *
 * Nothing is fetched until Works is near. Then the centred exhibit buffers and
 * its neighbours fetch just their first frame; only the centred one plays, and
 * only while it is on screen.
 */
import { projects } from '../content'
import { signals, useStore } from '../store/useStore'
import { clamp, gsap, onTick } from './clock'
import { worksTrack } from './timeline'
import { visibility } from '../theme'
import { exhibitRects } from './registry'
import { labOff } from './perfLab'

export interface Reel {
  video: HTMLVideoElement
  src: string
  /** Showing its poster frame (media.start) or later: safe to display. */
  ready: boolean
}

const isVideo = (src?: string) => !!src && /\.(mp4|webm)$/i.test(src)
const reels: (Reel | null)[] = projects.map(() => null)
/** Case study currently holding a reel: it plays, everything else pauses. */
let owner: number | null = null
let exhibits = false
let ticking = false

export const saveData = () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
/** Data saver, or a 2G/3G-class connection: the 720p file only (never an upscaled lower one). */
const slowNet = () => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !!c && (!!c.saveData || /2g|3g/.test(c.effectiveType ?? ''))
}

function makeVideo(src: string) {
  const v = document.createElement('video')
  v.muted = v.defaultMuted = true
  v.loop = v.playsInline = true
  v.setAttribute('muted', '')
  v.setAttribute('playsinline', '')
  v.setAttribute('aria-hidden', 'true')
  v.disablePictureInPicture = true
  v.disableRemotePlayback = true
  // Same-origin today; keeps the WebGL texture untainted if served from a CDN.
  v.crossOrigin = 'anonymous'
  v.preload = 'metadata'
  v.src = src
  return v
}

/** Seek to `start` once metadata is in; resolve when that frame is decoded. */
function primeAt(v: HTMLVideoElement, start: number, done: () => void) {
  const go = () => {
    if (start > 0 && start < v.duration) {
      v.addEventListener('seeked', done, { once: true })
      v.currentTime = start
    } else if (v.readyState >= 2) done()
    else v.addEventListener('loadeddata', done, { once: true })
  }
  if (v.readyState >= 1) go()
  else v.addEventListener('loadedmetadata', go, { once: true })
}

/**
 * Discrete GPUs get the 1080p file on the exhibit too (mipmapped, see
 * WorksGallery): sharper on a large screen, and the case study then already
 * has full quality without a second decoder. Integrated GPUs and phones get
 * 720p, which uploads in under half the bandwidth; their case study crossfades
 * to 1080p.
 */
export const hiResExhibits = () => {
  const s = useStore.getState()
  return s.quality === 'high' && !s.lite && !s.isTouch && window.innerWidth >= 1000 && !saveData()
}

/** Dev-only: ?noreels keeps exhibits on their posters, for profiling. */
const noReels = (import.meta.env.DEV && new URLSearchParams(location.search).has('noreels')) || labOff('videos')

function reelSrc(i: number) {
  const m = projects[i]?.media
  if (!m || !isVideo(m.src) || noReels) return null
  if (hiResExhibits()) return m.src
  // The focused reel is shown at the display's resolution (src/core/reelWindow.ts): 1080p wherever the
  // screen's box has more device pixels across than the 720p file (1280), short of a slow connection.
  const across = (exhibitRects[i]?.()?.width ?? window.innerWidth * 0.6) * (window.devicePixelRatio || 1)
  return across > 1280 * 1.1 && !slowNet() ? m.src : (m.preview ?? m.src)
}

/** The shared reel for project i, created on first call. Null when it has no video. */
export function reel(i: number, eager = false): Reel | null {
  const m = projects[i]?.media
  const src = reelSrc(i)
  if (!m || !src) return null
  let r = reels[i]
  if (!r) {
    const v = makeVideo(src)
    const fresh: Reel = { video: v, src, ready: false }
    primeAt(v, m.start ?? 0, () => (fresh.ready = true))
    r = reels[i] = fresh
    startTicking()
  }
  if (eager) r.video.preload = 'auto'
  return r
}

function want(r: Reel | null, on: boolean) {
  if (!r) return
  const v = r.video
  if (on) {
    if (v.paused && r.ready) v.play().catch(() => {})
  } else if (!v.paused) v.pause()
}

function startTicking() {
  if (ticking) return
  ticking = true
  onTick(() => {
    if (document.hidden) {
      reels.forEach((r) => want(r, false))
      return
    }
    if (owner !== null) {
      reels.forEach((r, i) => i !== owner && want(r, false))
      return
    }
    if (!exhibits) return
    const n = projects.length
    const [a, b] = visibility.works
    const t = signals.t
    const { k } = worksTrack(signals.progress.works)
    const focus = Math.round(clamp(k, 0, n - 1))
    if (t > a - 0.6 && t < b + 0.2 && !saveData()) {
      reel(focus, true)
      if (focus > 0) reel(focus - 1)
      if (focus < n - 1) reel(focus + 1)
    }
    const onStage = t > a && t < b && !signals.heroCovers && !signals.contactCovers && !signals.paused
    reels.forEach((r, i) => want(r, onStage && i === focus && Math.abs(k - i) < 0.5))
  }, 50)
}

/** The WebGL gallery drives exhibit playback while mounted. */
export function driveExhibits() {
  exhibits = true
  startTicking()
  return () => {
    exhibits = false
    reels.forEach((r, i) => i !== owner && want(r, false))
  }
}

/** Current reel of project i, without creating it. */
export const peekReel = (i: number) => reels[i]

// ---------------------------------------------------------------- Case study

interface Hold {
  index: number
  hd: HTMLVideoElement | null
  /** The element currently on top (preview, or HD once it has faded in). */
  front: HTMLVideoElement | null
  dispose: () => void
}
let hold: Hold | null = null

/** Wrap a time into [0, d). */
const wrap = (t: number, d: number) => ((t % d) + d) % d

/** Seconds of media buffered beyond the playhead. */
function bufferedAhead(v: HTMLVideoElement) {
  const b = v.buffered
  for (let i = 0; i < b.length; i++) {
    if (b.start(i) <= v.currentTime + 0.05 && b.end(i) > v.currentTime) return b.end(i) - v.currentTime
  }
  return 0
}

/**
 * Show project i's reel in `host`. The preview element moves in at its current
 * frame and keeps playing; on large screens the HD file loads behind it,
 * seeks to the same moment and crossfades over it. Reduced motion: HD only,
 * paused on the poster, with native controls.
 */
export function mountReel(i: number, host: HTMLElement) {
  unmountReel()
  const m = projects[i]?.media
  if (!m || !isVideo(m.src)) return
  const store = useStore.getState()
  const cls = 'absolute inset-0 h-full w-full object-cover'
  const disposers: (() => void)[] = []
  const h: Hold = { index: i, hd: null, front: null, dispose: () => disposers.forEach((d) => d()) }
  hold = h
  owner = i
  startTicking()

  // The details view is where the reel is watched: HD from any box the 720p
  // file would not already fill pixel for pixel, short of data saver.
  const wide = host.clientWidth * Math.min(window.devicePixelRatio || 1, 2) > 960
  const hdSrc = wide && !slowNet() ? m.src : (m.preview ?? m.src)

  if (store.reducedMotion) {
    const v = makeVideo(hdSrc)
    v.className = cls
    v.controls = true
    v.removeAttribute('aria-hidden')
    v.setAttribute('aria-label', `${projects[i].title} demo reel`)
    if (m.poster) v.poster = m.poster
    primeAt(v, m.start ?? 0, () => {})
    host.appendChild(v)
    h.hd = h.front = v
    disposers.push(() => free(v))
    return
  }

  const r = reel(i, true)!
  const pv = r.video
  pv.className = cls
  pv.style.opacity = r.ready ? '1' : '0'
  host.appendChild(pv)
  h.front = pv
  // A preview that was never primed fades in over the poster when its first frame lands.
  let fadeIn = 0
  if (!r.ready) {
    fadeIn = window.setInterval(() => {
      if (!r.ready) return
      clearInterval(fadeIn)
      gsap.to(pv, { opacity: 1, duration: 0.5, ease: 'power2.out' })
    }, 50)
  }
  // The preview plays until the HD copy has fully faded in over it.
  const keepPlaying = onTick(() => want(r, h.front === pv), 51)
  disposers.push(() => {
    clearInterval(fadeIn)
    keepPlaying()
    gsap.killTweensOf(pv)
    pv.style.opacity = ''
    pv.className = ''
    pv.remove()
  })

  if (hdSrc === r.src || hdSrc !== m.src) return

  // HD upgrade: park the HD copy (paused) a little ahead of the preview, start
  // it the moment the preview reaches that frame, confirm the two agree, then
  // crossfade. A miss doubles the lead and tries again; it never fades out of sync.
  const hd = makeVideo(hdSrc)
  hd.className = cls
  hd.preload = 'auto'
  hd.style.opacity = '0'
  host.appendChild(hd)
  h.hd = hd
  let lead = 0.4
  let phase: 'seeking' | 'armed' | 'starting' | 'fading' | 'done' = 'seeking'
  let startedAt = 0
  /** How far HD is ahead of the preview, in seconds (negative: behind). */
  const delta = () => {
    const d = hd.duration
    return wrap(hd.currentTime - pv.currentTime + d / 2, d) - d / 2
  }
  let seekFrom = 0
  const park = () => {
    phase = 'seeking'
    seekFrom = performance.now()
    hd.pause()
    hd.currentTime = wrap(pv.currentTime + lead, hd.duration)
  }
  const retry = () => {
    lead = Math.min(lead * 1.5, 3)
    park()
  }
  hd.addEventListener('loadedmetadata', park, { once: true })
  hd.addEventListener('seeked', () => {
    if (phase !== 'seeking') return
    // Lead with what a seek actually costs on this device.
    lead = Math.min(3, Math.max(lead, ((performance.now() - seekFrom) / 1000) * 1.5 + 0.15))
    phase = 'armed'
  })
  hd.addEventListener('playing', () => (startedAt = performance.now()))
  const stopSync = onTick(() => {
    if (phase === 'done' || !hd.duration || pv.paused) return
    const dt = delta()
    if (phase === 'armed') {
      if (dt < -0.05) retry()
      // Only start with a second in hand, so it cannot stall mid-fade.
      else if (dt <= 0.017 && bufferedAhead(hd) > 1) {
        phase = 'starting'
        startedAt = 0
        hd.play().catch(() => {})
      }
    } else if (phase === 'starting' && startedAt && performance.now() - startedAt > 250) {
      if (Math.abs(dt) > 0.04) return retry()
      phase = 'fading'
      gsap.to(hd, {
        opacity: 1,
        duration: 0.6,
        ease: 'power2.inOut',
        onComplete: () => {
          phase = 'done'
          h.front = hd
        },
      })
    } else if (phase === 'fading' && Math.abs(dt) > 0.06) {
      // Slipped mid-fade (a stall): hide it again and re-sync.
      gsap.killTweensOf(hd)
      hd.style.opacity = '0'
      retry()
    }
  }, 52)
  disposers.push(() => {
    stopSync()
    gsap.killTweensOf(hd)
    free(hd)
  })
}

/**
 * Called as the case study starts closing: the exhibit is about to show the
 * preview again, so bring it to wherever the HD copy got to.
 */
export function handBackReel() {
  const h = hold
  if (!h || !h.hd || h.front !== h.hd) return
  const r = reels[h.index]
  if (!r || !h.hd.duration) return
  r.video.currentTime = wrap(h.hd.currentTime + 0.1, r.video.duration || h.hd.duration)
  // Resume the preview underneath the (still visible) HD copy.
  h.front = r.video
}

export function unmountReel() {
  if (!hold) return
  hold.dispose()
  hold = null
  owner = null
}

/** Stop a video and let the browser release its decoder and buffer. */
function free(v: HTMLVideoElement) {
  v.pause()
  v.removeAttribute('src')
  v.load()
  v.remove()
}
