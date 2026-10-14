/**
 * The performance lab's switches (scripts/perf-lab.mjs): read only in development or in a build made with
 * VITE_PERF_LAB=1 (`npm run perf:build`); in a production build PERF_LAB is false and every check below folds
 * away. Nothing here changes what a visitor sees.
 *
 *   ?off=a,b    turn layers off, one at a time, to rank their cost: terrain (the landscape's whole loop),
 *               landscape (its dot lattice), inflow (the streamers), fx (the agent, comets, ring), robot (the
 *               robot's whole frame), robotdraw (its draw only), shadows, reflect, glows, dissolve, screenlight,
 *               env, beam (the stage's CSS pulse loop), sections (the sections' WebGL stage), post, videos
 *   ?rdpr=1.5   the robot's pixel ratio; ?tdpr= the landscape's
 *   ?hz=120     the display's refresh rate as the frame pacer takes it (src/core/clock.ts)
 *   ?lock=1     the pacer's even 30 from the start
 *   ?loop=1     the hero's last-resort loop (src/hero/loop.ts) from the start; off=loop never
 */
export const PERF_LAB = import.meta.env.DEV || import.meta.env.VITE_PERF_LAB === '1'

const params = PERF_LAB ? new URLSearchParams(location.search) : null
const offList = new Set((params?.get('off') ?? '').split(',').filter(Boolean))

/** This layer is switched off for a measurement. */
export const labOff = (layer: string) => PERF_LAB && offList.has(layer)

/** A numeric override (?name=value), or undefined. */
export function labNumber(name: string): number | undefined {
  if (!PERF_LAB) return undefined
  const v = params?.get(name)
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
