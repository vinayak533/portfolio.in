/**
 * The loss landscape: the ground the robot's stage stands on, and the hero's farthest layer (stage.ts
 * mounts it). The robot sits at the global minimum.
 *
 *   camera    its own virtual camera (40 deg vertical field, pitched 29 deg down), not the robot's: the
 *             surface is seen from above, so its dots, slopes and contours read. A lens shift puts the
 *             world's origin, the centre of the basin's flat bottom, exactly under the dais's centre on
 *             screen (dom.ts stageFrame), and the plateau is sized to the dais's on-screen ellipse (6%
 *             larger), so the dais sits on it without a seam.
 *   terrain   one grid of light dots on the ground plane, displaced in the vertex shader by f(x, z): a
 *             wide bowl (flat inside the plateau) rising steeply to the left, right and far edges, plus
 *             four secondary wells and four hills and a little smooth noise. Its far rim is the horizon
 *             (~36% of the height, 34% on phones), where a violet band glows behind a few dark, layered
 *             far ridges. Rows are spaced geometrically in depth and columns evenly in x, so the dots
 *             stay distinct (not streaks) from the foreground to the rim. Slopes #A78BFA at 30-50%; the
 *             basin round the plateau #C4B5FD at 60-75%; crests and rim #C4B5FD at 55-70%, 20% larger,
 *             with a soft halo; every 7% of height a contour row 35% brighter; far dots smaller, hazier,
 *             toward #7C5CFF, the farthest quarter out of focus. Dot sizes come in three tiers by depth
 *             (large, medium, small), fixed per row. Round the robot (its silhouette plus 12%, feathered)
 *             everything is dimmed to 45%, a dark pocket that frames it.
 *   motion    an energy system on the hero's one clock (src/hero/motion.ts: the 96 BPM beat, and ENERGY, a
 *             0..1 scalar that interaction raises and that eases back to 0.35 over 1.2 s), richer but never
 *             noisier: every motion is a smooth swell, Gaussian or sine, never per-dot jitter or twinkle.
 *               breath    the surface breathes (+-2.5%, a 5 s sine)
 *               waves     every 2 beats a low pulse wave runs out from the stage (1% of the relief high, 12% of
 *                         the width long, 14% of the width a second, fading with distance), its crest 10%
 *                         brighter; every 4 beats a longer, slower one (0.7%, 21%, 8%) from either flank in
 *                         turn. The two families cross in a ripple-tank interference; all displacement is
 *                         clamped to 2% of the relief
 *               wake      desktop: the pointer presses a soft Gaussian (9% of the width, 1.2% of the relief)
 *                         into the surface, a short wake fading over 900 ms; touch: a tap sends one ring out
 *                         from where it landed (25% of the width, 1.2 s)
 *               tremor    each typing burst on the laptop shivers the first rows round the plateau (0.4%, 240 ms)
 *               sweep     every 10 beats (6.25 s) a band of light (+12%, 14% of the width) crosses the crests
 *                         and the rim from left to right, eased in and out at the edges
 *               comets    every 14 beats (8.75 s) one faint comet (#C4B5FD, a 14-dot trail, at most 35%) arcs
 *                         over the far ridges on one side or the other, in 2.2 s
 *               ENERGY    up to +25% on the waves' speed and +8% on the dots' brightness
 *             At most 9 background systems move at once (these 7 with the agent, the beam and the
 *             horizon's breath, stage.ts), only the landing flash passes +15% (0.4 s, every 7 s), and the
 *             dots never pass ~70%: the robot's visor and the laptop's screen stay the brightest things.
 *   agent     a bright point doing momentum gradient descent (0.9) on the same f, planned here on the
 *             CPU with finite differences: from a high rim at the far left or right (alternating), down
 *             through one secondary well (it slows, circles, escapes), to the plateau's front edge, on a
 *             7 s cycle: spawn 0.4 s, descent 5.2 s, the landing (the plateau flashes for 0.4 s, a ring of
 *             dots runs out over the surface for 1.1 s, a faint column rises), the wells and hills easing
 *             into a new arrangement over 1.6 s as the next agent comes from the other side. Each spawn is
 *             published (stageCues.agentAt, and the agent's screen position while it is live): the robot's
 *             eyes find it (engine.ts).
 *
 *   vortex    the inflow: dots drawn into the stage like a gravity well. Each starts on the visible bowl's outer
 *             ring (85-100% of it), rides the same surface (0.6% of the relief above it) inward along a
 *             logarithmic spiral on one of three arms (+-6 deg), clockwise from the camera, its radial speed
 *             growing as 1/r^0.6 and its turn with it; it lives 6-9 s (5-7 s on phones), seeded and staggered.
 *             Far 1.5 px at 6%, mid ~2.75 px at 18-24%, near 2 px at up to 38%, #A78BFA to #C4B5FD; in the
 *             last 10% before the stage's rim it shrinks, fades and dips 3% below the surface. Half as bright
 *             within the robot's silhouette (+10%). +6% on the beat; ENERGY up to +15% speed, a landing +25%
 *             for 0.6 s (one flow clock, integrated here, so speed changes never jump). The arms turn once per
 *             24 s; a faint arc on the dais's outer ring turns with them (engine.ts, dots.ts). All analytic in
 *             one vertex shader, one draw. HIGH 700, MEDIUM 350, LOW 140 dots (no arc); the first thing the
 *             ladder sheds (half, then off). Fades out over hero progress 0 .. 0.6 and stops there. Reduced
 *             motion: a still 40% of it at 70%, no arc.
 *
 * Everything is emissive and additive on its own canvas under the robot's layer: it lights, shadows and
 * covers nothing of the robot. By tier (src/hero/tier.ts): MEDIUM a 100 x 60 grid on phones, no depth of
 * field, waves at 70%, the wake only as tap ripples; LOW (also automatic lite) an 80 x 48 grid at a pixel
 * ratio of 1, no waves, sweep, comets, depth of field, glow, morph or parallax, a 24-dot trail, a 60-dot
 * ring, 30 frames a second. Reduced motion: one still frame, the agent resting at the plateau's edge with
 * its trail. Paused while the hero is off screen, the tab hidden or the backdrop faded. When frames run
 * over budget for 2 s (tier.ts overBudget; the engine's governor, stageCues.degrade; this layer's own watchdog where that does
 * not run) it gives up, one step at a time: the interference waves, the comets, grid density, trail length
 * with the glow, depth of field and ring dots, its pixel ratio, then its frame rate.
 */
import { stageCues, type StageFrame } from './dom'
import { easeInOut, easeOut, energy, heroScroll, masterBeats } from '../motion'
import { overBudget, SLOW_FRAME, TIERS, type HeroTier } from '../tier'
import { createPacer, pacing } from '../../core/clock'
import { FROZEN, randomSource } from '../freeze'
import { PERF_LAB, labNumber, labOff } from '../../core/perfLab'

const VIOLET = [124 / 255, 92 / 255, 255 / 255]
const LILAC = [167 / 255, 139 / 255, 250 / 255]
const GLOW = [196 / 255, 181 / 255, 253 / 255]
const vec3 = (c: number[]) => `vec3(${c.map((v) => v.toFixed(4)).join(',')})`

/** The landscape camera: vertical field of view and pitch (radians). */
const FOV = (40 * Math.PI) / 180
const PITCH = (29 * Math.PI) / 180
const SIN = Math.sin(PITCH)
const COS = Math.cos(PITCH)
/** The horizon (the far rim), as a share of the hero's height. */
const HORIZON = { wide: 0.36, phone: 0.22 }
/** The plateau, as a multiple of the dais's on-screen ellipse. */
const PLATEAU = 1.06
/**
 * The bowl, in screen terms at the stage's depth (shares of the height): how far its side walls rise at
 * the screen's edges, how high its far rim stands, and the crater lip round the plateau (the valley floor's
 * height above the stage), so the plateau is the lowest ground there is.
 */
const RELIEF = { side: 0.34, far: 0.07, lip: 0.065 }
/**
 * Phones: the robot fills the width, so the bowl is set wider than the screen (its walls climb into view
 * in the far rows, beside and above the robot, instead of shooting off the top), with gentler walls.
 */
const PHONE = { side: 0.18, far: 0.05, lip: 0.05, width: 1.35 }
/** Seconds per beat on the hero's clock (beat.ts: 96 BPM). */
const BEAT_S = 60 / 96
/**
 * The stage's pulse waves: one every `every` beats, a single raised-sine swell `amp` of the relief high and
 * `length` of the width long, travelling `speed` of the width a second, fading over `reach` of the width
 * (and gone by `life`); its crest `crest` brighter. All the surface's displacement together is clamped to
 * `clamp` of the relief.
 */
const WAVE = { every: 2, amp: 0.01, length: 0.12, speed: 0.14, reach: 0.55, life: 1.0, crest: 0.1, clamp: 0.02 }
/**
 * The flank waves (the interference family): one every `every` beats, longer and slower, from either flank
 * in turn (`source`: x as a share of the bowl's half-width, z of its depth).
 */
const FLANK = { every: 4, amp: 0.007, length: 0.21, speed: 0.08, life: 0.9, crest: 0.07, source: [0.46, -0.3] }
/**
 * The pointer's wake (desktop): a sample every `every` s while it moves, each a Gaussian `radius` of the width
 * across (two sigmas), `amp` of the relief deep (`share` of it per sample, so a slow pass does not stack
 * up), fading over `life` s; `lit` brighter at its centre.
 */
const WAKE = { radius: 0.09, amp: 0.012, share: 0.4, life: 0.9, every: 0.09, lit: 0.06 }
/** A tap (touch): one ring out from where it landed to `radius` of the width in `life` s, `length` wide. */
const TAP = { radius: 0.25, life: 1.2, length: 0.05, amp: 0.012, lit: 0.12 }
/** The typing tremor round the plateau: `amp` of the relief, `cycles` damped swings over `life` s. */
const TREMOR = { amp: 0.004, life: 0.24, cycles: 3 }
/** The light sweep: every `every` beats a band (`width` of the screen, `gain` brighter) crosses in `travel` beats. */
const SWEEP = { every: 10, travel: 6, gain: 0.12, width: 0.14 }
/** The comets: every `every` beats one, `life` s long, a `head` px head and `trail` dots, at most `alpha`. */
const COMET = { every: 14, life: 2.2, head: 2.6, trail: 14, alpha: 0.35 }
/** ENERGY's reach: the waves' speed and the dots' brightness at full energy. */
const LIFT = { speed: 0.25, bright: 0.08 }
/** Uniform slots: the stage's waves in flight, the flank waves, the wake's samples. */
const FRONTS_A = 6
const FRONTS_B = 5
const WAKES = 6
/** The surface's breath: +-2.5% over a 5 s sine. The horizon's glow: +-8% over 4 s. */
const BREATH = { amp: 0.025, period: 5 }
const HAZE = { amp: 0.08, period: 4 }
/** The landing point: on the plateau's edge, this far (radians) round from its front, on the agent's side. */
const LAND_ANGLE = (60 * Math.PI) / 180
const WELLS = 4
const HILLS = 4
/** Dot spacing at the stage's depth (px, across and down) and the point budget per size. */
const GRID = {
  desktop: { sx: 13, sy: 9.5, budget: 220 * 130 },
  tablet: { sx: 16, sy: 11, budget: 140 * 80 },
  phone: { sx: 8, sy: 6.5, budget: 100 * 60 },
} as const
/** The grid's density against the spacing above: 15% fewer dots, 25% on phones. */
const DENSITY = { desktop: 0.85, tablet: 0.85, phone: 0.75 } as const
/** Dot size tiers (px): small (far), medium, large (near). */
const DOT = { wide: [3, 4.5, 6], phone: [2.6, 3.4, 4.4] } as const
/**
 * The lattice drain (see the header): every dot of the landscape flows into the stage. Its rim-to-stage time
 * (s; phones), the radial profile (rho^K falls linearly in time: speed ~ 1/rho^(K-1), slow far out, fast near the
 * stage), the spiral's twist (rad per e-fold of radius, clockwise from the camera), the fall into the rim (its
 * share of the path, at most `rim` plateau radii wide; the dip as a share of the relief), the fade-in at the outer ring (share of the path), how the
 * dots are shared between directions (weight (rho0^K - 1)^share: the far side, longer and foreshortened, gets more
 * of them), and the margin round the screen the outer ring reaches (share of the width).
 */
const DRAIN = { life: 6, phoneLife: 5.5, K: 1.6, twist: 0.7, fall: 0.1, rim: 0.3, drop: 0.03, born: 0.04, share: 0.72, margin: 0.06 }
/** Floats per landscape dot: aFlow (4): a flowing dot's birth direction, phase, outer ring and seed, or (x, z, 0, seed) for a still one. */
const DRAIN_STRIDE = 4
/** Directions in the outer ring's table, and in its coarse copy the streamers read (a uniform array). */
const RING_STEPS = 360
const RING_U = 36
/** Gradient descent: momentum, step, the arrival radius (world), the most steps. */
const GD = { beta: 0.9, lr: 0.0016, arrive: 0.05, max: 2600 }
/**
 * Cycle timing (s), 7 s in all: the agent's fade-in, the descent, the landing's ring, the reshape and when it
 * starts, and the wait from the landing to the next spawn.
 */
const CYCLE = { spawn: 0.4, descent: 5.2, land: 1.1, morphAt: 0.1, morph: 1.6, rest: 1.4 }
/** The landing's flash on the plateau (s): at most 0.4 s, to 85%. */
const FLASH = 0.4
/** The landing ring: dots, peak opacity, reach (share of the width; phones). */
const RING = { dots: 140, lite: 60, degraded: 70, alpha: 0.75, reach: 0.6, phoneReach: 0.8 }
/**
 * The inflow vortex (see the header): dots per tier, arms and their jitter, the outer ring (share of the visible
 * bowl), lifetimes (s), the spiral's twist (rad per e-fold of radius), the arms' revolution (s), the hover and
 * the final dip (shares of the relief) and the fall's share of the path, the reactions (beat, ENERGY, landing
 * over landS s), the robot's clearance (floor, margin and feather as shares of its height), reduced motion's
 * share and opacity, the scroll fade (hero progress), and the rim's arc (gain, width).
 */
