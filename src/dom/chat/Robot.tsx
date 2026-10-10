import { useEffect, useId, useState, type ReactNode } from 'react'
import { useStore } from '../../store/useStore'

export type Mood = 'neutral' | 'happy' | 'wink' | 'surprised' | 'sleepy' | 'sad' | 'angel' | 'thinking'

const EYE = '#62e6ff'

/**
 * The assistant's face: a white helmet head with a dark screen, glowing cyan
 * LED eyes, ear pods with teal light strips and a teal antenna slit.
 *
 * `mood` picks the expression. A change plays a quick blink (the eyes close,
 * swap shape, reopen) and a small head tilt. `live` adds idle life: blinking,
 * glancing around and a slow float. All motion is CSS (chat.css) and is off
 * with prefers-reduced-motion, where moods simply switch.
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
        <radialGradient id={id('shell')} cx="0.34" cy="0.24" r="0.9">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#eef0f4" />
          <stop offset="0.85" stopColor="#c9ced8" />
          <stop offset="1" stopColor="#9aa1ae" />
        </radialGradient>
        <radialGradient id={id('screen')} cx="0.45" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#1a3560" />
          <stop offset="0.55" stopColor="#0d1d3b" />
          <stop offset="1" stopColor="#060d1d" />
        </radialGradient>
        <linearGradient id={id('pod')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a414b" />
          <stop offset="1" stopColor="#1b1f25" />
        </linearGradient>
        <clipPath id={id('face')}>
          <path d={SCREEN} />
        </clipPath>
        <pattern id={id('grid')} width="1.25" height="1.25" patternUnits="userSpaceOnUse">
          <path d="M0 0H1.25M0 0V1.25" stroke="#04101f" strokeWidth="0.32" />
        </pattern>
        <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="robot-float">
        <g className={beat ? 'robot-react' : undefined} key={`r${beat}`}>
          {shown === 'angel' && <ellipse className="robot-halo" cx="32" cy="7.6" rx="12.5" ry="2.9" fill="none" stroke="#f7e6b0" strokeWidth="2.2" />}

          {/* Ear pods with their light strips, then the antenna slit. */}
          <rect x="2.6" y="27" width="7" height="16" rx="3.2" fill={url('pod')} />
          <rect x="54.4" y="27" width="7" height="16" rx="3.2" fill={url('pod')} />
          <rect className="robot-led" x="3.9" y="29.5" width="1.6" height="11" rx="0.8" fill="#3fe0d0" />
          <rect className="robot-led" x="58.5" y="29.5" width="1.6" height="11" rx="0.8" fill="#3fe0d0" />
          <rect className="robot-led" x="28.2" y="11.6" width="7.6" height="2.6" rx="1.3" fill="#3fe0d0" />

          {/* Helmet and screen. */}
          <path d={SHELL} fill={url('shell')} />
          <path d={SHELL} fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="0.6" />
          <path d={SCREEN} fill={url('screen')} />

          <g clipPath={url('face')}>
            <g className="robot-look">
              <g className="robot-blink">
                <g className={beat ? 'robot-swap' : undefined} key={`s${beat}`} filter={url('glow')} fill={EYE} stroke={EYE} strokeLinecap="round" strokeLinejoin="round">
                  {face(shown)}
                </g>
              </g>
            </g>
            <rect className="robot-grid" x="10" y="16" width="44" height="38" fill={url('grid')} opacity="0.5" />
            <path d="M18 24.5c4.2-3.6 10.4-4.8 16-4.4" fill="none" stroke="#fff" strokeOpacity="0.13" strokeWidth="1.6" strokeLinecap="round" />
          </g>

          {shown === 'sleepy' && (
            <g className="robot-zzz" fill="#cfe9ff" fontFamily="system-ui, sans-serif" fontWeight="700">
              <text x="47" y="15" fontSize="7">z</text>
              <text x="52" y="9" fontSize="5">z</text>
            </g>
          )}
        </g>
      </g>
    </svg>
  )
}

