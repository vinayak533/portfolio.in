/**
 * The robot's expressions, defined once and drawn two ways: as SVG by the chat
 * avatars (src/dom/chat/Robot.tsx) and onto the 3D head's screen as a canvas
 * texture (model.ts), so the floating launcher, the hero robot and every
 * avatar in the chat panel wear exactly the same faces.
 *
 * Shapes are in "face space": the 64-unit square the chat robot was first
 * drawn in, where the screen spans about x 10..54, y 17..52 and the eyes sit
 * at x 24.5 / 39.5, y 34.6. Neutral is the hero robot's own look: two small
 * round glowing eyes.
 */

export type Mood = 'neutral' | 'happy' | 'wink' | 'surprised' | 'sleepy' | 'sad' | 'angel' | 'thinking'

export type FaceShape =
  | { kind: 'path'; d: string; style: 'fill' | 'line'; width?: number; tear?: 0 | 1 }
  | { kind: 'circle'; cx: number; cy: number; r: number; style: 'fill' | 'line'; width?: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; style: 'fill' | 'line'; width?: number }

/** The screen in face space (the canvas texture covers exactly this box). */
export const FACE_BOX = { x: 10.1, y: 17, w: 43.8, h: 35.2 }

export const EYE_COLOR = '#f6f8ff'
export const EYE_GLOW = '#c4b5fd'
export const TEAR_COLOR = '#9fdcff'

const CRESCENT_L = 'M19.4 37.8C19.4 29.4 29.6 29.4 29.6 37.8C27.6 35.4 21.4 35.4 19.4 37.8Z'
const CRESCENT_R = 'M34.4 37.8C34.4 29.4 44.6 29.4 44.6 37.8C42.6 35.4 36.4 35.4 34.4 37.8Z'

/** Eye (and mouth) shapes per mood. */
export function faceShapes(mood: Mood): FaceShape[] {
  switch (mood) {
    case 'happy':
      // Filled crescents, as when smiling (laughing) with the eyes.
      return [
        { kind: 'path', d: CRESCENT_L, style: 'fill' },
        { kind: 'path', d: CRESCENT_R, style: 'fill' },
      ]
    case 'wink':
      return [
        { kind: 'path', d: CRESCENT_L, style: 'fill' },
        { kind: 'path', d: 'M35.4 35.8Q39.5 31.4 43.6 35.8', style: 'line', width: 2.4 },
      ]
    case 'surprised':
      return [
        { kind: 'circle', cx: 24.5, cy: 33.4, r: 4.8, style: 'fill' },
        { kind: 'circle', cx: 39.5, cy: 33.4, r: 4.8, style: 'fill' },
        { kind: 'ellipse', cx: 32, cy: 44.2, rx: 1.7, ry: 2.3, style: 'line', width: 1.5 },
      ]
    case 'sleepy':
      // Shut, peaceful: two low curves.
      return [
        { kind: 'path', d: 'M20.4 35.2Q24.5 38.8 28.6 35.2', style: 'line', width: 2 },
        { kind: 'path', d: 'M35.4 35.2Q39.5 38.8 43.6 35.2', style: 'line', width: 2 },
      ]
    case 'sad':
      // Crying: drooping eyes and two falling tears.
      return [
        { kind: 'path', d: 'M19 33.4L28.9 30.3Q30.5 29.9 30.4 31.8Q30.1 38 28 42.3Q27.3 43.7 26.5 42.3Q25.5 40.5 23.4 39.9Q19.5 38.9 18.9 35.6Q18.7 34.1 19 33.4Z', style: 'fill' },
        { kind: 'path', d: 'M45 33.4L35.1 30.3Q33.5 29.9 33.6 31.8Q33.9 38 36 42.3Q36.7 43.7 37.5 42.3Q38.5 40.5 40.6 39.9Q44.5 38.9 45.1 35.6Q45.3 34.1 45 33.4Z', style: 'fill' },
        { kind: 'path', d: 'M27.2 44.6q1.1 1.7 0 2.5q-1.1-.8 0-2.5Z', style: 'fill', tear: 0 },
        { kind: 'path', d: 'M36.8 44.6q1.1 1.7 0 2.5q-1.1-.8 0-2.5Z', style: 'fill', tear: 1 },
      ]
    case 'angel':
      return [
        { kind: 'path', d: 'M20.4 36.2Q24.5 31.4 28.6 36.2', style: 'line', width: 2.4 },
        { kind: 'path', d: 'M35.4 36.2Q39.5 31.4 43.6 36.2', style: 'line', width: 2.4 },
        { kind: 'path', d: 'M28.6 42.2Q32 45.2 35.4 42.2', style: 'line', width: 1.8 },
      ]
    case 'thinking':
      // Looking up and to the side.
      return [
        { kind: 'circle', cx: 26, cy: 32.4, r: 3.3, style: 'fill' },
        { kind: 'circle', cx: 41, cy: 32.4, r: 3.3, style: 'fill' },
      ]
    default:
      return [
        { kind: 'circle', cx: 24.5, cy: 34.6, r: 3.5, style: 'fill' },
        { kind: 'circle', cx: 39.5, cy: 34.6, r: 3.5, style: 'fill' },
      ]
  }
}

/** Tear fall, as the chat CSS had it: 1.5 s loop, the second tear 0.6 s late. */
export function tearAt(time: number, late: number) {
  const t = (((time - late * 0.6) % 1.5) + 1.5) % 1.5 / 1.5
  const opacity = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8
  return { opacity: Math.max(0, opacity), dy: -1 + 7 * t * t }
}

/**
 * Draws a mood onto a canvas whose full area is the screen (FACE_BOX), with
 * a transparent background: the head's black glass shows through.
 * `time` (s) animates the tears.
 */
export function drawFace(ctx: CanvasRenderingContext2D, mood: Mood, time = 0) {
  const { width, height } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const k = width / FACE_BOX.w
  ctx.setTransform(k, 0, 0, k, -FACE_BOX.x * k, -FACE_BOX.y * k)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Two passes: a soft bloom, then the crisp shape.
  for (const pass of [0, 1]) {
    for (const s of faceShapes(mood)) {
      let alpha = 1
      ctx.save()
      if (s.kind === 'path' && s.tear !== undefined) {
        const t = tearAt(time, s.tear)
        alpha = t.opacity
        ctx.translate(0, t.dy)
      }
      const color = s.kind === 'path' && s.tear !== undefined ? TEAR_COLOR : EYE_COLOR
      ctx.globalAlpha = alpha * (pass ? 1 : 0.85)
      ctx.fillStyle = ctx.strokeStyle = color
      ctx.shadowColor = pass ? 'transparent' : EYE_GLOW
      ctx.shadowBlur = pass ? 0 : 2.6 * k
      ctx.lineWidth = s.width ?? 2
      const path = new Path2D()
      if (s.kind === 'path') path.addPath(new Path2D(s.d))
      else if (s.kind === 'circle') path.arc(s.cx, s.cy, s.r, 0, Math.PI * 2)
      else path.ellipse(s.cx, s.cy, s.rx, s.ry, 0, 0, Math.PI * 2)
      if (s.style === 'fill') ctx.fill(path)
      else ctx.stroke(path)
      ctx.restore()
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

/** True for moods whose face moves on its own (the texture is redrawn every frame). */
export const animatedFace = (mood: Mood) => mood === 'sad'
