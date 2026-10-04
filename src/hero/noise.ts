/**
 * CPU twin of shaders/common.glsl. Math.fround keeps the arithmetic in 32-bit
 * float like the GPU, so the density read here matches what is drawn.
 */
const f32 = Math.fround
const fract = (x: number) => x - Math.floor(x)
const mod = (x: number, y: number) => x - y * Math.floor(x / y)
const mix = (a: number, b: number, t: number) => a + (b - a) * t

export function hash12(x: number, y: number) {
  let px = fract(f32(x * 0.1031))
  let py = fract(f32(y * 0.1031))
  let pz = px
  const d = f32(px * f32(py + 33.33) + py * f32(pz + 33.33) + pz * f32(px + 33.33))
  px = f32(px + d)
  py = f32(py + d)
  pz = f32(pz + d)
  return fract(f32(f32(px + py) * pz))
}

export function vnoise(x: number, y: number, tile: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const x0 = mod(ix, tile)
  const y0 = mod(iy, tile)
  const x1 = mod(ix + 1, tile)
  const y1 = mod(iy + 1, tile)
  return mix(mix(hash12(x0, y0), hash12(x1, y0), ux), mix(hash12(x0, y1), hash12(x1, y1), ux), uy)
}

const fbm2 = (x: number, y: number, t: number) => 0.6666667 * vnoise(x, y, t) + 0.3333333 * vnoise(x * 2, y * 2, t * 2)

const fbm3 = (x: number, y: number, t: number) =>
  0.5714286 * vnoise(x, y, t) + 0.2857143 * vnoise(x * 2, y * 2, t * 2) + 0.1428571 * vnoise(x * 4, y * 4, t * 4)

/** Same as cloudField() in GLSL, density only. */
export function cloudField(qx: number, qy: number, tile: number, driftX: number, driftY: number, evoX: number, evoY: number, warp: number) {
  const x = qx + driftX
  const y = qy + driftY
  const wx = fbm2(x + evoX, y + evoY, tile) - 0.5
  const wy = fbm2(x + evoX + 5.2, y + evoY + 1.3, tile) - 0.5
  return fbm3(x + warp * wx, y + warp * wy, tile)
}

/** Same as wispField() in GLSL: density 0..1 of a wisp layer at image point (px, py) (uv * aspect). */
export function wispField(
  px: number,
  py: number,
  scale: number,
  stretch: number,
  threshold: number,
  softness: number,
  driftX: number,
  driftY: number,
  evo: number,
  tile: number,
) {
  const qx = (px / stretch) * scale + driftX
  const qy = (py + px * 0.12) * scale + driftY
  const wx = fbm2(qx * 0.5 + evo, qy * 0.5, tile * 0.5) - 0.5
  const wy = fbm2(qx * 0.5 + evo + 3.7, qy * 0.5 + 1.9, tile * 0.5) - 0.5
  const raw = fbm3(qx + wx * 2.4, qy + wy * 1.6, tile)
  const fib = fbm2(qx * 2 + wx * 3, qy * 5 + wy * 3, tile * 2)
  const group = fbm2(qx * 0.25 + 7 + evo * 0.5, qy * 0.25 + 2.1, tile * 0.25)
  return smoothstep(threshold, threshold + softness, raw) * (0.3 + 0.7 * fib) * smoothstep(0.45, 0.68, group)
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
