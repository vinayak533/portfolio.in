# Lattice: portfolio of Vinayak K V

A single, continuous camera flight in five acts, from a robot at its desk down into a diamond inner space:

| Act | Section | What happens |
|---|---|---|
| I · Robot | Hero | An interactive 3D robot (`src/hero/robot/`) seated at its desk, coding on its laptop on a stage made of light dots; its head and eyes follow the pointer. In the bottom-left corner: the name, a one-line pitch and the ways in (`src/dom/HeroCopy.tsx`). The first scroll (`src/hero/transition.ts`) closes on the robot's head as its body dissolves, then the head flies into the bottom-right corner and becomes the chat launcher. Without WebGL it is a still render (`public/hero/robot-still.webp`). |
| II · Self | About | The portrait is rebuilt from tens of thousands of instanced GPU crystals. A scan beam sweeps down (scroll-scrubbed and reversible); crystals fly in on curl-noise paths and lock into the photo; a second pass adds a depth shimmer. The bio reveals line by line as the beam passes. Photo / Spectral (violet duotone) toggle. |
| III · Work | Works | Five floating glass exhibits, each playing its project reel (a live generative shader stands in until the poster loads, and for projects without media). Hover: ripple + RGB split. Click: the screen grows into a full case study (shared-element FLIP); the reel continues from the same frame, then crossfades to HD. |
| IV · Path | Experience | The camera rides a beam of light; each role's waypoint ignites as it passes. Leaving a role, its card's own letters shatter into crystal shards (sampled from the live text) and the camera flies through the debris. Scroll-scrubbed and reversible. |
| V · Signal | Contact | The closing frame. The section slides in *under* Experience's hand-off: the 3D world lifts and dims, a near-black stage with film grain settles beneath it, then the label, the headline (line by line through clip masks), copy, email, links and metadata arrive in sequence. A generative field (`src/dom/contact/abyss.ts`) resolves out of the dark: nested shells of nodes wired to their nearest neighbours, links between layers that reorganise now and then, sparse signals travelling outward. It leans toward the pointer with spring inertia under a low violet light; the headline's letters shift a pixel or two over a light that passes beneath them. The email is a `mailto:` link, with GitHub, LinkedIn and (once present) the résumé beneath it and the contact form beside them. |

## Run

```bash
npm install
npm run dev        # http://localhost:5199
npm run build      # type-check + production build into dist/
npm run preview
```

Requires Node 20+. QA switches: `?static` forces the no-WebGL / reduced-motion layout. In dev only, `?nosky` and `?nopost` disable the sky and post stack, and `window.__lattice.gpu(40)` reports real GPU time per frame (timer queries, not vsync-bound).

## Contact form

