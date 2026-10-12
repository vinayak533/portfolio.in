/**
 * The robot's dot language, as small shader materials (model.ts):
 *
 *   face    a dot-matrix LED display behind the visor glass. The expression is
 *           drawn once per mood onto a small mask canvas (the chat avatars'
 *           shapes, face.ts); the shader samples it at each LED's centre, so
 *           the eyes are always made of whole dots. Gaze shifts the sampling by
 *           up to two cells, and a blink squashes it onto one row.
 *   vents   perforated grilles backlit violet (the chest core, the shoulder
 *           vents, the dorsal spine): a breath and a beat pulse brighten them
 *   dais    a flat disc of concentric dot rings the robot sits on; the foot's
 *           tap ripples it and the keyboard's light shimmers on it
 *
 * Colours are written as sRGB straight to the framebuffer (no tone mapping),
 * so the LEDs read exactly as the palette's #C4B5FD.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  LinearFilter,
  NormalBlending,
  ShaderMaterial,
  Vector2,
  type Texture,
} from 'three'
import { faceShapes, tearAt, type FaceShape, type Mood } from './face'

/** The face's moods: the shared ones (face.ts), and the hero's own joy (two upward arcs, ^ ^). */
export type FaceMood = Mood | 'joy'

const srgb = (hex: string) => {
  const c = new Color()
  c.setHex(parseInt(hex.slice(1), 16), 'srgb-linear')
  return c
}

// ---- face

/** LEDs across and down the face. Odd, so the middle column and row are centred. */
export const FACE_GRID = { cols: 19, rows: 11 }
/** One cell, in face space (face.ts: the chat robot's 64-unit square). The grid's centre is (32, 35). */
const CELL = 2.5
const CENTER = { x: 32, y: 35 }
/** Mask margin around the grid (cells): gaze shifts sample outside it. */
const MARGIN = 3
/** Mask pixels per face unit. */
const RES = 6

/** The hero robot's own resting eyes: two tall pills of dots, four cells either side of centre. */
const NEUTRAL: FaceShape[] = [-10, 10].map((dx) => ({
  kind: 'path' as const,
  d: pill(CENTER.x + dx, CENTER.y, 7.5, 11.5, 3.75),
  style: 'fill' as const,
}))

/** Joy: the eyes curve into upward arcs (the beat's happy moment, perform.ts). */
const JOY: FaceShape[] = [-10, 10].map((dx) => ({
  kind: 'path' as const,
  d: `M${CENTER.x + dx - 4.6} ${CENTER.y + 1.8}Q${CENTER.x + dx} ${CENTER.y - 4.4} ${CENTER.x + dx + 4.6} ${CENTER.y + 1.8}`,
  style: 'line' as const,
  width: 2.3,
}))

function pill(cx: number, cy: number, w: number, h: number, r: number) {
  const x = cx - w / 2
  const y = cy - h / 2
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
}

export interface DotFace {
  material: ShaderMaterial
  /** Redraws the mask for a mood (`time` animates the tears). */
  paint(mood: FaceMood, time?: number): void
  /** Gaze offset in cells, the lid (1 open .. ~0 shut) and a focused narrowing (0..1: the top rows dim). */
  set(offsetX: number, offsetY: number, lid: number, narrow?: number): void
  texture: Texture
}

