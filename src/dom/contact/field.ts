/**
 * Contact's generative object: nested shells of nodes, like the layers of a
 * network seen from outside. Each shell is wired to its nearest neighbours
 * (re-linked as the shells drift), sparse links reach between layers and
 * reorganise now and then, and the odd signal travels outward through them.
 *
 * Canvas 2D, a few hundred nodes, batched strokes: well under a millisecond a
 * frame. It runs on the shared GSAP ticker and only while it is switched on.
 */
import { damp, onTick } from '../../core/clock'
import { signals } from '../../store/useStore'

export interface FieldOptions {
  /** Total node count across all shells. */
  count: number
  /** Narrow screens: the object sits behind the headline, quieter and smaller. */
  compact: boolean
  /** Pointer response (off for touch and reduced motion). */
  interactive: boolean
  maxDpr: number
  /** Optional element sized to the object's footprint (cursor hit area). */
  hit?: HTMLElement | null
}

interface Node {
  shell: number
  /** Rest direction on the unit sphere and two tangents for drift. */
  ux: number
  uy: number
  uz: number
  t1: [number, number, number]
  t2: [number, number, number]
  r: number
  ph: number
  w1: number
  w2: number
  appear: number
  hub: boolean
  /** Inter-layer candidates in the next shell out, and the one in use (-1: none). */
  next: number[]
  link: number
  // Per frame.
  x: number
  y: number
  z: number
  sx: number
  sy: number
  p: number
  depth: number
  vis: number
  glow: number
  // Pointer offset (screen px) on a damped spring.
  ox: number
  oy: number
  vx: number
  vy: number
}

interface Edge {
  a: number
  b: number
  inter: boolean
  on: boolean
  w: number
  heat: number
}

/** A partial great circle on one shell: the wireframe that makes each layer's curvature legible. */
interface Arc {
  shell: number
  e1: [number, number, number]
  e2: [number, number, number]
  from: number
  sweep: number
}

interface Pulse {
  path: number[]
  seg: number
  s: number
  dur: number
}

const RADII = [0.4, 0.69, 1.02]
const AXIS = normalize([-1, 0.16, 0.66])
const CAP = (112 * Math.PI) / 180
const FOCAL = 3.4
const INK = '244,243,247'
const MID = '199,187,255'
const VIOLET = '154,130,255'
const LEVELS = 12
const ARC_STEPS = 40