The form in Contact posts to `POST /api/contact`. `server/contact.ts` validates it (the same rules as the browser, from `src/core/contact.ts`), checks a honeypot field and a minimum fill time, rate-limits each IP to 5 messages per 10 minutes, and sends the message through [Resend](https://resend.com). The visitor's address is set as **Reply-To**, never as the sender. The page shows "sent" only after Resend returns a message id; any failure shows an error and keeps the text so the visitor can retry.

- **Production (Vercel):** `api/contact.ts` is the Vercel Function. In Vercel → Project → Settings → Environment Variables, set `RESEND_API_KEY` (and optionally `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`; see `.env.example`), then redeploy.
- **Local:** copy `.env.example` to `.env.local` and fill in the key. `npm run dev` serves the same handler at `/api/contact`. `npm run preview` does not, so use `npx vercel dev` to test a production build with the API.
- **Recipient:** with no `CONTACT_TO_EMAIL`, messages go to the address the site shows (`contact.email` in `src/content.ts`).
- **Sender:** with no `CONTACT_FROM_EMAIL`, mail is sent from `onboarding@resend.dev`. Resend only delivers that sender to the address the Resend account was registered with, so that must be the recipient above. To send from your own address, verify a domain in Resend (DNS records) and set `CONTACT_FROM_EMAIL=Portfolio <contact@yourdomain.com>`.
- **Tests:** `npm run test:contact` runs the handler against a stubbed Resend (no network, no key needed). `npm run test:content` checks that the email and links agree everywhere (`src/content.ts`, `index.html`'s `<noscript>`, the server).
- The rate limit lives in memory, so it is per warm function instance and resets on cold starts. For stricter limits, back it with Vercel KV / Upstash.

> **OneDrive note.** This folder lives in OneDrive, which turns `node_modules` files into reparse points that Vite 8's Rolldown resolver cannot follow. `vite.config.ts` sets `resolve.preserveSymlinks: true` to work around it. Keeping the repo outside OneDrive (or excluding `node_modules` from sync) is still the better long-term fix.

## Swap your photo

1. Replace `public/about.jpg` with your photo (jpg / png / webp; a plain light or dark backdrop works best).
2. Run `npm run portrait`. It writes `public/portrait/about.cutout.png` (used by the particle scan) and `about.cutout.webp` (static fallback). The original file is never modified.
3. If your photo has a busy background, cut it out with any tool and save it directly as `public/portrait/about.cutout.png` (+ `.webp`); skip step 2.

The particle sampler fades the bottom 30% of the cutout into dust, so a chest-up crop reads best. Particle counts per tier are in `src/core/quality.ts`.

## Swap content

Everything on the page is in `src/content.ts`: name, role, location and timezone, intro, availability, bio, facts, projects (title, tagline, stack, case study, outcomes, optional `media`), roles, and the contact details (email, GitHub, LinkedIn, résumé path), which the hero, the mobile menu, Contact, the form's fallback and the server's default inbox all read. `index.html`'s `<noscript>` repeats them by hand; `npm run test:content` fails if it drifts. Layouts measure text at runtime (the bio is split into real rendered lines), so lengths can change freely.

- **Résumé:** drop the PDF at `public/resume.pdf`. The hero, the mobile menu and Contact link it only once it is actually served (a HEAD request in `src/dom/useResumeUrl.ts`), so nothing points at a missing file.
- **Social card:** `npm run social` writes `public/og.jpg` (1200×630, name and role over `scripts/source/night.webp`) and `public/apple-touch-icon.png`. Set `SITE_URL` at build time (or deploy on Vercel) so `og:image`, `og:url` and the canonical link are absolute.

- **Project reels:** drop the master video in `src/project-videos/` (git-ignored), map it to an id in `MASTERS` in `scripts/prepare-videos.mjs`, set `media: reel('<id>', <poster second>)` on the project, and run `npm run videos` (needs ffmpeg on PATH, or `FFMPEG=path`). It writes `public/works/<id>-1080.mp4` (case study, and the exhibit on discrete GPUs), `<id>-720.mp4` (exhibit on integrated GPUs and phones) and `<id>.webp` (poster, the frame where playback starts). Playback lives in `src/core/reels.ts`: nothing loads until Works is near, only the centred exhibit plays, Save-Data shows posters only, and reduced motion gets a paused HD video with controls. An image also works: `media: { src: '/works/x.webp' }`.
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
- **Shaders** (`src/gl/shaders`): portrait crystals (all motion on the GPU; the CPU writes a handful of uniforms), scan beam, exhibit screens, experience card shards, glass frames, experience beam, solid crystals, volumetric sky, depth dust and a custom monochrome film-grain + vignette pass.
- **Performance:** tiers chosen from GPU name / cores / memory (integrated GPUs get the mid tier), adaptive DPR via `PerformanceMonitor` (drops when FPS < 50), MSAA only on the high tier, async shader compilation during the loader, acts outside their slice of the timeline are hidden, rendering pauses while the case study covers the canvas and when the tab is hidden. The main bundle has no three.js; the 3D stage and three.js load lazily. Lite mode switches itself on (reduced motion, 4 cores or 4 GB of memory or less, or under 40 fps for 3 s after load; src/core/autoLite.ts) and forces the low tier; there is no switch.
- **Accessibility:** semantic sections with real headings under the canvas, skip link, keyboard-reachable navigation (a Menu button below 768 px), every project listed for screen readers even when only the centred exhibit is drawn, focus-trapped case-study dialog (Esc closes, focus returns), visible focus rings, `aria-live` on changing content. `prefers-reduced-motion` and missing WebGL both get a static layout with the crisp cutout portrait and a soft glow, no smooth scroll and no camera flight.

## Assets and licences

No templates or 3D models are used. Two raster images are supplied by the owner: the portrait and the photograph behind the social card. Everything else is generated in code.

| Asset | Source | Licence |
|---|---|---|
| Portrait (`public/about.jpg`, `public/portrait/*`) | Provided by the site owner | Owner's own image, all rights reserved |
| Bricolage Grotesque (latin subset, WOFF2 via `@fontsource/bricolage-grotesque`; WOFF copy in `public/fonts` for the 3D exhibit numbers) | Mathieu Triay / Google Fonts | SIL Open Font License 1.1 (`public/fonts/OFL-BricolageGrotesque.txt`) |
| JetBrains Mono (latin subset, via `@fontsource/jetbrains-mono`) | JetBrains | SIL Open Font License 1.1 (`public/fonts/OFL-JetBrainsMono.txt`) |
| Inter (variable, optical sizes, via `@fontsource-variable/inter`; Contact only, loaded when the section is near) | Rasmus Andersson | SIL Open Font License 1.1 (`public/fonts/OFL-Inter.txt`) |
| Social-card photograph (`scripts/source/night.webp`, and `public/og.jpg` made from it) | Provided by the site owner | **Owner to record the source and licence here** |
| The hero robot and its stage, noise texture, crystals, exhibit visuals, dust, favicon | Generated in this repo (procedural geometry and shaders) | Same as this repo |

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
  hero/                 the 3D robot, its stage and the hero -> About transition
scripts/               asset preparation (portrait, social card, reels) and tests
```
