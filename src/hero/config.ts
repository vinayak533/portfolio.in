/**
 * Tunables for the hero -> About scroll transition (src/hero/shot.ts,
 * src/hero/transition.ts).
 */
export const heroConfig = {
  /**
   * One continuous camera move: it eases out of stillness, closes on the robot
   * and hands over to About. One scrubbed timeline, progress 0..1 over the pin.
   */
  transition: {
    /** Per breakpoint. `mobile` applies in portrait or below 768 px wide. */
    desktop: {
      target: [0.5005, 0.4035] as [number, number], // what the camera pushes toward: the figure's back and the glow of the laptop, image uv (y down)
      frame: [0.5, 0.6] as [number, number], // where that lands on screen at the end of the push (viewport uv, y down): a touch low, looking past them at the horizon
      zoom: 2.4, // camera zoom on the figure as the bank swallows them: a push, not a crash zoom (the photo stays crisp)
      pinVh: 260, // scroll length of the pin, viewport heights
    },
    mobile: {
      target: [0.5005, 0.4035] as [number, number],
      frame: [0.5, 0.58] as [number, number],
      zoom: 2.0,
      pinVh: 200,
    },
    /** Scroll progress where the idle hold ends and the camera starts to move. */
    hold: 0.04,
    /**
     * The camera's speed over the move, as fractions of it: it eases in from
     * stillness over `easeIn`, travels at one steady speed, and settles to a
     * stop over `settle` as About arrives. Never an abrupt change of pace.
     */
    move: { easeIn: 0.3, settle: 0.2 },
    scrub: 0.5, // seconds of scroll smoothing on top of Lenis: weight without trailing the wheel
    renderUntil: 0.995, // the hero render loop stops at this progress (and restarts below it)
    keyboardDuration: 3.2, // seconds for PageDown / Space to play the whole shot
    /** Hold: the screen glow pulses a little harder, inviting the scroll. */
    cue: { pulse: 1.6, glow: 0.18 },
    /** Depth parallax: zoom exponent per layer (the figure = 1). Far < 1 barely moves, near > 1 rushes past. */
    parallax: { far: 0.22, near: 1.45, iterations: 3 },
    /** Keep the photograph in focus throughout the push; the camera easing supplies the cinematic motion. */
    blur: { motion: 0, dof: 0, focus: 0.26 }, // optional lens effects remain available in the debug panel
    vignette: 0.16, // extra vignette at the end of the push
    raysFade: 0.85, // god rays and moon glow give way as the air between camera and sky thickens
    ambientSlow: 0, // clouds, grass and particles slow by this fraction during the push (0 = the world keeps its pace)
    windUp: 0.7, // the wind builds as the weather rolls in: grass and leaves move this much more under the clouds
    screenGlow: 0.1, // light the laptop screen throws into the mist (bloom)
    /** Maps hero progress onto About's stage (its hero-to-About handover), finishing while the camera is inside the bank. */
    stageMap: [0.3, 0.76] as [number, number],
    /**
     * The weather the camera flies through (shaders/clouds.frag): real depth,
     * not an overlay. Distances are in bank units along the view axis. The
     * photo's depth map places every pixel at a distance (the figure at
     * `scene.figure`, the sky at `scene.sky`), and the cloud volume is
     * composited against it, so mist gathers in the far sky first, rolls over
     * the back of the island, swallows the figure, then streams past the lens.
     *
     * Bank coordinates: the main bank spans 0 .. `bank.depth` (density ramps
     * over `bank.ramp`); thin veils lead it and one trails it. The camera
     * travels from `path[0]` to `path[1]` over the move.
     */
    atmosphere: {
      path: [-18.6, 5.7] as [number, number],
      scene: { figure: 3.2, spread: 2.4, sky: 12 }, // figure distance at rest, depth-map spread (exp), far cap
      bank: { depth: 3.4, ramp: 0.9, density: 4.2 }, // optical density per unit inside the bank
      /** Thin veils ahead of the bank and one behind it: [from, to, ramp, density] in bank coordinates. */
      leading: [
        [-6.4, -4.7, 0.8, 0.26],
        [-3.4, -2.0, 0.65, 0.42],
      ] as [number, number, number, number][],
      trailing: [3.9, 5.1, 0.5, 0.42] as [number, number, number, number],
      slices: 14, // depth slices the volume is integrated in (each its own cloud sheet)
      slicesLow: 8, // on phones / Lite
      scale: 1.6, // cloud cells per viewport height on a slice one unit away
      softness: 0.22, // edge softness of the cloud bodies (higher = mistier)
      structure: 0.85, // 0 smooth fog .. 1 fully billowed slices
      silver: 1.0, // moonlight on cloud edges facing the moon
      scatter: 1.4, // forward scattering: the mist glows when you look toward the moon
      moonReach: 1.0, // how fast moonlight dies with depth into the bank (1 / units)
      glowReach: 0.7, // how far About's light reaches back into the bank from its far side (1 / units)
      ambient: [0.011, 0.015, 0.034] as [number, number, number], // moonlit mist body, linear
      deep: [0.009, 0.008, 0.028] as [number, number, number], // the heart of the bank: cooler, toward About's indigo
      glow: [0.03, 0.016, 0.1] as [number, number, number], // About's light seen through the far side of the bank (its accent, dimmed)
      laptop: 0.4, // the laptop's glow diffusing in the mist around the figure
      laptopColor: [0.32, 0.46, 1.0] as [number, number, number],
      wind: 0.04, // lateral drift, cloud units / s (with config.wind.direction): life, never progress
      dim: 0.45, // moonlight on the scene lost as the air thickens
    },
  },
}

/** Breakpoint for the transition profile: portrait screens or narrower than 768 px. */
export const MOBILE_QUERY = '(max-width: 767px), (orientation: portrait)'

/** The transition profile (zoom target, max zoom, pin length) for the current viewport. */
let mobileQuery: MediaQueryList | null = null
export function transitionProfile() {
  mobileQuery ??= window.matchMedia(MOBILE_QUERY)
  return mobileQuery.matches ? heroConfig.transition.mobile : heroConfig.transition.desktop
}
