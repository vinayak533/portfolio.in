/**
 * Samples the background-removed portrait into per-instance crystal data.
 * Runs once at load; nothing here is touched per frame.
 */

export interface PortraitSample {
  count: number
  /** Local target position (x, y from the photo, z from luminance + silhouette relief). */
  target: Float32Array
  /** Scattered dust start position. */
  dust: Float32Array
  /** Photo colour, linear. */
  color: Float32Array
  /** lum, seedA, seedB, v (0 = top of photo, 1 = bottom). */
  data: Float32Array
  /** Per-crystal size factor that keeps coverage even where sampling is denser. */
  scale: Float32Array
  width: number
  height: number
  /** Average spacing between particles in world units (drives crystal size). */
  spacing: number
  /** The cutout itself: settled crystals sample it so the assembled portrait is the real photo. */
  image: HTMLImageElement
}

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Separable box blur on a single channel (used to get a soft silhouette relief). */
function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const d = 2 * r + 1
  for (let y = 0; y < h; y++) {
    let acc = 0
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / d
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / d
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** Face centre and spread in normalised photo coordinates (public/portrait/about.cutout.png). */
const FACE = { x: 0.46, y: 0.37, sx: 0.13, sy: 0.17, boost: 2.0 }

export async function samplePortrait(src: string, count: number, worldHeight = 6.6): Promise<PortraitSample> {
  const img = await loadImage(src)
  const aspect = img.naturalWidth / img.naturalHeight
  const H = 420
  const W = Math.round(H * aspect)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, W, H)
  const px = ctx.getImageData(0, 0, W, H).data

  const alpha = new Float32Array(W * H)
  const weight = new Float32Array(W * H)
  const boost = new Float32Array(W * H)
  let total = 0
  for (let i = 0; i < W * H; i++) {
    const a = px[i * 4 + 3] / 255
    alpha[i] = a
    const x = (i % W) / W
    const y = Math.floor(i / W) / H
    const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255
    // Oval vignette around head and shoulders: the cropped shoulders and the
    // bottom edge thin out into loose crystals instead of ending on hard crops.
    const vx = (x - FACE.x) / 0.56
    const vy = (y - 0.4) / 0.66
    const fade = (1 - smooth(0.72, 1.0, Math.hypot(vx, vy))) * (1 - smooth(0.84, 1.0, y))
    // Extra density where the likeness lives (eyes, nose, mouth); those crystals
    // shrink by 1/sqrt(boost) so the surface stays evenly covered.
    const fx = (x - FACE.x) / FACE.sx
    const fy = (y - FACE.y) / FACE.sy
    const b = 1 + FACE.boost * Math.exp(-0.5 * (fx * fx + fy * fy))
    boost[i] = b
    // Near-uniform density so dark hair, beard and shirt keep enough crystals to read as form.
    const w = Math.pow(a, 1.6) * fade * (0.85 + l * 0.3) * b
    weight[i] = w
    total += w
  }
  const relief = boxBlur(alpha, W, H, 14)
  // Average colour of the nearby solid interior, used to clean up the matte edge.
  const solid = [0, 1, 2, 3].map((c) => {
    const ch = new Float32Array(W * H)
    for (let i = 0; i < W * H; i++) if (alpha[i] > 0.98) ch[i] = c === 3 ? 1 : px[i * 4 + c] / 255
    return boxBlur(ch, W, H, 5)
  })

  const worldWidth = worldHeight * aspect
  const target = new Float32Array(count * 3)
  const dust = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  const data = new Float32Array(count * 4)
  const scale = new Float32Array(count)

  // Stratified sampling: walk the cumulative weight with an even stride + jitter.
  const stride = total / count
  let acc = Math.random() * stride
  let n = 0
  let run = 0
  for (let i = 0; i < W * H && n < count; i++) {
    run += weight[i]
    while (run >= acc && n < count) {
      const x = (i % W) + Math.random()
      const yy = Math.floor(i / W) + Math.random()
      let r = px[i * 4] / 255
      let g = px[i * 4 + 1] / 255
      let b = px[i * 4 + 2] / 255
      // Semi-transparent hair fringe still carries the light studio backdrop and would
      // read as white glitter on the outline: pull it toward the solid colour next to it.
      const sw = solid[3][i]
      if (alpha[i] < 0.98 && sw > 1e-3) {
        const t = smooth(0.5, 0.98, alpha[i])
        r = solid[0][i] / sw + (r - solid[0][i] / sw) * t
        g = solid[1][i] / sw + (g - solid[1][i] / sw) * t
        b = solid[2][i] / sw + (b - solid[2][i] / sw) * t
      }
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const v = yy / H

      target[n * 3] = (x / W - 0.5) * worldWidth
      target[n * 3 + 1] = (0.5 - v) * worldHeight
      target[n * 3 + 2] = relief[i] * 0.85 + (lum - 0.35) * 0.05 + (Math.random() - 0.5) * 0.01

      // Dust: a wide, deep cloud, biased toward the camera so assembly reads as arrival.
      const rr = 3 + Math.pow(Math.random(), 0.6) * 9
      const th = Math.random() * Math.PI * 2
      dust[n * 3] = Math.cos(th) * rr * 1.25
      dust[n * 3 + 1] = Math.sin(th) * rr * 0.75 + (Math.random() - 0.5) * 2
      dust[n * 3 + 2] = -5 + Math.random() * 13

      color[n * 3] = srgbToLinear(r)
      color[n * 3 + 1] = srgbToLinear(g)
      color[n * 3 + 2] = srgbToLinear(b)

      data[n * 4] = lum
      data[n * 4 + 1] = Math.random()
      data[n * 4 + 2] = Math.random()
      data[n * 4 + 3] = v
      scale[n] = 1 / Math.sqrt(boost[i])
      n++
      acc += stride
    }
  }

  const coverage = total / (W * H) // rough fraction of the frame occupied
  const spacing = Math.sqrt((worldWidth * worldHeight * Math.max(coverage, 0.2)) / Math.max(n, 1))

  return {
    count: n,
    target: target.subarray(0, n * 3),
    dust: dust.subarray(0, n * 3),
    color: color.subarray(0, n * 3),
    data: data.subarray(0, n * 4),
    scale: scale.subarray(0, n),
    width: worldWidth,
    height: worldHeight,
    spacing,
    image: img,
  }
}

function smooth(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
