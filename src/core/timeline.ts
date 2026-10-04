/**
 * Pure scroll-timeline math shared by the DOM and the WebGL camera. Kept free
 * of three.js so the DOM shell can load and paint before the 3D stage.
 */
import { sectionHeights, layout } from '../theme'
import { experience, projects } from '../content'
import { remap } from './clock'

/** Fraction of each section where its sticky stage holds (the rest is the hand-off). */
export const holdEnd = (id: keyof typeof sectionHeights) => {
  const h = sectionHeights[id]
  return id === 'contact' ? 1 : (h - 100) / h
}

/** Works: camera x for a given section progress, with a gentle dwell at each exhibit. */
export function worksTrack(p: number) {
  const n = projects.length
  const k = remap(p, 0.03, holdEnd('works') - 0.03) * (n - 1)
  const i = Math.min(Math.floor(k), n - 2)
  const f = k - i
  const dwell = f * f * (3 - 2 * f)
  return { x: layout.worksStartX + (i + f * 0.35 + dwell * 0.65) * layout.worksSpacing, k }
}

/** Experience: 0..1 position of the beam head along the path. */
export function experienceHead(p: number) {
  return remap(p, 0.02, holdEnd('experience') - 0.02)
}

/** Path parameter of each role's waypoint along the beam. */
export const waypointU = experience.map((_, i, a) => 0.16 + (i / Math.max(a.length - 1, 1)) * 0.66)
