/**
 * Tunables for the hero -> About scroll hand-off (src/hero/shot.ts, src/hero/transition.ts, and the engine's
 * own beats in src/hero/robot/engine.ts). HERO_SPEC.md lists the locked values.
 */
export const heroConfig = {
  transition: {
    /** Per breakpoint. `mobile` applies in portrait or below 768 px wide. */
    desktop: {
      pinVh: 260, // scroll length of the pin, viewport heights
    },
    mobile: {
      pinVh: 200,
    },
    /** Scroll progress where the idle hold ends and the hand-off starts to move. */
    hold: 0.04,
    /**
     * The hand-off's pace, as fractions of it: it eases in from stillness over `easeIn`, travels at one steady
     * speed, and settles to a stop over `settle` as About arrives. Never an abrupt change of pace.
     */
    move: { easeIn: 0.3, settle: 0.2 },
    /** Along that travel (0..1): the hero's backdrop parts onto About's world over `part`; About's page arrives from `arrive` on. */
    part: [0.808642, 0.82716] as [number, number],
    arrive: 0.883128,
    scrub: 0.5, // seconds of scroll smoothing on top of Lenis: weight without trailing the wheel
    keyboardDuration: 3.2, // seconds for PageDown / Space to play the whole hand-off
    /** Maps hero progress onto About's stage (its hero-to-About handover). */
    stageMap: [0.3, 0.76] as [number, number],
  },
}

/** Breakpoint for the transition profile: portrait screens or narrower than 768 px. */
export const MOBILE_QUERY = '(max-width: 767px), (orientation: portrait)'

/** The transition profile (the pin's length) for the current viewport. */
let mobileQuery: MediaQueryList | null = null
export function transitionProfile() {
  mobileQuery ??= window.matchMedia(MOBILE_QUERY)
  return mobileQuery.matches ? heroConfig.transition.mobile : heroConfig.transition.desktop
}
