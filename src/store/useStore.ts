import { create } from 'zustand'
import { experience, type SectionId } from '../content'
import type { HeroTier } from '../hero/tier'

export type Quality = 'high' | 'mid' | 'low'
export type RenderMode = 'webgl' | 'static'
export type CursorState = 'default' | 'link' | 'view' | 'copy' | 'drag' | 'tag' | 'hidden'

interface State {
  mode: RenderMode
  quality: Quality
  lite: boolean
  /** The hero's quality tier (src/hero/tier.ts): chosen at start-up, only ever stepped down. */
  heroTier: HeroTier
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
  /** Bumped when fonts land or the viewport width changes: text is re-split. */
  layoutKey: number
  set: (p: Partial<State>) => void
}

export const useStore = create<State>((set) => ({
  mode: 'webgl',
  quality: 'high',
  lite: false,
  heroTier: 'high',
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
  /** True while the opaque Contact stage covers the whole viewport: the fixed stage behind it is skipped. */
  contactCovers: false,
  pointer: { x: 0, y: 0, nx: 0, ny: 0, vx: 0, vy: 0, lastMove: 0, active: false },
  /** Phones: the box the About copy leaves for the portrait, as fractions of the stage (centre x/y, width, height). */
  aboutSlot: null as { x: number; y: number; w: number; h: number } | null,
  /**
   * The About portrait on screen (viewport px), written by the 3D portrait each frame it draws: its photo plane's
   * box, whether every crystal is locked and still, and when this was written (performance.now()).
   */
  aboutPhoto: { x: 0, y: 0, w: 0, h: 0, settled: false, frame: 0 },
}