const VORTEX = {
  count: { high: 600, medium: 300, low: 120 } as Record<HeroTier, number>,
  arms: 3,
  jitter: (6 * Math.PI) / 180,
  start: [0.85, 1] as [number, number],
  life: [5, 7] as [number, number],
  phoneLife: [5, 6.5] as [number, number],
  /** The trail: dots behind each streamer (against its travel), and their spacing on its clock (s). */
  trail: 4,
  trailGap: 0.07,
  twist: 3.2,
  turn: 24,
  hover: 0.006,
  drop: 0.03,
  fall: 0.1,
  beat: 0.06,
  energy: 0.15,
  land: 0.25,
  landS: 0.6,
  clear: { floor: 0.5, margin: 0.1, feather: 0.06 },
  still: 0.4,
  stillAlpha: 0.7,
  fade: [0, 0.6] as [number, number],
  arc: { gain: 0.1, width: (70 * Math.PI) / 180 },
}
/** Floats per vortex point: aSeed (4), aArm (1), aTrail (1: 0 the head, then its trail). */
const VORTEX_STRIDE = 6
/** The trail: dots (over ~2 s), lite, degraded. */
const TRAIL = { dots: 70, lite: 24, degraded: 40, span: 2 }

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** The landscape's random source (seeded under ?freeze, src/hero/freeze.ts). */
let random = Math.random
const rand = (a: number, b: number) => a + random() * (b - a)

/* ---- The height field and the projection, shared by every program (and twinned on the CPU below). */

const FIELD = /* glsl */ `
uniform vec4 uWell[${WELLS}];  // x, z, sigma (world), depth (share of the bowl, 0..0.6)
uniform vec4 uHill[${HILLS}];  // x, z, sigma, height (world)
uniform vec4 uBowl;            // half-width Bx, depth Bz, the side walls' relief (world), breath
uniform vec2 uBowl2;           // the far rim's relief, the crater lip's (world)
uniform vec2 uPlat;            // the plateau's radii (x, z)
uniform vec4 uCam;             // distance D, focal length (px), sin, cos of the pitch
uniform vec4 uScr;             // the origin on screen (px), the canvas's size (px)
uniform vec2 uShift;           // parallax at the stage's depth (px)
float plateau(vec2 p) { return length(p / uPlat); }
// The bowl: side walls rising steeply to the screen's edges, a lower far rim, the crater lip round the plateau.
float bowl(vec2 p) {
  float ex = abs(p.x) / uBowl.x;
  float ez = max(-p.y, 0.0) / uBowl.y;
  float nx = p.x / uBowl.x;
  float peaks = 0.7 + 0.45 * (1.0 - abs(sin(nx * 2.3 + 0.7))) + 0.2 * sin(nx * 5.1 + 2.0);
  return uBowl.z * min(2.4, pow(ex, 2.4)) * (1.0 + 0.3 * ez) + uBowl2.x * min(1.6, pow(ez, 1.8)) * peaks + uBowl2.y * smoothstep(1.0, 2.2, plateau(p));
}
float field(vec2 p) {
  float m = smoothstep(1.0, 1.32, plateau(p));
  float b = bowl(p);
  float w = 0.0;
  for (int i = 0; i < ${WELLS}; i++) {
    vec2 d = p - uWell[i].xy;
    w += uWell[i].w * exp(-dot(d, d) / (2.0 * uWell[i].z * uWell[i].z));
  }
  float h = 0.0;
  for (int i = 0; i < ${HILLS}; i++) {
    vec2 d = p - uHill[i].xy;
    h += uHill[i].w * exp(-dot(d, d) / (2.0 * uHill[i].z * uHill[i].z));
  }
  vec2 n = vec2(p.x / uBowl.x, p.y / uBowl.y);
  float noise = 0.6 * sin(n.x * 5.3 + 1.7) * sin(n.y * 4.1 + 0.4) + 0.4 * sin(n.x * 11.7 - n.y * 9.3 + 2.1);
  return m * (b * max(0.25, 1.0 - w) + h + 0.08 * uBowl.z * noise) * uBowl.w;
}
// World (x, height, z) to screen px; z is the depth from the camera.
vec3 project(vec3 P) {
  float depth = uCam.x - P.y * uCam.z - P.z * uCam.w;
  float vert = P.y * uCam.w - P.z * uCam.z;
  float k = uCam.y / max(depth, 0.05);
  return vec3(uScr.x + P.x * k + uShift.x * uCam.x / depth, uScr.y - vert * k + uShift.y * uCam.x / depth, depth);
}
vec4 toClip(vec2 s) {
  return vec4(s.x / uScr.z * 2.0 - 1.0, 1.0 - s.y / uScr.w * 2.0, 0.0, 1.0);
}
// The robot's clearing: dimmed (0.45) inside its silhouette (the head's disc, a box round the body, chair and
// desk) plus the margin, rising to 1 over the feather.
uniform vec3 uHead;
uniform vec4 uBody;
uniform vec3 uClear;           // margin, feather (px), the pocket's floor (0.45; lighter on phones)
float clearing(vec2 s) {
  float dh = length(s - uHead.xy) - uHead.z;
  vec2 c = (uBody.xy + uBody.zw) * 0.5;
  vec2 h = (uBody.zw - uBody.xy) * 0.5;
  vec2 d = abs(s - c) - h;
  float db = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return mix(uClear.z, 1.0, smoothstep(uClear.x, uClear.x + uClear.y, min(dh, db)));
}
`

const TERRAIN_VS = /* glsl */ `
precision highp float;
attribute vec4 aFlow;          // flowing: birth direction (rad), phase (0..1), outer ring (plateau radii), seed; still: x, z (world), 0, seed
uniform float uDpr;
uniform vec2 uFlowT;           // the flow clock (s: ENERGY and a landing speed it up), the rim-to-stage time (s)
uniform vec2 uDepth;           // the grid's nearest and farthest depth
uniform vec4 uSize;            // size at the stage's depth (px); the small, medium and large tiers (px)
uniform float uRowK;           // the depth ratio between rows (log)
uniform vec2 uFx;              // depth of field, contours+glow (0/1)
uniform vec4 uFrontA[${FRONTS_A}];  // the stage's waves: front distance from the plateau's rim, height (world), crest gain
uniform vec4 uFrontB[${FRONTS_B}];  // the flank waves: source (x, z), front radius, height (world; 0 off)
uniform vec4 uWaveK;           // the two families' wavelengths, the fade distance, the clamp on all displacement (world)
uniform vec4 uWake[${WAKES}];       // the pointer's wake: centre (x, z), height (world; negative, pressed in), brightness gain
uniform vec4 uTap;             // a tap's ring: centre (x, z), radius, height (world; 0 off)
uniform vec4 uMove;            // the wake's sigma, the tap ring's wavelength (world), its brightness gain, the tremor's height (world)
uniform vec4 uSweep;           // the light sweep: centre x (px), half-width (px), gain (0 off); ENERGY's brightness gain
uniform vec4 uLand;            // the landing point (x, z), the flash (0..1), the bottom fade's start (px)
uniform vec3 uRing;            // the ring's radius and width (in plateau radii, from the plateau's centre), strength
varying vec4 vCol;
varying vec4 vShape;
${FIELD}
float hillPeak(vec2 p) {
  float k = 0.0;
  for (int i = 0; i < ${HILLS}; i++) {
    vec2 d = p - uHill[i].xy;
    float g = exp(-dot(d, d) / (2.0 * uHill[i].z * uHill[i].z));
    k = max(k, smoothstep(0.55, 0.95, g) * step(0.05, uHill[i].w));
  }
  return k;
}
// One raised-sine swell, len long, d behind its front (0 outside it).
float hump(float d, float len) {
  return d > 0.0 && d < len ? 0.5 - 0.5 * cos(6.2832 * d / len) : 0.0;
}
void main() {
  // The drain: a flowing dot slides in from its outer ring along a gentle spiral (turning clockwise from the
  // camera, faster as it nears the stage), falls into the stage's rim over the last ${(DRAIN.fall * 100).toFixed(0)}% of its path and
  // is reborn on the outer ring. The dots are spread evenly over (direction, phase), so the field it makes is
  // the same at every moment: a continuous drain, no seam, no waves of rebirth.
  vec2 aPos = aFlow.xy;
  float fall = 0.0;
  float born = 1.0;
  if (aFlow.z > 0.5) {
    float u = fract(aFlow.y + uFlowT.x / uFlowT.y);
    float r0k = pow(aFlow.z, ${DRAIN.K.toFixed(2)});
    float rho = pow(r0k - u * (r0k - 1.0), ${(1 / DRAIN.K).toFixed(4)});
    float th = aFlow.x + ${DRAIN.twist.toFixed(2)} * log(aFlow.z / rho);
    aPos = vec2(cos(th), sin(th)) * rho * uPlat;
    fall = 1.0 - smoothstep(1.0, 1.0 + min(${DRAIN.fall.toFixed(2)} * (aFlow.z - 1.0), ${DRAIN.rim.toFixed(2)}), rho);
    born = smoothstep(0.0, ${DRAIN.born.toFixed(2)}, u);
  }
  float f = field(aPos) - uBowl.z * ${DRAIN.drop.toFixed(3)} * fall;
  float rP = plateau(aPos);
  // The surface's motion, all smooth swells and Gaussians: the stage's waves, the flank waves crossing them
  // (the interference), the pointer's wake and a tap's ring, summed and clamped; the plateau under the dais
  // stays still. The typing tremor shivers only the first rows round it.
  float away = max(rP - 1.0, 0.0) * uPlat.x;
  float fadeA = exp(-away / uWaveK.z);
  float disp = 0.0;
  float lit = 0.0;
  for (int i = 0; i < ${FRONTS_A}; i++) {
    float h = hump(uFrontA[i].x - away, uWaveK.x) * fadeA;
    disp += uFrontA[i].y * h;
    lit += uFrontA[i].z * h;
  }
  for (int i = 0; i < ${FRONTS_B}; i++) {
    float r = length(aPos - uFrontB[i].xy);
    float h = hump(uFrontB[i].z - r, uWaveK.y) * exp(-r / uWaveK.z);
    disp += uFrontB[i].w * h;
    lit += ${FLANK.crest.toFixed(2)} * h * step(1e-6, uFrontB[i].w);
  }
  for (int i = 0; i < ${WAKES}; i++) {
    vec2 q = aPos - uWake[i].xy;
    float g = exp(-dot(q, q) / (2.0 * uMove.x * uMove.x));
    disp += uWake[i].z * g;
    lit += uWake[i].w * g;
  }
  float tap = hump(uTap.z - length(aPos - uTap.xy), uMove.y);
  disp += uTap.w * tap;
  lit += uMove.z * tap;
  disp *= smoothstep(1.02, 1.3, rP);
  disp += uMove.w * smoothstep(0.99, 1.02, rP) * (1.0 - smoothstep(1.1, 1.16, rP));
  f += clamp(disp, -uWaveK.w, uWaveK.w);
  vec3 s = project(vec3(aPos.x, f, aPos.y));
  float hn = clamp(f / uBowl.z, 0.0, 1.0);
  float far = clamp((s.z - uDepth.x) / (uDepth.y - uDepth.x), 0.0, 1.0);

  // Slopes: #A78BFA at 28-45%.
  vec3 col = ${vec3(LILAC)};
  float a = mix(0.28, 0.45, smoothstep(0.06, 0.5, hn));
  // Size: the perspective size (continuous, so a dot never pops as it flows nearer) within the small and large
  // tiers, and each dot one of three tiers of it (its seed).
  float tierK = aFlow.w < 0.34 ? 0.82 : aFlow.w < 0.67 ? 1.0 : 1.18;
  float size = clamp(uSize.x * uCam.x / s.z, uSize.y, uSize.w) * tierK;
  // The basin round the plateau: #C4B5FD, brightest at its rim (75%), fading outward.
  float basin = smoothstep(0.98, 1.06, rP) * (1.0 - smoothstep(1.2, 1.9, rP));
  a = mix(a, mix(0.75, 0.6, smoothstep(1.1, 1.6, rP)), basin);
  col = mix(col, ${vec3(GLOW)}, basin);
  // On the plateau, under the dais: as faint as the dais's own dots, so the two meet without a seam.
  float on = 1.0 - smoothstep(0.96, 1.06, rP);
  a = mix(a, 0.14 + 0.1 * rP, on);
  // Crests and the rim: #C4B5FD at 55-70%, 20% larger, with a soft glow.
  float rim = smoothstep(0.86, 1.0, -aPos.y / uBowl.y);
  float crest = max(max(smoothstep(0.6, 0.9, hn), hillPeak(aPos)), 0.7 * rim) * (1.0 - on);
  a = mix(a, mix(0.55, 0.7, smoothstep(0.75, 1.0, hn)), crest);
  col = mix(col, ${vec3(GLOW)}, crest);
  float halo = crest * uFx.y;
  // Contours: every 7% of height a row 35% brighter.
  float c = fract(hn / 0.07);
  float line = (1.0 - smoothstep(0.0, 0.3, min(c, 1.0 - c))) * smoothstep(1.1, 1.3, rP) * step(0.03, hn);
  a *= 1.0 + line * uFx.y * 0.35;
  // The light sweep crossing the crests and the rim (+12% at its centre); ENERGY's lift (up to +8%).
  float sw = (s.x - uSweep.x) / uSweep.y;
  a *= 1.0 + uSweep.z * crest * exp(-sw * sw) + uSweep.w;
  // Distance: hazier, toward #7C5CFF; the farthest quarter out of focus (softer, not larger).
  a *= mix(1.0, 0.7, smoothstep(0.3, 1.0, far));
  col = mix(col, ${vec3(VIOLET)}, 0.6 * smoothstep(0.4, 1.0, far) * (1.0 - 0.5 * crest));
  float blur = uFx.x * smoothstep(0.75, 0.95, far);
  a *= 1.0 - 0.3 * blur;
  // Where rows crowd together on screen (a slope turned away), each dot is fainter: dots, not lines.
  vec2 nb = vec2(aPos.x, aPos.y - s.z * uRowK / uCam.w);
  float gap = abs(project(vec3(nb.x, field(nb), nb.y)).y - s.y);
  a *= clamp(gap / (uSize.x * 1.4), 0.45, 1.0);
  // Falling into the rim it shrinks and fades; reborn on the outer ring it fades in.
  a *= (1.0 - fall) * born;
  size *= 1.0 - 0.7 * fall;
  // The last rows thin into the horizon; the bottom fades into the vignette.
  a *= 1.0 - smoothstep(0.97, 1.0, far);
  a *= 1.0 - smoothstep(uLand.w, uScr.w, s.y);
  // The landing ring passing: dots swell 25% and brighten, then relax; just behind it a darker wake, so the
  // front stands out even crossing the bright basin.
  float rr = (rP - uRing.x) / uRing.y;
  float front = exp(-rr * rr) * uRing.z;
  float wake = (1.0 - smoothstep(-4.0, -1.2, rr)) * smoothstep(-9.0, -5.0, rr) * uRing.z;
  size *= 1.0 + 0.25 * front;
  a = (a + 0.3 * front) * (1.0 - 0.5 * wake);
  col = mix(col, ${vec3(GLOW)}, front);
  // The dots riding a wave's crest (10%, the flank waves' 7%), the wake and a tap's ring: never past +15%.
  a *= 1.0 + min(lit, 0.15);
  // The robot's dark pocket; the plateau's flash (to 85%) shows round it.
  float flash = uLand.z * (1.0 - smoothstep(1.0, 1.35, rP));
  a = mix(a * clearing(s.xy), 0.85, flash);
  // Never brighter than ~70%: the robot's visor and the laptop's screen stay the brightest things in frame.
  a = min(a, max(0.7, 0.85 * flash));
  // The halo grows the sprite, not the dot; whole device pixels, so sizes never shimmer.
  float sprite = max(1.0, ceil(size * (1.0 + 2.2 * halo) * uDpr));
  vCol = vec4(col, a);
  vShape = vec4(min(1.0, size * uDpr / sprite), blur, halo * 0.32, 0.0);
  gl_PointSize = sprite;
  gl_Position = a < 0.004 || size < 0.3 || s.z < 0.1 ? vec4(2.0, 2.0, 2.0, 1.0) : toClip(s.xy);
}
`

