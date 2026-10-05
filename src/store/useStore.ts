import { create } from 'zustand'
import { experience, type SectionId } from '../content'

export type Quality = 'high' | 'mid' | 'low'
export type RenderMode = 'webgl' | 'static'
export type CursorState = 'default' | 'link' | 'view' | 'copy' | 'drag' | 'hidden'

interface State {
  mode: RenderMode
  quality: Quality
  lite: boolean
  reducedMotion: boolean
  isTouch: boolean
  /** 0..1 asset + shader warm-up progress. */
  loadProgress: number
  loaded: boolean
  /** Intro choreography finished (loader gone, hero settled). */
  introDone: boolean
  section: SectionId
  cursor: CursorState
  cursorLabel: string
  hoveredWork: number | null
  focusedWork: number
  openWork: number | null
  duotone: boolean
  /** Bumped when fonts land or the viewport width changes: text is re-split. */
  layoutKey: number
  set: (p: Partial<State>) => void
}

export const useStore = create<State>((set) => ({
  mode: 'webgl',
  quality: 'high',
  lite: false,
  reducedMotion: false,
  isTouch: false,
  loadProgress: 0,
  loaded: false,
  introDone: false,
  section: 'hero',
  cursor: 'default',
  cursorLabel: '',
  hoveredWork: null,
  focusedWork: 0,
  openWork: null,
  duotone: false,
  layoutKey: 0,
  set: (p) => set(p),
}))

/**
 * High-frequency values that must never trigger React renders. Written by the
 * scroll / pointer systems, read inside useFrame and GSAP callbacks.
 */
export const signals = {
  /** Global camera parameter: section index + local progress. */
  t: 0,
  /** Smoothed scroll velocity in viewport heights per second. */
  velocity: 0,
  /** Local 0..1 progress per section. */
  progress: { hero: 0, about: 0, works: 0, experience: 0, contact: 0 } as Record<SectionId, number>,
  /** Choreography values driven by scrubbed GSAP timelines. */
  scan: 0,
  shimmer: 0,
  intro: 0,
  /** Displayed loader progress 0..1 (eased). */
  load: 0,
  /** Explosion progress 0..1 of each experience card (scrubbed). */
  shatter: experience.map(() => ({ p: 0 })),
  /** True while a full-screen overlay hides the canvas: rendering is skipped. */
  paused: false,
  /** True while the opaque hero photo covers the whole viewport: the fixed stage behind it is skipped. */
  heroCovers: false,
  pointer: { x: 0, y: 0, nx: 0, ny: 0, vx: 0, vy: 0, lastMove: 0, active: false },
}
