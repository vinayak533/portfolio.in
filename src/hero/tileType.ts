/**
 * The hero's tile lettering (the name and the role): each letter on its own square tile of 5 x 5 modules, a
 * dark circle in every module and hairlines through their centres, the letter drawn over them as one module-wide
 * stroke with round ends and corners rounded to a module (the cut corners show the circle under them).
 *
 * It returns an SVG as a data URI, for an <img>: an image is a candidate for the page's largest paint, so the
 * name stays that paint (it must be there at the first paint, hero.css [data-intro=wait]). Pure strings, no DOM:
 * vite.config.ts (heroBoot) builds the pre-painted copy with it too.
 */
type Pt = [number, number]

/** Each letter's strokes, on the modules' centres (0 - 4, y down). */
const GLYPHS: Record<string, Pt[][]> = {
  A: [[[0, 4], [0, 0], [4, 0], [4, 4]], [[0, 2], [4, 2]]],
  E: [[[4, 0], [0, 0], [0, 4], [4, 4]], [[0, 2], [3, 2]]],
  G: [[[4, 0], [0, 0], [0, 4], [4, 4], [4, 2], [2, 2]]],
  I: [[[1, 0], [3, 0]], [[2, 0], [2, 4]], [[1, 4], [3, 4]]],
  K: [[[0, 0], [0, 4]], [[0, 2], [3, 2]], [[4, 0], [4, 1], [3, 2], [4, 3], [4, 4]]],
  L: [[[0, 0], [0, 4], [4, 4]]],
  M: [[[0, 4], [0, 0], [4, 0], [4, 4]], [[2, 0], [2, 3]]],
  N: [[[0, 4], [0, 0], [4, 0], [4, 4]]],
  R: [[[0, 4], [0, 0], [4, 0], [4, 2], [0, 2]], [[2, 2], [4, 4]]],
  V: [[[0, 0], [0, 2], [2, 4], [4, 2], [4, 0]]],
  Y: [[[0, 0], [0, 2], [4, 2], [4, 0]], [[2, 2], [2, 4]]],
  '/': [[[3, 0], [1, 4]]],
}

const TILE = 5
const GAP = 1
const SPACE = 3

const n = (v: number) => +v.toFixed(3)

/** A stroke's path: straight runs, each corner a curve of half a module (a module on the stroke's outside). */
function strokePath(pts: Pt[]): string {
  const p = pts.map(([x, y]) => [x + 0.5, y + 0.5] as Pt)
  let d = `M${n(p[0][0])} ${n(p[0][1])}`
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]]
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1])
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1])
    const r = Math.min(0.5, l1 / 2, l2 / 2)
    const s: Pt = [b[0] - ((b[0] - a[0]) / l1) * r, b[1] - ((b[1] - a[1]) / l1) * r]
    const e: Pt = [b[0] + ((c[0] - b[0]) / l2) * r, b[1] + ((c[1] - b[1]) / l2) * r]
    d += `L${n(s[0])} ${n(s[1])}Q${n(b[0])} ${n(b[1])} ${n(e[0])} ${n(e[1])}`
  }
  const z = p[p.length - 1]
  return d + `L${n(z[0])} ${n(z[1])}`
}

export type TileStyle = {
  /** The letters: one colour, or a top-to-bottom gradient. */
  ink: string | [string, string]
  /** The tile's ground, its hairlines and the circles' fill. */
  ground: string
  line: string
  well: string
  /** Rendered height in CSS px (the image's intrinsic size; CSS may scale it). */
  height: number
}

/** `text` (upper-cased; letters without a glyph are left out) as an SVG data URI and its aspect (w / h). */
export function tileText(text: string, style: TileStyle): { src: string; aspect: number } {
  const chars = [...text.toUpperCase()].filter((c) => c === ' ' || GLYPHS[c])
  const tiles: string[] = []
  const strokes: string[] = []
  let x = 0
  chars.forEach((c, i) => {
    if (c === ' ') {
      x += SPACE
      return
    }
    if (i > 0 && chars[i - 1] !== ' ') x += GAP
    tiles.push(`<use href="#t" x="${x}"/>`)
    for (const s of GLYPHS[c]) strokes.push(`<path transform="translate(${x})" d="${strokePath(s)}"/>`)
    x += TILE
  })
  const w = Math.max(x, 1)
  const ink = Array.isArray(style.ink) ? 'url(#g)' : style.ink
  const grad = Array.isArray(style.ink)
    ? `<linearGradient id="g" x1="0" y1="0" x2="0" y2="${TILE}" gradientUnits="userSpaceOnUse">` +
      `<stop offset=".2" stop-color="${style.ink[0]}"/><stop offset=".95" stop-color="${style.ink[1]}"/></linearGradient>`
    : ''
  let grid = ''
  for (let k = 0.5; k < TILE; k++) grid += `M0 ${k}H${TILE}M${k} 0V${TILE}`
  let wells = ''
  for (let r = 0.5; r < TILE; r++) for (let c = 0.5; c < TILE; c++) wells += `<circle cx="${c}" cy="${r}" r=".4"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${TILE}" width="${n((w / TILE) * style.height)}" height="${style.height}">` +
    `<defs>${grad}<g id="t"><rect width="${TILE}" height="${TILE}" fill="${style.ground}" stroke="${style.line}" stroke-width=".05"/>` +
    `<path d="${grid}" stroke="${style.line}" stroke-width=".03"/>` +
    `<g fill="${style.well}" stroke="${style.line}" stroke-width=".04">${wells}</g></g></defs>` +
    tiles.join('') +
    `<g fill="none" stroke="${ink}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${strokes.join('')}</g></svg>`
  const src = 'data:image/svg+xml,' + svg.replace(/"/g, "'").replace(/[<>#%]/g, encodeURIComponent)
  return { src, aspect: w / TILE }
}

/** The name's and the role's looks. */
export const NAME_STYLE: TileStyle = {
  ink: ['#f5f3ff', '#c4b5fd'],
  ground: 'rgba(124,92,255,0.14)',
  line: 'rgba(196,181,253,0.4)',
  well: '#07050f',
  height: 64,
}
export const ROLE_STYLE: TileStyle = {
  ink: '#ddd6fe',
  ground: 'rgba(124,92,255,0.06)',
  line: 'rgba(196,181,253,0.18)',
  well: '#07050f',
  height: 16,
}
