/**
 * Rasterises the text inside `root` exactly where it sits on screen (word by
 * word, using each word's live layout rect and computed font) and returns
 * sample points on the glyph shapes, in CSS pixels: [x0, y0, x1, y1, ...],
 * plus the sample spacing in CSS pixels.
 *
 * Used to turn a DOM card into crystal shards that start precisely on the
 * letters they replace.
 */
export interface GlyphSample {
  points: Float32Array
  spacing: number
}

export function sampleGlyphs(root: HTMLElement, maxPoints: number, lineSelector = '[data-x-line]'): GlyphSample {
  const scale = 0.5
  const W = Math.ceil(window.innerWidth * scale)
  const H = Math.ceil(window.innerHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'alphabetic'

  // Measure the resting layout: neutralise reveal transforms, then restore.
  const lines = Array.from(root.querySelectorAll<HTMLElement>(lineSelector))
  const saved = lines.map((l) => l.style.transform)
  lines.forEach((l) => (l.style.transform = 'none'))

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    const el = node.parentElement
    if (!el || !text.trim()) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || el.closest('.sr-only')) continue
    const size = parseFloat(cs.fontSize) * scale
    ctx.font = `${cs.fontStyle === 'normal' ? '' : cs.fontStyle} ${cs.fontWeight} ${size}px ${cs.fontFamily}`
    const ls = parseFloat(cs.letterSpacing)
    ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${(Number.isFinite(ls) ? ls : 0) * scale}px`
    const upper = cs.textTransform === 'uppercase'
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      range.setStart(node, m.index)
      range.setEnd(node, m.index + m[0].length)
      const r = range.getClientRects()[0]
      if (!r || r.width === 0) continue
      const word = upper ? m[0].toUpperCase() : m[0]
      const fm = ctx.measureText(word)
      const asc = fm.fontBoundingBoxAscent ?? size * 0.8
      const desc = fm.fontBoundingBoxDescent ?? size * 0.2
      const baseline = r.top * scale + (r.height * scale - (asc + desc)) / 2 + asc
      ctx.fillText(word, r.left * scale, baseline)
    }
  }
  lines.forEach((l, i) => (l.style.transform = saved[i]))

  const img = ctx.getImageData(0, 0, W, H).data
  let lit = 0
  for (let i = 3; i < img.length; i += 4) if (img[i] > 110) lit++
  if (!lit) return { points: new Float32Array(0), spacing: 1 }
  const stride = Math.max(1, Math.sqrt(lit / maxPoints))
  const out: number[] = []
  for (let y = 0; y < H; y += stride) {
    for (let x = 0; x < W; x += stride) {
      const jx = Math.min(W - 1, Math.floor(x + Math.random() * stride))
      const jy = Math.min(H - 1, Math.floor(y + Math.random() * stride))
      if (img[(jy * W + jx) * 4 + 3] > 110) out.push(jx / scale, jy / scale)
    }
  }
  return { points: new Float32Array(out), spacing: stride / scale }
}
