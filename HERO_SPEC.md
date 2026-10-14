# Hero spec (locked)

Frozen: a visual or timing change means updating this file, the baselines (`npm run hero:baseline -- --update`) and any moved budget (`scripts/hero-perf.mjs`).

## Scene

A pearl-ceramic robot in headphones, seated on a fixed chair at a fixed table, coding on a laptop, on a round dot
stage at the global minimum of a dotted loss landscape. Below: the copy (name, hairline, tagline, role),
bottom-left over a soft scrim. Header: a centred nav pill with a sliding indicator; phones show `01 / 05` and
MENU. No logo, no LITE switch (quality is automatic). On scroll the body, props and landscape dissolve and only
the head docks bottom-right as the chat launcher's face.

## Tokens

| Colour | Hex | Use |
|---|---|---|
| void | `#040309` | page and hero base, scrim, vignette |
| surface / surface 2 | `#0B0916` / `#14102A` | panels, nav indicator, dais |
| accent | `#7C5CFF` | seams, headphone rings, rims, horizon glow |
| accent soft | `#A78BFA` | rim light, slopes, focus ring |
| highlight | `#C4B5FD` | LED eyes, crests, rim/basin dots |
| graphite | `#1A1726` | joints, headphone cups |
| pearl shell | `#ECE8EE` | robot shell |
| text / muted | `#F5F3FF` / `#A09BB8` | copy |
| warm key (only exception) | `#FFF1E6` | the robot's key light (`WARM_KEY_ENABLED`, engine.ts) |

Nothing on the robot or its props passes L\* 92 except the LED eyes and the screen.

- Page margin: `clamp(24px, 4.4vw, 64px)` (`--h-margin`); the copy's left edge, MENU's glyphs and the docked
  head's right edge all sit on it. Ultrawide: the copy follows a 1600 px column; the chrome stays on the margin.
- Spacing: copy bottom 48 px (phones 24 px + safe area); hairline 44 x 1 px (accent 80%), 18 px above, 16 below
  (phones 12 / 10); role 14 px under the tagline (phones 10). Header row 44 px, padded `clamp(10px, 1.4vw, 20px)`.
- Type: name in the tile lettering (src/hero/tileType.ts: each letter on a 5 x 5 module tile of circles, one
  module-wide rounded stroke), an SVG image `clamp(240px, 27vw, 390px)` wide (phones `min(100%, 340px)`), letters
  a gradient `#F5F3FF` -> `#C4B5FD` with a void drop shadow; the image is the LCP element. Tagline Instrument Serif italic,
  `clamp(22px, 1.9vw, 28px)` (tablets `clamp(20px, 2.3vw, 24px)`, phones `clamp(18px, 5vw, 20px)`), 1.3, at most
  3 lines. Role in the same tile lettering, 260 px wide (phones 230, about 15 px tall), `#DDD6FE`,
  after a 6 px accent-soft dot breathing 100 -> 60% / 4 s. Nav Inter 14 px / 500. Fallbacks size-adjusted
  (Georgia 78.7%, Times New Roman 88.9%). Under 640 px of height on phones only the name and the role show.
- Motion: 150 / 200 / 300 / 400 / 800 ms (`--dur-hover/fast/swap/base/slow`); ease-out `(0.2, 0.8, 0.2, 1)`,
  ease-in-out `(0.65, 0, 0.35, 1)`, ease-out-expo `(0.16, 1, 0.3, 1)`. Poster -> live scene: 300 ms crossfade.
  Nav indicator: 300 ms.
