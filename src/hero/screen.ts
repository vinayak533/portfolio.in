import { about, site } from '../content'
import { loadImage } from './maps'

/**
 * What the laptop shows: the About section itself, so the dive lands on the
 * page it is about to open. The photograph has ~31 x 23 px of screen, which no
 * zoom can rescue, so the page is drawn here at native resolution (16:10, up
 * to 3840 px wide) and composited in perspective at full device resolution by
 * final.frag. Everything is designed on a 1600 x 1000 grid and scaled.
 *
 * The copy comes from content.ts and the portrait from site.portrait, drawn as
 * the same field of light points About renders, in the site palette.
 */

export const DESIGN: [number, number] = [1600, 1000]

export interface ScreenArt {
  canvas: HTMLCanvasElement
  /** Text caret, as a uv rect (x, y, w, h) of the art; final.frag blinks it. Null when the art has none. */
  caret: [number, number, number, number] | null
}

const C = {
  base: '#07070d',
  ink: '#eceaf2',
  ink2: 'rgba(236, 234, 242, 0.62)',
  ink3: 'rgba(236, 234, 242, 0.38)',
  line: 'rgba(236, 234, 242, 0.12)',
  accent: '#7c5cff',
}

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
const SANS = '"Bricolage Grotesque", ui-sans-serif, system-ui, sans-serif'

/** Deterministic noise so the art is identical on every load. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > max) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

function stars(ctx: CanvasRenderingContext2D, rand: () => number, n: number, x0: number, y0: number, w: number, h: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const r = 0.45 + Math.pow(rand(), 3) * 1.25
    const a = alpha * (0.3 + 0.7 * rand())
    const tint = rand()
    ctx.fillStyle = tint < 0.7 ? `rgba(206, 210, 255, ${a})` : tint < 0.9 ? `rgba(184, 160, 255, ${a})` : `rgba(255, 255, 255, ${a})`
    ctx.beginPath()
    ctx.arc(x0 + rand() * w, y0 + rand() * h, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** The portrait as a field of light points over a faint copy of the photo, as About renders it. */