function normalize(v: number[]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Deterministic PRNG so the composition is the same on every visit. */
function mulberry(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function buildArcs(): Arc[] {
  const rand = mulberry(0xa2c)
  const arcs: Arc[] = []
  RADII.forEach((_, shell) => {
    for (let i = 0; i < 2 + shell; i++) {
      const n = normalize([rand() - 0.5, rand() - 0.5, rand() - 0.5])
      const helper = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
      const e1 = normalize([helper[1] * n[2] - helper[2] * n[1], helper[2] * n[0] - helper[0] * n[2], helper[0] * n[1] - helper[1] * n[0]])
      const e2: [number, number, number] = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]
      arcs.push({ shell, e1, e2, from: rand() * Math.PI * 2, sweep: (0.45 + rand() * 0.45) * Math.PI })
    }
  })
  return arcs
}

function buildNodes(count: number): Node[] {
  const rand = mulberry(0x5eed)
  const weights = RADII.map((r) => Math.pow(r, 1.1))
  const total = weights.reduce((a, b) => a + b, 0)
  const nodes: Node[] = []
  const capCos = Math.cos(CAP)
  // Basis around the cap axis.
  const ref = Math.abs(AXIS[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const bx = normalize([ref[1] * AXIS[2] - ref[2] * AXIS[1], ref[2] * AXIS[0] - ref[0] * AXIS[2], ref[0] * AXIS[1] - ref[1] * AXIS[0]])
  const by: [number, number, number] = [AXIS[1] * bx[2] - AXIS[2] * bx[1], AXIS[2] * bx[0] - AXIS[0] * bx[2], AXIS[0] * bx[1] - AXIS[1] * bx[0]]

  RADII.forEach((radius, shell) => {
    const n = Math.max(8, Math.round((count * weights[shell]) / total))
    // Fibonacci points over the cap only, then jittered so no lattice shows.
    const golden = Math.PI * (3 - Math.sqrt(5))
    const spacing = Math.sqrt((2 * Math.PI * (1 - capCos)) / n)
    for (let i = 0; i < n; i++) {
      const c = 1 - ((i + 0.5) / n) * (1 - capCos)
      const s = Math.sqrt(1 - c * c)
      const a = i * golden + shell * 1.7
      const jx = (rand() - 0.5) * spacing * 0.8
      const jy = (rand() - 0.5) * spacing * 0.8
      const lx = Math.cos(a) * s + jx
      const ly = Math.sin(a) * s + jy
      const u = normalize([AXIS[0] * c + bx[0] * lx + by[0] * ly, AXIS[1] * c + bx[1] * lx + by[1] * ly, AXIS[2] * c + bx[2] * lx + by[2] * ly])
      const helper = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
      const t1 = normalize([helper[1] * u[2] - helper[2] * u[1], helper[2] * u[0] - helper[0] * u[2], helper[0] * u[1] - helper[1] * u[0]])
      const t2: [number, number, number] = [u[1] * t1[2] - u[2] * t1[1], u[2] * t1[0] - u[0] * t1[2], u[0] * t1[1] - u[1] * t1[0]]
      nodes.push({
        shell,
        ux: u[0],
        uy: u[1],
        uz: u[2],
        t1,
        t2,
        r: radius * (1 + (rand() - 0.5) * 0.05),
        ph: rand() * Math.PI * 2,
        w1: 0.05 + rand() * 0.06,
        w2: 0.04 + rand() * 0.05,
        // The core resolves first, then each layer outward.
        appear: 0.04 + (shell / RADII.length) * 0.5 + rand() * 0.22,
        hub: rand() < 0.06,
        next: [],
        link: -1,
        x: 0,
        y: 0,
        z: 0,
        sx: 0,
        sy: 0,
        p: 1,
        depth: 0,
        vis: 0,
        glow: 0,
        ox: 0,
        oy: 0,
        vx: 0,
        vy: 0,
      })
    }
  })

  // Candidates for inter-layer links: the closest directions one shell out.
  for (const a of nodes) {
    if (a.shell === RADII.length - 1) continue
    const scored: [number, number][] = []
    nodes.forEach((b, j) => {
      if (b.shell === a.shell + 1) scored.push([a.ux * b.ux + a.uy * b.uy + a.uz * b.uz, j])
    })
    scored.sort((p, q) => q[0] - p[0])
    a.next = scored.slice(0, 3).map((s) => s[1])
    a.link = rand() < 0.5 ? a.next[Math.floor(rand() * a.next.length)] : -1
  }
  return nodes
}

export function createField(canvas: HTMLCanvasElement, opts: FieldOptions) {
  const ctx = canvas.getContext('2d', { alpha: true })!
  const nodes = buildNodes(opts.count)
  const arcs = buildArcs()
  const arcPts = new Float32Array(arcs.length * (ARC_STEPS + 1) * 4)
  // Typical neighbour distance per shell: links much longer than this are not drawn.
  const reach = RADII.map((r, i) => {
    const n = nodes.filter((d) => d.shell === i).length
    return r * Math.sqrt((2 * Math.PI * (1 - Math.cos(CAP))) / n) * 1.75
  })
  const edges = new Map<number, Edge>()
  const pulses: Pulse[] = []
  const key = (a: number, b: number) => (a < b ? a * 4096 + b : b * 4096 + a)
  const buckets = Array.from({ length: 3 * LEVELS }, () => [] as number[])
  const dotBuckets = Array.from({ length: 3 * LEVELS }, () => [] as number[])

  let W = 1
  let H = 1
  let dpr = 1
  let cx = 0
  let cy = 0
  let S = 1
  let fadeX = 0
  let fadeTop = 0
  let fadeY0 = 0
  let fadeY1 = 0
  let gain = 1

  let time = 0
  let reveal = 0
  let revealTarget = 0
  let revealRate = 1
  let relinkIn = 0
  let reorganiseIn = 2
  let pulseIn = 1.6
  let stop: (() => void) | null = null
  let destroyed = false

  // Pointer, smoothed so nothing snaps to it.
  const ptr = { x: 0, y: 0, presence: 0, init: false }

  function layout() {
    const rect = canvas.getBoundingClientRect()
    W = Math.max(1, rect.width)
    H = Math.max(1, rect.height)
    dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    if (opts.compact) {
      S = Math.min(W * 0.58, H * 0.36)
      cx = W * 0.94
      cy = Math.min(H * 0.26, S * 1.15)
      fadeX = W * 0.25
      fadeTop = 0
      fadeY0 = cy + S * 0.35
      fadeY1 = cy + S * 1.25
      gain = 0.6
    } else {
      S = Math.min(H * 0.5, W * 0.6)
      cx = W * 0.79
      cy = H * 0.48
      fadeX = W * 0.34
      // Keep clear of the navigation above and the footer below.
      fadeTop = Math.min(110, H * 0.12)
      fadeY0 = H - 190
      fadeY1 = H - 60
      gain = 1
    }
    if (opts.hit) {
      const d = S * 1.9
      Object.assign(opts.hit.style, { left: `${cx - d / 2}px`, top: `${cy - d / 2}px`, width: `${d}px`, height: `${d}px` })
    }
  }

  /** Positions for the current time: breathing shells, drifting nodes, a slow sway. */
  function solve() {
    const yaw = -0.18 + Math.sin((time * Math.PI * 2) / 47) * 0.07
    const pitch = 0.1 + Math.sin((time * Math.PI * 2) / 61 + 1) * 0.035
    const cyw = Math.cos(yaw)
    const syw = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const project = (x: number, y: number, z: number, out: Float32Array, o: number) => {
      const x1 = x * cyw + z * syw
      const z1 = -x * syw + z * cyw
      const y1 = y * cp - z1 * sp
      const z2 = y * sp + z1 * cp
      const p = FOCAL / (FOCAL - z2)
      out[o] = cx + x1 * S * p
      out[o + 1] = cy - y1 * S * p
      out[o + 2] = smooth(-1.1, 1.1, z2)
      out[o + 3] = 0
    }
    arcs.forEach((a, i) => {
      const r = RADII[a.shell] * (1 + Math.sin((time * Math.PI * 2) / 11 - a.shell * 0.9) * 0.012)
      for (let k = 0; k <= ARC_STEPS; k++) {
        const t = a.from + (a.sweep * k) / ARC_STEPS + time * 0.004 * (a.shell % 2 ? 1 : -1)
        const c = Math.cos(t) * r
        const s = Math.sin(t) * r
        project(a.e1[0] * c + a.e2[0] * s, a.e1[1] * c + a.e2[1] * s, a.e1[2] * c + a.e2[2] * s, arcPts, (i * (ARC_STEPS + 1) + k) * 4)
      }
    })
    for (const n of nodes) {
      const breath = 1 + Math.sin((time * Math.PI * 2) / 11 - n.shell * 0.9) * 0.012
      const a1 = Math.sin(time * n.w1 * Math.PI * 2 + n.ph) * 0.022
      const a2 = Math.cos(time * n.w2 * Math.PI * 2 + n.ph * 1.3) * 0.022
      const r = n.r * breath
      let x = (n.ux + n.t1[0] * a1 + n.t2[0] * a2) * r
      let y = (n.uy + n.t1[1] * a1 + n.t2[1] * a2) * r
      let z = (n.uz + n.t1[2] * a1 + n.t2[2] * a2) * r
      // Yaw about y, then pitch about x.
      const x1 = x * cyw + z * syw
      const z1 = -x * syw + z * cyw
      const y1 = y * cp - z1 * sp
      z = y * sp + z1 * cp
      x = x1
      y = y1
      const p = FOCAL / (FOCAL - z)
      n.x = x + n.ox / (S * p)
      n.y = y - n.oy / (S * p)
      n.z = z
      n.p = p
      n.sx = cx + x * S * p + n.ox
      n.sy = cy - y * S * p + n.oy
      n.depth = smooth(-1.1, 1.1, z)
    }
  }

  /** Nearest-neighbour wiring within each shell, from current positions. */
  function relink() {
    for (const e of edges.values()) if (!e.inter) e.on = false
    const k = 3
    const best: [number, number][] = []
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      best.length = 0
      for (let j = 0; j < nodes.length; j++) {
        const b = nodes[j]
        if (j === i || b.shell !== a.shell) continue
        const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
        if (best.length < k) {
          best.push([d, j])
          best.sort((p, q) => p[0] - q[0])
        } else if (d < best[k - 1][0]) {
          best[k - 1] = [d, j]
          best.sort((p, q) => p[0] - q[0])
        }
      }
      // Two nearest, a third only when it is about as close; never long spans.
      const max = reach[a.shell] ** 2
      for (let m = 0; m < best.length; m++) {
        if (best[m][0] > max) continue
        if (m === 2 && best[2][0] > best[0][0] * 1.6) continue
        const id = key(i, best[m][1])
        const e = edges.get(id)
        if (e) e.on = true
        else edges.set(id, { a: i, b: best[m][1], inter: false, on: true, w: 0, heat: 0 })
      }
    }
  }

  function syncInter() {
    for (const e of edges.values()) if (e.inter) e.on = false
    nodes.forEach((n, i) => {
      if (n.link < 0) return
      const id = key(i, n.link)
      const e = edges.get(id)
      if (e) e.on = true
      else edges.set(id, { a: i, b: n.link, inter: true, on: true, w: 0, heat: 0 })
    })
  }

  function reorganise() {
    // A handful of inter-layer links switch target or switch off.
    const pool = nodes.filter((n) => n.next.length)
    for (let i = 0; i < 3; i++) {
      const n = pool[Math.floor(Math.random() * pool.length)]
      const options = [-1, ...n.next].filter((v) => v !== n.link)
      n.link = options[Math.floor(Math.random() * options.length)]
    }
    syncInter()
  }

  function spawnPulse() {
    const starts = nodes.map((n, i) => (n.shell === 0 && n.link >= 0 ? i : -1)).filter((i) => i >= 0)
    if (!starts.length) return
    const path = [starts[Math.floor(Math.random() * starts.length)]]
    while (path.length < 6) {
      const last = nodes[path[path.length - 1]]
      if (last.link >= 0) path.push(last.link)
      else break
    }
    if (path.length < 2) return
    pulses.push({ path, seg: 0, s: 0, dur: 1.15 + Math.random() * 0.5 })
  }

  function updatePointer(dt: number) {
    const p = signals.pointer
    const rect = opts.interactive ? canvas.getBoundingClientRect() : null
    let want = 0
    if (rect && p.active && performance.now() - p.lastMove < 4000) {
      const lx = p.x - rect.left
      const ly = p.y - rect.top
      // Present when the pointer is anywhere near the object (not only over the canvas).
      const d = Math.hypot(lx - cx, ly - cy)
      want = 1 - smooth(S * 1.05, S * 1.6, d)
      if (!ptr.init) {
        ptr.x = lx
        ptr.y = ly
        ptr.init = true
      }
      ptr.x = damp(ptr.x, lx, 5, dt)
      ptr.y = damp(ptr.y, ly, 5, dt)
    }
    ptr.presence = damp(ptr.presence, want, want > ptr.presence ? 2.4 : 1.2, dt)

    const R = Math.max(150, S * 0.42)
    const k = 16
    const c = 2 * Math.sqrt(k) * 0.92
    for (const n of nodes) {
      let tx = 0
      let ty = 0
      let g = 0
      if (ptr.presence > 0.001) {
        const dx = ptr.x - (n.sx - n.ox)
        const dy = ptr.y - (n.sy - n.oy)
        const d = Math.hypot(dx, dy)
        if (d < R) {
          const f = 1 - d / R
          g = f * f * ptr.presence
          // Lean toward the pointer, a few pixels at most.
          tx = dx * 0.16 * g
          ty = dy * 0.16 * g
        }
      }
      n.glow = g
      n.vx += ((tx - n.ox) * k - n.vx * c) * dt
      n.vy += ((ty - n.oy) * k - n.vy * c) * dt
      n.ox += n.vx * dt
      n.oy += n.vy * dt
    }
    return ptr.presence > 0.02
  }

  const fade = (x: number, y: number) =>
    smooth(0, fadeX, x) * (fadeTop > 0 ? smooth(0, fadeTop, y) : 1) * (fadeY1 > fadeY0 ? 1 - smooth(fadeY0, fadeY1, y) : 1)

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    if (reveal <= 0.001) return

    // Violet light under the pointer, very low.
    if (ptr.presence > 0.01) {
      const rad = Math.max(200, S * 0.6)
      const g = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, rad)
      g.addColorStop(0, `rgba(124,92,255,${0.085 * ptr.presence * reveal})`)
      g.addColorStop(1, 'rgba(124,92,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(ptr.x - rad, ptr.y - rad, rad * 2, rad * 2)
    }

    for (const n of nodes) n.vis = smooth(n.appear, n.appear + 0.28, reveal) * fade(n.sx, n.sy)

    // Edges, bucketed by tint and alpha so the whole mesh is ~a dozen strokes.
    for (const b of buckets) b.length = 0
    const arcReveal = smooth(0.25, 0.95, reveal)
    if (arcReveal > 0) {
      for (let i = 0; i < arcs.length; i++) {
        for (let k = 0; k < ARC_STEPS; k++) {
          const o = (i * (ARC_STEPS + 1) + k) * 4
          const x0 = arcPts[o]
          const y0 = arcPts[o + 1]
          const x1 = arcPts[o + 4]
          const y1 = arcPts[o + 5]
          // Ends taper so the fragments read as drawn, not cut.
          const u = k / (ARC_STEPS - 1)
          const taper = Math.sin(Math.PI * u) ** 0.6
          const alpha = 0.2 * (0.1 + 0.9 * arcPts[o + 2] ** 1.5) * taper * arcReveal * fade(x0, y0) * gain
          const l = Math.min(LEVELS - 1, Math.round(alpha * 2 * LEVELS))
          if (l > 0) buckets[l].push(x0, y0, x1, y1)
        }
      }
    }
    for (const e of edges.values()) {
      const a = nodes[e.a]
      const b = nodes[e.b]
      const vis = Math.min(a.vis, b.vis)
      if (vis <= 0.003 || e.w <= 0.003) continue
      const depth = (a.depth + b.depth) * 0.5
      const glow = Math.max(a.glow, b.glow)
      const base = e.inter ? 0.05 : 0.12
      const alpha = (base * (0.12 + 0.88 * depth * depth) + glow * 0.32 + e.heat * 0.4) * e.w * vis * gain
      const tint = Math.max(glow * 1.6, e.heat)
      const t = tint > 0.55 ? 2 : tint > 0.18 ? 1 : 0
      const l = Math.min(LEVELS - 1, Math.round(alpha * 2 * LEVELS))
      if (l <= 0) continue
      buckets[t * LEVELS + l].push(a.sx, a.sy, b.sx, b.sy)
    }
    ctx.lineWidth = 0.75
    ctx.lineCap = 'round'
    buckets.forEach((seg, i) => {
      if (!seg.length) return
      const t = Math.floor(i / LEVELS)
      const l = i % LEVELS
      ctx.strokeStyle = `rgba(${t === 2 ? VIOLET : t === 1 ? MID : INK},${l / (2 * LEVELS)})`
      ctx.beginPath()
      for (let j = 0; j < seg.length; j += 4) {
        ctx.moveTo(seg[j], seg[j + 1])
        ctx.lineTo(seg[j + 2], seg[j + 3])
      }
      ctx.stroke()
    })

    // Nodes.
    for (const b of dotBuckets) b.length = 0
    for (const n of nodes) {
      if (n.vis <= 0.003) continue
      const alpha = ((0.14 + 0.8 * n.depth * n.depth) * (n.hub ? 1.15 : 1) + n.glow * 0.5) * n.vis * gain
      const t = n.glow > 0.35 ? 2 : n.glow > 0.12 ? 1 : 0
      const l = Math.min(LEVELS - 1, Math.round(alpha * LEVELS))
      if (l <= 0) continue
      dotBuckets[t * LEVELS + l].push(n.sx, n.sy, (n.hub ? 1.5 : 0.95) * n.p * (0.75 + n.depth * 0.45))
    }
    dotBuckets.forEach((pts, i) => {
      if (!pts.length) return
      const t = Math.floor(i / LEVELS)
      const l = i % LEVELS
      ctx.fillStyle = `rgba(${t === 2 ? VIOLET : t === 1 ? MID : INK},${l / LEVELS})`
      ctx.beginPath()
      for (let j = 0; j < pts.length; j += 3) {
        ctx.moveTo(pts[j] + pts[j + 2], pts[j + 1])
        ctx.arc(pts[j], pts[j + 1], pts[j + 2], 0, Math.PI * 2)
      }
      ctx.fill()
    })

    // Hubs carry a faint ring.
    ctx.lineWidth = 0.6
    for (const n of nodes) {
      if (!n.hub || n.vis <= 0.05) continue
      ctx.strokeStyle = `rgba(${INK},${0.16 * n.vis * (0.4 + 0.6 * n.depth) * gain})`
      ctx.beginPath()
      ctx.arc(n.sx, n.sy, 4.2 * n.p, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Signals in flight.
    for (const pl of pulses) {
      const a = nodes[pl.path[pl.seg]]
      const b = nodes[pl.path[pl.seg + 1]]
      const e = 1 - Math.pow(1 - pl.s, 3)
      const tail = Math.max(0, e - 0.22)
      const x = a.sx + (b.sx - a.sx) * e
      const y = a.sy + (b.sy - a.sy) * e
      const vis = Math.min(a.vis, b.vis) * gain
      if (vis <= 0.01) continue
      const g = ctx.createLinearGradient(a.sx + (b.sx - a.sx) * tail, a.sy + (b.sy - a.sy) * tail, x, y)
      g.addColorStop(0, `rgba(${VIOLET},0)`)
      g.addColorStop(1, `rgba(${VIOLET},${0.7 * vis})`)
      ctx.strokeStyle = g
      ctx.lineWidth = 1.1
      ctx.beginPath()
      ctx.moveTo(a.sx + (b.sx - a.sx) * tail, a.sy + (b.sy - a.sy) * tail)
      ctx.lineTo(x, y)
      ctx.stroke()
      ctx.fillStyle = `rgba(${MID},${0.95 * vis})`
      ctx.beginPath()
      ctx.arc(x, y, 1.35, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function step(dt: number) {
    time += dt
    reveal = revealTarget > reveal ? Math.min(revealTarget, reveal + dt * revealRate) : Math.max(revealTarget, reveal - dt * 2.2)
    const engaged = opts.interactive ? updatePointer(dt) : false
    solve()

    relinkIn -= dt
    if (relinkIn <= 0) {
      relink()
      // Re-wire faster while the pointer bends the mesh, so connections reform around it.
      relinkIn = engaged ? 0.35 : 2.6
    }
    reorganiseIn -= dt
    if (reorganiseIn <= 0) {
      reorganise()
      reorganiseIn = 1.8 + Math.random() * 2.4
    }
    pulseIn -= dt
    if (pulseIn <= 0 && reveal > 0.9) {
      if (pulses.length < 3) spawnPulse()
      pulseIn = 2.2 + Math.random() * 2.8
    }

    for (const e of edges.values()) {
      e.w = damp(e.w, e.on ? 1 : 0, e.on ? 1.1 : 0.9, dt)
      e.heat = damp(e.heat, 0, 1.4, dt)
      if (!e.on && e.w < 0.004) edges.delete(key(e.a, e.b))
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pl = pulses[i]
      pl.s += dt / pl.dur
      const e = edges.get(key(pl.path[pl.seg], pl.path[pl.seg + 1]))
      if (e) e.heat = Math.max(e.heat, Math.min(1, pl.s * 1.4))
      if (pl.s >= 1) {
        pl.seg++
        pl.s = 0
        if (pl.seg >= pl.path.length - 1) pulses.splice(i, 1)
      }
    }
    draw()
  }

  layout()
  solve()
  relink()
  syncInter()
  // Start fully wired so the reveal shows structure, not edges growing in.
  for (const e of edges.values()) e.w = 1

  return {
    /** Run or pause the frame loop (pause whenever the section is off screen). */
    setRunning(on: boolean) {
      if (destroyed || on === !!stop) return
      if (on) stop = onTick((_, dt) => step(dt), 20)
      else {
        stop?.()
        stop = null
      }
    },
    /** Resolve out of darkness over `duration` seconds, or fade away. */
    reveal(on: boolean, duration = 1.8) {
      revealTarget = on ? 1 : 0
      revealRate = 1 / Math.max(duration, 0.01)
    },
    /** One still, fully resolved frame (reduced motion). */
    still() {
      reveal = revealTarget = 1
      solve()
      draw()
    },
    resize() {
      layout()
      solve()
      if (!stop) draw()
    },
    destroy() {
      destroyed = true
      stop?.()
      stop = null
    },
  }
}

export type Field = ReturnType<typeof createField>

/** A soft monochrome film-grain tile (gaussian, white on transparent) as a data URL. */
export function grainTile(size = 180) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  const rand = mulberry(0x9a1)
  for (let i = 0; i < size * size; i++) {
    // Sum of uniforms: close enough to gaussian, no harsh speckle.
    const n = (rand() + rand() + rand() + rand() - 2) / 2
    const o = i * 4
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255
    img.data[o + 3] = Math.min(255, Math.abs(n) * 2.2 * 255)
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}