- Copy entrance (src/hero/introFx.ts, inlined into index.html; once, 2.6 s): the name's letterforms are at 14%
  from the first paint (it is the page's LCP element: it must paint at FCP, never at its fade-in); dots on a 6 px
  grid fly in toward the stage and assemble it (0 - 1.1 s) as it fills to 100% (0.55 - 1.1 s) and they fade
  (1 - 1.45 s); hairline 1.1 - 1.5 s; words up 80 ms apart from 1.25 s; "prototype chaos" resolves from a
  scramble 1.65 - 2.5 s; "production." at 2.05 s; role 2.15 - 2.6 s. The real text is
  in the DOM throughout; the final text is guaranteed by compositor animations and a 3.2 s timer. Reduced
  motion: no entrance.

## Master clock and energy (src/hero/motion.ts, robot/beat.ts)

- 96 BPM, 4/4 (one beat 625 ms). Head bob, chest core, headphone rings, equaliser, dais ripple (every 2nd beat)
  and the beam's +-8% swell read it.
- ENERGY 0..1: baseline 0.35, rises in 200 ms, settles over 1.2 s; pointer 0.6, tap 0.85, scroll 1. It adds up
  to +25% wave speed and +8% dot brightness, never new motion.
- Landscape: breath +-2.5% / 5 s; pulse wave every 2 beats; flank (interference) wave every 4 beats; light sweep
  every 10 beats (+12%); a comet every 14 beats (2.2 s); horizon glow +-8% / 4 s; typing tremor 240 ms.
- Inflow (terrain.ts DRAIN): every landscape dot drains into the stage along a gentle clockwise log spiral
  (0.7 rad per e-fold of radius; radial speed ~ 1/r^0.6), rim to stage in 6 s (phones 5.5 s); it fades in over
  the first 4% of its path at the visible bowl's outer ring and sinks 3% into the stage's rim over the last 10%.
  Phases are spread evenly, so the field is the same at every moment: no seam, no waves of rebirth. Measured
  (two frames 40 ms apart): 88% of the moving field flows inward at 1440x900, 96% at 390x844.
- Streamers (terrain.ts VORTEX): 3 log-spiral arms (+-6 deg, twist 3.2, one turn / 24 s) of brighter dots, each
  with a 4-dot trail 70 ms apart, from 85-100% of the visible bowl, life 5-7 s (phones 5-6.5 s); 3 -> 4.4 px,
  45% -> 75% (capped at 75%) as they near the stage; x0.5 over the robot; +6% on the beat, ENERGY +15% speed,
  landing +25% for 0.6 s; a +10% / 70 deg arc on the dais's outer ring turns with the arms. HIGH 600 /
  MEDIUM 300 / LOW 120 (no arc); they fade over p 0 .. 0.6 and stop; reduced motion: a still 40% at 70%.
- Descent agent: a 7 s cycle (spawn 0.4 s, descent 5.2 s, landing ring 1.1 s, rest 1.4 s), landing flash 0.4 s
  (the only brightness event above +15%). Landscape dots never pass ~70% (streamers 75%).
- Robot: irregular typing bursts, builds every 10-12 s (^ ^, a +15% screen pulse, the commit pulse), glances
  every 12-15 s, headphone fidget every 30-40 s, blinks every 4-6 s (120 ms). Eyes find each new agent in 120 ms
  and follow it 1.2 s (head 30%). Pointer: head and eyes only, within +-12 deg, released 3 s after it stops.
  One shared cue per event (`stageCues`): its reactions land in the same frame (the eyes within 150 ms).

## Tiers (src/hero/tier.ts)

| | HIGH | MEDIUM | LOW |
|---|---|---|---|
| chosen for | desktops | touch, <= 1024 px, 3G | Save-Data, 2G, <= 4 cores or GB, battery < 20%, failed probe |
| landscape grid | 220 x 130 budget | 100 x 60 | 80 x 48, DPR 1 |
| robot DPR cap | 2 (1.5 integrated GPU) | 1.5 | 1.25 |
| shadows, floor reflection | yes | no | no |
| waves / comets / wake | 100% / yes / pointer | 70% / yes / taps | none |
| frame rate | 60 | 60 (landscape 30 on phones) | 30 |

Frame pacing (src/core/clock.ts `pacing`): every WebGL loop (robot, landscape, sections) draws on whole refreshes at
about 60 a second whatever the display: 60-100 Hz every refresh, 120 Hz every 2nd (60), 144 Hz every 2nd (72, the
even cadence nearest 60), 165 Hz every 3rd (55), 240 Hz every 4th. Locked: an even ~30 (every 2nd refresh at 60 Hz,
4th at 120, 5th at 144). The DOM (scroll, tweens) runs on every refresh; motion is delta-time based.

Probe: 1.5 s of frames, 3.2 s after the scene is live. Under ~28 fps (over 36 ms) steps down one tier; under ~40
(over the budget by 35%) locks to the even 30 and keeps the tier's features. Live ladder (2 s windows, only
downward): frames more than 12% over the paced interval (under ~54 fps at 60 Hz; under ~27 once locked), or more
than a tenth of them a refresh late (hovering between cadences), shed one step; far over (under ~40) locks to 30 at once instead. Steps: the vortex (half, then off), then 1 interference
waves, 2 comets, 3 grid density, 4 glow cards and floor reflection, 5 shadow map halves, 6 equaliser 28 columns,
7 landscape DPR x0.75, 8 landscape frame rate, then the 30 lock. Site-wide lite (under 40 fps for 3 s) means LOW.
The head, eyes and screen never degrade. Docked, the head draws only when its picture changes (render on demand).