function portrait(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, h: number, rand: () => number) {
  const w = (h * img.naturalWidth) / img.naturalHeight
  const fade = (py: number) => 1 - Math.min(1, Math.max(0, (py - (y + h * 0.66)) / (h * 0.3)))

  // Halo behind the head.
  const halo = ctx.createRadialGradient(x + w * 0.5, y + h * 0.42, 0, x + w * 0.5, y + h * 0.42, w * 0.62)
  halo.addColorStop(0, 'rgba(124, 92, 255, 0.30)')
  halo.addColorStop(0.55, 'rgba(124, 92, 255, 0.10)')
  halo.addColorStop(1, 'rgba(124, 92, 255, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(x - w * 0.2, y - h * 0.1, w * 1.4, h * 1.1)

  // Sample the cutout on a grid.
  const pitch = 4.2
  const cols = Math.round(w / pitch)
  const rows = Math.round(h / pitch)
  const probe = document.createElement('canvas')
  probe.width = cols
  probe.height = rows
  const pctx = probe.getContext('2d', { willReadFrequently: true })!
  pctx.drawImage(img, 0, 0, cols, rows)
  const px = pctx.getImageData(0, 0, cols, rows).data

  // A faint, soft copy of the photo carries the form between the points.
  const soft = document.createElement('canvas')
  soft.width = cols * 2
  soft.height = rows * 2
  const sctx = soft.getContext('2d')!
  sctx.drawImage(img, 0, 0, soft.width, soft.height)
  sctx.globalCompositeOperation = 'destination-in'
  const mask = sctx.createLinearGradient(0, 0, 0, soft.height)
  mask.addColorStop(0.62, 'rgba(0,0,0,1)')
  mask.addColorStop(0.96, 'rgba(0,0,0,0)')
  sctx.fillStyle = mask
  sctx.fillRect(0, 0, soft.width, soft.height)
  ctx.save()
  ctx.globalAlpha = 0.34
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(soft, x, y, w, h)
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const k = (j * cols + i) * 4
      const a = px[k + 3] / 255
      if (a < 0.25) continue
      const cx = x + (i + 0.5 + (rand() - 0.5) * 0.5) * pitch
      const cy = y + (j + 0.5 + (rand() - 0.5) * 0.5) * pitch
      const f = fade(cy)
      if (f <= 0.01) continue
      const r = px[k]
      const g = px[k + 1]
      const b = px[k + 2]
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
      // Lifted and cooled a touch toward the site's violet, like the live render.
      const lift = (v: number, t: number) => Math.min(255, Math.round(v * 1.18 + t))
      const rad = pitch * (0.2 + 0.32 * Math.sqrt(lum))
      ctx.fillStyle = `rgba(${lift(r, 10)}, ${lift(g, 6)}, ${lift(b, 26)}, ${(a * f * (0.55 + 0.45 * lum)).toFixed(3)})`
      ctx.beginPath()
      ctx.arc(cx, cy, rad, 0, Math.PI * 2)
      ctx.fill()
    }
  // Sparks drifting off the silhouette.
  for (let n = 0; n < 260; n++) {
    const i = Math.floor(rand() * cols)
    const j = Math.floor(rand() * rows * 0.75)
    const k = (j * cols + i) * 4
    if (px[k + 3] > 60) continue
    const near = px[k + 3 + 4 * 3] > 60 || px[k + 3 - 4 * 3] > 60 || px[k + 3 + cols * 4 * 3] > 60 || px[k + 3 - cols * 4 * 3] > 60
    if (!near) continue
    ctx.fillStyle = `rgba(210, 200, 255, ${0.35 + rand() * 0.5})`
    ctx.beginPath()
    ctx.arc(x + i * pitch, y + j * pitch, 0.7 + rand() * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** The scan beam that sweeps the portrait in About. */
function beam(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const glow = ctx.createLinearGradient(0, y - 26, 0, y + 26)
  glow.addColorStop(0, 'rgba(124, 92, 255, 0)')
  glow.addColorStop(0.5, 'rgba(124, 92, 255, 0.28)')
  glow.addColorStop(1, 'rgba(124, 92, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(x0, y - 26, x1 - x0, 52)
  const core = ctx.createLinearGradient(x0, 0, x1, 0)
  core.addColorStop(0, 'rgba(200, 190, 255, 0)')
  core.addColorStop(0.18, 'rgba(214, 206, 255, 0.85)')
  core.addColorStop(0.82, 'rgba(236, 232, 255, 1)')
  core.addColorStop(1, 'rgba(200, 190, 255, 0)')
  ctx.fillStyle = core
  ctx.fillRect(x0, y - 1.6, x1 - x0, 3.2)
  ctx.restore()
}

export async function buildScreenArt(width: number): Promise<ScreenArt> {
  const [face] = await Promise.all([
    loadImage(site.portrait.still).catch(() => null),
    Promise.race([
      Promise.all(
        ['400 16px', '600 16px'].map((w) => document.fonts.load(`${w} "JetBrains Mono"`)).concat(['400 16px', '500 16px', '600 16px'].map((w) => document.fonts.load(`${w} "Bricolage Grotesque"`))),
      ).catch(() => {}),
      new Promise((r) => setTimeout(r, 2500)),
    ]),
  ])

  const [DW, DH] = DESIGN
  const W = Math.round(width)
  const H = Math.round((width * DH) / DW)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.scale(W / DW, H / DH)
  ctx.textBaseline = 'alphabetic'
  const rand = lcg(11)

  // ---- the void, a violet bloom from above, stars
  ctx.fillStyle = C.base
  ctx.fillRect(0, 0, DW, DH)
  const bloom = ctx.createRadialGradient(DW * 0.42, -DH * 0.05, 0, DW * 0.42, -DH * 0.05, DW * 0.7)
  bloom.addColorStop(0, 'rgba(98, 78, 196, 0.55)')
  bloom.addColorStop(0.35, 'rgba(70, 54, 150, 0.22)')
  bloom.addColorStop(1, 'rgba(40, 30, 90, 0)')
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, DW, DH)
  stars(ctx, rand, 1100, 0, 0, DW, DH, 0.85)
  stars(ctx, rand, 700, 760, 60, 760, 760, 0.6) // denser dust around the portrait

  // ---- portrait and its scan beam
  const ph = 800
  if (face) portrait(ctx, face, 1150 - (ph * face.naturalWidth) / face.naturalHeight / 2, 120, ph, rand)
  beam(ctx, 700, 1600, 668)

  // ---- HUD: mark, nav pill (About current), lite switch
  ctx.font = `600 17px ${MONO}`
  ctx.letterSpacing = '2.5px'
  ctx.fillStyle = C.ink
  ctx.fillText(site.mark, 48, 66)
  ctx.letterSpacing = '0px'

  const nav = ['Home', 'About', 'Works', 'Experience', 'Contact']
  ctx.font = `500 18px ${SANS}`
  const padX = 22
  const gap = 6
  const widths = nav.map((n) => ctx.measureText(n).width + padX * 2)
  const navW = widths.reduce((a, b) => a + b, 0) + gap * (nav.length - 1) + 12
  let nx = (DW - navW) / 2
  ctx.beginPath()
  ctx.roundRect(nx, 34, navW, 52, 26)
  ctx.fillStyle = 'rgba(16, 15, 30, 0.82)'
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1
  ctx.stroke()
  nx += 6
  nav.forEach((n, i) => {
    if (n === 'About') {
      ctx.beginPath()
      ctx.roundRect(nx, 40, widths[i], 40, 20)
      ctx.fillStyle = 'rgba(124, 92, 255, 0.22)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.75)'
      ctx.stroke()
    }
    ctx.fillStyle = n === 'About' ? C.ink : C.ink2
    ctx.fillText(n, nx + padX, 66)
    nx += widths[i] + gap
  })

  ctx.font = `400 13px ${MONO}`
  ctx.letterSpacing = '2px'
  ctx.fillStyle = C.ink3
  ctx.textAlign = 'right'
  ctx.fillText('LITE', DW - 112, 66)
  ctx.textAlign = 'left'
  ctx.letterSpacing = '0px'
  ctx.beginPath()
  ctx.roundRect(DW - 98, 50, 50, 22, 11)
  ctx.strokeStyle = C.line
  ctx.stroke()
  ctx.fillStyle = C.ink
  ctx.beginPath()
  ctx.arc(DW - 87, 61, 6, 0, Math.PI * 2)
  ctx.fill()

  // ---- copy
  const x = 96
  ctx.font = `400 14px ${MONO}`
  ctx.letterSpacing = '1.2px'
  ctx.fillStyle = C.ink2
  ctx.fillText(`(02) ${about.kicker.toUpperCase()}`, x, 300)
  ctx.letterSpacing = '0px'

  ctx.font = `600 78px ${SANS}`
  ctx.letterSpacing = '-2.7px'
  ctx.fillStyle = C.ink
  const head = wrap(ctx, about.heading, 600)
  head.forEach((l, i) => ctx.fillText(l, x - 3, 384 + i * 74))
  ctx.letterSpacing = '0px'

  let y = 384 + (head.length - 1) * 74 + 70
  ctx.font = `400 20px ${SANS}`
  ctx.fillStyle = C.ink2
  for (const l of wrap(ctx, about.bio, 560)) {
    ctx.fillText(l, x, y)
    y += 30
  }

  y += 24
  ctx.fillStyle = C.line
  ctx.fillRect(x, y, 580, 1)
  const colW = 580 / 3
  about.facts.forEach((f, i) => {
    const fx = x + i * (colW + 4)
    ctx.font = `500 34px ${SANS}`
    ctx.letterSpacing = '-0.6px'
    ctx.fillStyle = C.ink
    ctx.fillText(f.value, fx, y + 60)
    ctx.letterSpacing = '0.4px'
    ctx.font = `400 12.5px ${MONO}`
    ctx.fillStyle = C.ink3
    wrap(ctx, f.label, colW - 24).forEach((l, k) => ctx.fillText(l, fx, y + 88 + k * 18))
    ctx.letterSpacing = '0px'
  })

  // ---- render toggle, as on the page
  y += 166
  ctx.font = `400 12px ${MONO}`
  ctx.letterSpacing = '1.2px'
  ctx.fillStyle = C.ink3
  ctx.fillText('RENDER', x, y)
  ctx.beginPath()
  ctx.roundRect(x + 84, y - 21, 196, 32, 16)
  ctx.strokeStyle = C.line
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(x + 88, y - 17, 86, 24, 12)
  ctx.fillStyle = 'rgba(124, 92, 255, 0.22)'
  ctx.fill()
  ctx.fillStyle = C.ink
  ctx.fillText('PHOTO', x + 106, y)
  ctx.fillStyle = C.ink3
  ctx.fillText('SPECTRAL', x + 186, y)
  ctx.letterSpacing = '0px'

  return { canvas, caret: null }
}
