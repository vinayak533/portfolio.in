import codeShot from '../assets/screen/code.webp'
import { loadImage } from './maps'

/**
 * What the laptop shows: a code editor (src/assets/screen/code.webp). The
 * photograph has ~31 x 23 px of screen, which no zoom can rescue, so the shot
 * is drawn here into a 16:10 canvas and composited in perspective at full
 * device resolution by final.frag, sharp from the opening frame to the
 * deepest zoom. Layout is on a 1600 x 1000 design grid.
 */

export const DESIGN: [number, number] = [1600, 1000]

export interface ScreenArt {
  canvas: HTMLCanvasElement
  /** Text caret, as a uv rect (x, y, w, h) of the art; final.frag blinks it. Null when the art has none. */
  caret: [number, number, number, number] | null
}

export async function buildScreenArt(width: number): Promise<ScreenArt> {
  const img = await loadImage(codeShot)

  // No point drawing far past the shot's own resolution: the GPU upsamples just as well, for less memory.
  const W = Math.round(Math.min(width, Math.max(2048, img.naturalWidth * 1.5)))
  const H = Math.round((W * DESIGN[1]) / DESIGN[0])
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#07070d'
  ctx.fillRect(0, 0, W, H)

  // Cover fit, centred: crop the long side, never stretch.
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  const dw = img.naturalWidth * k
  const dh = img.naturalHeight * k
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)

  return { canvas, caret: null }
}