const DOT_FS = /* glsl */ `
precision mediump float;
varying vec4 vCol;
varying vec4 vShape;   // the dot's share of the sprite, blur, halo, gaussian
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float disc = 1.0 - smoothstep(mix(0.55, 0.0, vShape.y), 1.0, r / vShape.x);
  float gauss = exp(-r * r * 3.2) * (1.0 - smoothstep(0.7, 1.0, r));
  float m = mix(disc, gauss, vShape.w) + vShape.z * exp(-r * r * 5.0) * (1.0 - r);
  float a = vCol.a * m;
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol.rgb * a, a);
}
`

/** The agent, its trail, the ring and the column: points on the same surface. */
const FX_VS = /* glsl */ `
precision highp float;
attribute vec2 aPos;   // world x, z
attribute vec4 aK;     // lift (world), size (px), alpha, tint (0 lilac .. 1 glow)
attribute float aSoft; // 0 crisp .. 1 gaussian
uniform float uDpr;
varying vec4 vCol;
varying vec4 vShape;
${FIELD}
void main() {
  // Screen-space points (the comets) carry aSoft + 2 and their position in px.
  bool scr = aSoft >= 1.5;
  vec3 s = scr ? vec3(aPos, 1.0) : project(vec3(aPos.x, field(aPos) + aK.x, aPos.y));
  float a = aK.z * (scr ? 1.0 : clearing(s.xy));
  vCol = vec4(mix(${vec3(LILAC)}, ${vec3(GLOW)}, aK.w), a);
  vShape = vec4(1.0, 0.25, 0.0, scr ? aSoft - 2.0 : aSoft);
  gl_PointSize = aK.y * uDpr;
  gl_Position = a < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : toClip(s.xy);
}
`

/**
 * The inflow vortex: every dot's place is a function of the flow clock and its seeds alone (no per-dot CPU
 * work). Plateau radii (rho, 1 = the stage's rim), turned clockwise from the camera as they shrink.
 */
const VORTEX_VS = /* glsl */ `
precision highp float;
attribute vec4 aSeed;  // the arm's jitter, the start radius, the lifetime, the phase (0..1)
attribute float aArm;  // the arm (0, 1, 2) + a keep seed (0..1) for reduced motion's share
attribute float aTrail; // 0 the streamer itself, 1.. its trail, each a step behind it on its own path
uniform float uDpr;
uniform float uFlow;   // the flow clock (s): ENERGY and a landing speed it up
uniform float uRing[${RING_U}]; // the outer ring: the visible bowl's reach (plateau radii) every ${360 / 36} deg (+z, toward the camera, is 90)
uniform vec2 uVLife;   // the lifetime's range (s)
uniform vec4 uVLook;   // opacity (the scroll's fade, reduced motion), the beat's gain, reduced motion's share, its flag
uniform vec3 uVClear;  // the robot's clearance: margin, feather (px), floor
varying vec4 vCol;
varying vec4 vShape;
${FIELD}
const float TAU = 6.2831853;
const float K = 1.6;   // radial speed ~ 1 / rho^0.6: rho^1.6 falls linearly in time
void main() {
  float arm = floor(aArm);
  float keep = fract(aArm);
  float life = mix(uVLife.x, uVLife.y, aSeed.z);
  float cyc = (uFlow - aTrail * ${VORTEX.trailGap.toFixed(3)}) / life + aSeed.w;
  float u = fract(cyc);
  // The arms: rigid log spirals turning once per ${VORTEX.turn} s; each dot slides in along its own (+-6 deg),
  // so its turn is the arm's plus the spiral's, quickening as it nears the stage. Its start ring is taken where
  // its arm met the rim when this pass began.
  float born = (floor(cyc) - aSeed.w) * life;
  float off = arm * TAU / ${VORTEX.arms.toFixed(1)} + (aSeed.x * 2.0 - 1.0) * ${VORTEX.jitter.toFixed(4)};
  float th0 = off + born * TAU / ${VORTEX.turn.toFixed(1)};
  // The outer ring: the visible bowl in this direction (the lattice's own, drainSeeds()).
  float rf = fract(th0 / TAU) * ${RING_U}.0;
  int i0 = int(floor(rf));
  int i1 = i0 + 1 >= ${RING_U} ? 0 : i0 + 1;
  float edge = mix(uRing[i0], uRing[i1], fract(rf));
  float rho0 = max(1.6, mix(${VORTEX.start[0].toFixed(2)}, ${VORTEX.start[1].toFixed(2)}, aSeed.y) * edge);
  float r0k = pow(rho0, K);
  float rho = pow(r0k - u * (r0k - 1.0), 1.0 / K);
  float th = off + uFlow * TAU / ${VORTEX.turn.toFixed(1)} + ${VORTEX.twist.toFixed(2)} * log(rho0 / rho);
  vec2 p = vec2(cos(th), sin(th)) * rho * uPlat;
  // Along the path (0 the ring .. 1 the rim), and the fall over its last ${(VORTEX.fall * 100).toFixed(0)}%.
  float v = (rho0 - rho) / (rho0 - 1.0);
  float fall = 1.0 - smoothstep(1.0, 1.0 + ${VORTEX.fall.toFixed(2)} * (rho0 - 1.0), rho);
  float h = field(p) + uBowl.z * (${VORTEX.hover.toFixed(3)} - ${VORTEX.drop.toFixed(3)} * fall);
  vec3 s = project(vec3(p.x, h, p.y));
  // 45% far out to 75% near the stage; 3-4.4 px; the trail fainter and finer behind it.
  float a = mix(0.45, 0.75, smoothstep(0.05, 0.85, v)) * mix(0.92, 1.0, keep);
  float size = mix(3.0, 4.4, smoothstep(0.0, 0.7, v)) * (1.0 - 0.75 * fall);
  float tk = aTrail / ${(VORTEX.trail + 1).toFixed(1)};
  a *= pow(1.0 - tk, 1.6) * smoothstep(0.0, 0.06, u) * (1.0 - fall);
  size *= 1.0 - 0.45 * tk;
  // Half as bright over the robot (its silhouette and the margin, feathered).
  float dh = length(s.xy - uHead.xy) - uHead.z;
  vec2 bc = (uBody.xy + uBody.zw) * 0.5;
  vec2 bd = abs(s.xy - bc) - (uBody.zw - uBody.xy) * 0.5;
  float db = length(max(bd, 0.0)) + min(max(bd.x, bd.y), 0.0);
  a *= mix(uVClear.z, 1.0, smoothstep(uVClear.x, uVClear.x + uVClear.y, min(dh, db)));
  a = min(0.75, a * (1.0 + uVLook.y)) * uVLook.x;
  a *= 1.0 - smoothstep(uScr.w * 0.9, uScr.w, s.y);
  if (uVLook.w > 0.5 && (keep > uVLook.z || aTrail > 0.5)) a = 0.0;
  float sprite = max(1.0, ceil(size * uDpr));
  vCol = vec4(mix(${vec3(LILAC)}, ${vec3(GLOW)}, smoothstep(0.3, 0.9, v)), a);
  vShape = vec4(min(1.0, size * uDpr / sprite), 0.0, 0.0, 0.0);
  gl_PointSize = sprite;
  gl_Position = a < 0.003 || size < 0.05 || s.z < 0.1 ? vec4(2.0, 2.0, 2.0, 1.0) : toClip(s.xy);
}
`

/** Floats per FX point: aPos (2), aK (4), aSoft (1). */
const FX_STRIDE = 7
const FX_MAX = 2 + TRAIL.dots + RING.dots + 24 + 1 + COMET.trail + 4

type Bump = [x: number, z: number, sigma: number, amp: number]
interface Arrangement {
  wells: Bump[]
  hills: Bump[]
}

export interface TerrainHandle {
  /** The stage's layout changed (stage.ts calls this from its own size()). */
  resize(): void
  dispose(): void
}

