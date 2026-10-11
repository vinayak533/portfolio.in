import { useEffect, useId, useState } from 'react'
import { useStore } from '../../store/useStore'
import { EYE_COLOR, TEAR_COLOR, faceShapes, type FaceShape, type Mood } from '../../hero/robot/face'

export type { Mood }

/**
 * The assistant's face: the hero robot's head (src/hero/robot), drawn flat. A
 * warm grey shell over a black knit cap, ear knobs, a rainbow bezel around a
 * black glass screen, and the robot's glowing eyes on it.
 *
 * `mood` picks the expression (shared with the 3D head, src/hero/robot/face.ts).
 * A change plays a quick blink (the eyes close, swap shape, reopen) and a small
 * head tilt. `live` adds idle life: blinking, glancing around and a slow float.
 * All motion is CSS (chat.css) and is off with prefers-reduced-motion, where
 * moods simply switch.
 */
export function Robot({ mood = 'neutral', live = false, className }: { mood?: Mood; live?: boolean; className?: string }) {
  const reduced = useStore((s) => s.reducedMotion)
  const [shown, setShown] = useState(mood)
  const [beat, setBeat] = useState(0)

  // Swap the face halfway through the blink, so the change happens with the eyes shut.
  useEffect(() => {
    if (mood === shown) return
    if (reduced) {
      setShown(mood)
      return
    }
    setBeat((b) => b + 1)
    const t = window.setTimeout(() => setShown(mood), 110)
    return () => window.clearTimeout(t)
  }, [mood, shown, reduced])

  const uid = useId().replace(/:/g, '')
  const id = (n: string) => `${uid}-${n}`
  const url = (n: string) => `url(#${id(n)})`

  return (
    <svg className={`robot${className ? ` ${className}` : ''}`} viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true" focusable="false" data-mood={shown} data-live={live || undefined}>
      <defs>
        <radialGradient id={id('shell')} cx="0.36" cy="0.26" r="0.92">
          <stop offset="0" stopColor="#ebe6df" />
          <stop offset="0.5" stopColor="#cdc7be" />
          <stop offset="0.85" stopColor="#a8a197" />
          <stop offset="1" stopColor="#867f75" />
        </radialGradient>
        <linearGradient id={id('ear')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#dad4cc" />
          <stop offset="1" stopColor="#968f85" />
        </linearGradient>
        <radialGradient id={id('screen')} cx="0.4" cy="0.25" r="0.9">
          <stop offset="0" stopColor="#15151c" />
          <stop offset="0.6" stopColor="#060609" />
          <stop offset="1" stopColor="#020203" />
        </radialGradient>
        <clipPath id={id('bezel')}>
          <path d={BEZEL} clipRule="evenodd" fillRule="evenodd" />
        </clipPath>
        <clipPath id={id('face')}>
          <rect {...SCREEN} />
        </clipPath>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={id('soft')} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
      </defs>

      <g className="robot-float">
        <g className={beat ? 'robot-react' : undefined} key={`r${beat}`}>
          {shown === 'angel' && <ellipse className="robot-halo" cx="32" cy="7.4" rx="12" ry="2.8" fill="none" stroke="#f7e6b0" strokeWidth="2.2" />}

          {/* Ear knobs. */}
          <rect x="1.6" y="28" width="6" height="12" rx="2.6" fill={url('ear')} />
          <rect x="56.4" y="28" width="6" height="12" rx="2.6" fill={url('ear')} />
          <rect x="0.4" y="30.2" width="2.6" height="7.6" rx="1.3" fill={url('ear')} />
          <rect x="61" y="30.2" width="2.6" height="7.6" rx="1.3" fill={url('ear')} />

          {/* The knit cap peeking out behind the shell, then the shell. */}
          <rect x="6" y="11.2" width="52" height="44.2" rx="9" fill="#141417" />
          <rect x="6.8" y="12.4" width="50.4" height="43.2" rx="8.2" fill={url('shell')} />
          <rect x="6.8" y="12.4" width="50.4" height="43.2" rx="8.2" fill="none" stroke="#000" strokeOpacity="0.14" strokeWidth="0.6" />

          {/* Rainbow bezel: a colour wheel, softened, seen through the ring. */}
          <g className="robot-led" clipPath={url('bezel')}>
            <g filter={url('soft')}>
              {WEDGES.map(([d, fill]) => (
                <path key={d} d={d} fill={fill} />
              ))}
            </g>
          </g>
          {/* Grey inner frame, then the black glass. */}
          <rect x={32 - 16.55} y={34.5 - 13.45} width="33.1" height="26.9" rx="6" fill="#bfb8af" />
          <rect {...SCREEN} fill={url('screen')} />

          <g clipPath={url('face')}>
            <g className="robot-look">
              <g className="robot-blink">
                <g className={beat ? 'robot-swap' : undefined} key={`s${beat}`} filter={url('glow')}>
                  <g transform={FACE_TRANSFORM}>{shapes(shown)}</g>
                </g>
              </g>
            </g>
            <path d="M19.4 25.4c3.4-2.2 8.2-3 12.6-2.7" fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="1.3" strokeLinecap="round" />
          </g>

          {shown === 'sleepy' && (
            <g className="robot-zzz" fill="#cfe9ff" fontFamily="system-ui, sans-serif" fontWeight="700">
              <text x="10" y="12" fontSize="7">z</text>
              <text x="5" y="6.5" fontSize="5">z</text>
            </g>
          )}
        </g>
      </g>
    </svg>
  )
}

/** The head is drawn at 48 units per model unit, centred on (32, 34); the screen's centre is (32, 34.5). */
const SCREEN = { x: 32 - 14.65, y: 34.5 - 11.75, width: 29.3, height: 23.5, rx: 4.3 }
/** Face space (face.ts) onto the screen. */
const FACE_K = 29.3 / 43.8
const FACE_TRANSFORM = `translate(32 34.5) scale(${FACE_K.toFixed(4)}) translate(-32 -34.6)`

function roundedRect(cx: number, cy: number, w: number, h: number, r: number) {
  const x = cx - w / 2
  const y = cy - h / 2
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
}
const BEZEL = `${roundedRect(32, 34.5, 41.3, 34.6, 9.6)}${roundedRect(32, 34.5, 32.6, 26.4, 5.8)}`

/** The 3D bezel's colour sweep (model.ts), as wedges around the screen's centre: 0 = right, clockwise. */
const STOPS: [number, string][] = [
  [0, '#ff5a2c'],
  [0.09, '#ff8a1e'],
  [0.24, '#ffd422'],
  [0.37, '#b9e83c'],
  [0.5, '#35e39a'],
  [0.6, '#27d6ff'],
  [0.72, '#3d7bff'],
  [0.84, '#7a4dff'],
  [0.93, '#e8376f'],
  [1, '#ff5a2c'],
]
function sweep(t: number) {
  let k = 0
  while (k < STOPS.length - 2 && STOPS[k + 1][0] < t) k++
  const [t0, c0] = STOPS[k]
  const [t1, c1] = STOPS[k + 1]
  const f = (t - t0) / (t1 - t0 || 1)
  const a = parseInt(c0.slice(1), 16)
  const b = parseInt(c1.slice(1), 16)
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}
const WEDGES: [string, string][] = Array.from({ length: 36 }, (_, i) => {
  const a0 = ((i - 0.6) / 36) * Math.PI * 2
  const a1 = ((i + 1.6) / 36) * Math.PI * 2
  const R = 30
  const p = (a: number) => `${(32 + Math.cos(a) * R).toFixed(2)} ${(34.5 + Math.sin(a) * R).toFixed(2)}`
  return [`M32 34.5L${p(a0)}L${p(a1)}Z`, sweep((i + 0.5) / 36)]
})

function shapes(mood: Mood) {
  return faceShapes(mood).map((s, i) => <Shape key={`${mood}${i}`} s={s} />)
}

function Shape({ s }: { s: FaceShape }) {
  const tear = s.kind === 'path' && s.tear !== undefined
  const color = tear ? TEAR_COLOR : EYE_COLOR
  const paint =
    s.style === 'fill'
      ? { fill: color, stroke: 'none' }
      : { fill: 'none', stroke: color, strokeWidth: s.width ?? 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (s.kind === 'circle') return <circle cx={s.cx} cy={s.cy} r={s.r} {...paint} />
  if (s.kind === 'ellipse') return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...paint} />
  return <path className={tear ? `robot-tear${s.tear ? ' robot-tear--late' : ''}` : undefined} d={s.d} {...paint} />
}
