/**
 * The hero's deep-space backdrop, rebuilt from the reference photo
 * (scripts/prepare-space.mjs): the nebula as a soft image, and every star
 * redrawn crisp at the screen's resolution, so it holds up on any display.
 *
 * Portrait screens see the photo as shot. Landscape screens see it
 * transposed (mirrored across its diagonal): the same sky, the same stars,
 * and the nebula still crossing from lower left to upper right, framed
 * without upscaling a narrow strip. Drawn once per size; nothing animates.
 *
 * Restrained for the hero's composition: the nebula is kept only as a faint,
 * heavily blurred violet haze in the lower-left and upper-right corners, the
 * stars read as fine dust at half brightness, and only the few brightest
 * (BRIGHT) keep a little sparkle. Phones draw about half the dust.
 */
import stars from './stars.json'

export const NEBULA_URL = '/hero/space-nebula.webp'

type Star = [x: number, y: number, r: number, b: number, hex: string, spike: number]

/** How many of the brightest stars stay bright (with a small sparkle); the rest are dust. */
const BRIGHT = 5
/** Nebula haze opacity. */
const HAZE = 0.25

/** Star indices, brightest first. */
const byBrightness = (stars.stars as Star[])
  .map((s, i) => [s[3] * s[2], i] as const)
  .sort((a, b) => b[0] - a[0])
  .map(([, i]) => i)

export interface SpaceHandle {
  dispose(): void
}

export function mountSpace(host: HTMLElement): SpaceHandle {
  const canvas = document.createElement('canvas')
  canvas.className = 'hero-space'
  canvas.setAttribute('aria-hidden', 'true')
  host.prepend(canvas)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return { dispose: () => canvas.remove() }

  const nebula = new Image()
  nebula.decoding = 'async'
  nebula.src = NEBULA_URL
  let ready = false
  let drawn = ''

  function draw() {
    const W = Math.max(1, host.clientWidth)
    const H = Math.max(1, host.clientHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const key = `${W}x${H}@${dpr}:${ready}`
    if (key === drawn || !ctx) return
    drawn = key
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)

    const flip = W > H
    const sw = flip ? stars.h : stars.w
    const sh = flip ? stars.w : stars.h
    const k = Math.max(W / sw, H / sh)
    const ox = (W - sw * k) / 2
    const oy = (H - sh * k) / 2

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = '#05040a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    if (ready) drawHaze(ctx, nebula, W, H, dpr, k, ox, oy, flip)

    // Stars add light on top of the nebula, as they do in the photo.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'lighter'
    // Sizes follow the framing, within limits: never sub-pixel mush, never blobs.
    const sizeK = Math.min(1.5, Math.max(0.75, k))
    const sparse = W < 768
    const at = (i: number) => {
      const [sx, sy] = (stars.stars as Star[])[i]
      return [ox + (flip ? sy : sx) * k, oy + (flip ? sx : sy) * k]
    }
    // The bright few: on screen, clear of the header, the intro copy (hero.css .hero-intro) and
    // the robot's column (engine.ts layout: about 64% across on desktop, centred on phones).
    const copyR = W >= 768 ? W * 0.08 + Math.min(560, W * 0.44) + 24 : W
    const copyT = W >= 768 ? H * 0.2 : H * 0.45
    const copyB = W >= 768 ? H * 0.8 : H
    const [robotL, robotR] = W >= 1200 ? [0.46, 0.83] : W >= 768 ? [0.5, 0.97] : [0.14, 0.86]
    const brightest = new Set<number>()
    for (const i of byBrightness) {
      if (brightest.size >= BRIGHT) break
      const [x, y] = at(i)
      if (x < 16 || y < 96 || x > W - 16 || y > H - 16) continue
      if (x < copyR && y > copyT && y < copyB) continue
      if (x > W * robotL && x < W * robotR) continue
      brightest.add(i)
    }
    ;(stars.stars as Star[]).forEach((s, i) => {
      const [, , r, b, hex, spike] = s
      const bright = brightest.has(i)
      if (sparse && !bright && i % 2) return
      const [x, y] = at(i)
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) return
      // Dust: smaller and at half brightness; the few bright ones keep their size.
      const sigma = Math.max(0.36, r * sizeK * (bright ? 0.9 : 0.55))
      const R = sigma * 3
      const rgb = hexRgb(hex)
      const a = Math.min(1, b * (bright ? 1 : 0.55))
      const g = ctx.createRadialGradient(x, y, 0, x, y, R)
      g.addColorStop(0, rgba(rgb, a))
      g.addColorStop(0.33, rgba(rgb, a * 0.6))
      g.addColorStop(0.66, rgba(rgb, a * 0.13))
      g.addColorStop(1, rgba(rgb, 0))
      ctx.fillStyle = g
      ctx.fillRect(x - R, y - R, R * 2, R * 2)
      if (bright) sparkle(ctx, x, y, Math.min(spike || 10, 12) * sizeK, rgb)
    })
    ctx.globalCompositeOperation = 'source-over'
  }

  nebula.decode().then(
    () => {
      ready = true
      drawn = ''
      draw()
    },
    () => {},
  )

  const observer = new ResizeObserver(() => draw())
  observer.observe(host)
  draw()

  return {
    dispose() {
      observer.disconnect()
      canvas.remove()
    },
  }
}

