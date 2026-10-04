# Lattice: portfolio of Vinayak K V

A single, continuous camera flight in five acts, from a night sky above the clouds down into a crystalline inner space:

| Act | Section | What happens |
|---|---|---|
| I · Night | Hero | The night-island photograph (`public/hero/`) full bleed, drawn through a small WebGL shader (`src/dom/HeroSky.tsx`): a flow map drifts the clouds left to right while a mask keeps the island, figure and moon still, stars twinkle in the dark sky, the moon halo breathes and leaves blow past. Over it, a hairline meta strip (role, location, live local time, availability), the name set edge to edge, the intro and two actions. The sheet holds while a rule fills, then scrolls away as the camera pushes into About. |
| II · Self | About | The portrait is rebuilt from tens of thousands of instanced GPU crystals. A scan beam sweeps down (scroll-scrubbed and reversible); crystals fly in on curl-noise paths and lock into the photo; a second pass adds a depth shimmer. The bio reveals line by line as the beam passes. Photo / Spectral (violet duotone) toggle. |
| III · Work | Works | Five floating glass exhibits, each running a live generative shader of what the system does (retrieval, vision, pipeline DAG, agents, recommender). Hover: ripple + RGB split. Click: the screen grows into a full case study (shared-element FLIP, live media canvas). |
| IV · Path | Experience | The camera rides a beam of light; each role's waypoint ignites as it passes. Leaving a role, its card's own letters shatter into crystal shards (sampled from the live text) and the camera flies through the debris. Scroll-scrubbed and reversible. |
| V · Seed | Contact | The last crystal follows the cursor on a spring and settles when idle. Magnetic copy-to-clipboard email. |

## Run

```bash
npm install
npm run dev        # http://localhost:5199
npm run build      # type-check + production build into dist/
npm run preview
```

Requires Node 20+. QA switches: `?static` forces the no-WebGL / reduced-motion layout. In dev only, `?nosky` and `?nopost` disable the sky and post stack, and `window.__lattice.gpu(40)` reports real GPU time per frame (timer queries, not vsync-bound).

> **OneDrive note.** This folder lives in OneDrive, which turns `node_modules` files into reparse points that Vite 8's Rolldown resolver cannot follow. `vite.config.ts` sets `resolve.preserveSymlinks: true` to work around it. Keeping the repo outside OneDrive (or excluding `node_modules` from sync) is still the better long-term fix.

## Swap your photo

1. Replace `public/about.jpg` with your photo (jpg / png / webp; a plain light or dark backdrop works best). The current photo came from `src/profile/`; its untouched original is `public/about.original.png`.
2. Run `npm run portrait`. It writes `public/portrait/about.cutout.png` (used by the particle scan) and `about.cutout.webp` (static fallback). The original file is never modified.
3. If your photo has a busy background, cut it out with any tool and save it directly as `public/portrait/about.cutout.png` (+ `.webp`); skip step 2.

The particle sampler fades the bottom 30% of the cutout into dust, so a chest-up crop reads best. Particle counts per tier are in `src/core/quality.ts`.

## Swap content

Everything on the page is in `src/content.ts`: name, role, location and timezone, intro, bio, facts, projects (title, tagline, stack, case study, outcomes, optional `media`), roles, email and socials. Layouts measure text at runtime (the bio is split into real rendered lines, the hero name is fitted to the width), so lengths can change freely. To swap the hero photo, replace the files in `public/hero/` and update `MOON` and the still-region ellipses in `src/dom/HeroSky.tsx`.

- **Project media:** set `media: { src: '/works/atlas.mp4', poster: '/works/atlas.webp' }` to show a video or image in the case study instead of the live shader. Encode video as H.264 MP4 (`ffmpeg -i in.mov -c:v libx264 -crf 23 -preset slow -an -movflags +faststart out.mp4`) with a WebP poster.
- **Visual per project:** `visual: 'rag' | 'vision' | 'pipeline' | 'agents' | 'recsys'` picks the exhibit shader.
- **Section order / lengths:** scroll lengths live in `sectionHeights` in `src/theme.ts`.

## Swap colours

The palette is three colours. Change them in two places:

- `src/theme.ts` → `palette` (feeds every shader through `src/gl/world.ts`)
- `src/styles/global.css` → `--base`, `--ink`, `--accent` (and the rgba tints below them, which reuse the same values)

## How it is built

