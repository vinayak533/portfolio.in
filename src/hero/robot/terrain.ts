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
 *             toward #7C5CFF, the farthest quarter out of focus. Round the robot (its silhouette plus
 *             12%, feathered) everything is dimmed to 45%, a dark pocket that frames it.
 *   agent     a bright point doing momentum gradient descent (0.9) on the same f, planned here on the
 *             CPU with finite differences: from a high rim at the far left or right (alternating), down
 *             through a secondary well or two (it slows, circles, escapes), to the plateau's front edge,
 *             landing as the laptop's build passes (stageCues.buildDue / buildAt / commitAt, read only;
 *             an 11 s cycle without them). The landing: the plateau flashes, a ring of dots runs out over
 *             the surface (up the slopes), a faint column rises; then the wells and hills ease into a new
 *             arrangement and the next agent comes from the other side.
 *   plot      four dotted corner crosshairs and two edge rulers of fine ticks, the left one with a
 *             cursor tick following the agent's elevation (an SVG; no rulers on phones).
 *
 * Everything is emissive and additive on its own canvas under the robot's layer: it lights, shadows and
 * covers nothing of the robot. Lite: 55% of the grid, no depth of field, glow, morph or parallax, a
 * 24-dot trail, a 60-dot ring. Reduced motion: one still frame, the agent resting at the plateau's edge
 * with its trail. Paused while the hero is off screen, the tab hidden or the backdrop faded. The
 * frame-rate governor (stageCues.degrade) takes away, in order: the depth of field, grid density, trail
 * length, the contours and glow, ring dots, then the pixel ratio.
 */
import { stageCues, type StageFrame } from './dom'
import { beat, emptySample } from './beat'

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
/** The dots' life (not in lite or reduced motion): ripples running over the surface, a shimmer, a twinkle. */
const VIBE = { ripple: 0.022, jitter: 0.6 }
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
/** Dot size (px): nearest .. farthest. */
const DOT = { wide: [3, 5.5], phone: [2.2, 4.2] } as const
/** Gradient descent: momentum, step, the arrival radius (world), the most steps. */
const GD = { beta: 0.9, lr: 0.0016, arrive: 0.05, max: 2600 }
/**
 * Cycle timing (s): the agent's fade-in, the timer-mode descent, the final approach (as long as the
 * build prints: perform.ts DUR.build), the landing's effects, the morph and when it starts, the rest
 * before the next run (timer mode), and the longest hold for a build that does not come.
 */
