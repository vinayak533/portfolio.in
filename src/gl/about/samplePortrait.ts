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
  width: number
  height: number
  /** Average spacing between particles in world units (drives crystal size). */
  spacing: number
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
  let total = 0
  for (let i = 0; i < W * H; i++) {
    const a = px[i * 4 + 3] / 255
    alpha[i] = a
    const y = Math.floor(i / W) / H
    const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255
    // Bottom of the frame dissolves into dust instead of ending on a hard crop.
    const fade = 1 - smooth(0.7, 1.0, y)
    const w = Math.pow(a, 1.6) * fade * (0.55 + l * 1.1)
    weight[i] = w
    total += w
  }
  const relief = boxBlur(alpha, W, H, 14)

  const worldWidth = worldHeight * aspect
  const target = new Float32Array(count * 3)
  const dust = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  const data = new Float32Array(count * 4)

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
      const r = px[i * 4] / 255
      const g = px[i * 4 + 1] / 255
      const b = px[i * 4 + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const v = yy / H

      target[n * 3] = (x / W - 0.5) * worldWidth
      target[n * 3 + 1] = (0.5 - v) * worldHeight
      target[n * 3 + 2] = relief[i] * 0.85 + (lum - 0.35) * 0.55 + (Math.random() - 0.5) * 0.05

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
    width: worldWidth,
    height: worldHeight,
    spacing,
  }
}

function smooth(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
