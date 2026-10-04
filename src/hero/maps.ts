import type { HeroConfig } from './config'

export type MapName = 'sky-mask' | 'depth' | 'grass-mask' | 'protect-mask' | 'moon-matte'
export const MAP_NAMES: MapName[] = ['sky-mask', 'depth', 'grass-mask', 'protect-mask', 'moon-matte']

/**
 * Real maps dropped into src/assets/hero-maps/ are picked up at build time
 * (sky-mask.png, depth.png, grass-mask.png, optional protect-mask.png). The
 * glob is empty until then, and the temporary maps below are used instead.
 */
const supplied = import.meta.glob('../assets/hero-maps/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export function suppliedMapUrl(name: MapName): string | undefined {
  for (const [path, url] of Object.entries(supplied)) {
    const base = path.split('/').pop()!.replace(/\.[^.]+$/, '')
    if (base === name) return url
  }
  return undefined
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  return img.decode().then(() => img)
}

// ------------------------------------------------------------ fallback maps

const WORK_W = 512

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Separable box blur, run twice (close to a gaussian). Radius in work px. */
function blur(src: Float32Array, w: number, h: number, radius: number) {
  if (radius < 1) return src
  const r = Math.round(radius)
  const tmp = new Float32Array(src.length)
  let a = src
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0
      for (let x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))]
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * r + 1)
        acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]
      }
    }
    const out = new Float32Array(src.length)
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / (2 * r + 1)
        acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
      }
    }
    a = out
  }
  return a
}

function rasterize(w: number, h: number, scale: [number, number], draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  ctx.setTransform(scale[0], 0, 0, scale[1], 0, 0)
  draw(ctx)
  const d = ctx.getImageData(0, 0, w, h).data
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255
  return out
}

function polygon(ctx: CanvasRenderingContext2D, pts: [number, number][]) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fill()
}

function toCanvas(values: Float32Array, w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < values.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, values[i])) * 255)
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/**
 * Temporary maps built from the photo itself: a luminance / colour sky mask
 * constrained by the hand-traced island silhouette in the config, a green-
 * hue grass mask, a layered depth estimate and the never-warp zone around
 * the figure. Good enough to run; real maps look better.
 */
export function buildFallbackMaps(photo: HTMLImageElement, cfg: HeroConfig, names: MapName[]): Partial<Record<MapName, HTMLCanvasElement>> {
  const w = WORK_W
  const h = Math.round((WORK_W * photo.naturalHeight) / photo.naturalWidth)
  const scale: [number, number] = [w / cfg.image.ref[0], h / cfg.image.ref[1]]
  const geo = cfg.scene

  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(photo, 0, 0, w, h)
  const px = sctx.getImageData(0, 0, w, h).data

  const island = blur(
    rasterize(w, h, scale, (ctx) => {
      polygon(ctx, geo.island)
      for (const [cx, cy, rx, ry] of geo.islandExtras) {
        ctx.beginPath()
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }),
    w,
    h,
    1.5,
  )
  // A wider halo of the island where grass wisps poke above the traced edge.
  const near = blur(island, w, h, 9)
  const grassRegion = blur(rasterize(w, h, scale, (ctx) => polygon(ctx, geo.grassTop)), w, h, 2)
  const [pcx, pcy] = geo.person.center
  const [prx, pry] = geo.person.radius
  const [lcx, lcy] = cfg.laptop.pos
  const [lw, lh] = cfg.laptop.size
  const protect = blur(
    rasterize(w, h, scale, (ctx) => {
      ctx.beginPath()
      ctx.ellipse(pcx, pcy, prx, pry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(lcx - lw * 0.75, lcy - lh * 0.8, lw * 1.5, lh * 1.6)
    }),
    w,
    h,
    3,
  )

  const sky = new Float32Array(w * h)
  const grass = new Float32Array(w * h)
  const depth = new Float32Array(w * h)
  const [dBack, dFront] = geo.islandDepth
  for (let y = 0; y < h; y++) {
    const yn = y / h
    const cloudDepth = yn < geo.horizon ? (yn / geo.horizon) * 0.12 : 0.15 + 0.85 * Math.pow((yn - geo.horizon) / (1 - geo.horizon), 1.15)
    const islandDepth = dBack + (dFront - dBack) * Math.min(1, Math.max(0, (yn - 0.36) / 0.55))
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const r = px[i * 4] / 255
      const g = px[i * 4 + 1] / 255
      const b = px[i * 4 + 2] / 255
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      // Grass is green-dominant; clouds are blue-grey and rock is near black.
      const green = smooth(0.0, 0.07, g - Math.max(r * 0.95, b * 1.08))
      const cloudish = smooth(-0.02, 0.04, b - g) * smooth(0.04, 0.16, lum)
      // Luminance / colour refinement only near the silhouette; elsewhere the trace decides.
      let s = 1 - island[i]
      const band = near[i] * (1 - island[i] * island[i])
      s = s * (1 - band * green) + band * cloudish * (1 - green) * 0.5
      s *= 1 - protect[i]
      sky[i] = Math.min(1, Math.max(0, s))
      grass[i] = grassRegion[i] * Math.min(1, green * 1.25 + smooth(0.03, 0.12, lum) * 0.35) * (1 - protect[i])
      depth[i] = cloudDepth + (islandDepth - cloudDepth) * island[i]
    }
  }

  const maps: Record<MapName, () => Float32Array> = {
    'sky-mask': () => blur(sky, w, h, 1),
    depth: () => blur(depth, w, h, 6),
    'grass-mask': () => blur(grass, w, h, 1),
    'protect-mask': () => protect,
    // Built by `npm run hero`; without it nothing passes in front of the moon but the wisps.
    'moon-matte': () => new Float32Array(w * h),
  }
  const out: Partial<Record<MapName, HTMLCanvasElement>> = {}
  for (const n of names) out[n] = toCanvas(maps[n](), w, h)
  return out
}
