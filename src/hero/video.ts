import { ClampToEdgeWrapping, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, VideoTexture } from 'three'

/**
 * The laptop screen's video: a hidden, muted, looping <video> (no controls, no
 * audio) whose frames become a texture. The engine says each frame whether it
 * should play and whether it may hold GPU memory; this file does the rest:
 *
 * - Autoplay. If the browser blocks it, the first frame still shows and
 *   playback starts on the first scroll, wheel, touch, click or key press. No
 *   play button.
 * - GPU. The texture exists only while `gpu` is true (released once About has
 *   taken over, rebuilt on the way back). It is updated only when the video
 *   presents a new frame.
 * - Average colour. Every `sampleMs` a 16 x 9 copy of the frame is averaged
 *   (linear light) for the light the screen spills on the scene.
 *
 * Frames are uploaded as they are (display-encoded, NoColorSpace) and
 * final.frag shows them without a transfer, so colours match the file.
 */

export interface ScreenVideoOptions {
  sources: { src: string; type: string }[]
  sampleMs: number
}

export interface ScreenVideo {
  /** The texture while the video holds a frame on the GPU; null otherwise. */
  readonly texture: VideoTexture | null
  /** Width / height of the video (0 until its metadata is known). */
  readonly aspect: number
  /** Average colour of the current frame, linear RGB, eased. */
  readonly average: [number, number, number]
  /** Every source failed to load (missing or undecodable file). */
  readonly failed: boolean
  /** Called every frame (and on every visibility change) by the engine. */
  update(want: { play: boolean; gpu: boolean }, dt: number): void
  dispose(): void
}

const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'keydown', 'wheel', 'scroll', 'click'] as const

const toLinear = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function createScreenVideo(container: HTMLElement, opts: ScreenVideoOptions, maxAnisotropy: number): ScreenVideo {
  const video = document.createElement('video')
  video.muted = true
  video.defaultMuted = true
  video.loop = true
  video.playsInline = true
  video.autoplay = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.controls = false
  video.disablePictureInPicture = true
  video.setAttribute('muted', '')
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.setAttribute('disableremoteplayback', '')
  video.setAttribute('aria-hidden', 'true')
  video.tabIndex = -1
  // In the DOM (some browsers will not decode a detached video) but invisible and inert.
  video.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;'

  let failed = false
  let errors = 0
  for (const s of opts.sources) {
    const el = document.createElement('source')
    el.src = s.src
    el.type = s.type
    el.addEventListener('error', () => {
      errors++
      if (errors >= opts.sources.length) {
        failed = true
        if (import.meta.env.DEV) console.info('[hero] no screen video found (public/video/screen.mp4 / .webm); the screen keeps its art')
      }
    })
    video.appendChild(el)
  }
  container.appendChild(video)

  let texture: VideoTexture | null = null
  let hasFrame = false
  let wantPlay = false
  let blocked = false
  let playing = false
  let pending: Promise<void> | null = null

  const onFrameData = () => {
    hasFrame = true
    if (texture) texture.needsUpdate = true
  }
  video.addEventListener('loadeddata', onFrameData)
  video.addEventListener('seeked', onFrameData)
  video.addEventListener('playing', () => (playing = true))
  video.addEventListener('pause', () => (playing = false))

  // ---- autoplay, and the unlock when it is blocked
  let armed = false
  const unlock = () => {
    if (!wantPlay) return
    tryPlay()
  }
  const arm = (on: boolean) => {
    if (on === armed) return
    armed = on
    for (const ev of UNLOCK_EVENTS) {
      if (on) window.addEventListener(ev, unlock, { capture: true, passive: true })
      else window.removeEventListener(ev, unlock, { capture: true })
    }
  }
  function tryPlay() {
    if (pending || failed) return
    pending = video
      .play()
      .then(() => {
        blocked = false
        arm(false)
        // Paused again while play() was settling.
        if (!wantPlay) video.pause()
      })
      .catch((e: DOMException) => {
        if (e?.name === 'NotAllowedError') {
          blocked = true
          arm(true)
        }
      })
      .finally(() => {
        pending = null
      })
  }

  // ---- average colour
  const probe = document.createElement('canvas')
  probe.width = 16
  probe.height = 9
  const pctx = probe.getContext('2d', { willReadFrequently: true })
  const target: [number, number, number] = [0, 0, 0]
  const average: [number, number, number] = [0, 0, 0]
  let lastSample = -Infinity
  let sampled = false
  function sample(now: number) {
    if (!pctx || !hasFrame || video.readyState < 2) return
    if (sampled && (!playing || now - lastSample < opts.sampleMs)) return
    lastSample = now
    try {
      pctx.drawImage(video, 0, 0, 16, 9)
      const d = pctx.getImageData(0, 0, 16, 9).data
      let r = 0
      let g = 0
      let b = 0
      for (let i = 0; i < d.length; i += 4) {
        r += toLinear(d[i])
        g += toLinear(d[i + 1])
        b += toLinear(d[i + 2])
      }
      const n = d.length / 4
      target[0] = r / n
      target[1] = g / n
      target[2] = b / n
      if (!sampled) average.splice(0, 3, ...target)
      sampled = true
    } catch {
      // A cross-origin source without CORS taints the canvas: keep the last colour.
    }
  }

  function makeTexture() {
    const t = new VideoTexture(video)
    t.colorSpace = NoColorSpace
    t.flipY = false // screen uv has (0, 0) at the top-left, like the screen art
    t.generateMipmaps = true // the screen is ~30 px at rest: mips keep it from shimmering
    t.minFilter = LinearMipmapLinearFilter
    t.magFilter = LinearFilter
    t.wrapS = t.wrapT = ClampToEdgeWrapping
    t.anisotropy = maxAnisotropy
    t.needsUpdate = true // the current frame now, even while paused (blocked autoplay shows frame one)
    return t
  }

  return {
    get texture() {
      return texture && hasFrame ? texture : null
    },
    get aspect() {
      return video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 0
    },
    average,
    get failed() {
      return failed
    },
    update(want, dt) {
      if (failed) return
      wantPlay = want.play
      if (wantPlay && video.paused && !blocked) tryPlay()
      else if (!wantPlay && !video.paused && !pending) video.pause()
      if (!wantPlay) arm(false)
      else if (blocked) arm(true)

      if (want.gpu && !texture && hasFrame) texture = makeTexture()
      else if (!want.gpu && texture) {
        texture.dispose()
        texture = null
      }

      if (texture) {
        sample(performance.now())
        const k = 1 - Math.exp(-8 * dt)
        for (let i = 0; i < 3; i++) average[i] += (target[i] - average[i]) * k
      }
    },
    dispose() {
      arm(false)
      wantPlay = false
      video.pause()
      texture?.dispose()
      texture = null
      video.removeEventListener('loadeddata', onFrameData)
      video.removeEventListener('seeked', onFrameData)
      while (video.firstChild) video.firstChild.remove()
      video.removeAttribute('src')
      video.load() // drops the decoder and its buffers
      video.remove()
    },
  }
}