export function mountTerrain(host: HTMLElement, parent: HTMLElement, frame: () => StageFrame): TerrainHandle {
  random = randomSource(0x51ed27)
  // Back to front: the horizon's glow, the far ridges, the landscape's canvas (under the beam).
  const haze = document.createElement('div')
  haze.className = 'hero-haze'
  haze.setAttribute('aria-hidden', 'true')
  const canvas = document.createElement('canvas')
  canvas.className = 'hero-terrain'
  canvas.setAttribute('aria-hidden', 'true')
  parent.insertBefore(canvas, parent.firstChild)
  parent.insertBefore(haze, canvas)
  // The far ridges, dark against the haze, under the dots: static, so an SVG drawn once per layout.
  const ridgeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  ridgeSvg.setAttribute('class', 'hero-ridges')
  ridgeSvg.setAttribute('aria-hidden', 'true')
  ridgeSvg.setAttribute('focusable', 'false')
  parent.insertBefore(ridgeSvg, canvas)

  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' })
  const programs = gl ? build(gl) : null
  if (!gl || !programs) {
    return {
      resize: () => {},
      dispose() {
        canvas.remove()
        haze.remove()
        ridgeSvg.remove()
      },
    }
  }
  let { terrain, fx, vortex } = programs
  /** The programs are linked (true), still compiling (false) or failed (null: nothing is drawn). */
  let ready: boolean | null = false
  let pollTimer = 0
  /** Polls the programs' background compile (cheaply, on a timer: not tied to the hero being on screen). */
  function poll() {
    pollTimer = 0
    if (disposed || lost) return
    ready = settle(gl!, [terrain, fx, vortex])
    if (ready === false) {
      pollTimer = window.setTimeout(poll, 16)
      return
    }
    stageCues.backdropReady = true
    if (ready) {
      if (still()) stillFrame()
      else wake()
    }
  }
  stageCues.backdropReady = false
  let terrainBuf = gl.createBuffer()!
  let fxBuf = gl.createBuffer()!
  // The vortex's seeds: one static buffer, written once (a tier's count is a prefix of it).
  // (Its own random source: the landscape's arrangements draw the same numbers with or without it.)
  const vrand = randomSource(0x7a11ce)
  // Each streamer is its head and its trail, consecutive points (a tier's count of streamers is a prefix).
  const VPTS = VORTEX.trail + 1
  const vortexData = new Float32Array(VORTEX.count.high * VPTS * VORTEX_STRIDE)
  for (let i = 0; i < VORTEX.count.high; i++) {
    const seed = [vrand(), vrand(), vrand(), vrand(), (i % VORTEX.arms) + vrand() * 0.999]
    for (let j = 0; j < VPTS; j++) vortexData.set([...seed, j], (i * VPTS + j) * VORTEX_STRIDE)
  }
  let vortexBuf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, vortexBuf)
  gl.bufferData(gl.ARRAY_BUFFER, vortexData, gl.STATIC_DRAW)
  const fxData = new Float32Array(FX_MAX * FX_STRIDE)
  // Allocated once; each frame only its used part is rewritten (bufferSubData).
  gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf)
  gl.bufferData(gl.ARRAY_BUFFER, fxData.byteLength, gl.DYNAMIC_DRAW)
  let gridCount = 0
  /** The context is lost (nothing is drawn until it is restored and rebuilt). */
  let lost = false

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  /** Reduced motion, or the frozen baseline frame (src/hero/freeze.ts): one still frame. */
  const still = () => reduced.matches || FROZEN
  /** Lite: automatic lite (src/core/autoLite.ts) or a software renderer (Hero.tsx); phones are not lite, they have their own profile. */
  const lite = () => !!host.closest('[data-lite-landscape]')
  /** The hero's tier (src/hero/tier.ts, on #hero as data-tier); lite is always LOW. */
  const heroEl = host.closest<HTMLElement>('#hero')
  const tierNow = (): HeroTier => (lite() ? 'low' : ((heroEl?.dataset.tier as HeroTier | undefined) ?? 'high'))
  /**
   * How far this layer has stepped down (0..8): the engine's governor where it runs (HIGH, MEDIUM), else its
   * own watchdog. 1 the interference waves, 2 the comets, 3 grid density, 4 trail length, the glow, depth of
   * field and ring dots, 7 the pixel ratio, 8 the frame rate (5 and 6 are the engine's own).
   */
  const degradeStep = () => Math.max(stageCues.degrade, watchdog.level)
  const backdrop = () => {
    const v = parseFloat(host.style.getPropertyValue('--robot-bg'))
    return Number.isFinite(v) ? v : 1
  }

  // ---- layout: the camera, the plateau, the domain, the grid

  let W = 1
  let H = 1
  let dpr = 1
  let size: 'desktop' | 'tablet' | 'phone' = 'desktop'
  let F = frame()
  /** Camera: distance to the origin, focal length (px); the origin on screen (px). */
  const C = { D: 3, f: 1000, ox: 0, oy: 0 }
  /** Plateau radii, bowl half-width and depth, the walls', far rim's and lip's relief (world); the horizon (px). */
  const B = { rx: 1, rz: 0.6, bx: 2, bz: 3.5, relief: 0.5, far: 0.1, lip: 0.1, horizon: 0 }
  /** The grid's depth range and row ratio. */
  const G = { dN: 2, dF: 6, rowK: 0.01, sizeK: 3.5 }
  /** The landing point (world): the plateau's front edge. */
  const L = { x: 0, z: 0.6 }
  const head = { x: 0, y: 0, r: 0 }
  const body = { x0: 0, y0: 0, x1: 0, y1: 0 }
  const clear = { margin: 0, feather: 1, floor: 0.45 }
  let gridKey = ''
  /** Development only: overrides for profiling (window.__heroTerrain.tune). */
  const tune: { dpr?: number; grid?: number; noDraw?: boolean; vortexGain?: number; vortexCount?: number } = {}

  /** World point to screen (px) and depth: the CPU twin of project(). */
  function toScreen(x: number, h: number, z: number) {
    const depth = C.D - h * SIN - z * COS
    const k = C.f / Math.max(depth, 0.05)
    return { x: C.ox + x * k, y: C.oy - (h * COS - z * SIN) * k, depth }
  }

  function layout() {
    W = Math.max(1, host.clientWidth)
    H = Math.max(1, host.clientHeight)
    size = W > 1024 ? 'desktop' : W >= 768 ? 'tablet' : 'phone'
    const phone = size === 'phone'
    F = frame()
    // The robot's silhouette (the engine's head and screen, else the fallback's proportions).
    const h = F.head ?? { x: F.x - 0.2 * F.robotH, y: F.topY + 0.31 * F.robotH, r: 0.23 * F.robotH }
    Object.assign(head, h)
    body.x0 = Math.min(h.x - 0.9 * h.r, F.x - 0.36 * F.robotH)
    body.x1 = F.screen ? Math.max(F.screen.x + F.screen.w / 2 + 0.17 * F.robotH, F.x + 0.3 * F.robotH) : F.x + 0.38 * F.robotH
    body.y0 = h.y + 0.6 * h.r
    body.y1 = F.daisY
    // Phones: the robot spans the width, so a full-strength pocket would dim nearly everything; there it is
    // lighter and tighter.
    clear.margin = (phone ? 0.03 : 0.072) * F.robotH
    clear.feather = (phone ? 0.08 : 0.12) * F.robotH
    clear.floor = phone ? 0.75 : 0.45

    // The camera: the origin (the plateau's centre) on the dais's centre; its distance makes the plateau's
    // half-width 6% wider than the dais's on screen.
    C.f = H / 2 / Math.tan(FOV / 2)
    C.ox = F.x
    C.oy = F.daisY
    const rxPx = (F.daisW / 2) * PLATEAU
    const rzPx = (F.daisH / 2) * PLATEAU
    B.rx = 1
    C.D = C.f / Math.max(40, rxPx)
    // Its depth radius: the plateau's front rim at the dais's front rim (the robot's camera is lower, so
    // the plateau is an ellipse in the world, a circle to its eye).
    B.rz = (rzPx * C.D) / (C.f * SIN + rzPx * COS)
    // The bowl: as wide as the screen at the stage's depth; its relief in screen terms.
    B.bx = (Math.max(F.x, W - F.x) * C.D) / C.f
    if (phone) B.bx = Math.max(B.bx, PHONE.width * B.rx)
    const toWorld = (share: number) => (share * H * C.D) / (C.f * COS)
    const R = phone ? PHONE : RELIEF
    B.relief = toWorld(R.side)
    B.far = toWorld(R.far)
    B.lip = toWorld(R.lip)
    // Its far rim's crest on the horizon: solve for its distance.
    B.horizon = H * (phone ? HORIZON.phone : HORIZON.wide)
    const crest = B.far * (0.7 + 0.45 * (1 - Math.abs(Math.sin(0.7))) + 0.2 * Math.sin(2.0)) + B.lip
    let lo = 0.3
    let hi = 80
    for (let i = 0; i < 40; i++) {
      const z = (lo + hi) / 2
      if (toScreen(0, crest, -z).y > B.horizon) lo = z
      else hi = z
    }
    B.bz = (lo + hi) / 2
    placeLanding()

    // The grid: from the bottom edge (flat ground at H + 24 px) to the far rim; rows geometric in depth,
    // columns even in x, each row only as wide as the screen at its depth (and a margin for the parallax).
    const below = H + 24 - C.oy
    G.dN = C.D / (1 + below / (C.f * Math.tan(PITCH)))
    G.dF = C.D + B.bz * COS
    const spec = GRID[size]
    const ultra = size === 'desktop' ? Math.min(1.25, Math.max(1, W / 1920)) : 1
    // Density: the size's (15% under the spacing, 25% on phones), the tier's share (its grid is given at phone
    // size: MEDIUM 100 x 60, LOW 80 x 48), step 3 80%; and never more points than the size's budget.
    const tierK = Math.min(1, TIERS[tierNow()].budget / GRID.phone.budget)
    const k0 = Math.sqrt((tune.grid ?? 1) * DENSITY[size] * tierK * (degradeStep() >= 3 ? 0.8 : 1))
    const budget = spec.budget * k0 * k0
    let k = k0
    let sx = 0
    let rowK = 0
    let count = 0
    const half = (d: number) => ((Math.max(C.ox, W - C.ox) + 48) * d) / C.f
    for (let pass = 0; pass < 6; pass++) {
      sx = (spec.sx * ultra) / k
      rowK = (spec.sy * ultra) / k / (C.f * Math.tan(PITCH))
      const rows = Math.ceil(Math.log(G.dF / G.dN) / rowK)
      const dx = (sx * C.D) / C.f
      count = 0
      for (let j = 0; j <= rows; j++) count += 2 * Math.floor(half(G.dN * Math.exp(j * rowK)) / dx) + 1
      if (count <= budget * 1.02) break
      k *= Math.sqrt(budget / count)
    }
    G.rowK = rowK
    G.sizeK = phone ? 3.7 : 4.2
    const key = `${W}x${H}:${sx.toFixed(3)}:${rowK.toFixed(5)}:${C.D.toFixed(4)}:${B.bz.toFixed(4)}`
    outerRing()
    if (key !== gridKey) {
      gridKey = key
      // The plateau under the dais keeps the grid's own still dots (as faint as the dais's: they meet without a
      // seam); everywhere else the same number of dots flows (drainSeeds).
      const dx = (sx * C.D) / C.f
      const plat: number[] = []
      const rows = Math.ceil(Math.log(G.dF / G.dN) / rowK)
      for (let j = 0; j <= rows; j++) {
        const depth = G.dN * Math.exp(j * rowK)
        const z = (C.D - depth) / COS
        const m = Math.floor(half(depth) / dx)
        for (let i = -m; i <= m; i++) if (Math.hypot((i * dx) / B.rx, z / B.rz) < 1.06) plat.push(i * dx, z)
      }
      const pts = drainSeeds(Math.max(0, count - plat.length / 2), plat)
      gl!.bindBuffer(gl!.ARRAY_BUFFER, terrainBuf)
      gl!.bufferData(gl!.ARRAY_BUFFER, pts, gl!.STATIC_DRAW)
      gridCount = pts.length / DRAIN_STRIDE
    }

    // Up to 1.25x (the dots are soft; on 3x phones this is a ninth of the native fill), 1x in LOW, less once degraded.
    dpr = (tune.dpr ?? labNumber('tdpr') ?? Math.min(window.devicePixelRatio || 1, TIERS[tierNow()].terrainDpr)) * (degradeStep() >= 7 ? 0.75 : 1)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    layoutVersion++
    haze.style.top = `${Math.round(B.horizon)}px`
    buildRidges()
    // The arrangement's slots are in world units: a new shape of world re-places them.
    const worldKey = `${B.bx.toFixed(2)}:${B.bz.toFixed(2)}:${B.rz.toFixed(2)}`
    if (worldKey !== placedKey && cur.wells.length) setArrangement(lite() ? fixedArrangement() : arrangement(side))
    placedKey = worldKey
  }
  let placedKey = ''

  /**
   * The outer ring: in each direction from the stage, how far (plateau radii) the bowl is on screen, plus a
   * margin (the parallax, and the spiral carrying dots sideways). The lattice and the streamers are born on it.
   */
  function outerRing() {
    const flat: Arrangement = { wells: [], hills: [] }
    const margin = DRAIN.margin * W
    const ring = drainRing
    for (let k = 0; k < RING_STEPS; k++) {
      const th = (k / RING_STEPS) * Math.PI * 2
      const c = Math.cos(th)
      const sn = Math.sin(th)
      let rho = 1.05
      for (; rho < 80; rho *= 1.02) {
        const x = c * rho * B.rx
        const z = sn * rho * B.rz
        if (z < -B.bz) break
        const sc = toScreen(x, field(flat, x, z), z)
        if (sc.depth < 0.1 || sc.x < -margin || sc.x > W + margin || sc.y > H + 24 || sc.y < -margin) break
      }
      ring[k] = Math.max(1.6, rho)
    }
    for (let k = 0; k < RING_U; k++) {
      let sum = 0
      const per = RING_STEPS / RING_U
      for (let j = 0; j < per; j++) sum += ring[(k * per + j - per / 2 + RING_STEPS) % RING_STEPS]
      V.ring[k] = sum / per
    }
  }

  /**
   * The drain's dots: `n` flowing ones, then the plateau's still ones. Each flowing dot is born on the outer
   * ring (the bowl as far as the screen shows it, plus a margin, in its direction), and the dots are spread
   * over (direction, phase) as a jittered Fibonacci lattice: an even field whose every shift along the phase
   * looks the same, so the flow never shows a seam or a wave of rebirth. Directions are shared by weight
   * (DRAIN.share): the far side, whose paths are longer and foreshortened, gets more dots.
   */
  function drainSeeds(n: number, plat: number[]) {
    const ring = drainRing
    const cdf = new Float32Array(RING_STEPS + 1)
    for (let k = 0; k < RING_STEPS; k++) cdf[k + 1] = cdf[k] + (ring[k] ** DRAIN.K - 1) ** DRAIN.share
    const out = new Float32Array((n + plat.length / 2) * DRAIN_STRIDE)
    const rnd = randomSource(0xd2a1e)
    const jitter = 0.6 / Math.sqrt(Math.max(1, n))
    const PHI = 0.6180339887
    let k = 0
    for (let i = 0; i < n; i++) {
      const q = ((((i * PHI + (rnd() - 0.5) * jitter) % 1) + 1) % 1) * cdf[RING_STEPS]
      while (k > 0 && cdf[k] > q) k--
      while (k < RING_STEPS - 1 && cdf[k + 1] < q) k++
      const f = (q - cdf[k]) / Math.max(1e-6, cdf[k + 1] - cdf[k])
      const th = ((k + f) / RING_STEPS) * Math.PI * 2
      const r0 = ring[k] + (ring[(k + 1) % RING_STEPS] - ring[k]) * f
      const phase = ((((i + 0.5) / n + (rnd() - 0.5) * jitter) % 1) + 1) % 1
      out.set([th, phase, r0, rnd()], i * DRAIN_STRIDE)
    }
    for (let i = 0; i < plat.length / 2; i++) out.set([plat[i * 2], plat[i * 2 + 1], 0, rnd()], (n + i) * DRAIN_STRIDE)
    return out
  }
  const drainRing = new Float32Array(RING_STEPS)

  /** The landing point: on the plateau's edge, front-left or front-right (the side the agent comes from). */
  function placeLanding(sd = landSide) {
    landSide = sd
    Object.assign(L, landingFor(sd))
  }
  const landingFor = (sd: number) => ({ x: sd * Math.sin(LAND_ANGLE) * B.rx * 1.08, z: Math.cos(LAND_ANGLE) * B.rz * 1.08 })
  let landSide = -1

  /** Three far ridges, farthest first: dark silhouettes rising over the horizon, a dotted crest on each. */
  function buildRidges() {
    const layers = [
      { lift: 26, amp: 44, seed: 1.3, fill: 0.3, dot: 0.22 },
      { lift: 14, amp: 30, seed: 4.7, fill: 0.45, dot: 0.28 },
      { lift: 4, amp: 18, seed: 8.1, fill: 0.6, dot: 0.34 },
    ]
    const k = Math.min(1, H / 900)
    const base = B.horizon.toFixed(1)
    // Their feet melt into the horizon's glow (the last 36 px, scaled), so its band never meets a hard edge.
    let svg = `<defs><linearGradient id="hero-ridge-fade" gradientUnits="userSpaceOnUse" x1="0" y1="${(B.horizon - 36 * k).toFixed(1)}" x2="0" y2="${base}"><stop offset="0" stop-color="#040309"/><stop offset="1" stop-color="#040309" stop-opacity="0"/></linearGradient></defs>`
    for (const l of layers) {
      let d = ''
      for (let x = -12; x <= W + 12; x += 6) {
        const u = x / Math.max(W, 1) + l.seed
        const peaks = 0.5 + 0.3 * Math.sin(u * 7.1) + 0.2 * Math.sin(u * 15.3 + 1.1) + 0.15 * (1 - Math.abs(Math.sin(u * 23.7 + 2.3)))
        d += `${d ? 'L' : 'M'}${x} ${(B.horizon - k * (l.lift + l.amp * peaks)).toFixed(1)}`
      }
      // The silhouette (down to the horizon), then its crest as round dots (zero-length dashes, round caps).
      svg += `<path d="${d}L${W + 12} ${base}L-12 ${base}Z" fill="url(#hero-ridge-fade)" fill-opacity="${l.fill}"/>`
      svg += `<path d="${d}" fill="none" stroke="#7C5CFF" stroke-opacity="${l.dot}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="0 12"/>`
    }
    ridgeSvg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    ridgeSvg.innerHTML = svg
  }

  // ---- the height field (the CPU twin of FIELD)

  let cur: Arrangement = { wells: [], hills: [] }
  let from: Arrangement = { wells: [], hills: [] }
  let next: Arrangement = { wells: [], hills: [] }
  let morphT = 1

  function field(A: Arrangement, x: number, z: number) {
    const rP = Math.hypot(x / B.rx, z / B.rz)
    const m = smoothstep(1.0, 1.32, rP)
    if (m <= 0) return 0
    const ex = Math.abs(x) / B.bx
    const ez = Math.max(-z, 0) / B.bz
    const nx0 = x / B.bx
    const peaks = 0.7 + 0.45 * (1 - Math.abs(Math.sin(nx0 * 2.3 + 0.7))) + 0.2 * Math.sin(nx0 * 5.1 + 2.0)
    const b = B.relief * Math.min(2.4, ex ** 2.4) * (1 + 0.3 * ez) + B.far * Math.min(1.6, ez ** 1.8) * peaks + B.lip * smoothstep(1.0, 2.2, rP)
    let w = 0
    for (const [wx, wz, s, a] of A.wells) w += a * Math.exp(-((x - wx) ** 2 + (z - wz) ** 2) / (2 * s * s))
    let hh = 0
    for (const [hx, hz, s, a] of A.hills) hh += a * Math.exp(-((x - hx) ** 2 + (z - hz) ** 2) / (2 * s * s))
    const nx = x / B.bx
    const nz = z / B.bz
    const noise = 0.6 * Math.sin(nx * 5.3 + 1.7) * Math.sin(nz * 4.1 + 0.4) + 0.4 * Math.sin(nx * 11.7 - nz * 9.3 + 2.1)
    return m * (b * Math.max(0.25, 1 - w) + hh + 0.08 * B.relief * noise)
  }

  /** Where a world point (on the surface) lands on screen. */
  const onScreen = (A: Arrangement, x: number, z: number) => toScreen(x, field(A, x, z), z)

  /** Inside the visible frame, with a margin, below the horizon and above the bottom's fade. */
  function inFrame(A: Arrangement, x: number, z: number, m = 0.05) {
    if (z < -B.bz * 0.95 || z > B.rz * 1.6) return false
    const s = onScreen(A, x, z)
    return s.x > W * m && s.x < W * (1 - m) && s.y > Math.max(H * 0.16, 120) && s.y < H * 0.95
  }

  /** In the robot's pocket on screen (where the robot would hide it). */
  function behindRobot(A: Arrangement, x: number, z: number, pad = 0) {
    const s = onScreen(A, x, z)
    if (Math.hypot(s.x - head.x, s.y - head.y) < head.r + pad) return true
    return s.x > body.x0 - pad && s.x < body.x1 + pad && s.y > body.y0 - pad && s.y < body.y1 + pad
  }

  /**
   * A new arrangement: a secondary well on each side, between the rim and the stage (where the agents
   * come down), two more anywhere, and four hills; none on the plateau or hidden behind the robot.
   */
  function arrangement(_side: number): Arrangement {
    const A: Arrangement = { wells: [], hills: [] }
    const flatA: Arrangement = { wells: [], hills: [] }
    const taken: Bump[] = []
    const place = (list: Bump[], xr: [number, number], zr: [number, number], sr: [number, number], ar: [number, number]) => {
      for (let t = 0; t < 60; t++) {
        const x = rand(...xr) * B.bx
        const z = rand(...zr) * B.bz
        const s = rand(...sr) * B.bx
        if (Math.hypot(x / B.rx, z / B.rz) < 1.5 + s / B.rx) continue
        if (taken.some(([tx, tz, ts]) => Math.hypot(x - tx, z - tz) < (s + ts) * 1.1)) continue
        if (!inFrame(flatA, x, z, 0.08) || behindRobot(flatA, x, z, 30)) continue
        const b: Bump = [x, z, s, rand(...ar)]
        list.push(b)
        taken.push(b)
        return
      }
      list.push([0, -B.bz * 2, 0.1, 0])
    }
    const relief = B.relief
    place(A.wells, [-0.8, -0.42], [-0.6, -0.08], [0.16, 0.24], [0.4, 0.6])
    place(A.wells, [0.42, 0.8], [-0.6, -0.08], [0.16, 0.24], [0.4, 0.6])
    for (let i = 0; i < 2; i++) place(A.wells, [-0.9, 0.9], [-0.85, -0.1], [0.13, 0.2], [0.35, 0.5])
    for (let i = 0; i < HILLS; i++) place(A.hills, [-0.9, 0.9], [-0.85, 0.05], [0.12, 0.2], [0.25 * relief, 0.45 * relief])
    return A
  }

  /** Lite's fixed arrangement (and the first frame's). */
  function fixedArrangement(): Arrangement {
    const bx = B.bx
    const bz = B.bz
    const r = B.relief
    return {
      wells: [
        [-0.62 * bx, -0.32 * bz, 0.2 * bx, 0.5],
        [0.6 * bx, -0.36 * bz, 0.2 * bx, 0.5],
        [-0.2 * bx, -0.78 * bz, 0.16 * bx, 0.4],
        [0.82 * bx, -0.05 * bz, 0.15 * bx, 0.4],
      ],
      hills: [
        [-0.85 * bx, -0.12 * bz, 0.16 * bx, 0.35 * r],
        [0.3 * bx, -0.72 * bz, 0.18 * bx, 0.35 * r],
        [-0.45 * bx, -0.62 * bz, 0.14 * bx, 0.3 * r],
        [0.86 * bx, -0.6 * bz, 0.15 * bx, 0.3 * r],
      ],
    }
  }

  const copyA = (A: Arrangement): Arrangement => ({ wells: A.wells.map((b) => [...b] as Bump), hills: A.hills.map((b) => [...b] as Bump) })

  function setArrangement(A: Arrangement) {
    arrVersion++
    cur = copyA(A)
    from = copyA(A)
    next = copyA(A)
    morphT = 1
    replan()
  }

  function startMorph() {
    from = copyA(cur)
    next = arrangement(-side)
    morphT = 0
    replan()
  }

  function stepMorph(dt: number) {
    if (morphT >= 1) return
    morphT = Math.min(1, morphT + dt / CYCLE.morph)
    arrVersion++
    const e = smoothstep(0, 1, morphT)
    for (const k of ['wells', 'hills'] as const) {
      for (let i = 0; i < cur[k].length; i++) for (let c = 0; c < 4; c++) cur[k][i][c] = from[k][i][c] + (next[k][i][c] - from[k][i][c]) * e
    }
  }

  // ---- the descent (CPU): momentum gradient descent with finite differences, planned ahead a slice per
  // frame while the agent is away (against the arrangement the terrain is easing into)

  let side = random() < 0.5 ? -1 : 1
  let path = new Float32Array(GD.max * 2)
  let scratch = new Float32Array(GD.max * 2)
  let nArrive = 0
  let nPath = 0
  /** The next run: tries so far, whether `path` holds a run, whether it is final, its side. */
  const planner = { tries: 0, held: false, ready: false, side: -side, detours: 0 }
  let simA: Arrangement = cur

  /**
   * The potential the agent descends: f, plus (here only, never drawn) a gentle funnel toward the landing
   * point and a lip round the plateau, so it rolls round the rim to the front rather than across the stage.
   */
  function potential(x: number, z: number) {
    const dL = (x - sim.gx) ** 2 + (z - sim.gz) ** 2
    const rP = Math.hypot(x / B.rx, z / B.rz)
    const lip = (1 - smoothstep(0.9, 1.12, rP)) * (1 - Math.exp(-dL / 0.04))
    return field(simA, x, z) + 0.05 * B.relief * dL + 0.6 * B.relief * lip
  }

  function spawnPoint(A: Arrangement, sd: number): [number, number] {
    const cands: [number, number, number][] = []
    for (let i = 0; i < 70; i++) {
      const z = rand(-0.82, -0.12) * B.bz
      const sx = sd < 0 ? W * rand(0.06, 0.13) : W * rand(0.87, 0.94)
      // x from the screen's x (twice: the height moves the depth a little).
      let x = ((sx - C.ox) * (C.D - z * COS)) / C.f
      x = ((sx - C.ox) * toScreen(x, field(A, x, z), z).depth) / C.f
      if (!inFrame(A, x, z, 0.04)) continue
      cands.push([x, z, field(A, x, z)])
    }
    if (!cands.length) return [sd * B.bx * 0.7, -0.4 * B.bz]
    cands.sort((a, b) => b[2] - a[2])
    const top = cands.slice(0, Math.max(1, Math.ceil(cands.length * 0.3)))
    const [x, z] = top[Math.floor(random() * top.length)]
    return [x, z]
  }

  /** A run being simulated into `scratch`, a slice per frame, toward its goal (gx, gz: its side's landing point). */
  const sim = { on: false, x: 0, z: 0, vx: 0, vz: 0, slow: 0, escapeAt: -1, detours: 0, arrive: 0, phase: 0, k: 0, caught: false, gx: 0, gz: 0 }

  function simStart(A: Arrangement, x: number, z: number, sd: number) {
    simA = A
    const goal = landingFor(sd)
    Object.assign(sim, { on: true, x, z, vx: 0, vz: 0, slow: 0, escapeAt: -1, detours: 0, arrive: 0, phase: rand(0, Math.PI * 2), k: 0, caught: false, gx: goal.x, gz: goal.z })
  }

  /** Up to `steps` more steps of the run; true once it has arrived and settled (or run out). */
  function simRun(steps: number) {
    const buf = scratch
    let { x, z, vx, vz, slow, escapeAt, detours, arrive, k, caught } = sim
    const end = Math.min(GD.max, k + steps)
    const eps = 0.003
    let done = false
    for (; k < end; k++) {
      buf[k * 2] = x
      buf[k * 2 + 1] = z
      const toL = Math.hypot(x - sim.gx, z - sim.gz)
      if (!arrive && toL < GD.arrive) arrive = k
      if (arrive && k > arrive + 50) {
        done = true
        break
      }
      let gx = (potential(x + eps, z) - potential(x - eps, z)) / (2 * eps)
      let gz = (potential(x, z + eps) - potential(x, z - eps)) / (2 * eps)
      // Caught in a secondary well (slow, far from the stage): circle a while, then a growing pull toward
      // the landing point lifts it out (an annealed escape, which also guarantees the arrival).
      const speed = Math.hypot(vx, vz)
      if (toL > 0.45 && speed < 0.0035) slow++
      else slow = Math.max(0, slow - 1)
      if (slow > 18 && !caught) {
        caught = true
        detours++
        escapeAt = k + 70
      }
      if (escapeAt < 0 && k > 900) escapeAt = k
      if (escapeAt >= 0 && k >= escapeAt && toL > 1e-6) {
        const pull = Math.min(3, 0.02 * (k - escapeAt)) * B.relief * (toL > 0.4 ? 1 : 0.3)
        gx += (pull * (x - sim.gx)) / toL
        gz += (pull * (z - sim.gz)) / toL
        // Out of the well and moving again (only one detour a run: never caught twice).
        if (caught && speed > 0.008 && k > escapeAt + 40 && detours < 1) {
          caught = false
          escapeAt = -1
          slow = 0
        }
      }
      // A small lateral wobble, across the slope, so the path curves.
      const g = Math.hypot(gx, gz) || 1
      const w = 0.22 * Math.sin(k * 0.05 + sim.phase)
      vx = GD.beta * vx - GD.lr * (gx - (gz / g) * w * g)
      vz = GD.beta * vz - GD.lr * (gz + (gx / g) * w * g)
      x += vx
      z += vz
      // Stay in the frame: bounce off its bounds.
      if (!arrive && !inFrame(simA, x, z, 0.04) && toL > 0.6) {
        x -= vx
        z -= vz
        vx *= -0.4
        vz *= -0.4
      }
    }
    Object.assign(sim, { x, z, vx, vz, slow, escapeAt, detours, arrive, k, caught })
    return done || k >= GD.max
  }

  /** A slice of planning the next run: kept if it detours through a well; after 8 runs the best one stands. */
  function planTry(A: Arrangement, steps = 160) {
    if (planner.ready) return
    const t0 = performance.now()
    if (!sim.on) {
      const [x, z] = spawnPoint(A, planner.side)
      simStart(A, x, z, planner.side)
    }
    if (simRun(steps)) {
      sim.on = false
      planner.tries++
      const arrive = sim.arrive || sim.k - 1
      const good = sim.detours >= 1 && arrive > 260 && arrive < 2200
      if (good || !planner.held || (sim.detours > planner.detours && arrive < 2200)) {
        const swap = path
        path = scratch
        scratch = swap
        nArrive = arrive
        nPath = sim.k
        planner.held = true
        planner.detours = sim.detours
      }
      if (good || planner.tries >= 8) planner.ready = true
    }
    cost.plan = Math.max(cost.plan, performance.now() - t0)
  }

  function replan() {
    sim.on = false
    planner.tries = 0
    planner.held = false
    planner.ready = false
    planner.detours = 0
  }

  // ---- the cycle

  type Phase = 'wait' | 'spawn' | 'descent' | 'land' | 'rest'
  let phase: Phase = 'wait'
  let phaseAt = 0
  /** The cycle's clock (s). */
  let clock = 0
  let step = 0
  let rate = 40
  let landAt = -1
  const trail = new Float32Array(TRAIL.dots * 2)
  let trailN = 0
  let trailAt = 0
  let agentA = 0

  function go(p: Phase) {
    phase = p
    phaseAt = clock
  }

  function startRun() {
    while (!planner.ready && !planner.held) planTry(morphT < 1 ? next : cur, GD.max)
    side = planner.side
    planner.side = -side
    replan()
    placeLanding(side)
    step = 0
    trailN = 0
    rate = nArrive / CYCLE.descent
    go('spawn')
    // The robot's eyes find the new agent (engine.ts reads when it spawned, and where it is while it is live).
    stageCues.agentAt = performance.now()
  }

  function land() {
    landAt = clock
    step = nArrive
    go('land')
    V.boostAt = clock
  }

  /** The flow clocks (s: the streamers', the lattice's), the outer ring's coarse copy (plateau radii; outerRing()), the landing boost. */
  const V = { flow: 0, drain: 0, ring: new Float32Array(RING_U), boostAt: -1e9 }
  /** Its share of the hero still showing (it fades out over hero progress 0 .. 0.6 and stops there). */
  const vortexFade = () => 1 - smoothstep(VORTEX.fade[0], VORTEX.fade[1], heroScroll.p)
  /** Its dots now: the tier's count, halved then dropped by the ladder (stageCues.vortex, the watchdog). */
  const vortexCount = () => {
    const step = Math.max(stageCues.vortex, watchdog.vortex)
    return step >= 2 ? 0 : Math.round(VORTEX.count[tierNow()] / (step >= 1 ? 2 : 1))
  }
  function stepVortex(dt: number) {
    // A landing speeds it up 25% (in 90 ms, back over the rest of 0.6 s); ENERGY up to 15%. The lattice drains on
    // the same clock for as long as the landscape is drawn; the streamers stop once they have faded out.
    const t = (clock - V.boostAt) / VORTEX.landS
    const boost = t < 0 || t > 1 ? 0 : t < 0.15 ? smoothstep(0, 0.15, t) : 1 - smoothstep(0.15, 1, t)
    const step = dt * (1 + VORTEX.energy * lift + VORTEX.land * boost)
    V.drain += step
    if (vortexFade() > 0) V.flow += step
  }

  /** Development only: hold the cycle at a moment (window.__heroTerrain.freeze). */
  let frozen = false
  function update(dt: number) {
    if (frozen) return
    clock += dt
    stepMorph(dt)

    // Planning starts as soon as the next arrangement is known (the reshape has begun). Phones plan in smaller
    // slices (slower CPUs): no frame pays more than a fraction of a millisecond.
    if (phase === 'wait' || phase === 'rest' || (phase === 'land' && (phaseAt === -1 || lite()))) planTry(morphT < 1 ? next : cur, size === 'phone' ? 120 : 240)
    // A run starts once it is planned (planning goes a slice per frame), with the best run so far a moment
    // later, or after 1.5 s more regardless.
    const planned = (late: number) => planner.ready || (late > 0.3 && planner.held) || late > 1.5
    if (phase === 'wait' && planned(clock)) startRun()
    else if (phase === 'spawn' && clock - phaseAt >= CYCLE.spawn) go('descent')

    if (phase === 'descent') {
      step = Math.min(nArrive, step + rate * dt)
      if (step >= nArrive) land()
    } else if (phase === 'land') {
      const t = clock - landAt
      if (t >= CYCLE.morphAt && morphT >= 1 && !lite() && phaseAt === landAt) {
        startMorph()
        phaseAt = -1
      }
      if (t >= CYCLE.land) go('rest')
    } else if (phase === 'rest') {
      // 7 s from spawn to spawn (the reshape finishes as the next agent fades in).
      if (clock - landAt >= CYCLE.rest && planned(clock - landAt - CYCLE.rest)) startRun()
    }

    // The agent's position, and its trail (~70 positions over 2 s).
    const at = agentPos()
    const live = phase === 'spawn' || phase === 'descent'
    const every = TRAIL.span / TRAIL.dots
    if (clock - trailAt >= every) {
      trailAt = clock
      if (live) {
        trail.copyWithin(2, 0, trail.length - 2)
        trail[0] = at[0]
        trail[1] = at[1]
        trailN = Math.min(trailMax(), trailN + 1)
      } else trailN = Math.max(0, trailN - 2)
    }
    agentA = phase === 'spawn' ? smoothstep(0, CYCLE.spawn, clock - phaseAt) : live ? 1 : phase === 'land' ? 1 - smoothstep(0.2, 0.8, clock - landAt) : 0
    if (live) {
      const s = onScreen(cur, at[0], at[1])
      stageCues.agent.x = s.x
      stageCues.agent.y = s.y
    }
    stepMotion(dt)
    stepVortex(dt)
  }

  const trailMax = () => (lite() ? TRAIL.lite : degradeStep() >= 4 ? TRAIL.degraded : TRAIL.dots)

  function agentPos(): [number, number] {
    if (phase === 'wait' || phase === 'rest' || !nPath) return [L.x, L.z]
    const i = Math.min(nPath - 1, Math.floor(step))
    const j = Math.min(nPath - 1, i + 1)
    const t = step - i
    return [path[i * 2] + (path[j * 2] - path[i * 2]) * t, path[i * 2 + 1] + (path[j * 2 + 1] - path[i * 2 + 1]) * t]
  }

  // ---- the energy system's moving parts (src/hero/motion.ts): wave fronts, the wake, a tap, the comets

  /** Uniform data, rewritten each frame (allocated once). */
  const frontA = new Float32Array(FRONTS_A * 4)
  const frontB = new Float32Array(FRONTS_B * 4)
  const wakeU = new Float32Array(WAKES * 4)
  /** The stage's waves in flight: the distance each has travelled (world; -1 a free slot). */
  const waveA = new Float32Array(FRONTS_A).fill(-1)
  /** The flank waves: source x, z, radius (world; radius -1 a free slot). */
  const waveB = new Float32Array(FRONTS_B * 3).fill(-1)
  let slotA = 0
  let slotB = 0
  let emittedA = NaN
  let emittedB = NaN
  let flankSide = 1
  /** The wake's samples: x, z (world), born (clock, s). */
  const wakeS = new Float32Array(WAKES * 3)
  for (let i = 0; i < WAKES; i++) wakeS[i * 3 + 2] = -1e9
  let wakeNext = 0
  let wakeAt = -1e9
  const tapS = { x: 0, z: 0, at: -1e9 }
  /** The latest pointer and touch input (viewport px): recorded by the listeners, consumed by the frame loop. */
  const input = { x: 0, y: 0, moved: false, tapX: 0, tapY: 0, tapped: false }
  /** ENERGY's excess over its baseline this frame (0..1), and the master clock (beats). */
  let lift = 0
  let beats = 0
  let beatsOn = false
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  /** The hero is in view and has not started to leave: input there disturbs the surface. */
  const inHero = () => visible && heroScroll.p < 0.3 && !document.hidden

  const onPointer = (ev: PointerEvent) => {
    if (ev.pointerType !== 'mouse') return
    input.x = ev.clientX
    input.y = ev.clientY
    input.moved = true
    if (inHero()) energy.poke('pointer')
  }
  const onTouch = (ev: TouchEvent) => {
    const t = ev.touches[0]
    if (!t) return
    input.tapX = t.clientX
    input.tapY = t.clientY
    input.tapped = true
    if (inHero()) energy.poke('tap')
  }
  window.addEventListener('pointermove', onPointer, { passive: true })
  window.addEventListener('touchstart', onTouch, { passive: true })

  /** Where a screen point (px) meets the surface (world x, z, into `ground`); false above the horizon. */
  const ground = { x: 0, z: 0 }
  function groundAt(sx: number, sy: number) {
    let h = 0
    for (let i = 0; i < 3; i++) {
      // Screen y to depth on the plane at height h (the inverse of toScreen), then the surface's height there.
      const a = (C.oy - sy) / C.f
      const den = SIN - a * COS
      if (den <= 1e-4) return false
      const z = (h * COS - a * (C.D - h * SIN)) / den
      const depth = C.D - h * SIN - z * COS
      if (depth <= 0.05 || z < -B.bz) return false
      ground.x = ((sx - C.ox) * depth) / C.f
      ground.z = z
      h = field(cur, ground.x, ground.z)
    }
    return true
  }

  /** Advances the fronts and samples the input; the uniforms are written by draw(). */
  function stepMotion(dt: number) {
    const now = performance.now()
    const T = TIERS[tierNow()]
    const clk = masterBeats(now)
    beats = clk.beats
    beatsOn = clk.on
    lift = energy.excess(now)
    const wpx = (W * C.D) / C.f
    const speed = 1 + LIFT.speed * lift
    const wavesOn = !lite() && T.waves > 0
    // The stage's waves: one every 2 beats (on the wall clock until the music starts).
    const nA = Math.floor(beats / WAVE.every)
    if (nA !== emittedA) {
      if (!Number.isNaN(emittedA) && wavesOn) waveA[(slotA = (slotA + 1) % FRONTS_A)] = 0
      emittedA = nA
    }
    // The flank waves: one every 4 beats once the music plays, from either side in turn.
    const nB = Math.floor(beats / FLANK.every)
    if (nB !== emittedB) {
      if (!Number.isNaN(emittedB) && wavesOn && beatsOn && T.flank && degradeStep() < 1) {
        slotB = (slotB + 1) % FRONTS_B
        flankSide = -flankSide
        waveB[slotB * 3] = flankSide * FLANK.source[0] * B.bx
        waveB[slotB * 3 + 1] = FLANK.source[1] * B.bz
        waveB[slotB * 3 + 2] = 0
      }
      emittedB = nB
    }
    for (let i = 0; i < FRONTS_A; i++) {
      if (waveA[i] < 0) continue
      waveA[i] += WAVE.speed * wpx * speed * dt
      if (waveA[i] > WAVE.life * wpx) waveA[i] = -1
    }
    for (let i = 0; i < FRONTS_B; i++) {
      const o = i * 3 + 2
      if (waveB[o] < 0) continue
      waveB[o] += FLANK.speed * wpx * speed * dt
      if (waveB[o] > FLANK.life * wpx) waveB[o] = -1
    }
    // The pointer's wake (desktop, HIGH): a sample at most every 90 ms while it moves over the landscape.
    if (input.moved && clock - wakeAt >= WAKE.every) {
      input.moved = false
      if (!lite() && T.wake === 'pointer' && finePointer.matches && inHero() && groundAt(input.x, input.y)) {
        wakeAt = clock
        const o = (wakeNext++ % WAKES) * 3
        wakeS[o] = ground.x
        wakeS[o + 1] = ground.z
        wakeS[o + 2] = clock
      }
    }
    // A tap (touch, MEDIUM and up): one ring from where it landed.
    if (input.tapped) {
      input.tapped = false
      if (!lite() && T.wake !== 'none' && inHero() && groundAt(input.tapX, input.tapY)) {
        tapS.x = ground.x
        tapS.z = ground.z
        tapS.at = clock
      }
    }
  }

  /** The motion's uniforms for this frame (the waves at `waves` of their height: 0 off, 0.7 MEDIUM). */
  function motionUniforms(u: Program['u'], waves: number, still: boolean) {
    const g = gl!
    const wpx = (W * C.D) / C.f
    const ampA = still ? 0 : WAVE.amp * B.relief * waves
    for (let i = 0; i < FRONTS_A; i++) {
      const d = waveA[i]
      const k = d < 0 ? 0 : 1 - smoothstep(0.75 * WAVE.life * wpx, WAVE.life * wpx, d)
      frontA[i * 4] = d < 0 ? -1e3 : d
      frontA[i * 4 + 1] = ampA * k
      frontA[i * 4 + 2] = ampA > 0 ? WAVE.crest * k : 0
      frontA[i * 4 + 3] = 0
    }
    const ampB = still ? 0 : FLANK.amp * B.relief * waves
    for (let i = 0; i < FRONTS_B; i++) {
      const r = waveB[i * 3 + 2]
      const k = r < 0 ? 0 : 1 - smoothstep(0.7 * FLANK.life * wpx, FLANK.life * wpx, r)
      frontB[i * 4] = waveB[i * 3]
      frontB[i * 4 + 1] = waveB[i * 3 + 1]
      frontB[i * 4 + 2] = r < 0 ? -1e3 : r
      frontB[i * 4 + 3] = ampB * k
    }
    for (let i = 0; i < WAKES; i++) {
      const age = (clock - wakeS[i * 3 + 2]) / WAKE.life
      const k = !still && age >= 0 && age < 1 ? (1 - age) * (1 - age) : 0
      wakeU[i * 4] = wakeS[i * 3]
      wakeU[i * 4 + 1] = wakeS[i * 3 + 1]
      wakeU[i * 4 + 2] = -WAKE.amp * WAKE.share * B.relief * k
      wakeU[i * 4 + 3] = WAKE.lit * WAKE.share * k
    }
    g.uniform4fv(u.uFrontA, frontA)
    g.uniform4fv(u.uFrontB, frontB)
    g.uniform4fv(u.uWake, wakeU)
    g.uniform4f(u.uWaveK, WAVE.length * wpx, FLANK.length * wpx, WAVE.reach * wpx, WAVE.clamp * B.relief)
    // A tap's ring: out to a quarter of the width (eased out), fading as it goes.
    const tt = (clock - tapS.at) / TAP.life
    const tapOn = !still && tt >= 0 && tt < 1
    g.uniform4f(u.uTap, tapS.x, tapS.z, TAP.radius * wpx * easeOut(Math.max(0, tt)), tapOn ? TAP.amp * B.relief * (1 - tt) ** 1.5 : 0)
    // The typing tremor: three damped swings over 240 ms from a burst's first keys.
    const tr = (performance.now() - stageCues.burstAt) / 1000 / TREMOR.life
    const tremor = !still && !lite() && tr >= 0 && tr < 1 ? TREMOR.amp * B.relief * Math.sin(Math.PI * 2 * TREMOR.cycles * tr) * (1 - tr) : 0
    g.uniform4f(u.uMove, (WAKE.radius * wpx) / 2, TAP.length * wpx, tapOn ? TAP.lit * (1 - tt) : 0, tremor)
    // The light sweep: every 10 beats, across in 6, eased at both ends (and in and out in strength).
    const sw = (beats % SWEEP.every) / SWEEP.travel
    const sweepOn = !still && !lite() && beatsOn && sw < 1
    g.uniform4f(u.uSweep, W * (-0.1 + 1.2 * easeInOut(Math.min(1, sw))), (SWEEP.width * W) / 2, sweepOn ? SWEEP.gain * Math.sin(Math.PI * sw) : 0, still ? 0 : LIFT.bright * lift)
  }

  /** The comet, if one is crossing (screen space, over the far ridges on one side, never behind the robot). */
  function pushComet() {
    const n = Math.floor(beats / COMET.every)
    const tc = (beats - n * COMET.every) * BEAT_S
    if (tc >= COMET.life) return
    const side = n % 2 ? 1 : -1
    const hz = B.horizon
    // A gentle arc: from high over the outer ridges, curving down toward the middle.
    const x0 = W * (0.5 + side * 0.45)
    const x2 = W * (0.5 + side * 0.15)
    const y0 = Math.max(96, hz - 0.17 * H)
    const y2 = Math.max(116, hz - 0.06 * H)
    const x1 = x0 + (x2 - x0) * 0.55
    const y1 = Math.min(y0, y2) - 0.03 * H
    const a = COMET.alpha * smoothstep(0, 0.25, tc) * (1 - smoothstep(COMET.life - 0.6, COMET.life, tc))
    const uh = easeOut(tc / COMET.life)
    for (let i = 0; i <= COMET.trail; i++) {
      const u = uh - i * 0.018
      if (u < 0) break
      const k = i / COMET.trail
      const v = 1 - u
      pushFx(v * v * x0 + 2 * v * u * x1 + u * u * x2, v * v * y0 + 2 * v * u * y1 + u * u * y2, 0, COMET.head * (1 - 0.6 * k), a * (1 - k) ** 1.5, 1, 2.3)
    }
  }

  // ---- drawing

  let nFx = 0
  function pushFx(x: number, z: number, lift: number, sizePx: number, alpha: number, tint: number, soft: number) {
    if (nFx >= FX_MAX || alpha < 0.003) return
    const o = nFx++ * FX_STRIDE
    fxData[o] = x
    fxData[o + 1] = z
    fxData[o + 2] = lift
    fxData[o + 3] = sizePx
    fxData[o + 4] = alpha
    fxData[o + 5] = tint
    fxData[o + 6] = soft
  }

  function buildFx(still: boolean) {
    nFx = 0
    const phone = size === 'phone'
    const at = still ? [L.x, L.z] : agentPos()
    // The trail: from one sample back (the newest sits on the agent), fading 85% -> 0, tapering.
    const n = trailMax()
    const show = still ? 1 : phase === 'land' ? 1 - smoothstep(0, 0.8, clock - landAt) : Math.max(agentA, 0)
    for (let i = 1; i < trailN; i++) {
      const k = 1 - i / n
      pushFx(trail[i * 2], trail[i * 2 + 1], 0, (phone ? 2.4 : 3) + 2.8 * k, 0.85 * k ** 1.2 * show, 1, 0.15)
    }
    const a = still ? 1 : agentA
    if (a > 0) {
      // A soft glow (~28 px radius) and the core (9 px), kept under the visor's brightness.
      pushFx(at[0], at[1], 0, phone ? 46 : 60, 0.3 * a, 1, 1)
      pushFx(at[0], at[1], 0, phone ? 8 : 9.5, 0.6 * a, 1, 0.2)
    }
    if (!still && !lite() && beatsOn && TIERS[tierNow()].comets && degradeStep() < 2) pushComet()
    if (phase !== 'land' || still) return
    const t = clock - landAt
    // The ring: out from the plateau's rim across the landscape and up its slopes, to 60% of the width (80% on
    // phones) in 1.1 s (CYCLE.land). It spreads from the global minimum itself, so it runs out both sides of the robot.
    const ring = ringAt(t)
    if (ring.a > 0.003) {
      const count = lite() ? RING.lite : degradeStep() >= 4 ? RING.degraded : RING.dots
      for (let i = 0; i < count; i++) {
        const th = (i / count) * Math.PI * 2
        const x = ring.r * B.rx * Math.cos(th)
        const z = ring.r * B.rz * Math.sin(th)
        if (z < -B.bz || z > B.rz * 3) continue
        pushFx(x, z, 0, phone ? 4.5 : 6, ring.a, 1, 0.2)
      }
    }
    // The column: ~24 faint dots rising from the plateau's edge, gone in 1.2 s.
    if (t < 1.2) {
      const risen = Math.min(24, (t / 0.5) * 24)
      const gap = (5 * toScreen(L.x, 0, L.z).depth) / C.f
      for (let i = 0; i < risen; i++) pushFx(L.x, L.z, (i + 1) * gap, 3, 0.4 * (1 - t / 1.2) * (1 - (i / 24) * 0.7), 1, 0.4)
    }
  }

  /**
   * The ring at `t` s into the landing: its radius in plateau radii (from the plateau's rim out to the reach,
   * ease-out) and its opacity (peaks at 75%).
   */
  function ringAt(t: number) {
    if (t < 0 || t >= CYCLE.land) return { r: 0, a: 0 }
    const reach = ((size === 'phone' ? RING.phoneReach : RING.reach) * W * C.D) / C.f / B.rx
    const R = 1.02 + (Math.max(1.5, reach) - 1.02) * (1 - (1 - t / CYCLE.land) ** 2.4)
    const a = RING.alpha * (t < 0.15 ? t / 0.15 : (1 - (t - 0.15) / (CYCLE.land - 0.15)) ** 1.3)
    return { r: R, a: lite() ? a * 0.8 : a }
  }

  let lastDegrade = 0
  const shown = { hazeV: -1 }
  let wasLite = lite()
  let lastTier = tierNow()
  const at = { x: 0, y: 0 }

  /**
   * The uniforms both programs share. A program keeps its uniforms, so only what moves is sent each frame (the
   * breath, the parallax); the layout's only after a layout, the wells and hills only while they change.
   */
  function setShared(prog: Program, px: number, py: number, breath: number) {
    const g = gl!
    const u = prog.u
    g.useProgram(prog.p)
    if (prog.arr !== arrVersion) {
      prog.arr = arrVersion
      g.uniform4fv(u.uWell, flat4(cur.wells, WELLS))
      g.uniform4fv(u.uHill, flat4(cur.hills, HILLS))
    }
    if (prog.layout !== layoutVersion) {
      prog.layout = layoutVersion
      g.uniform2f(u.uBowl2, B.far, B.lip)
      g.uniform2f(u.uPlat, B.rx, B.rz)
      g.uniform4f(u.uCam, C.D, C.f, SIN, COS)
      g.uniform4f(u.uScr, C.ox, C.oy, W, H)
      g.uniform3f(u.uHead, head.x, head.y, head.r)
      g.uniform4f(u.uBody, body.x0, body.y0, body.x1, body.y1)
      g.uniform3f(u.uClear, clear.margin, clear.feather, clear.floor)
      g.uniform1f(u.uDpr, dpr)
    }
    g.uniform4f(u.uBowl, B.bx, B.bz, B.relief, breath)
    g.uniform2f(u.uShift, px, py)
  }
  /** Bumped when the layout or the arrangement changes (setShared re-sends those uniforms). */
  let layoutVersion = 0
  let arrVersion = 0

  function draw(time: number, still: boolean) {
    if (lost || ready !== true) return
    if (degradeStep() !== lastDegrade || lite() !== wasLite || tierNow() !== lastTier) {
      const liteChanged = lite() !== wasLite
      lastDegrade = degradeStep()
      wasLite = lite()
      lastTier = tierNow()
      layout()
      if (liteChanged) {
        setArrangement(lite() ? fixedArrangement() : arrangement(side))
        if (phase !== 'wait') startRun()
      }
    }
    const g = gl!
    g.viewport(0, 0, canvas.width, canvas.height)
    g.clearColor(0, 0, 0, 0)
    g.clear(g.COLOR_BUFFER_BIT)
    g.enable(g.BLEND)

    // The horizon's glow breathes, +-8% over 4 s (a sine). Style writes only when the value has moved (an
    // opacity change is composited, no layout or paint).
    const hazeBreath = still || lite() ? 0 : HAZE.amp * Math.sin((time * Math.PI * 2) / HAZE.period)
    const hazeV = Math.min(1, 0.9 + hazeBreath)
    if (Math.abs(hazeV - shown.hazeV) >= 0.006 || (hazeV >= 1) !== (shown.hazeV >= 1)) {
      shown.hazeV = hazeV
      haze.style.opacity = hazeV.toFixed(3)
    }

    // Pointer parallax (desktop): 11 px opposite the pointer at the stage's depth, more for nearer dots.
    // stage.ts eases --hero-px / --hero-py.
    const para = size === 'desktop' && !still && !lite()
    at.x = para ? parseFloat(host.style.getPropertyValue('--hero-px')) || 0 : 0
    at.y = para ? parseFloat(host.style.getPropertyValue('--hero-py')) || 0 : 0
    const px = -11 * at.x
    const py = -7 * at.y
    const breath = still ? 1 : 1 + BREATH.amp * Math.sin((time * Math.PI * 2) / BREATH.period)

    g.blendFunc(g.ONE, g.ONE)
    const tLand = phase === 'land' && !still ? clock - landAt : -1
    setShared(terrain, px, py, breath)
    const tu = terrain.u
    g.uniform2f(tu.uDepth, G.dN, G.dF)
    const phone = size === 'phone'
    const [small, medium, large] = phone ? DOT.phone : DOT.wide
    g.uniform4f(tu.uSize, G.sizeK, small, medium, large)
    g.uniform1f(tu.uRowK, G.rowK)
    const T = TIERS[tierNow()]
    const glow = !lite() && degradeStep() < 4 ? 1 : 0
    g.uniform2f(tu.uFx, glow && T.dof && !phone ? 1 : 0, glow)
    // The energy system's uniforms (waves, wake, tap, tremor, sweep), in world units at the stage's depth.
    motionUniforms(tu, lite() ? 0 : T.waves, still)
    const flash = tLand >= 0 ? Math.sin(Math.PI * Math.min(1, tLand / FLASH)) : 0
    g.uniform4f(tu.uLand, L.x, L.z, flash, H * 0.9)
    const ring = ringAt(tLand)
    g.uniform3f(tu.uRing, ring.r, 0.14, ring.a > 0 ? Math.min(1, ring.a / RING.alpha + 0.25) : 0)
    // The drain's clock: still (reduced motion, the frozen frame) where it stands.
    g.uniform2f(tu.uFlowT, V.drain, phone ? DRAIN.phoneLife : DRAIN.life)
    g.bindBuffer(g.ARRAY_BUFFER, terrainBuf)
    g.enableVertexAttribArray(terrain.a.aFlow)
    g.vertexAttribPointer(terrain.a.aFlow, 4, g.FLOAT, false, 0, 0)
    if (!tune.noDraw && !labOff('landscape')) g.drawArrays(g.POINTS, 0, gridCount)
    g.disableVertexAttribArray(terrain.a.aFlow)

    drawVortex(px, py, breath, still)

    buildFx(still)
    if (nFx && !labOff('fx')) {
      setShared(fx, px, py, breath)
      g.bindBuffer(g.ARRAY_BUFFER, fxBuf)
      g.bufferSubData(g.ARRAY_BUFFER, 0, fxData.subarray(0, nFx * FX_STRIDE))
      const S = FX_STRIDE * 4
      g.enableVertexAttribArray(fx.a.aPos)
      g.enableVertexAttribArray(fx.a.aK)
      g.enableVertexAttribArray(fx.a.aSoft)
      g.vertexAttribPointer(fx.a.aPos, 2, g.FLOAT, false, S, 0)
      g.vertexAttribPointer(fx.a.aK, 4, g.FLOAT, false, S, 8)
      g.vertexAttribPointer(fx.a.aSoft, 1, g.FLOAT, false, S, 24)
      g.drawArrays(g.POINTS, 0, nFx)
      g.disableVertexAttribArray(fx.a.aPos)
      g.disableVertexAttribArray(fx.a.aK)
      g.disableVertexAttribArray(fx.a.aSoft)
    }

    if (import.meta.env.DEV && snapWaiter) {
      snapWaiter(canvas.toDataURL())
      snapWaiter = null
    }
  }
  /** The inflow vortex: one draw of its seeded points; the rim's arc is published for the dais (engine.ts). */
  function drawVortex(px: number, py: number, breath: number, still: boolean) {
    const fade = vortexFade()
    const n = tune.vortexCount ?? vortexCount()
    const arc = stageCues.swallow
    arc.gain = 0
    if (fade <= 0 || !n || labOff('inflow')) return
    const g = gl!
    const phone = size === 'phone'
    const life = phone ? VORTEX.phoneLife : VORTEX.life
    // The beat: +6% on it, an eased swell (a raised cosine peaking on the beat).
    const beat = still || !beatsOn ? 0 : VORTEX.beat * (0.5 + 0.5 * Math.cos((beats % 1) * Math.PI * 2))
    // Reduced motion: a still moment of the flow, 40% of it at 70%.
    const flow = still ? 4.5 : V.flow
    setShared(vortex, px, py, breath)
    const u = vortex.u
    g.uniform1f(u.uFlow, flow)
    g.uniform1fv(u.uRing, V.ring)
    g.uniform2f(u.uVLife, life[0], life[1])
    g.uniform4f(u.uVLook, fade * (still ? VORTEX.stillAlpha : 1) * (tune.vortexGain ?? 1), beat, VORTEX.still, still ? 1 : 0)
    g.uniform3f(u.uVClear, VORTEX.clear.margin * F.robotH, VORTEX.clear.feather * F.robotH, VORTEX.clear.floor)
    g.bindBuffer(g.ARRAY_BUFFER, vortexBuf)
    const S = VORTEX_STRIDE * 4
    g.enableVertexAttribArray(vortex.a.aSeed)
    g.enableVertexAttribArray(vortex.a.aArm)
    g.enableVertexAttribArray(vortex.a.aTrail)
    g.vertexAttribPointer(vortex.a.aSeed, 4, g.FLOAT, false, S, 0)
    g.vertexAttribPointer(vortex.a.aArm, 1, g.FLOAT, false, S, 16)
    g.vertexAttribPointer(vortex.a.aTrail, 1, g.FLOAT, false, S, 20)
    g.drawArrays(g.POINTS, 0, n * VPTS)
    g.disableVertexAttribArray(vortex.a.aSeed)
    g.disableVertexAttribArray(vortex.a.aArm)
    g.disableVertexAttribArray(vortex.a.aTrail)
    // The arc follows the first arm to where its dots arrive (its mean lifetime and start ring); not in LOW
    // or reduced motion.
    if (still || tierNow() === 'low') return
    const rho0 = Math.max(1.6, ((VORTEX.start[0] + VORTEX.start[1]) / 2) * V.ring.reduce((a, b) => a + b, 0) / RING_U)
    arc.angle = (V.flow * Math.PI * 2) / VORTEX.turn + VORTEX.twist * Math.log(rho0)
    arc.gain = VORTEX.arc.gain * fade
  }

  /** Development only: the next drawn frame of this canvas, as a data URL (window.__heroTerrain.snap). */
  let snapWaiter: ((url: string) => void) | null = null

  const flatBuf = { 4: new Float32Array(16) } as Record<number, Float32Array>
  function flat4(list: Bump[], n: number) {
    const out = (flatBuf[n] ??= new Float32Array(n * 4))
    out.fill(0)
    for (let i = 0; i < Math.min(n, list.length); i++) out.set(list[i], i * 4)
    return out
  }

  /** Reduced motion: the agent resting at the plateau's edge, the trail it came by laid out behind it. */
  function stillFrame() {
    if (!nPath) {
      while (!planner.ready) planTry(cur, GD.max)
    }
    phase = 'rest'
    trailN = 0
    const n = trailMax()
    for (let i = 0; i < n; i++) {
      const k = Math.max(0, nArrive - i * 6)
      trail[i * 2] = path[k * 2]
      trail[i * 2 + 1] = path[k * 2 + 1]
      trailN++
    }
    draw(0, true)
  }

  // ---- the loop

  let visible = true
  let disposed = false
  /** The watchdog waits out the first seconds (shader warm-up, the first plans). */
  const bornAt = performance.now()
  let raf = 0
  let last = 0
  let carry = 0
  const pace = createPacer()
  const moving = () => !lost && !still() && visible && !document.hidden && backdrop() > 0.01 && !stageCues.loop
  /** CPU time per drawn frame (ms), for the performance check (the console, in development). */
  const cost = { sum: 0, n: 0, plan: 0 }

  /** Development only: GPU time of the layer's draws (EXT_disjoint_timer_query), when available. */
  // Opt in with ?gpu: polling the queries can stall the pipeline, so it is off even in development.
  const timer = PERF_LAB && new URLSearchParams(location.search).has('gpu') ? gl.getExtension('EXT_disjoint_timer_query') : null
  const gpu = { sum: 0, n: 0 }
  const queries: WebGLQuery[] = []
  let query: WebGLQuery | null = null
  function gpuBegin() {
    if (!timer || query) return
    query = timer.createQueryEXT()
    if (query) timer.beginQueryEXT(timer.TIME_ELAPSED_EXT, query)
  }
  function gpuEnd() {
    if (!timer || !query) return
    timer.endQueryEXT(timer.TIME_ELAPSED_EXT)
    queries.push(query)
    query = null
    while (queries.length && timer.getQueryObjectEXT(queries[0], timer.QUERY_RESULT_AVAILABLE_EXT)) {
      const q = queries.shift()!
      if (!gl!.getParameter(timer.GPU_DISJOINT_EXT)) {
        gpu.sum += timer.getQueryObjectEXT(q, timer.QUERY_RESULT_EXT) / 1e6
        gpu.n++
      }
      timer.deleteQueryEXT(q)
    }
  }
  let resizeRaf = 0
  /**
   * Its own frame-rate watchdog, where the engine's governor (stageCues.degrade) does not run (LOW, or no
   * engine): frames averaging over budget for 2 s (once the intro is over) take it one step down its own
   * rungs of the governor's ladder (degradeStep), only ever downward: the interference waves, the comets,
   * grid density, trail length with the glow and ring dots, resolution, then the frame rate.
   */
  const RUNGS = [1, 2, 3, 4, 7, 8]
  /** (The vortex goes first: half its dots, then all of them, before the first rung.) */
  const watchdog = { sum: 0, n: 0, level: 0, rung: 0, vortex: 0 }
  function watch(ms: number) {
    if (stageCues.governed || labOff('adapt') || watchdog.rung >= RUNGS.length || (performance.now() - bornAt) / 1000 < 6 || ms > 400) return
    watchdog.sum += ms
    watchdog.n++
    if (watchdog.sum < SLOW_FRAME.span) return
    const avg = watchdog.sum / watchdog.n
    watchdog.sum = watchdog.n = 0
    // (Its frames are the page's refreshes: the budget is the refresh's, unlocked.)
    if (!overBudget(avg, false)) return
    if (watchdog.vortex < 2 && VORTEX.count[tierNow()] > 0) {
      watchdog.vortex++
      return
    }
    watchdog.level = RUNGS[watchdog.rung++]
    layout()
  }
  /** Development only: skip the layer entirely (A/B frame-time checks). */
  let skip = labOff('terrain')
  function tick(now: number) {
    raf = 0
    if (!moving()) return idle()
    if (skip) {
      raf = requestAnimationFrame(tick)
      return
    }
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0)
    if (last) watch(now - last)
    last = now
    carry += dt
    // Paced with the robot (clock.ts): about 60 frames a second on any display. Phones and LOW: an even ~30 is
    // plenty for motion this slow; the ladder's last step halves the rest to 30 (and those already at 30 to 20).
    const slow = size === 'phone' || TIERS[tierNow()].fps <= 30
    const due = slow && degradeStep() >= 8 ? carry >= 1 / 22 : pace(now, slow || degradeStep() >= 8 || pacing.locked)
    if (due) {
      const t0 = performance.now()
      gpuBegin()
      update(carry)
      draw(now / 1000, false)
      gpuEnd()
      cost.sum += performance.now() - t0
      cost.n++
      carry = 0
    }
    raf = requestAnimationFrame(tick)
  }

  function idle() {
    if (still()) {
      if (visible) stillFrame()
      return
    }
    // The backdrop fading out is the scroll: check again soon, cheaply, without drawing.
    if (visible && !document.hidden) setTimeout(wake, 250)
  }

  function wake() {
    if (disposed) return
    if (!moving()) return idle()
    if (!raf) {
      last = 0
      raf = requestAnimationFrame(tick)
    }
  }

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    wake()
  })
  io.observe(host)
  document.addEventListener('visibilitychange', wake)
  reduced.addEventListener('change', wake)
  // A lost context is asked back (preventDefault) and rebuilt when it returns: the programs, the buffers, the grid.
  const onLost = (e: Event) => {
    e.preventDefault()
    lost = true
    cancelAnimationFrame(raf)
    raf = 0
  }
  const onRestored = () => {
    const rebuilt = build(gl)
    ;({ terrain, fx, vortex } = rebuilt)
    ready = false
    terrainBuf = gl.createBuffer()!
    fxBuf = gl.createBuffer()!
    vortexBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, vortexBuf)
    gl.bufferData(gl.ARRAY_BUFFER, vortexData, gl.STATIC_DRAW)
    gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf)
    gl.bufferData(gl.ARRAY_BUFFER, fxData.byteLength, gl.DYNAMIC_DRAW)
    lost = false
    gridKey = ''
    layout()
    poll()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  layout()
  setArrangement(lite() ? fixedArrangement() : arrangement(side))
  if (PERF_LAB)
    Object.assign(window, {
      __heroTerrain: {
        cost,
        gpu,
        tune(o: typeof tune) {
          Object.assign(tune, o)
          gridKey = ''
          layout()
        },
        skip(v: boolean) {
          skip = v
          gl.clear(gl.COLOR_BUFFER_BIT)
        },
        /** Freeze at `t` s into the landing (or, without t, wherever it is); unfreeze with null. */
        freeze(t?: number | null) {
          frozen = t !== null
          if (typeof t === 'number') {
            landAt = clock - t
            phase = 'land'
            phaseAt = landAt
            step = nArrive
          }
        },
        snap: () => new Promise<string>((r) => (snapWaiter = r)),
        motion: () => ({
          tier: tierNow(),
          degrade: degradeStep(),
          energy: lift,
          beats,
          beatsOn,
          waveA: Array.from(waveA),
          waveB: Array.from({ length: FRONTS_B }, (_, i) => waveB[i * 3 + 2]),
          wakes: Array.from({ length: WAKES }, (_, i) => clock - wakeS[i * 3 + 2]).filter((a) => a < WAKE.life).length,
          tapAge: clock - tapS.at,
          sweep: (beats % SWEEP.every) / SWEEP.travel,
          comet: ((beats % COMET.every) * BEAT_S).toFixed(2),
          wpx: (W * C.D) / C.f,
        }),
        state: () => ({ V, vortexCount: vortexCount(), vortexFade: vortexFade(), swallow: { ...stageCues.swallow }, ladder: { vortex: Math.max(stageCues.vortex, watchdog.vortex), degrade: degradeStep() }, nFx, ring: ringAt(clock - landAt), phase, clock, step, nArrive, nPath, rate, landAt, gridCount, C, B, G, L, W, H, detours: planner.detours, at: agentPos(), agentScreen: (() => { const [x, z] = agentPos(); return onScreen(cur, x, z) })() }),
      },
    })
  poll()

  return {
    resize() {
      // Coalesced to one rebuild per frame: phones fire resizes in bursts (the URL bar showing and hiding).
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        if (disposed) return
        layout()
        if (!raf) wake()
        if (still()) stillFrame()
      })
    },
    dispose() {
      disposed = true
      window.clearTimeout(pollTimer)
      stageCues.backdropReady = true
      cancelAnimationFrame(raf)
      cancelAnimationFrame(resizeRaf)
      io.disconnect()
      document.removeEventListener('visibilitychange', wake)
      reduced.removeEventListener('change', wake)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('touchstart', onTouch)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      gl.deleteBuffer(terrainBuf)
      gl.deleteBuffer(fxBuf)
      gl.deleteBuffer(vortexBuf)
      gl.deleteProgram(terrain.p)
      gl.deleteProgram(fx.p)
      gl.deleteProgram(vortex.p)
      stageCues.swallow.gain = 0
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
      haze.remove()
      ridgeSvg.remove()
    },
  }
}