- **Stack:** Vite + React + TypeScript, Three.js via React Three Fiber + Drei, `@react-three/postprocessing`, GSAP (ScrollTrigger, SplitText), Lenis, Zustand, custom GLSL via `vite-plugin-glsl`, Tailwind for layout only (its colour, font and shadow defaults are removed).
- **One clock.** The GSAP ticker is the only animation loop. Lenis, ScrollTrigger, the R3F frame (`frameloop="never"` + `advance()`), the overlay's live canvas and every DOM tween step from it (`src/core/clock.ts`).
- **One scroll number.** Each section is a tall track with a sticky stage. Its ScrollTrigger progress feeds both its DOM timeline and the global camera parameter `t = section index + progress`; `src/gl/cameraPath.ts` maps `t` to an authored camera pose and blends each hand-off. Shared, three-free timeline math lives in `src/core/timeline.ts`.
- **Shaders** (`src/gl/shaders`): night dome (moon with limb darkening and maria, sparse stars, a rare shooting star), lit cumulus and mist impostors (drifting, wrapped, back-to-front sorted, silver linings toward the moon), instanced grass blades (bent along a curve by travelling gusts, hand-shaded with backlit translucency, the laptop's light and soft analytic shadows from the figure), wind-borne leaves with a cheap depth of field, portrait crystals (all motion on the GPU; the CPU writes a handful of uniforms), scan beam, exhibit screens, experience card shards, glass frames, experience beam, solid crystals, volumetric sky, depth dust, a screen-space moon light-scattering pass (half resolution, only while the night act is on screen) and a custom monochrome film-grain + vignette pass.
- **Performance:** tiers chosen from GPU name / cores / memory (integrated GPUs get the mid tier), adaptive DPR via `PerformanceMonitor` (drops when FPS < 50), MSAA only on the high tier, async shader compilation during the loader, acts outside their slice of the timeline are hidden, rendering pauses while the case study covers the canvas and when the tab is hidden. The main bundle has no three.js; the 3D stage and three.js load lazily. Lite mode (bottom-right) forces the low tier and remembers the choice.
- **Accessibility:** semantic sections with real headings under the canvas, skip link, keyboard-reachable navigation and project list, focus-trapped case-study dialog (Esc closes, focus returns), visible focus rings, `aria-live` on changing content. `prefers-reduced-motion` and missing WebGL both get a static layout with the crisp cutout portrait and a soft glow, no smooth scroll and no camera flight.

## Assets and licences

No stock imagery, templates, models or textures are used. Every visual is generated in code, except your portrait.

| Asset | Source | Licence |
|---|---|---|
| Portrait (`src/profile/*`, `public/about.jpg`, `public/about.original.png`, `public/portrait/*`) | Provided by the site owner | Owner's own image, all rights reserved |
| Bricolage Grotesque (latin subset, WOFF2 via `@fontsource/bricolage-grotesque`; WOFF copy in `public/fonts` for the 3D exhibit numbers) | Mathieu Triay / Google Fonts | SIL Open Font License 1.1 (`public/fonts/OFL-BricolageGrotesque.txt`) |
| JetBrains Mono (latin subset, via `@fontsource/jetbrains-mono`) | JetBrains | SIL Open Font License 1.1 (`public/fonts/OFL-JetBrainsMono.txt`) |
| 3D simplex noise (`src/gl/shaders/common/noise.glsl`) | Ian McEwan, Stefan Gustavson (Ashima Arts) | MIT |
| Night sky, moon, clouds, mist, island rock, roots, grass, leaves, figure, laptop, noise texture, crystals, exhibit visuals, dust, favicon | Generated in this repo (procedural geometry and shaders) | Same as this repo |

The hero's composition, framing and lighting follow a reference image shared by the owner (composition and mood only). No pixels, models or code from it are used; the island scene is built entirely from code.

Background removal is a deterministic colour-key flood fill in `scripts/prepare-portrait.mjs` (uses `sharp`, Apache-2.0); no ML model or model licence is involved.

Libraries (all installed from npm): three (MIT), @react-three/fiber, @react-three/drei and @react-three/postprocessing (MIT), postprocessing (Zlib), troika-three-text via drei (MIT), GSAP incl. ScrollTrigger and SplitText (GSAP Standard "no charge" licence), Lenis (MIT), Zustand (MIT), React (MIT), Tailwind CSS (MIT), vite-plugin-glsl (MIT), sharp (Apache-2.0).

If you later add GLB models or large textures, compress them before committing:

```bash
npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress ktx2
```

## Project map

```
src/
  content.ts            all copy
  theme.ts              palette, easing, section lengths, layout numbers (no three.js)
  core/                 clock, scroll (Lenis), pointer, quality tiers, loader registry, timeline math
  store/useStore.ts     React state + high-frequency signals (no re-renders)
  dom/                  loader, cursor, HUD, sections, case study, live media canvas
  gl/                   Stage, camera rig/path, atmosphere, post, one folder per act
  gl/shaders/           GLSL
scripts/prepare-portrait.mjs
```
