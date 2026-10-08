/**
 * Single source of truth for colour, motion and the world layout.
 * CSS mirrors the colours as custom properties in styles/global.css.
 * Three.js objects (shader colours, world anchors) live in gl/world.ts.
 */

export const palette = {
  base: '#07070D',
  ink: '#ECEAF2',
  accent: '#7C5CFF',
}

/** Every eased motion on the site uses one of these. No bouncy defaults. */
export const ease = {
  out: 'expo.out',
  inOut: 'power3.inOut',
  soft: 'power2.out',
  in: 'power3.in',
}

export const duration = {
  micro: 0.35,
  base: 0.9,
  slow: 1.4,
  cinematic: 2.2,
}

/**
 * Section heights in viewport units. Each section owns one integer step of the
 * global camera parameter t (section index + local progress). The last 100vh of
 * every section is its hand-off to the next one.
 */
export const sectionHeights = {
  hero: 170,
  about: 420,
  works: 640,
  experience: 480,
  /** Unused in the WebGL layout: Contact underlaps Experience's hand-off and sizes to its content. */
  contact: 200,
} as const

/** Plain-number layout shared by DOM and WebGL (no three.js here). */
export const layout = {
  worksStartX: 0,
  worksSpacing: 7.6,
  /** Width of each exhibit's 16:9 reel, in world units: the reel is the whole card. */
  worksScreen: 5.0,
}

/**
 * Wide landscape viewports: each exhibit carries its own Details label in 3D.
 * Below that it would be too small to tap, so a DOM button stands in.
 * Mirrored by the `.works-details` breakpoint in global.css.
 */
export const worksWide = (aspect: number, width = window.innerWidth) => aspect > 1 && width >= 900

/** Ranges of the global t where each act's 3D group is mounted and visible. */
export const visibility = {
  hero: [-1, 0],
  about: [0.25, 2.25],
  works: [1.74, 3.35],
  experience: [2.55, 4.6],
} as const