export function createDotFace(): DotFace {
  const W = FACE_GRID.cols + MARGIN * 2
  const H = FACE_GRID.rows + MARGIN * 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * CELL * RES)
  canvas.height = Math.round(H * CELL * RES)
  const ctx = canvas.getContext('2d')!
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping
  texture.minFilter = texture.magFilter = LinearFilter
  texture.generateMipmaps = false

  // Face space -> mask pixels: the grid's top-left corner, less the margin, at the origin.
  const ox = CENTER.x - (FACE_GRID.cols / 2 + MARGIN) * CELL
  const oy = CENTER.y - (FACE_GRID.rows / 2 + MARGIN) * CELL

  function paint(mood: FaceMood, time = 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(RES, 0, 0, RES, -ox * RES, -oy * RES)
    // The chat faces are drawn smaller (their eyes 15 units apart): scaled up about the grid's
    // centre, so their eyes land about four cells either side of it, like the resting pills.
    if (mood !== 'neutral' && mood !== 'joy') {
      ctx.translate(CENTER.x, CENTER.y)
      ctx.scale(1.25, 1.25)
      ctx.translate(-CENTER.x, -34.6)
    }
    ctx.fillStyle = ctx.strokeStyle = '#fff'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const s of mood === 'neutral' ? NEUTRAL : mood === 'joy' ? JOY : faceShapes(mood)) {
      ctx.save()
      if (s.kind === 'path' && s.tear !== undefined) {
        const t = tearAt(time, s.tear)
        ctx.globalAlpha = t.opacity
        ctx.translate(0, t.dy)
      }
      // Lines a touch heavier than the avatars': a 2-unit stroke is under one LED.
      ctx.lineWidth = Math.max(2.6, (s.width ?? 2) * 1.3)
      const path = new Path2D()
      if (s.kind === 'path') path.addPath(new Path2D(s.d))
      else if (s.kind === 'circle') path.arc(s.cx, s.cy, s.r, 0, Math.PI * 2)
      else path.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2)
      if (s.style === 'fill') ctx.fill(path)
      else ctx.stroke(path)
      ctx.restore()
    }
    texture.needsUpdate = true
  }

  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    toneMapped: false,
    uniforms: {
      uMask: { value: texture },
      uGrid: { value: new Vector2(FACE_GRID.cols, FACE_GRID.rows) },
      uMargin: { value: MARGIN },
      uOffset: { value: new Vector2() },
      uLid: { value: 1 },
      uNarrow: { value: 0 },
      uColor: { value: srgb('#c4b5fd') },
      uDim: { value: 0.06 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMask;
      uniform vec2 uGrid;
      uniform float uMargin;
      uniform vec2 uOffset;
      uniform float uLid;
      uniform float uNarrow;
      uniform vec3 uColor;
      uniform float uDim;
      varying vec2 vUv;

      float sampleMask(vec2 c) {
        // c: grid space (cells, y up). The mask has y down and a margin all round.
        vec2 m = vec2(c.x + uMargin, uGrid.y - c.y + uMargin) / (uGrid + 2.0 * uMargin);
        return texture2D(uMask, vec2(m.x, 1.0 - m.y)).a;
      }

      // How lit one LED is: its centre, squashed toward the middle row by the lid, less the gaze.
      float lit(vec2 cell) {
        if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) return 0.0;
        vec2 c = cell + 0.5;
        float mid = uGrid.y * 0.5;
        c.y = mid + (c.y - mid) / max(uLid, 0.03);
        c -= uOffset;
        float m = sampleMask(c) * 0.4;
        m += sampleMask(c + vec2(0.22, 0.0)) * 0.15;
        m += sampleMask(c - vec2(0.22, 0.0)) * 0.15;
        m += sampleMask(c + vec2(0.0, 0.22)) * 0.15;
        m += sampleMask(c - vec2(0.0, 0.22)) * 0.15;
        // Focused: the eyes' top rows dim, as if narrowed (0 leaves the face as drawn).
        float top = smoothstep(mid + 0.4, mid + 1.6, c.y);
        return smoothstep(0.32, 0.68, m) * (1.0 - uNarrow * 0.8 * top);
      }

      void main() {
        vec2 p = vUv * uGrid;
        vec2 cell = floor(p);
        vec2 f = p - cell - 0.5;
        float d = length(f);
        float aa = fwidth(d) * 0.9 + 1e-4;
        float L = lit(cell);
        float disc = 1.0 - smoothstep(0.33 - aa, 0.33 + aa, d);
        // A soft glow from each lit LED onto its neighbours' gaps.
        float glow = 0.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 n = cell + vec2(float(i), float(j));
            vec2 dv = p - (n + 0.5);
            glow += lit(n) * exp(-dot(dv, dv) * 3.2);
          }
        }
        float a = disc * mix(uDim, 1.0, L) + glow * 0.22 * (1.0 - disc * L);
        // The hottest LED cores lean toward white, never past the palette's lilac at the edge.
        vec3 col = mix(uColor, vec3(0.96, 0.95, 1.0), disc * L * smoothstep(0.2, 0.0, d) * 0.55);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
  })

  return {
    material,
    paint,
    texture,
    set(x, y, lid, narrow = 0) {
      material.uniforms.uOffset.value.set(x, y)
      material.uniforms.uLid.value = lid
      material.uniforms.uNarrow.value = narrow
    },
  }
}

// ---- vents

export interface VentOptions {
  cols: number
  rows: number
  /** The field's outline: a rounded rect or a circle. */
  shape: 'rect' | 'circle'
  /** Overall brightness (the small vents are dimmer). */
  dim?: number
}

/**
 * A perforated dot grille over a violet core (the chest core, the shoulder
 * vents, the dorsal spine): graphite between the holes, the holes lit from
 * behind. `uBreath` (about 0.85..1.15, a 6 s breath) and `uPulse` (the beat,
 * 0..1) brighten it together. Written with three's own chunks, so the engine's
 * dissolve patches it like the rest of the body.
 */
