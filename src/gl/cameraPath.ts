import { CatmullRomCurve3, Vector3 } from 'three'
import { world } from './world'
import { clamp, easeInOutCubic, remap } from '../core/clock'
import { experienceHead, holdEnd, worksTrack } from '../core/timeline'
import { layout } from '../theme'

export interface Pose {
  pos: Vector3
  look: Vector3
  fov: number
  roll: number
}

export const makePose = (): Pose => ({ pos: new Vector3(), look: new Vector3(), fov: 38, roll: 0 })

export const experienceCurve = new CatmullRomCurve3(world.experience.points, false, 'centripetal', 0.5)

const tmp = new Vector3()
const tmp2 = new Vector3()

/** Narrow screens need the camera further back to keep subjects in frame. */
const fit = (aspect: number) => (aspect < 1 ? 1 + (1 - aspect) * 1.25 : 1)

type PoseFn = (p: number, out: Pose, aspect: number) => void

// Hero: the type sheet covers the canvas while it holds; as it scrolls away the
// camera pushes in from further out and lands exactly on the About framing.
const hero: PoseFn = (p, out, aspect) => {
  const push = easeInOutCubic(remap(p, holdEnd('hero') * 0.6, 1))
  const z = world.about.center.z + 11.5 * fit(aspect) + (1 - push) * 9
  out.pos.set(0, (1 - push) * 0.6, z)
  out.look.set(0, 0, z - 12)
  out.fov = 38 + Math.sin(push * Math.PI) * 6
  out.roll = 0
}

const about: PoseFn = (p, out, aspect) => {
  const k = remap(p, 0, holdEnd('about'))
  const z = world.about.center.z + 11.5 * fit(aspect) - k * 1.1
  out.pos.set(0, 0, z)
  out.look.set(0, 0, z - 12)
  out.fov = 38
  out.roll = 0
}

const works: PoseFn = (p, out, aspect) => {
  const { x } = worksTrack(p)
  // Far enough back that a whole exhibit (plus margin) fits the frame width.
  // Landscape sits the card off-centre by the camera's side offset.
  // Portrait (phones) is width-bound: a slim margin lets the reel fill ~92% of the screen.
  const side = aspect > 1 ? 0.6 : 0
  const margin = aspect < 1 ? 0.45 : 1.2
  const span = layout.worksScreen + margin + side * 2
  const back = Math.max(8.6, span / (2 * Math.tan((36 * Math.PI) / 360) * aspect))
  // Sits the exhibits a little high, clear of the title and index below them.
  out.pos.set(x - side, 0.05, world.works.z + back)
  out.look.set(x, -0.2, world.works.z)
  out.fov = 36
  out.roll = 0
}

const experience: PoseFn = (p, out, aspect) => {
  const u = experienceHead(p)
  const head = experienceCurve.getPointAt(clamp(u, 0, 1), tmp)
  const tangent = experienceCurve.getTangentAt(clamp(u, 0, 1), tmp2)
  const back = 6.2 * fit(aspect)
  out.pos.copy(head).addScaledVector(tangent, -back)
  out.pos.x += 2.2
  out.pos.y += 1.1
  out.look.copy(experienceCurve.getPointAt(clamp(u + 0.05, 0, 1)))
  out.fov = 42
  out.roll = -0.04
}

const contact: PoseFn = (p, out, aspect) => {
  const c = world.contact.center
  const k = easeInOutCubic(clamp(p))
  out.pos.set(c.x, c.y + 0.2, c.z + (12.5 - 2.5 * k) * fit(aspect))
  out.look.set(c.x, c.y - 0.1, c.z)
  out.fov = 36
  out.roll = 0
}

const fns: PoseFn[] = [hero, about, works, experience, contact]
const blendFrom = [1, holdEnd('about'), holdEnd('works'), holdEnd('experience'), 1]

const a = makePose()
const b = makePose()

/** Pose for global t (section index + progress), blending each hand-off into the next act. */
export function poseAt(t: number, aspect: number, out: Pose) {
  const i = clamp(Math.floor(t), 0, fns.length - 1)
  const p = clamp(t - i)
  fns[i](p, a, aspect)
  const from = blendFrom[i]
  if (p > from && i < fns.length - 1) {
    fns[i + 1](0, b, aspect)
    const k = easeInOutCubic(remap(p, from, 1))
    a.pos.lerp(b.pos, k)
    a.look.lerp(b.look, k)
    a.fov += (b.fov - a.fov) * k
    a.roll += (b.roll - a.roll) * k
  }
  out.pos.copy(a.pos)
  out.look.copy(a.look)
  out.fov = a.fov
  out.roll = a.roll
  return out
}