const CYCLE = { spawn: 0.5, descent: 8.5, phoneDescent: 7, final: 1.2, land: 1.6, morphAt: 0.3, morph: 3, rest: 2, hold: 6 }
/** The load sequence (s after the reveal): the landscape's dot-wave, then the horizon and plot, then the agent at power-on. */
const LOAD = { terrain: [0.4, 1.8], details: [1.8, 2.3], agent: 2.5 }
/** The landing ring: dots, peak opacity, reach (share of the width; phones). */
const RING = { dots: 140, lite: 60, degraded: 70, alpha: 0.75, reach: 0.6, phoneReach: 0.8 }
/** The trail: dots (over ~2 s), lite, degraded. */
const TRAIL = { dots: 70, lite: 24, degraded: 40, span: 2 }

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const rand = (a: number, b: number) => a + Math.random() * (b - a)

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
attribute vec2 aPos;           // world x, z
uniform float uDpr;
uniform float uTime;
uniform vec2 uDepth;           // the grid's nearest and farthest depth
uniform vec3 uSize;            // size at the stage's depth (px), min, max
uniform float uRowK;           // the depth ratio between rows (log)
uniform float uReveal;         // the reveal front's radius (world)
uniform vec2 uFx;              // depth of field, contours+glow (0/1)
uniform float uVibe;           // the dots' life: ripples, shimmer, twinkle (0/1)
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
void main() {
  float f = field(aPos);
  // Life: ripples running across the surface (two crossing wave trains), each dot shimmering on its own
  // phase, now and then a twinkle. The plateau stays still under the dais.
  float ph = fract(sin(dot(aPos, vec2(127.1, 311.7))) * 43758.5453);
  float live = uVibe * smoothstep(1.05, 1.4, plateau(aPos));
  float ripple = sin(dot(aPos, vec2(2.6, 1.9)) * 3.0 - uTime * 2.6) + 0.7 * sin(dot(aPos, vec2(-2.1, 2.8)) * 2.4 - uTime * 3.4);
  f += live * ${VIBE.ripple.toFixed(3)} * uBowl.z * ripple;
  vec3 s = project(vec3(aPos.x, f, aPos.y));
  s.xy += live * ${VIBE.jitter.toFixed(2)} * vec2(sin(uTime * 7.0 + ph * 6.283), cos(uTime * 5.3 + ph * 9.1));
  float hn = clamp(f / uBowl.z, 0.0, 1.0);
  float rP = plateau(aPos);
  float far = clamp((s.z - uDepth.x) / (uDepth.y - uDepth.x), 0.0, 1.0);

  // Slopes: #A78BFA at 30-50%.
  vec3 col = ${vec3(LILAC)};
  float a = mix(0.30, 0.50, smoothstep(0.06, 0.5, hn));
  float size = uSize.x * uCam.x / s.z;
  // The basin round the plateau: #C4B5FD, brightest at its rim (75%), fading outward.
  float basin = smoothstep(0.98, 1.06, rP) * (1.0 - smoothstep(1.2, 1.9, rP));
  a = mix(a, mix(0.75, 0.6, smoothstep(1.1, 1.6, rP)), basin);
  col = mix(col, ${vec3(GLOW)}, basin);
  size *= 1.0 + 0.15 * basin;
  // On the plateau, under the dais: as faint as the dais's own dots, so the two meet without a seam.
  float on = 1.0 - smoothstep(0.96, 1.06, rP);
  a = mix(a, 0.14 + 0.1 * rP, on);
  // Crests and the rim: #C4B5FD at 55-70%, 20% larger, with a soft glow.
  float rim = smoothstep(0.86, 1.0, -aPos.y / uBowl.y);
  float crest = max(max(smoothstep(0.6, 0.9, hn), hillPeak(aPos)), 0.7 * rim) * (1.0 - on);
  a = mix(a, mix(0.55, 0.7, smoothstep(0.75, 1.0, hn)), crest);
  col = mix(col, ${vec3(GLOW)}, crest);
  size *= 1.0 + 0.2 * crest;
  float halo = crest * uFx.y;
  // Contours: every 7% of height a row 35% brighter, its brightness drifting.
  float c = fract(hn / 0.07);
  float line = (1.0 - smoothstep(0.0, 0.3, min(c, 1.0 - c))) * smoothstep(1.1, 1.3, rP) * step(0.03, hn);
  a *= 1.0 + 0.35 * line * uFx.y * (0.8 + 0.2 * sin(uTime * 0.4 - hn * 11.0));
  size *= 1.0 + 0.1 * line * uFx.y;
  // Distance: smaller, hazier, toward #7C5CFF; the farthest quarter out of focus.
  a *= mix(1.0, 0.7, smoothstep(0.3, 1.0, far));
  col = mix(col, ${vec3(VIOLET)}, 0.6 * smoothstep(0.4, 1.0, far) * (1.0 - 0.5 * crest));
  float blur = uFx.x * smoothstep(0.75, 0.95, far);
  size *= 1.0 + 0.5 * blur;
  a *= 1.0 - 0.3 * blur;
  // Where rows crowd together on screen (a slope turned away), each dot is fainter: dots, not lines.
  vec2 nb = vec2(aPos.x, aPos.y - s.z * uRowK / uCam.w);
  float gap = abs(project(vec3(nb.x, field(nb), nb.y)).y - s.y);
  a *= clamp(gap / (uSize.x * 1.4), 0.45, 1.0);
  // The last rows thin into the horizon; the bottom fades into the vignette.
  a *= 1.0 - smoothstep(0.97, 1.0, far);
  a *= 1.0 - smoothstep(uLand.w, uScr.w, s.y);
  // The reveal: a dot-wave outward from the stage.
  a *= 1.0 - smoothstep(uReveal - 0.6, uReveal, length(aPos));
  // The landing ring passing: dots swell 25% and brighten, then relax; just behind it a darker wake, so the
  // front stands out even crossing the bright basin.
  float rr = (rP - uRing.x) / uRing.y;
  float front = exp(-rr * rr) * uRing.z;
  float wake = (1.0 - smoothstep(-4.0, -1.2, rr)) * smoothstep(-9.0, -5.0, rr) * uRing.z;
  size *= 1.0 + 0.25 * front;
  a = (a + 0.4 * front) * (1.0 - 0.5 * wake);
  col = mix(col, ${vec3(GLOW)}, front);
  // A twinkle: each dot flares briefly every few seconds on its own beat; the ripples' crests a touch brighter.
  float tw = pow(0.5 + 0.5 * sin(uTime * (1.3 + ph * 1.7) + ph * 40.0), 18.0);
  a *= 1.0 + uVibe * (0.6 * tw + 0.12 * ripple);
  size *= 1.0 + uVibe * 0.35 * tw;
  // The robot's dark pocket; the plateau's flash (to 85%) shows round it.
  float flash = uLand.z * (1.0 - smoothstep(1.0, 1.35, rP));
  a = mix(a * clearing(s.xy), 0.85, flash);
  a = min(a, 0.8);
  // Size within its range (the halo grows the sprite, not the dot).
  size = clamp(size, uSize.y, uSize.z * 1.25);
  float sprite = size * (1.0 + 2.2 * halo);
  vCol = vec4(col, a);
  vShape = vec4(size / sprite, blur, halo * 0.32, 0.0);
  gl_PointSize = sprite * uDpr;
  gl_Position = a < 0.004 || s.z < 0.1 ? vec4(2.0, 2.0, 2.0, 1.0) : toClip(s.xy);
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
  vec3 s = project(vec3(aPos.x, field(aPos) + aK.x, aPos.y));
  float a = aK.z * clearing(s.xy);
  vCol = vec4(mix(${vec3(LILAC)}, ${vec3(GLOW)}, aK.w), a);
  vShape = vec4(1.0, 0.25, 0.0, aSoft);
  gl_PointSize = aK.y * uDpr;
  gl_Position = a < 0.003 ? vec4(2.0, 2.0, 2.0, 1.0) : toClip(s.xy);
}
`

/** Floats per FX point: aPos (2), aK (4), aSoft (1). */
const FX_STRIDE = 7
const FX_MAX = 2 + TRAIL.dots + RING.dots + 24 + 4

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
  // Back to front: the horizon's glow, the landscape's canvas, the plot marks (under the beam).
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
  const plot = createPlot(parent)

  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' })
  const programs = gl ? build(gl) : null
  if (!gl || !programs) {
    return {
      resize: () => plot.size(host.clientWidth, host.clientHeight, null),
      dispose() {
        canvas.remove()
        haze.remove()
        ridgeSvg.remove()
        plot.el.remove()
      },
    }
  }
  const { terrain, fx } = programs
  const terrainBuf = gl.createBuffer()!
  const fxBuf = gl.createBuffer()!
  const fxData = new Float32Array(FX_MAX * FX_STRIDE)
  // Allocated once; each frame only its used part is rewritten (bufferSubData).
  gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf)
  gl.bufferData(gl.ARRAY_BUFFER, fxData.byteLength, gl.DYNAMIC_DRAW)
  let gridCount = 0

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  /** Lite: the LITE toggle or a software renderer (Hero.tsx); phones are not lite, they have their own profile. */
  const lite = () => !!host.closest('[data-lite-landscape]')
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
  const tune: { dpr?: number; grid?: number; noDraw?: boolean } = {}

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
    // Density: lite 55%, the governor's step 2 80%; and never more points than the size's budget.
    const k0 = Math.sqrt((tune.grid ?? 1) * (lite() ? 0.55 : 1) * (stageCues.degrade >= 2 ? 0.8 : 1) * (watchdog.level >= 1 ? 0.75 : 1))
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
    if (key !== gridKey) {
      gridKey = key
      const dx = (sx * C.D) / C.f
      const pts = new Float32Array(count * 2 + 8)
      let n = 0
      const rows = Math.ceil(Math.log(G.dF / G.dN) / rowK)
      for (let j = 0; j <= rows; j++) {
        const depth = G.dN * Math.exp(j * rowK)
        const z = (C.D - depth) / COS
        const m = Math.floor(half(depth) / dx)
        for (let i = -m; i <= m && n < pts.length - 1; i++) {
          pts[n++] = i * dx
          pts[n++] = z
        }
      }
      gl!.bindBuffer(gl!.ARRAY_BUFFER, terrainBuf)
      gl!.bufferData(gl!.ARRAY_BUFFER, pts.subarray(0, n), gl!.STATIC_DRAW)
      gridCount = n / 2
    }

    // Up to 1.25x (the dots are soft; on 3x phones this is a ninth of the native fill), less once degraded.
    dpr = (tune.dpr ?? Math.min(window.devicePixelRatio || 1, 1.25)) * (stageCues.degrade >= 6 || watchdog.level >= 3 ? 0.75 : 1)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    layoutVersion++
    haze.style.top = `${Math.round(B.horizon)}px`
    buildRidges()
    plot.size(W, H, size)
    // The arrangement's slots are in world units: a new shape of world re-places them.
    const worldKey = `${B.bx.toFixed(2)}:${B.bz.toFixed(2)}:${B.rz.toFixed(2)}`
    if (worldKey !== placedKey && cur.wells.length) setArrangement(lite() ? fixedArrangement() : arrangement(side))
    placedKey = worldKey
  }
  let placedKey = ''

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
    let svg = ''
    for (const l of layers) {
      let d = ''
      for (let x = -12; x <= W + 12; x += 6) {
        const u = x / Math.max(W, 1) + l.seed
        const peaks = 0.5 + 0.3 * Math.sin(u * 7.1) + 0.2 * Math.sin(u * 15.3 + 1.1) + 0.15 * (1 - Math.abs(Math.sin(u * 23.7 + 2.3)))
        d += `${d ? 'L' : 'M'}${x} ${(B.horizon - k * (l.lift + l.amp * peaks)).toFixed(1)}`
      }
      // The silhouette (down to the horizon), then its crest as round dots (zero-length dashes, round caps).
      svg += `<path d="${d}L${W + 12} ${base}L-12 ${base}Z" fill="#040309" fill-opacity="${l.fill}"/>`
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

  let side = Math.random() < 0.5 ? -1 : 1
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
    const [x, z] = top[Math.floor(Math.random() * top.length)]
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
        // Out of the well and moving again: the next one may catch it.
        if (caught && speed > 0.008 && k > escapeAt + 40 && detours < 2) {
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

  type Phase = 'wait' | 'spawn' | 'descent' | 'hold' | 'final' | 'land' | 'rest'
  let phase: Phase = 'wait'
  let phaseAt = 0
  /** The cycle's clock (s), and the page's clock at its zero (ms), to read the engine's cues. */
  let clock = 0
  let clockBase = performance.now()
  const toClock = (ms: number) => (ms - clockBase) / 1000
  let step = 0
  let rate = 40
  /** Where the descent hands over to the final approach; the final approach's start and end (clock). */
  let nStage = 0
  /** The planned descent's pace (steps/s); it adapts within limits to reach the final approach as the build is due. */
  let rate0 = 40
  /** A build (by its start) that came too early in a run to land on: the agent waits for the next. */
  let skipped = -Infinity
  const fin = { from: 0, at: 0, end: 0 }
  let landAt = -1
  let runAt = 0
  let timerMode = true
  let seenCommit = stageCues.commitAt
  const trail = new Float32Array(TRAIL.dots * 2)
  let trailN = 0
  let trailAt = 0
  let agentA = 0
  let elevation = 0.5

  function go(p: Phase) {
    phase = p
    phaseAt = clock
  }

  /** The builds can be followed (the engine publishes them: not in lite, reduced motion or the scroll). */
  const syncable = () => !lite() && Number.isFinite(stageCues.buildDue)

  function startRun() {
    while (!planner.ready) planTry(morphT < 1 ? next : cur, GD.max)
    side = planner.side
    planner.side = -side
    replan()
    placeLanding(side)
    step = 0
    trailN = 0
    runAt = clock
    const phone = size === 'phone'
    timerMode = !syncable()
    if (timerMode) {
      nStage = nArrive
      rate = nArrive / (phone ? CYCLE.phoneDescent : CYCLE.descent)
    } else {
      // Reach the final approach as the build is due (it starts at the next pause after), so the last
      // stretch can run exactly as long as the build prints.
      const due = toClock(stageCues.buildDue)
      const T = Math.min(phone ? 8 : 10, Math.max(phone ? 4.5 : 5, due + 0.2 - (clock + CYCLE.spawn)))
      nStage = Math.floor((nArrive * T) / (T + CYCLE.final))
      rate = nStage / T
    }
    rate0 = rate
    go('spawn')
  }

  function final(endAt: number) {
    fin.from = step
    fin.at = clock
    fin.end = Math.max(clock + 0.25, endAt)
    go('final')
  }

  function land() {
    landAt = clock
    step = nArrive
    go('land')
  }

  let onAt = host.hasAttribute('data-on') ? -1e9 : Infinity

  /** Development only: hold the cycle at a moment (window.__heroTerrain.freeze). */
  let frozen = false
  function update(dt: number) {
    if (frozen) return
    clock += dt
    // The page's clock drifts from ours only while the loop is paused (the tab hidden): keep them aligned.
    clockBase = performance.now() - clock * 1000
    const since = (performance.now() - onAt) / 1000
    const commit = stageCues.commitAt !== seenCommit && Number.isFinite(stageCues.commitAt)
    seenCommit = stageCues.commitAt
    const buildStart = toClock(stageCues.buildAt)
    let building = !timerMode && buildStart > runAt + CYCLE.spawn * 0.5 && Math.abs(buildStart - skipped) > 0.5
    // Too early in the run (the agent still high on the rim): let this build pass and land on the next.
    const early = step < nStage * 0.5 && (phase === 'spawn' || phase === 'descent')
    if (building && early) {
      skipped = buildStart
      building = false
    }
    stepMorph(dt)

    // Phones plan in smaller slices (slower CPUs): no frame pays more than a fraction of a millisecond.
    if (phase === 'wait' || phase === 'rest') planTry(morphT < 1 ? next : cur, size === 'phone' ? 70 : 160)
    // A run starts once it is planned (planning goes a slice per frame), or after 1.5 s more regardless.
    const planned = (late: number) => planner.ready || late > 1.5
    if (phase === 'wait' && since >= LOAD.agent && planned(since - LOAD.agent)) startRun()
    else if (phase === 'spawn' && clock - phaseAt >= CYCLE.spawn) go('descent')

    if (phase === 'spawn' || phase === 'descent' || phase === 'hold') {
      // Following the builds: pace the descent to reach the final approach as the next one is due.
      if (phase === 'descent' && !timerMode && Number.isFinite(stageCues.buildDue)) {
        const left = toClock(stageCues.buildDue) + 0.2 - clock
        rate = Math.min(rate0 * 2.5, Math.max(rate0 * 0.4, (nStage - step) / Math.max(0.3, left)))
      }
      if (phase === 'descent') step = Math.min(nStage, step + rate * dt)
      if (phase === 'hold') step = Math.min(nArrive - (nArrive - nStage) * 0.6, step + rate * 0.12 * dt)
      if (commit && !timerMode && !early) final(clock + 0.3)
      else if (building) final(buildStart + CYCLE.final)
      else if (phase === 'descent' && step >= nStage) {
        if (timerMode) land()
        else go('hold')
      } else if (phase === 'hold' && clock - phaseAt > CYCLE.hold) {
        // The build never came (the scroll, or a long read): land on the timer from now on.
        timerMode = true
        final(clock + 1)
      }
    } else if (phase === 'final') {
      if (commit) fin.end = Math.min(fin.end, clock + 0.15)
      const t = Math.min(1, (clock - fin.at) / Math.max(1e-3, fin.end - fin.at))
      step = fin.from + (nArrive - fin.from) * (1 - (1 - t) ** 1.6)
      if (t >= 1) land()
    } else if (phase === 'land') {
      const t = clock - landAt
      if (t >= CYCLE.morphAt && morphT >= 1 && !lite() && phaseAt === landAt) {
        startMorph()
        phaseAt = -1
      }
      if (t >= CYCLE.land) go('rest')
    } else if (phase === 'rest') {
      const wait = lite() ? CYCLE.rest : timerMode ? Math.max(CYCLE.rest, CYCLE.morphAt + CYCLE.morph * 0.6) : CYCLE.morphAt + CYCLE.morph
      if (clock - landAt >= wait && planned(clock - landAt - wait)) startRun()
    }

    // The agent's position, and its trail (~70 positions over 2 s).
    const at = agentPos()
    const live = phase === 'spawn' || phase === 'descent' || phase === 'hold' || phase === 'final'
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
    if (live || phase === 'land') {
      const hn = Math.min(1, field(cur, at[0], at[1]) / B.relief)
      elevation += (hn - elevation) * (1 - Math.exp(-4 * dt))
    }
  }

  const trailMax = () => (lite() ? TRAIL.lite : stageCues.degrade >= 3 ? TRAIL.degraded : TRAIL.dots)

  function agentPos(): [number, number] {
    if (phase === 'wait' || phase === 'rest' || !nPath) return [L.x, L.z]
    const i = Math.min(nPath - 1, Math.floor(step))
    const j = Math.min(nPath - 1, i + 1)
    const t = step - i
    return [path[i * 2] + (path[j * 2] - path[i * 2]) * t, path[i * 2 + 1] + (path[j * 2 + 1] - path[i * 2 + 1]) * t]
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
      // A soft glow (~28 px radius) and the core (9 px).
      pushFx(at[0], at[1], 0, phone ? 46 : 60, 0.42 * a, 1, 1)
      pushFx(at[0], at[1], 0, phone ? 8 : 9.5, 0.8 * a, 1, 0.2)
    }
    if (phase !== 'land' || still) return
    const t = clock - landAt
    // The ring: out from the plateau's rim across the landscape and up its slopes, to 60% of the width (80% on
    // phones) in 1.6 s. It spreads from the global minimum itself, so it runs out both sides of the robot.
    const ring = ringAt(t)
    if (ring.a > 0.003) {
      const count = lite() ? RING.lite : stageCues.degrade >= 5 ? RING.degraded : RING.dots
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

  let lastDegrade = stageCues.degrade
  const beatNow = emptySample()
  const shown = { hazeV: -1, ridges: -1, plot: false }
  let wasLite = lite()
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
    if (stageCues.degrade !== lastDegrade || lite() !== wasLite) {
      const liteChanged = lite() !== wasLite
      lastDegrade = stageCues.degrade
      wasLite = lite()
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

    const since = (performance.now() - onAt) / 1000
    const grow = still ? 1 : smoothstep(LOAD.terrain[0], LOAD.terrain[1], since)
    const details = still ? 1 : smoothstep(LOAD.details[0], LOAD.details[1], since)
    // The horizon's glow pulses with the beat (+-18%) and shimmers a little between beats. Style writes only
    // when the value has moved visibly (an opacity change is composited, no layout or paint).
    beat.sample(performance.now(), beatNow)
    const pulse = still || lite() || !beatNow.on ? 0 : beatNow.pulse * 0.18 + 0.05 * Math.sin(time * 5.1)
    const hazeV = Math.min(1, details * (0.86 + pulse))
    if (Math.abs(hazeV - shown.hazeV) >= 0.025 || (hazeV >= 1) !== (shown.hazeV >= 1)) {
      shown.hazeV = hazeV
      haze.style.opacity = hazeV.toFixed(3)
    }
    if (Math.abs(details - shown.ridges) >= 0.05 || (details >= 1 && shown.ridges < 1)) ridgeSvg.style.opacity = String((shown.ridges = details))
    const plotOn = details > 0.01
    if (plotOn !== shown.plot) plot.el.toggleAttribute('data-on', (shown.plot = plotOn))
    if (grow <= 0) return

    // Pointer parallax (desktop): 11 px opposite the pointer at the stage's depth, more for nearer dots.
    // stage.ts eases --hero-px / --hero-py.
    const para = size === 'desktop' && !still && !lite()
    at.x = para ? parseFloat(host.style.getPropertyValue('--hero-px')) || 0 : 0
    at.y = para ? parseFloat(host.style.getPropertyValue('--hero-py')) || 0 : 0
    const px = -11 * at.x
    const py = -7 * at.y
    const breath = still ? 1 : 1 + 0.02 * Math.sin((time * Math.PI * 2) / 12)

    g.blendFunc(g.ONE, g.ONE)
    const tLand = phase === 'land' && !still ? clock - landAt : -1
    setShared(terrain, px, py, breath)
    const tu = terrain.u
    g.uniform1f(tu.uTime, still ? 0 : time)
    g.uniform2f(tu.uDepth, G.dN, G.dF)
    const phone = size === 'phone'
    const [sMin, sMax] = phone ? DOT.phone : DOT.wide
    g.uniform3f(tu.uSize, G.sizeK, sMin, sMax)
    g.uniform1f(tu.uRowK, G.rowK)
    // The reveal front: out from the stage to past the farthest corner.
    const reach = Math.hypot(B.bx * 2.6, B.bz) + 0.8
    g.uniform1f(tu.uReveal, grow * reach + (grow >= 1 ? 99 : 0))
    const glow = !lite() && stageCues.degrade < 4 && watchdog.level < 2 ? 1 : 0
    g.uniform2f(tu.uFx, !lite() && stageCues.degrade < 1 && !phone ? 1 : 0, glow)
    g.uniform1f(tu.uVibe, still || lite() || watchdog.level >= 2 ? 0 : 1)
    const flash = tLand >= 0 ? Math.sin(Math.PI * Math.min(1, tLand / 0.5)) : 0
    g.uniform4f(tu.uLand, L.x, L.z, flash, H * 0.9)
    const ring = ringAt(tLand)
    g.uniform3f(tu.uRing, ring.r, 0.14, ring.a > 0 ? Math.min(1, ring.a / RING.alpha + 0.25) : 0)
    g.bindBuffer(g.ARRAY_BUFFER, terrainBuf)
    g.enableVertexAttribArray(terrain.a.aPos)
    g.vertexAttribPointer(terrain.a.aPos, 2, g.FLOAT, false, 0, 0)
    if (!tune.noDraw) g.drawArrays(g.POINTS, 0, gridCount)
    g.disableVertexAttribArray(terrain.a.aPos)

    if (grow < 1 && !still) return
    buildFx(still)
    if (nFx) {
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

    // The left ruler's cursor follows the agent's elevation.
    plot.cursor(elevation, still ? 0.8 : 0.3 + 0.7 * agentA)
    if (import.meta.env.DEV && snapWaiter) {
      snapWaiter(canvas.toDataURL())
      snapWaiter = null
    }
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
    elevation = 0
    draw(0, true)
  }

  // ---- the loop

  let visible = true
  let disposed = false
  let raf = 0
  let last = 0
  let carry = 0
  const moving = () => !reduced.matches && visible && !document.hidden && backdrop() > 0.01
  /** CPU time per drawn frame (ms), for the performance check (the console, in development). */
  const cost = { sum: 0, n: 0, plan: 0 }

  /** Development only: GPU time of the layer's draws (EXT_disjoint_timer_query), when available. */
  // Opt in with ?gpu: polling the queries can stall the pipeline, so it is off even in development.
  const timer = import.meta.env.DEV && new URLSearchParams(location.search).has('gpu') ? gl.getExtension('EXT_disjoint_timer_query') : null
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
   * Its own frame-rate watchdog: the engine's governor (stageCues.degrade) does not run in low power, which is
   * every phone, so on phones and tablets this layer watches the page's frame rate itself (2 s windows, once the intro is over) and,
   * only ever downward, gives up: 1 a quarter of its dots, 2 the shimmer, twinkle and glow, 3 resolution, and
   * draws at 20 frames a second.
   */
  const watchdog = { sum: 0, n: 0, level: 0 }
  function watch(ms: number) {
    // Desktops have the engine's governor (stageCues.degrade); this is for phones and tablets.
    if (size === 'desktop' || watchdog.level >= 3 || (performance.now() - onAt) / 1000 < 6 || ms > 400) return
    watchdog.sum += ms
    watchdog.n++
    if (watchdog.sum < 2000) return
    const fps = (1000 * watchdog.n) / watchdog.sum
    watchdog.sum = watchdog.n = 0
    if (fps >= 26) return
    watchdog.level++
    layout()
  }
  /** Development only: skip the layer entirely (A/B frame-time checks). */
  let skip = false
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
    // Phones: ~30 frames a second is plenty for motion this slow (20 once the watchdog has stepped down).
    if ((size !== 'phone' && watchdog.level < 3) || carry >= (watchdog.level >= 3 ? 1 / 21 : 1 / 32)) {
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
    if (reduced.matches) {
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
  const mo = new MutationObserver(() => {
    if (host.hasAttribute('data-on') && onAt === Infinity) onAt = performance.now()
    wake()
  })
  mo.observe(host, { attributes: true, attributeFilter: ['data-on'] })
  document.addEventListener('visibilitychange', wake)
  reduced.addEventListener('change', wake)
  const onLost = (e: Event) => e.preventDefault()
  canvas.addEventListener('webglcontextlost', onLost)

  layout()
  setArrangement(lite() ? fixedArrangement() : arrangement(side))
  if (import.meta.env.DEV)
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
        state: () => ({ nFx, ring: ringAt(clock - landAt), phase, clock, step, nStage, nArrive, nPath, rate, timerMode, landAt, gridCount, C, B, G, L, W, H, detours: planner.detours, at: agentPos(), agentScreen: (() => { const [x, z] = agentPos(); return onScreen(cur, x, z) })() }),
      },
    })
  wake()

  return {
    resize() {
      // Coalesced to one rebuild per frame: phones fire resizes in bursts (the URL bar showing and hiding).
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        if (disposed) return
        layout()
        if (!raf) wake()
        if (reduced.matches) stillFrame()
      })
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(raf)
      cancelAnimationFrame(resizeRaf)
      io.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', wake)
      reduced.removeEventListener('change', wake)
      canvas.removeEventListener('webglcontextlost', onLost)
      gl.deleteBuffer(terrainBuf)
      gl.deleteBuffer(fxBuf)
      gl.deleteProgram(terrain.p)
      gl.deleteProgram(fx.p)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
      haze.remove()
      ridgeSvg.remove()
      plot.el.remove()
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
}

function build(gl: WebGLRenderingContext) {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (import.meta.env.DEV) console.warn('[terrain]', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }
  const link = (vs: string, fs: string, attrs: string[], uniforms: string[]): Program | null => {
    const v = compile(gl.VERTEX_SHADER, vs)
    const f = compile(gl.FRAGMENT_SHADER, fs)
    if (!v || !f) return null
    const p = gl.createProgram()!
    gl.attachShader(p, v)
    gl.attachShader(p, f)
    gl.linkProgram(p)
    gl.deleteShader(v)
    gl.deleteShader(f)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (import.meta.env.DEV) console.warn('[terrain]', gl.getProgramInfoLog(p))
      return null
    }
    const u: Program['u'] = {}
    for (const n of uniforms) u[n] = gl.getUniformLocation(p, n === 'uWell' || n === 'uHill' ? `${n}[0]` : n)
    const a: Program['a'] = {}
    for (const n of attrs) a[n] = gl.getAttribLocation(p, n)
    return { p, u, a, layout: -1, arr: -1 }
  }
  const shared = ['uWell', 'uHill', 'uBowl', 'uBowl2', 'uPlat', 'uCam', 'uScr', 'uShift', 'uHead', 'uBody', 'uClear', 'uDpr']
  const terrain = link(TERRAIN_VS, DOT_FS, ['aPos'], [...shared, 'uTime', 'uDepth', 'uSize', 'uRowK', 'uReveal', 'uFx', 'uVibe', 'uLand', 'uRing'])
  const fx = link(FX_VS, DOT_FS, ['aPos', 'aK', 'aSoft'], shared)
  return terrain && fx ? { terrain, fx } : null
}

// ---- the plot details: corner crosshairs, edge rulers, the elevation cursor

const SVG = 'http://www.w3.org/2000/svg'

function createPlot(parent: HTMLElement) {
  const el = document.createElementNS(SVG, 'svg')
  el.setAttribute('class', 'hero-plot')
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('focusable', 'false')
  parent.insertBefore(el, parent.querySelector('.hero-beam'))
  let cursorEl: SVGGElement | null = null
  let span = { top: 0, bottom: 1 }
  let shownY = -1
  let shownA = -1

  return {
    el,
    size(W: number, H: number, size: 'desktop' | 'tablet' | 'phone' | null) {
      el.setAttribute('viewBox', `0 0 ${W} ${H}`)
      el.setAttribute('width', String(W))
      el.setAttribute('height', String(H))
      // Below the header (Hud: a 44 px row with clamp(10px, 1.4vw, 20px) above and below).
      const header = 44 + 2 * Math.min(20, Math.max(10, W * 0.014))
      const inset = 28
      const top = header + 16
      const bottom = Math.min(H, window.innerHeight || H) - inset
      // Crosshairs: a 10 px "+" of dots, #A78BFA at 30%.
      const marks: string[] = []
      for (const [x, y] of [
        [inset, top],
        [W - inset, top],
        [inset, bottom],
        [W - inset, bottom],
      ]) {
        for (let k = -2; k <= 2; k++) {
          marks.push(`<circle cx="${x + k * 2.5}" cy="${y}" r="0.9"/>`)
          if (k) marks.push(`<circle cx="${x}" cy="${y + k * 2.5}" r="0.9"/>`)
        }
      }
      // Rulers: 6 px ticks every 24 px, every fifth 12 px, #A78BFA at 25%, fading toward the centre.
      let rulers = ''
      cursorEl = null
      if (size && size !== 'phone') {
        const y0 = top + 28
        const y1 = bottom - 28
        span = { top: y0, bottom: y1 }
        let dl = ''
        let dr = ''
        for (let i = 0, y = y0; y <= y1; i++, y += 24) {
          const len = i % 5 === 0 ? 12 : 6
          dl += `M${inset} ${y}h${len}`
          dr += `M${W - inset} ${y}h${-len}`
        }
        rulers = `
          <defs>
            <linearGradient id="hero-tick-l" gradientUnits="userSpaceOnUse" x1="${inset}" x2="${inset + 12}"><stop offset="0" stop-color="#A78BFA" stop-opacity="0.25"/><stop offset="1" stop-color="#A78BFA" stop-opacity="0.08"/></linearGradient>
            <linearGradient id="hero-tick-r" gradientUnits="userSpaceOnUse" x1="${W - inset}" x2="${W - inset - 12}"><stop offset="0" stop-color="#A78BFA" stop-opacity="0.25"/><stop offset="1" stop-color="#A78BFA" stop-opacity="0.08"/></linearGradient>
          </defs>
          <g opacity="${size === 'tablet' ? 0.8 : 1}">
            <path d="${dl}" stroke="url(#hero-tick-l)" stroke-width="1" fill="none"/>
            <path d="${dr}" stroke="url(#hero-tick-r)" stroke-width="1" fill="none"/>
            <g class="hero-plot__cursor"><path d="M${inset - 3} 0h17" stroke="#C4B5FD" stroke-opacity="0.6" stroke-width="1.5" stroke-linecap="round"/></g>
          </g>`
      }
      el.innerHTML = `${rulers}<g fill="#A78BFA" fill-opacity="0.3">${marks.join('')}</g>`
      cursorEl = el.querySelector('.hero-plot__cursor')
      shownY = shownA = -1
    },
    /** Elevation 0 (the basin) .. 1 (the ridges): high on the ruler for high ground. */
    cursor(elevation: number, alpha: number) {
      if (!cursorEl) return
      const y = span.bottom - (span.bottom - span.top) * (0.08 + 0.84 * elevation)
      if (Math.abs(y - shownY) > 0.2) {
        shownY = y
        cursorEl.setAttribute('transform', `translate(0 ${y.toFixed(1)})`)
      }
      if (Math.abs(alpha - shownA) > 0.02) {
        shownA = alpha
        cursorEl.setAttribute('opacity', alpha.toFixed(2))
      }
    },
  }
}