export function createVent(o: VentOptions): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uBreath: { value: 1 },
      uPulse: { value: 0 },
      uGrid: { value: new Vector2(o.cols, o.rows) },
      uCircle: { value: o.shape === 'circle' ? 1 : 0 },
      uDim: { value: o.dim ?? 1 },
      uHole: { value: srgb('#1a1726') },
      uLight: { value: srgb('#7c5cff') },
      uHot: { value: srgb('#c4b5fd') },
    },
    vertexShader: /* glsl */ `
      #include <common>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        #include <begin_vertex>
        #include <project_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform float uTime;
      uniform float uBreath;
      uniform float uPulse;
      uniform vec2 uGrid;
      uniform float uCircle;
      uniform float uDim;
      uniform vec3 uHole;
      uniform vec3 uLight;
      uniform vec3 uHot;
      varying vec2 vUv;
      void main() {
        #include <clipping_planes_fragment>
        vec2 p = vUv * uGrid;
        vec2 cell = floor(p);
        vec2 f = p - cell - 0.5;
        vec2 cc = (cell + 0.5) / uGrid * 2.0 - 1.0;
        // The field: the cells inside a circle, or all but the rounded-off corners.
        float inField = uCircle > 0.5 ? step(length(cc), 0.95) : step(pow(pow(abs(cc.x), 4.0) + pow(abs(cc.y), 4.0), 0.25), 1.02);
        float d = length(f);
        float aa = fwidth(d) + 1e-4;
        float hole = inField * (1.0 - smoothstep(0.31 - aa, 0.31 + aa, d));
        // The core behind: hotter in the middle, a slow wave across it, brighter on the beat.
        float r = length(cc);
        float w = 0.5 + 0.5 * sin(6.2832 * (uTime / 6.0) - (cc.x * 0.8 + cc.y * 0.5) * 2.2);
        float heat = (0.55 + 0.45 * (1.0 - r * 0.7)) * uBreath * (1.0 + 0.5 * uPulse) * uDim;
        vec3 lightCol = mix(uLight, uHot, clamp(0.25 * w + 0.45 * uPulse + 0.2 * (1.0 - r), 0.0, 1.0)) * (0.9 + 0.7 * heat);
        float lightA = hole * (1.0 - smoothstep(0.06, 0.3, d) * 0.35);
        vec3 col = mix(uHole, lightCol, lightA * clamp(heat, 0.0, 1.4));
        // A graphite grille: solid between the holes.
        gl_FragColor = vec4(col, 1.0);
      }`,
  })
}

// ---- dais

/** The stage's radius (world units): rings of dots, wide enough for the chair and the whole desk. */
export const DAIS_R = 1.7

/** Concentric rings of dots: the first at R0, then every DR out to the rim. */
const R0 = 0.15
const DR = 0.08

export function createDais(): ShaderMaterial {
  const rings = Math.floor((DAIS_R * 0.98 - R0) / DR)
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uColor: { value: srgb('#a78bfa') },
      uHot: { value: srgb('#c4b5fd') },
      uFade: { value: 1 },
      uR: { value: DAIS_R },
      // The beat (0..1) on the dots.
      uPulse: { value: 0 },
      // The inflow vortex's swallow light on the outer ring (terrain.ts): its angle (disc frame) and gain (0 off).
      uArc: { value: 0 },
      uArcGain: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        vP = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uHot;
      uniform float uFade;
      uniform float uR;
      uniform float uPulse;
      uniform float uArc;
      uniform float uArcGain;
      varying vec2 vP;
      const float R0 = ${R0.toFixed(3)};
      const float DR = ${DR.toFixed(3)};
      const float LAST = ${rings.toFixed(1)};
      const float GAP = 0.058;
      void main() {
        float r = length(vP);
        float k = floor((r - R0) / DR + 0.5);
        float a = 0.0;
        if (k >= 0.0 && k <= LAST) {
          float rk = R0 + k * DR;
          float n = floor(6.2832 * rk / GAP);
          float th = atan(vP.y, vP.x);
          float ti = floor(th / 6.2832 * n + 0.5);
          float tc = ti / n * 6.2832;
          vec2 c = rk * vec2(cos(tc), sin(tc));
          float d = length(vP - c);
          float size = mix(0.012, 0.009, k / LAST);
          float aa = fwidth(d) + 1e-5;
          float dotA = 1.0 - smoothstep(size - aa, size + aa, d);
          // Under 30% at the centre, 16% at the rim (the outer ring a touch brighter, as an edge).
          float op = mix(0.27, 0.15, k / LAST) + (k == LAST ? 0.06 : 0.0);
          op *= 1.0 + 0.1 * uPulse;
          // The swallow light: a soft ~70 degree arc on the outer ring, turning with the vortex's arms.
          if (k == LAST && uArcGain > 0.0) {
            float da = atan(sin(th - uArc), cos(th - uArc));
            op *= 1.0 + uArcGain * exp(-da * da / ${(2 * (70 * Math.PI / 180 / 2.355) ** 2).toFixed(4)});
          }
          a = dotA * op + exp(-d * d / (size * size * 9.0)) * op * 0.25;
        }
        // A soft violet glow lifting off the disc's surface.
        a += 0.045 * (1.0 - smoothstep(0.0, uR, r));
        a *= uFade * (1.0 - smoothstep(uR * 0.92, uR * 1.02, r));
        // Additive (source alpha, one): the colour is weighted by a once, here.
        gl_FragColor = vec4(uColor, a);
      }`,
  })
}
