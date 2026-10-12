/**
 * The reel window: the focused exhibit's reel shown by the browser itself, in a DOM box laid exactly over
 * the exhibit's screen.
 *
 * The exhibits are WebGL textures, and the scene renders at 1x (or less) on phones and integrated GPUs and
 * goes through bloom, tone mapping and grain: a 1080p reel drawn that way loses most of its pixels (a 390 px
 * phone at DPR 3 shows a third of them). Over the focused exhibit the reel's own <video> (the same element
 * the texture reads, so the same frame) is composited by the browser at the display's resolution instead:
 * its box is the screen's size on screen (so it is drawn about 1:1) and a projective transform lays its
 * corners on the screen's, which settle on whole device pixels. It fades out as the exhibit leaves the
 * centre, where the texture takes over again. The exhibit's Details chip shows through a hole.
 */
import type { Reel } from './reels'

let el: HTMLDivElement | null = null
let shown: Reel | null = null
let alpha = 0

function host() {
  if (el) return el
  el = document.createElement('div')
  el.className = 'reel-window'
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

/**
 * Called every frame by the focused exhibit (WorksGallery). `quad`: its screen's corners in CSS px, top-left,
 * top-right, bottom-right, bottom-left ([x, y] x 4); `target`: how much it should show (0..1); `hole`: the
 * chip's box in the screen's fractions (left, top, right, bottom), or null.
 */
export function placeReelWindow(reel: Reel | null, quad: number[] | null, target: number, dt: number, hole: number[] | null) {
  const want = reel?.ready && quad ? target : 0
  alpha += (want - alpha) * Math.min(1, dt * 9)
  if (want === 0 && alpha < 0.01) alpha = 0
  if (!el && alpha === 0) return
  const w = host()
  if (want > 0 && reel && shown !== reel) {
    // The reel's element may be in the case study (it moves it there and back): take it only when free.
    if (!reel.video.parentElement || reel.video.parentElement === w) {
      w.replaceChildren(reel.video)
      shown = reel
      alpha = 0
    }
  }
  if (shown && shown.video.parentElement !== w) shown = null
  const visible = alpha > 0.002 && !!shown && !!quad
  w.style.opacity = visible ? alpha.toFixed(3) : '0'
  w.style.visibility = visible ? 'visible' : 'hidden'
  if (!visible || !quad) return
  const d = window.devicePixelRatio || 1
  const q = quad.map((v) => Math.round(v * d) / d)
  const bw = Math.max(1, Math.round(Math.hypot(q[2] - q[0], q[3] - q[1])))
  const bh = Math.max(1, Math.round(Math.hypot(q[6] - q[0], q[7] - q[1])))
  w.style.width = `${bw}px`
  w.style.height = `${bh}px`
  w.style.transform = `${projective(q)} scale(${1 / bw}, ${1 / bh})`
  const clip = hole
    ? `path(evenodd, "M0 0H${bw}V${bh}H0Z M${(hole[0] * bw).toFixed(1)} ${(hole[1] * bh).toFixed(1)}H${(hole[2] * bw).toFixed(1)}V${(hole[3] * bh).toFixed(1)}H${(hole[0] * bw).toFixed(1)}Z")`
    : ''
  if (w.style.clipPath !== clip) w.style.clipPath = clip
}

/** Hide it now (the gallery unmounts). */
export function hideReelWindow() {
  alpha = 0
  if (el) {
    el.style.opacity = '0'
    el.style.visibility = 'hidden'
  }
}

/**
 * The unit square onto the quad (Heckbert's square-to-quad), as a CSS matrix: (0,0) to its top-left, (1,0)
 * top-right, (1,1) bottom-right, (0,1) bottom-left.
 */
function projective(q: number[]) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  let g = 0
  let h = 0
  if (Math.abs(sx) > 1e-6 || Math.abs(sy) > 1e-6) {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9
    g = (sx * dy2 - dx2 * sy) / den
    h = (dx1 * sy - sx * dy1) / den
  }
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + h * x3
  const dd = y1 - y0 + g * y1
  const e = y3 - y0 + h * y3
  return `matrix3d(${a},${dd},0,${g},${b},${e},0,${h},0,0,1,0,${x0},${y0},0,1)`
}