// ---- GL plumbing

interface Program {
  p: WebGLProgram
  u: Record<string, WebGLUniformLocation | null>
  a: Record<string, number>
  /** The layout and arrangement versions its uniforms were last sent for. */
  layout: number
  arr: number
  /** Still compiling (build): its shaders and the names to look up once it is linked. */
  pending: { v: WebGLShader; f: WebGLShader; attrs: string[]; uniforms: string[] } | null
}

/** Uniform arrays (their location is their first element's). */
const ARRAYS = new Set(['uWell', 'uHill', 'uFrontA', 'uFrontB', 'uWake', 'uRing'])

/**
 * The three programs, compiled and linked without waiting: with KHR_parallel_shader_compile the driver builds
 * them in the background (asking for a status at once would hold the main thread until it is done, seconds on a
 * phone while the robot's own shaders compile). settle() finishes them once they are ready.
 */
function build(gl: WebGLRenderingContext) {
  const link = (vs: string, fs: string, attrs: string[], uniforms: string[]): Program => {
    const shader = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      return sh
    }
    const v = shader(gl.VERTEX_SHADER, vs)
    const f = shader(gl.FRAGMENT_SHADER, fs)
    const p = gl.createProgram()!
    gl.attachShader(p, v)
    gl.attachShader(p, f)
    gl.linkProgram(p)
    return { p, u: {}, a: {}, layout: -1, arr: -1, pending: { v, f, attrs, uniforms } }
  }
  const shared = ['uWell', 'uHill', 'uBowl', 'uBowl2', 'uPlat', 'uCam', 'uScr', 'uShift', 'uHead', 'uBody', 'uClear', 'uDpr']
  const terrain = link(TERRAIN_VS, DOT_FS, ['aFlow'], [...shared, 'uFlowT', 'uDepth', 'uSize', 'uRowK', 'uFx', 'uFrontA', 'uFrontB', 'uWaveK', 'uWake', 'uTap', 'uMove', 'uSweep', 'uLand', 'uRing'])
  const fx = link(FX_VS, DOT_FS, ['aPos', 'aK', 'aSoft'], shared)
  const vortex = link(VORTEX_VS, DOT_FS, ['aSeed', 'aArm', 'aTrail'], [...shared, 'uFlow', 'uRing', 'uVLife', 'uVLook', 'uVClear'])
  return { terrain, fx, vortex }
}

/** True once all three programs are linked and their locations read; false while they compile; null if one failed. */
function settle(gl: WebGLRenderingContext, progs: Program[]): boolean | null {
  const ext = gl.getExtension('KHR_parallel_shader_compile')
  for (const prog of progs) {
    if (!prog.pending) continue
    if (ext && !gl.getProgramParameter(prog.p, ext.COMPLETION_STATUS_KHR)) return false
  }
  for (const prog of progs) {
    const pend = prog.pending
    if (!pend) continue
    prog.pending = null
    const ok = gl.getProgramParameter(prog.p, gl.LINK_STATUS)
    if (!ok && import.meta.env.DEV) console.warn('[terrain]', gl.getShaderInfoLog(pend.v), gl.getShaderInfoLog(pend.f), gl.getProgramInfoLog(prog.p))
    gl.deleteShader(pend.v)
    gl.deleteShader(pend.f)
    if (!ok) return null
    for (const n of pend.uniforms) prog.u[n] = gl.getUniformLocation(prog.p, ARRAYS.has(n) ? `${n}[0]` : n)
    for (const n of pend.attrs) prog.a[n] = gl.getAttribLocation(prog.p, n)
  }
  return true
}
