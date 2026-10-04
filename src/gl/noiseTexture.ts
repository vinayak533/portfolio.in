import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three'

/**
 * Tileable value-noise texture baked once on the CPU. Channels hold the same
 * field at 4 frequencies, so shaders get cheap fbm from one or two fetches
 * instead of evaluating simplex noise per pixel.
 */
let cached: DataTexture | null = null

export function getNoiseTexture(size = 256) {
  if (cached) return cached
  const data = new Uint8Array(size * size * 4)
  const freqs = [4, 8, 16, 32]
  const lattices = freqs.map((f) => {
    const g = new Float32Array(f * f)
    for (let i = 0; i < g.length; i++) g[i] = Math.random()
    return g
  })
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let c = 0; c < 4; c++) {
        const f = freqs[c]
        const g = lattices[c]
        const fx = (x / size) * f
        const fy = (y / size) * f
        const x0 = Math.floor(fx)
        const y0 = Math.floor(fy)
        const tx = fade(fx - x0)
        const ty = fade(fy - y0)
        const x1 = (x0 + 1) % f
        const y1 = (y0 + 1) % f
        const a = g[y0 * f + x0]
        const b = g[y0 * f + x1]
        const cc = g[y1 * f + x0]
        const d = g[y1 * f + x1]
        const v = a + (b - a) * tx + (cc - a) * ty + (a - b - cc + d) * tx * ty
        data[(y * size + x) * 4 + c] = Math.round(v * 255)
      }
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  cached = tex
  return tex
}