Last resort (src/hero/loop.ts): a pre-rendered loop of the hero itself (public/hero/loop-{phone,tablet,desktop},
H.264 + VP9, 10 s at 30 fps, 720 px wide / 1080 px tall in the posters' framings, phones <= 2 MB, tablets <= 2.5,
desktops <= 6: the landscape's dots lose their detail below that at 1080p) in the poster's place, under the grain, vignette, scrim and the real copy. Taken where LOW cannot
keep a steady 30 (the engine's LOW watch: drawn frames over ~37 ms on average, or a tenth of them late, for two 2 s
windows in a row at rest):
the loop covers the hero while it rests at the top (after 1.2 s there) and the robot and the landscape sleep under
it; the scroll's hand-off is still the live scene, which wakes and crossfades back over the loop (300 ms, the
poster's) as the hero starts to move. Docked, the head is the engine's (drawn only when it changes). No WebGL or a
software renderer (SwiftShader, llvmpipe, Microsoft Basic Render): the static layout, with the loop as the hero.
Never with reduced motion, Save-Data or `?freeze`; a loop that cannot play (no codec, autoplay refused) leaves the
hero as it was. `npm run perf:build && npm run hero:loop` captures them from the real scene on a virtual clock
(seeded, deterministic; scripts/hero-loop.mjs) and crossfades their last 0.8 s into their first; recapture with the
posters. The lab forces it with `?loop=1` (perf build).

Draw-call budget (src/hero/robot/merge.ts): static parts are baked into what moves them (mergeStatic); the moving
parts left are drawn as one skinned mesh per material within each visibility domain (skinParts: each part is its
own bone, weight 1, normals by the inverse transpose), so the frame is the same. The robot: 83 draws on HIGH
(was 171), 80 on MEDIUM; its WebGL calls per frame 1051 on HIGH (was 1909), 580 on MEDIUM (was 982).

## Scroll hand-off (src/hero/config.ts, shot.ts, robot/engine.ts; progress p 0..1 over the pin)

- Pin: 260 vh (200 vh on phones and portrait), scrub 0.5 s, PageDown/Space play it in 3.2 s.
- 0 .. 0.07 the copy fades; 0 .. 0.30 typing stops, the screen dims; 0 .. 0.75 the landscape dims to 55% and
  drifts up 12%; 0.20 .. 0.60 body, props, chair, table and dais dissolve from the floor up; 0.50 .. 0.60 the
  head lifts off (wide eyes, then ^ ^ 400 ms); 0.50 .. 1.00 it arcs to the dock and lands as the pin releases.
- The backdrop parts onto About's world over travel 0.809 .. 0.827 (`part`), About arrives from 0.883; the
  stage fades out over p 0.97 .. 1. Every value is a pure function of p: stopping holds, reversing replays.
- Dock: 112 / 96 / 72 px box (desktop / tablet / phone), the head 46% of it; eyes follow the pointer (or drift
  with the scroll on touch), blink, float 3 px / 4 s, ^ ^ on each new section; 30 fps while idle; only the head
  is drawn. Its canvas is aria-hidden and pointer-events none (the launcher button around it is the chat). No
  status dot or badge on it (checked: zero green pixels at 112 / 96 / 72 px, DPR 1 / 2 / 3).

## Loading and fallbacks

Poster first (AVIF/WebP per form factor, preloaded) with the pre-rendered copy and nav live over it (`heroBoot`,
vite.config.ts). The 3D chunks load lazily, shaders compile async, the first frame crossfades in. No WebGL,
reduced motion or a lost robot context: the poster and copy stay (the landscape's own context is restored).
The posters are the frozen frame itself (`?freeze=1`, phones and tablets `&tier=medium`) with the poster, copy,
header, launcher, grain and vignette hidden, at 400 x 866 @2x, 768 x 1024 @1.5x and 1440 x 900 @4/3x into
scripts/source/, then `npm run poster`. Recapture them whenever the baselines change: a stale poster makes the
robot jump at the crossfade (and is the whole hero without WebGL).

## Lock

- `?freeze=1` (src/hero/freeze.ts): every clock and agent held, Math.random seeded, tier pinned (`&tier=`, else
  HIGH). Harmless in production: it only stops motion.
- `npm run hero:baseline`: frozen frames at 390x844, 768x1024, 1440x900, 1920x1080 and the docked head at
  390x844 and 1440x900 against `scripts/baselines/hero/` (fails above 0.2% of pixels); `-- --update` rewrites.
- `npm run build && npm run hero:perf`: Lighthouse mobile (perf >= 90, LCP <= 2.5 s, CLS 0, TBT <= 200 ms,
  transfer <= 2.5 MB), then a frame-time smoke test (scripts/perf-lab.mjs) on a laptop and a phone profile (CPU
  4x): hero idle, pointer and the hand-off both ways at 55+ fps with p95 <= 20 ms or a steady 30 (28+, p95 <= 34),
  no frame over 50 ms, JS heap < 150 MB. Exit 1 on any miss.
- `npm run perf:build && npm run perf:lab -- --profiles phone-mid --scenarios idle,pointer --matrix`: the
  performance lab (frame-by-frame CPU and GPU time per WebGL context, per device profile and scenario; the
  kill-switch matrix with `?off=` one layer at a time, src/core/perfLab.ts). Production builds ignore the switches.
- First visits (no shader cache): every program the robot and its environment prefilter will draw with is built in
  the background and asked for its uniforms before the first frame (engine.ts compile chain, prefetchPrograms):
  diffing `renderer.info.programs` at that point against the list after the first seconds live (`window.__programsAhead`
  in the perf build) finds none compiled on first use on HIGH, MEDIUM or LOW.
- Open exception (2026-10-12): the perf guard does not pass. Lighthouse mobile is ~65 on a warmed browser (the
  build before the Oct fix pass: ~67); FCP 2.4 s, LCP 2.9 s, TBT ~1.4-1.7 s, transfer 1.1 MB. The blocking time is
  the procedural robot's build (~0.6 s + ~0.45 s tasks at 4x); it needs a baked GLB or a worker build. A cold
  headless Chrome's first run can stall on GPU warm-up and score ~40: warm the browser before measuring.

## File map

| File | Role |
|---|---|
| src/dom/sections/Hero.tsx | entry: containers, poster, mounts the stage and the engine, the tier watch |
| src/dom/HeroCopy.tsx, src/hero/hero.css | the copy and its scrim; hero layout and tokens |
| src/hero/introCopy.ts, introFx.ts | the copy's markup (shared by index.html and the app); its entrance |
| src/dom/Hud.tsx, src/styles/global.css (.hud, .nav-pill) | header, nav pill, MENU |
| src/hero/transition.ts, config.ts, shot.ts | the scrubbed hand-off |
| src/hero/motion.ts, tier.ts, freeze.ts | clock and ENERGY, tiers, the frozen frame |
| src/hero/robot/engine.ts | robot renderer: lights, layout, gaze, dissolve, dock, governor |
| src/hero/robot/model.ts, body.ts, props.ts, furniture.ts, shape.ts, dots.ts, face.ts | the procedural robot, props, LED face |
| src/hero/robot/perform.ts, beat.ts | typing, eye states, reactions; the 96 BPM clock |
| src/hero/robot/stage.ts, terrain.ts, robot.css | beam pulse and floor wash; the loss landscape and agent |
| src/hero/robot/dom.ts, bridge.ts, still.ts | shared layout and cues; the dock link to the chat; no-WebGL stand-in |
| public/hero/poster-*, scripts/prepare-poster.mjs | the poster (`npm run poster`) |
| scripts/hero-baseline.mjs, scripts/hero-perf.mjs | the lock checks |
