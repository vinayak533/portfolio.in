/**
 * The hero -> About shot as a pure function of scroll progress: one camera
 * move, read by the engine (what is drawn) and by transition.ts (the DOM), so
 * the picture and the page can never disagree. Scrolling back replays it
 * exactly; nothing here keeps moving once the scroll stops.
 *
 *   stillness     0 .. hold          the idle hero
 *   movement      hold ..            the camera eases out of rest
 *   push                             it travels toward the figure; each depth
 *                                    layer of the photo zooms at its own rate
 *   depth                            the air between camera and sky thickens:
 *                                    mist gathers in the far sky, then veils
 *                                    drift in from the depth and past the lens
 *   passage       camX 0 .. depth    the bank rolls over the island and the
 *                                    camera flies into it; the photo is gone
 *   transformation                   inside, moonlight dies and About's indigo
 *                                    glows through the far side of the bank
 *   reveal        camX > depth       the camera leaves the bank; its last
 *                                    layers stream past onto About, and settle
 */
import { heroConfig as cfg, transitionProfile } from './config'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export interface Shot {
  /** 0..1 along the camera move (distance travelled, not time). */
  move: number
  /** 0..1 the photo push, reaching 1 as the camera enters the bank. */
  push: number
  /** log of the photo zoom on the figure. */
  logZ: number
  /** The camera in bank coordinates (the main bank spans 0 .. bank.depth). */
  camX: number
  /** 1 the photo is drawn .. 0 it is hidden for good inside the bank. */
  sceneVis: number
  /** 0..1 how much atmosphere lies between the camera and the sky. */
  veil: number
  /** 0..1 the camera leaving the bank: About's world opening up. */
  emerge: number
  /**
   * 0..1 from the camera breaking out of the bank to coming to rest. Linear in
   * distance, so it inherits the camera's own settle: anything tied to it
   * (About's first lines) slows into place with the camera.
   */
  arrive: number
}

// ---- the camera's speed: eased in from rest, steady, settled to a stop (C1, no lurch)

let table: Float32Array | null = null
let tableKey = ''
const STEPS = 1024

function distanceTable() {
  const { easeIn, settle } = cfg.transition.move
  const key = `${easeIn}|${settle}`
  if (table && key === tableKey) return table
  const t = new Float32Array(STEPS + 1)
  const speed = (u: number) => smoothstep(0, Math.max(1e-3, easeIn), u) * (1 - smoothstep(1 - Math.max(1e-3, settle), 1, u))
  let acc = 0
  for (let i = 1; i <= STEPS; i++) {
    acc += 0.5 * (speed((i - 1) / STEPS) + speed(i / STEPS)) / STEPS
    t[i] = acc
  }
  for (let i = 0; i <= STEPS; i++) t[i] /= acc || 1
  table = t
  tableKey = key
  return t
}

/** Distance travelled (0..1) after `u` (0..1) of the move. */
function travel(u: number) {
  const t = distanceTable()
  const x = clamp01(u) * STEPS
  const i = Math.min(STEPS - 1, Math.floor(x))
  return t[i] + (t[i + 1] - t[i]) * (x - i)
}

// ---- the atmosphere's density along the view axis: a sum of soft-edged bands

type Band = [number, number, number, number]

/** [from, to, ramp, density] in bank coordinates, in the order clouds.frag reads them (at most 4). */
export function atmosphereBands(): Band[] {
  const A = cfg.transition.atmosphere
  const bands: Band[] = [[0, A.bank.depth, A.bank.ramp, A.bank.density], ...A.leading, A.trailing]
  return bands.slice(0, 4)
}

// Antiderivative of a band that ramps up over [a, a + r], holds, and ramps down over [b - r, b].
// Mirrored in clouds.frag (bandIntegral).
function rampIntegral(z: number, a: number, r: number) {
  const t = Math.min(Math.max(z - a, 0), r)
  return (t * t) / (2 * r) + Math.max(z - a - r, 0)
}
export function opticalDepth(x0: number, x1: number) {
  let tau = 0
  for (const [a, b, r0, s] of atmosphereBands()) {
    const r = Math.max(1e-3, Math.min(r0, (b - a) / 2))
    const F = (z: number) => rampIntegral(z, a, r) - rampIntegral(z, b - r, r)
    tau += s * (F(x1) - F(x0))
  }
  return tau
}

export function shotAt(progress: number): Shot {
  const T = cfg.transition
  const A = T.atmosphere
  const [from, to] = A.path
  const move = travel((progress - T.hold) / (1 - T.hold))
  const camX = from + (to - from) * move
  // The push is measured in the same travel: it lands as the camera enters the bank,
  // and keeps going (unseen) inside it, so there is no moment where the zoom stops.
  const atBank = clamp01(-from / (to - from)) || 1
  const push = clamp01(move / atBank)
  const logZ = Math.log(Math.max(1, transitionProfile().zoom)) * (move / atBank)
  // Deep enough inside that every pixel is behind a closed wall of cloud.
  const inside = A.bank.ramp + 0.15
  const sceneVis = 1 - smoothstep(inside, inside + 0.45, camX)
  const veil = 1 - Math.exp(-opticalDepth(camX, camX + A.scene.sky) * 0.5)
  const out = A.bank.depth - A.bank.ramp * 0.6
  const emerge = smoothstep(out, A.trailing[1], camX)
  const arrive = clamp01((camX - out) / Math.max(1e-3, to - out))
  return { move, push, logZ, camX, sceneVis, veil, emerge, arrive }
}
