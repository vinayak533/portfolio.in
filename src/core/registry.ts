/**
 * Where each exhibit currently sits on screen, so the case-study overlay can
 * grow out of it (shared-element transition). Filled by the WebGL gallery.
 */
export const exhibitRects: (() => DOMRect | null)[] = []

/**
 * Experience card shatter. The DOM owns the text and the timing; the WebGL
 * side turns each card into crystal shards when its explosion begins.
 */
export const shatter = {
  /** Section progress (experience) at which card i starts to explode. */
  start: [] as number[],
  /** Section progress at which it is fully dispersed. */
  end: [] as number[],
  /** Glyph sample points of card i in CSS px, [x, y, ...], and their spacing. */
  sample: [] as (() => { points: Float32Array; spacing: number })[],
  /** Bumped when layout changes so shards are re-sampled. */
  version: 0,
}
