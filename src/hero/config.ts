/**
 * Every tunable for the cinematic hero lives in this one object. The engine
 * reads it each frame, so the ?debug panel (lil-gui) edits it live; "Copy
 * config" in that panel prints a JSON you can paste back over these values.
 *
 * Units: "px" means pixels of the SOURCE photograph (1672 x 941), so values
 * stay meaningful at any screen size. Image positions are in source px too.
 */
export const heroConfig = {
  /** Source photograph reference size, and the object-position used for the cover crop. */
  image: {
    ref: [1672, 941] as [number, number],
    objectPosition: [0.5, 0.42] as [number, number],
    exposure: 1.0,
  },

  /**
   * A. The photographed sky drifts right to left (with the wind) in three
   * depth layers, split by the depth map: far (the high sky and the clouds
   * around the moon) slow, mid (the horizon banks) medium, near (the cloud sea)
   * fastest. Each layer is the photo carried by a two-phase flow (`advect`, a
   * seamless loop) and rolled by domain-warped fbm (`displace`, `billow`), all
   * masked by the sky mask so the cliff and the figure never warp.
   */
  sky: {
    layers: {
      // drift: px / s the warp field travels; advect: px / s the photographed clouds travel;
      // scale: noise cells per image height (lower = bigger billows); displace: max roll, px; billow: shape morph, cells / s
      far: { drift: 4, advect: 1.4, scale: 1.4, displace: 4, billow: 0.008 },
      mid: { drift: 9, advect: 2.6, scale: 1.9, displace: 7, billow: 0.011 },
      near: { drift: 18, advect: 4.2, scale: 2.4, displace: 10, billow: 0.014 },
    },
    split: [0.05, 0.18] as [number, number], // depth where far turns to mid, and mid to near
    blend: 0.05, // softness of those splits, in depth
    warp: 1.6, // domain-warp strength
    advectCycle: 6, // seconds per flow cycle: the two crossfading copies drift apart by advect x cycle / 2 px (shorter = less smear, more shimmer)
    grade: 0.3, // night colour grade of the clear sky: navy overhead, indigo, cold blue at the horizon
    /** Moonlight on the photographed clouds: rims facing the moon light up, brighter near it; warm light from below low in the frame. Shifts as they move. */
    rim: {
      amount: 0.6, // rim light on cloud shoulders facing the moon
      reach: 5, // falloff of the rim light from the moon, moon radii
      under: 0.25, // warm under-lighting of cloud bellies low in the frame
      underColor: [1.0, 0.72, 0.46] as [number, number, number],
      shimmer: 0.45, // how much the moving cloud field modulates the rim light (0 = steady)
    },
    detail: 0.035, // faint animated micro-detail on clouds and grass (fraction of luminance); grows as the camera dives in
  },

  /** Cloud shadows rolling over the cloud sea (from the near cloud field). */
  sea: {
    coverage: 0.58, // noise threshold: lower = more shadow
    softness: 0.1,
    shadow: 0.16,
  },

  /**
   * Wisps: thin wind-sheared streaks between the camera and the moon. The
   * near layer crosses the disk every so often, lit silver from behind; the
   * mid layer drifts slower and higher. Speeds differ, and the mouse moves the
   * near layer more (parallax), so the sky reads as depth, not one sheet.
   */
  wisps: {
    near: { scale: 7, stretch: 3.2, threshold: 0.58, softness: 0.18, density: 1.1, speed: 12, parallax: 0.45 },
    mid: { scale: 11, stretch: 4, threshold: 0.6, softness: 0.18, density: 0.6, speed: 5, parallax: 0.15 },
    evolve: 0.005, // how fast the wisp shapes morph, cells / s
    light: 0.6, // forward scattering of the moonlight through them
    ambient: 1.0, // their faint navy body far from the moon
    selfShadow: 0.75, // thick cores darken against the backlight (0 = flat)
  },

  /**
   * B. Moon: a lit sphere rendered in scene.frag from seamless lunar maps
   * (src/assets/moon/, built by scripts/prepare-moon.mjs from the NASA CGI
   * Moon Kit). It sits behind every cloud: the photographed cumulus
   * (moon-matte) and the drifting wisps. The photographed moon and its glow are
   * inpainted out of the clean plate (src/assets/hero.jpg, scripts/prepare-hero.mjs,
   * which reads pos / radius from here: rerun it after moving the moon).
   */
  moon: {
    pos: [1188, 186] as [number, number], // centre, source px: the open gap between the cumulus and the cloud tower, clear of the navbar
    radius: 48, // source px (61% of the old 79 px moon)
    rotation: -12, // position angle, degrees clockwise: tilts lunar north the way it leans in an evening sky
    // ---- light
    lightAngle: 140, // where the sunlight comes FROM on screen, degrees: 0 = right, 90 = up, 140 = upper left
    phase: 26, // sun-moon-viewer angle, degrees: 0 = full; a little past full leaves a soft shadow on the lower-right limb
    terminator: 0.14, // softness of the day / night line (0 = razor sharp)
    limbDarkening: 0.32, // 0 = the flat full-moon disk (Lommel-Seeliger), 1 = a matte ball (Lambert)
    earthshine: 0.03, // light on the night side, fraction of the day side
    earthshineColor: [0.78, 0.88, 1.0] as [number, number, number],
    relief: 1.0, // normal-map strength: craters show at the terminator, as on the real moon
    // ---- colour: pale warm silver, graded into the scene
    kelvin: 5500, // colour temperature of the face (4500 warm .. 5500 pale silver)
    sceneHighlight: [1.15, 0.977, 0.784] as [number, number, number], // the photo's cloud highlights (linear hue, measured): the moon is pulled toward it
    sceneMatch: 0.2, // 0 = pure blackbody, 1 = exactly the cloud-highlight hue
    tint: [1.0, 1.0, 1.0] as [number, number, number], // final colour multiplier on the face, scatter ring and halo core
    mapSaturation: 0.3, // how much of the map's own colour survives (maria vs highlands)
    brightness: 0.86, // display brightness of the average face (highlights roll off below 0.97, never clip)
    // ---- edge: feathered limb, thin scatter ring, wide halo coloured by the sky behind it
    feather: 1.5, // limb feather, render px
    scatter: { amount: 0.16, width: 0.05 }, // thin bright ring just outside the limb; width in moon radii
    halo: {
      amp: [0.07, 0.03] as [number, number], // core, tail (linear, over the sky)
      scale: [0.22, 1.25] as [number, number], // falloff of each, moon radii outside the limb
      skyColor: 0.55, // 0 = the halo is the moon's colour, 1 = the colour of the sky behind it
      haze: 0.5, // how much it swells and thins with the passing haze (0 = steady)
      occlusion: 0.85, // how much of it a cloud in front of the moon hides
    },
    // ---- response to the clouds (density near the moon, from the same moving noise)
    lightBrightness: 0.95, // the light the moon throws (wisps, scene response, rays)
    response: 0.55, // how much cloud over the moon dims the light on the scene (0..1)
    smoothing: 0.6, // 1/s, how quickly the light follows the cloud (lower = softer)
    baseline: 0.82, // intensity the photo was "shot" at; clear sky lifts the scene above it
    glow: 1.0, // halo strength
    flare: 0.2, // extra glow in a clear gap
    dim: 0.55, // glow lost under thick cloud
    soften: 0.6, // how much thick cloud widens (softens) the halo
    warmth: 0.25, // warm shift of the light under cloud (0 = always cool)
    breathHz: 0.07, // slow breathing of the glow (0.05 - 0.1 Hz)
    breathAmount: 0.035, // on the glow; the face itself breathes a third of this
    wispTint: 0.6, // moonlight scattered by the wisps: 0 = the cool scene moonlight, 1 = the halo colour
  },

  /** C. Moonlight cast on the scene (lightness grading, not an overlay). */
  light: {
    sceneResponse: 0.42, // how much the whole frame follows the moon
    rim: 1.1, // extra response on moon-facing edges: cliff top, grass, the figure's silhouette
  },

  /** D. God rays: half-res radial blur from the moon through gaps in the cloud. */
  rays: {
    strength: 0.14,
    length: 0.62, // fraction of the way toward the moon each pixel gathers
    decay: 0.968,
    threshold: 0.2, // linear luminance needed to emit rays
    reach: 0.32, // how far from the moon emitters count, screen heights
  },

  /** E. Grass sway (driven by the grass mask). */
  grass: {
    amplitude: 2.2, // px at blade tips
    frequency: 0.45, // Hz of the base sway
    gust: 1.3, // extra push when a gust passes
    gustSpeed: 0.09, // Hz of gust waves rolling across the field
  },
  wind: {
    direction: -1, // -1 = right to left (matches the cloud drift), 1 = left to right
  },

  /** F. Laptop screen glow, independent of the moon. */
  laptop: {
    pos: [863, 388] as [number, number],
    size: [33, 25] as [number, number],
    pulse: 0.07, // amplitude of the screen pulse
    pool: 0.55, // how much of the pulse reaches the grass around it
    hz: 0.5,
  },

  /**
   * F2. What the laptop shows (screen.ts): a code editor shot (src/assets/screen/code.webp),
   * composited in perspective at full device resolution, so it is sharp from
   * the opening frame to the deepest zoom. Placed by `corners`.
   */
  screen: {
    enabled: true,
    resolution: 3840, // max art width px (16:10); screen.ts caps it near the shot's own resolution. Lite / small screens use 2048
    brightness: 1.12, // emission of the screen relative to the art
    glare: 0.045, // soft reflection across the glass
    bezel: 34, // black bezel around the panel, in art px (the art is 1600 wide)
    caretHz: 0.9, // text caret blink
    /** Laptop screen corners in source px: top-left, top-right, bottom-right, bottom-left. */
    corners: [
      [848.6, 375.8],
      [879.5, 378.0],
      [873.0, 401.1],
      [845.5, 396.1],
    ] as [number, number][],
    radius: 1.5, // screen corner radius, source px
  },

  /**
   * K. A video on the laptop screen (video.ts): a hidden, muted, looping
   * <video> used as a texture and warped onto the screen in perspective,
   * masked to the panel (bezel and rounded corners) and cover-fitted. Plays in
   * real time from page load (never scrubbed by scroll); pauses and leaves the
   * GPU once About has taken over, resumes on the way back. Missing files keep
   * the screen art above.
   */
  video: {
    enabled: true,
    /** Tried in order; the full-resolution file (it stays sharp at the deepest zoom). */
    sources: [
      { src: '/video/screen.mp4', type: 'video/mp4' },
      { src: '/video/screen.webm', type: 'video/webm' },
    ],
    /** Screen corners in image uv (0..1, y down): top-left, top-right, bottom-right, bottom-left. Align with ?debug. */
    corners: [
      [0.50754, 0.39936],
      [0.52602, 0.4017],
      [0.52213, 0.42625],
      [0.50568, 0.42093],
    ] as [number, number][],
    screenAspect: 1.6, // physical aspect of the panel (width / height); the video is cover-fitted to it
    emissive: 1.15, // brightness on the panel relative to the file: a lit screen reads brighter than the scene
    bloom: 2.4, // HDR boost of the video's average colour fed to the bloom (slight glow around the screen)
    spill: 3.0, // light the screen throws on the hands, face edge and grass, tinted by the video
    sampleMs: 100, // how often the average colour is sampled (a tiny downscaled frame)
  },

  /** G. Atmosphere. */
  particles: {
    dust: 48,
    fireflies: 10,
    leaves: 22,
    brightness: 1.0,
    dustSpeed: 1.6, // multiplier on how fast the dust rides the wind
    leafSpeed: 2.6, // multiplier on how fast leaves cross the frame (and tumble)
    leafFlutter: 1.5, // multiplier on how much leaves rise and dip on the gusts
  },
  stars: {
    twinkle: 1.0, // scintillation of the stars (the photo's own and the new ones)
    density: 0.7, // extra stars (0 = none); they never move with the clouds
    brightness: 0.7,
    milkyWay: 1.0, // a faint band high in the clear sky to the left, washed out near the moon
    /** A very rare shooting star in the dark upper sky (never with reduced motion). */
    meteor: {
      every: 75, // mean seconds between them (randomised 0.5x .. 1.5x)
      duration: 0.8, // seconds on screen
      length: 0.09, // streak length, image heights
      brightness: 1.1,
    },
  },

  /** H. Camera. */
  parallax: {
    maxShiftPx: 12, // screen px at the nearest / farthest depth
    ease: 0.05, // lerp per 60 fps frame
    focus: 0.5, // depth that stays still (the island)
    gyro: true,
  },
  dolly: {
    min: 1.0,
    max: 1.03,
    period: 40, // seconds for a full in-and-out breath (20 s each way)
    focus: [825, 390] as [number, number], // zooms toward the figure
  },

  /**
   * J. Scroll transition (src/hero/shot.ts, src/hero/transition.ts): one
   * continuous camera move. The camera eases out of stillness and pushes toward
   * the figure (each depth layer of the photo at its own rate); the air between
   * camera and sky thickens, a cloud bank rolls in from the depth of the scene,
   * over the island and past the lens; inside it the light turns from moonlight
   * to About's indigo; the camera flies out of its far side onto About's world
   * and settles. One scrubbed timeline, progress 0..1 over the pin; every value
   * is read live by ?debug.
   */
  transition: {
    /** Per breakpoint. `mobile` applies in portrait or below 768 px wide. */
    desktop: {
      target: [0.5005, 0.4035] as [number, number], // what the camera pushes toward: the figure's back and the glow of the laptop, image uv (y down)
      frame: [0.5, 0.6] as [number, number], // where that lands on screen at the end of the push (viewport uv, y down): a touch low, looking past them at the horizon
      zoom: 2.4, // camera zoom on the figure as the bank swallows them: a push, not a crash zoom (the photo stays crisp)
      pinVh: 380, // scroll length of the pin, viewport heights
    },
    mobile: {
      target: [0.5005, 0.4035] as [number, number],
      frame: [0.5, 0.58] as [number, number],
      zoom: 2.0,
      pinVh: 280,
    },
    /** Scroll progress where the idle hold ends and the camera starts to move. */
    hold: 0.04,
    /**
     * The camera's speed over the move, as fractions of it: it eases in from
     * stillness over `easeIn`, travels at one steady speed, and settles to a
     * stop over `settle` as About arrives. Never an abrupt change of pace.
     */
    move: { easeIn: 0.3, settle: 0.2 },
    scrub: 1.1, // seconds of scroll smoothing on the timeline: the camera has weight
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

  /** I. Film finish. */
  film: {
    fadeIn: 1.2,
    vignette: 0.42,
    grain: 0.045,
    aberration: 0.0035,
    bloom: 0.15,
    bloomThreshold: 0.65,
    knee: 0.62, // tone-map shoulder: values above roll off instead of clipping
    streak: 0.05, // anamorphic glass: a faint horizontal streak from the brightest light
    toe: 0.0025, // lifts the deepest blacks a touch so the shadows keep their information
    sharpen: 0.6, // contrast-adaptive sharpening: crisper fine detail without halos (0 = off)
    clarity: 0.18, // local contrast (a wide, gentle unsharp mask) on the midtones (0 = off)
  },

  perf: {
    maxDpr: 2,
    maxScenePixels: 1_800_000, // cap for the heavy scene pass with the 1672 px photo, just above its own 1.57 MP (rays and bloom run at 1/2 and 1/4 of it)
    maxScenePixelsHi: 8_400_000, // full 3840 x 2160 scene on the high tier
    /**
     * Highest photo tier to stream in from src/assets/hero-hi/ (built by `npm run hero`),
     * Chosen using the cover crop, DPR and maximum zoom. Phones / Lite cap at 4K;
     * desktops can use 8K. Unsupported texture sizes are excluded before downloading.
     */
    hiRes: '8k' as '8k' | '4k' | '2k' | 'off',
    swapSeconds: 0.9, // crossfade from the base photo to the sharp tier (no visible pop)
    lowPowerScale: 0.25, // ~2.1 MP with a sharp photo; effects adapt separately
    integratedScale: 0.5, // ~4.2 MP with a sharp photo; never stuck at the base photo's cap
    /** Automatic quality: when frames run slow, the scene resolution steps down (and back up when there is headroom). */
    adaptive: true,
    targetMs: 17.5, // frame time to hold (60 fps = 16.7 ms)
    minScale: 0.45, // lowest fraction of the pixel cap it may drop to
  },

  /** All GPU-side oscillators are quantised to this period so the whole film loops without a seam. */
  loop: { seconds: 600 },

  /**
   * Hand-traced geometry used ONLY to build temporary masks until you supply
   * real ones in src/assets/hero-maps/. Source px.
   */
  scene: {
    person: { center: [825, 382] as [number, number], radius: [64, 58] as [number, number] },
    islandDepth: [0.5, 0.62] as [number, number], // back of the grass .. foot of the cliff
    personDepth: 0.46, // matches src/assets/hero-maps/depth.png at the figure
    horizon: 0.3, // image-height fraction of the cloud horizon
    island: [
      [372, 440], [388, 414], [420, 396], [490, 376], [590, 361], [690, 350], [760, 343], [805, 340],
      [822, 331], [850, 333], [870, 346], [920, 347], [980, 344], [1040, 362], [1090, 379], [1140, 398],
      [1200, 412], [1245, 428], [1275, 452], [1292, 492], [1288, 525], [1270, 560], [1240, 585], [1195, 630],
      [1150, 690], [1135, 730], [1090, 746], [1040, 742], [990, 738], [960, 762], [900, 792], [850, 830],
      [800, 860], [700, 872], [630, 852], [575, 815], [530, 780], [490, 740], [455, 690], [440, 640],
      [410, 590], [385, 540], [372, 495],
    ] as [number, number][],
    /** Small floating rock and the hanging debris on the left: ellipses [cx, cy, rx, ry]. */
    islandExtras: [
      [1262, 672, 30, 36], [430, 675, 22, 28], [497, 750, 16, 22], [522, 810, 10, 14],
    ] as [number, number, number, number][],
    grassTop: [
      [372, 440], [388, 414], [420, 396], [490, 376], [590, 361], [690, 350], [760, 343], [805, 340],
      [822, 331], [850, 333], [870, 346], [920, 347], [980, 344], [1040, 362], [1090, 379], [1140, 398],
      [1200, 412], [1245, 428], [1275, 452], [1290, 495], [1220, 522], [1170, 552], [1120, 572], [1040, 602],
      [940, 632], [840, 622], [690, 602], [590, 582], [490, 552], [400, 502],
    ] as [number, number][],
  },
}

export type HeroConfig = typeof heroConfig

/** Breakpoint for the transition profile: portrait screens or narrower than 768 px. */
export const MOBILE_QUERY = '(max-width: 767px), (orientation: portrait)'

/** The transition profile (zoom target, max zoom, pin length) for the current viewport. */
let mobileQuery: MediaQueryList | null = null
export function transitionProfile() {
  mobileQuery ??= window.matchMedia(MOBILE_QUERY)
  return mobileQuery.matches ? heroConfig.transition.mobile : heroConfig.transition.desktop
}