/**
 * The nebula as haze: drawn tiny and scaled back up (a cheap, heavy blur that
 * works in every browser), kept only in the lower-left and upper-right
 * corners, at HAZE opacity.
 */
function drawHaze(
  ctx: CanvasRenderingContext2D,
  nebula: HTMLImageElement,
  W: number,
  H: number,
  dpr: number,
  k: number,
  ox: number,
  oy: number,
  flip: boolean,
) {
  const q = 1 / 24
  const w = Math.max(2, Math.round(W * q))
  const h = Math.max(2, Math.round(H * q))
  const small = document.createElement('canvas')
  small.width = w
  small.height = h
  const g = small.getContext('2d')
  if (!g) return
  g.setTransform(k * q, 0, 0, k * q, ox * q, oy * q)
  if (flip) g.transform(0, 1, 1, 0, 0, 0)
  g.imageSmoothingQuality = 'high'
  g.drawImage(nebula, 0, 0)
  // Keep the two corners only.
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'destination-in'
  const mask = document.createElement('canvas')
  mask.width = w
  mask.height = h
  const m = mask.getContext('2d')!
  const R = Math.max(w, h) * 0.62
  for (const [cx, cy] of [
    [0, h],
    [w, 0],
  ]) {
    const grad = m.createRadialGradient(cx, cy, 0, cx, cy, R)
    grad.addColorStop(0, 'rgba(0,0,0,1)')
    grad.addColorStop(0.55, 'rgba(0,0,0,0.45)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    m.fillStyle = grad
    m.fillRect(0, 0, w, h)
  }
  g.drawImage(mask, 0, 0)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = HAZE
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, W, H)
  ctx.globalAlpha = 1
}

/** A photographed sparkle: four long diagonal rays, four short ones on the axes, a soft halo. */
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, rgb: [number, number, number]) {
  const halo = ctx.createRadialGradient(x, y, 0, x, y, len * 0.45)
  halo.addColorStop(0, rgba(rgb, 0.55))
  halo.addColorStop(0.25, rgba(rgb, 0.16))
  halo.addColorStop(1, rgba(rgb, 0))
  ctx.fillStyle = halo
  ctx.fillRect(x - len, y - len, len * 2, len * 2)
  for (let i = 0; i < 8; i++) {
    const diag = i % 2 === 0
    const ang = (i * Math.PI) / 4 + Math.PI / 4
    const l = diag ? len : len * 0.55
    const w = diag ? 1.1 : 0.8
    const ex = x + Math.cos(ang) * l
    const ey = y + Math.sin(ang) * l
    const g = ctx.createLinearGradient(x, y, ex, ey)
    g.addColorStop(0, rgba(rgb, diag ? 0.9 : 0.7))
    g.addColorStop(0.35, rgba(rgb, diag ? 0.32 : 0.2))
    g.addColorStop(1, rgba(rgb, 0))
    ctx.strokeStyle = g
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(ex, ey)
    ctx.stroke()
  }
}

/** 3-digit hex (the star table's colours) to RGB. */
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16)
  return [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
}

const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${a.toFixed(3)})`