const SHELL = 'M32 13.2C47.4 13.2 57.6 22.4 57.6 35.2C57.6 48.4 47 56.4 32 56.4S6.4 48.4 6.4 35.2C6.4 22.4 16.6 13.2 32 13.2Z'
const SCREEN = 'M32 18.2C44.6 18.2 52.4 25.6 52.4 35.6C52.4 45.6 44.4 51.6 32 51.6S11.6 45.6 11.6 35.6C11.6 25.6 19.4 18.2 32 18.2Z'

/** Eye (and mouth) shapes per mood, drawn in the screen's coordinates. */
function face(mood: Mood): ReactNode {
  const none = { stroke: 'none' }
  const line = { fill: 'none', strokeWidth: 2.4 }
  switch (mood) {
    case 'happy':
      // Filled crescents, as when smiling with the eyes.
      return (
        <>
          <path {...none} d="M19.4 37.8C19.4 29.4 29.6 29.4 29.6 37.8C27.6 35.4 21.4 35.4 19.4 37.8Z" />
          <path {...none} d="M34.4 37.8C34.4 29.4 44.6 29.4 44.6 37.8C42.6 35.4 36.4 35.4 34.4 37.8Z" />
        </>
      )
    case 'wink':
      return (
        <>
          <path {...none} d="M19.4 37.8C19.4 29.4 29.6 29.4 29.6 37.8C27.6 35.4 21.4 35.4 19.4 37.8Z" />
          <path {...line} d="M35.4 35.8Q39.5 31.4 43.6 35.8" />
        </>
      )
    case 'surprised':
      return (
        <>
          <circle {...none} cx="24.5" cy="33.4" r="5.1" />
          <circle {...none} cx="39.5" cy="33.4" r="5.1" />
          <ellipse fill="none" strokeWidth="1.5" cx="32" cy="44.2" rx="1.7" ry="2.3" />
        </>
      )
    case 'sleepy':
      // Shut, peaceful: two low curves.
      return (
        <>
          <path {...line} strokeWidth="2" d="M20.4 35.2Q24.5 38.8 28.6 35.2" />
          <path {...line} strokeWidth="2" d="M35.4 35.2Q39.5 38.8 43.6 35.2" />
        </>
      )
    case 'sad':
      return (
        <>
          <path {...none} d="M19 33.4L28.9 30.3Q30.5 29.9 30.4 31.8Q30.1 38 28 42.3Q27.3 43.7 26.5 42.3Q25.5 40.5 23.4 39.9Q19.5 38.9 18.9 35.6Q18.7 34.1 19 33.4Z" />
          <path {...none} d="M45 33.4L35.1 30.3Q33.5 29.9 33.6 31.8Q33.9 38 36 42.3Q36.7 43.7 37.5 42.3Q38.5 40.5 40.6 39.9Q44.5 38.9 45.1 35.6Q45.3 34.1 45 33.4Z" />
          <path className="robot-tear" {...none} d="M27.2 44.6q1.1 1.7 0 2.5q-1.1-.8 0-2.5Z" />
          <path className="robot-tear robot-tear--late" {...none} d="M36.8 44.6q1.1 1.7 0 2.5q-1.1-.8 0-2.5Z" />
        </>
      )
    case 'angel':
      return (
        <>
          <path {...line} d="M20.4 36.2Q24.5 31.4 28.6 36.2" />
          <path {...line} d="M35.4 36.2Q39.5 31.4 43.6 36.2" />
          <path fill="none" strokeWidth="1.8" d="M28.6 42.2Q32 45.2 35.4 42.2" />
        </>
      )
    case 'thinking':
      // Looking up and to the side, a little narrowed.
      return (
        <>
          <ellipse {...none} cx="26" cy="32.6" rx="3.5" ry="4.4" />
          <ellipse {...none} cx="41" cy="32.6" rx="3.5" ry="4.4" />
        </>
      )
    default:
      return (
        <>
          <ellipse {...none} cx="24.5" cy="34.6" rx="4.3" ry="5.7" />
          <ellipse {...none} cx="39.5" cy="34.6" rx="4.3" ry="5.7" />
        </>
      )
  }
}
