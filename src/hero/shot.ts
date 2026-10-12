/**
 * The hero -> About hand-off as a pure function of scroll progress, read by the engine (when the backdrop
 * parts) and by transition.ts (the DOM), so the picture and the page can never disagree. Scrolling back
 * replays it exactly; nothing here keeps moving once the scroll stops.
 *
 *   stillness   0 .. hold      the idle hero
 *   travel      hold .. 1      eased in from rest, steady, settled to a stop (C1, no lurch)
 *   part                       the hero's backdrop gives way to About's world (sceneVis 1 -> 0)
 *   arrive                     About's page arrives, slowing into place with the travel's settle
 */
import { heroConfig as cfg } from './config'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export interface Shot {
  /** 0..1 along the hand-off (distance travelled, not time). */
  move: number
  /** 1 the hero's backdrop is whole .. 0 it has parted onto About's world. */
  sceneVis: number
  /** 0..1 from About starting to arrive to coming to rest (linear in distance: it inherits the settle). */
  arrive: number
}

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
    acc += (0.5 * (speed((i - 1) / STEPS) + speed(i / STEPS))) / STEPS
    t[i] = acc
  }
  for (let i = 0; i <= STEPS; i++) t[i] /= acc || 1
  table = t
  tableKey = key
  return t
}

/** Distance travelled (0..1) after `u` (0..1) of the hand-off. */
function travel(u: number) {
  const t = distanceTable()
  const x = clamp01(u) * STEPS
  const i = Math.min(STEPS - 1, Math.floor(x))
  return t[i] + (t[i + 1] - t[i]) * (x - i)
}

export function shotAt(progress: number): Shot {
  const T = cfg.transition
  const move = travel((progress - T.hold) / (1 - T.hold))
  return {
    move,
    sceneVis: 1 - smoothstep(T.part[0], T.part[1], move),
    arrive: clamp01((move - T.arrive) / (1 - T.arrive)),
  }
}
