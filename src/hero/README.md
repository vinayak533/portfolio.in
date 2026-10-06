# Cinematic hero

A framework-free WebGL engine (three.js, one fullscreen plane, custom GLSL)
that brings `src/assets/hero.jpg` to life. `src/dom/sections/Hero.tsx` only
mounts it.

```
src/hero/
  index.ts          public entry (mountHero, heroConfig)
  config.ts         every tunable, in one object
  engine.ts         renderer, passes, loop, visibility / reduced-motion handling
  maps.ts           loads your maps, or builds temporary ones from the photo
  noise.ts          CPU twin of the shader noise (moon cloud density)
  input.ts          mouse + gyroscope parallax
  shot.ts           the hero -> About camera move as a pure function of scroll progress
  debug.ts          lil-gui panel, moon split view, video corner handles; only with ?debug
  video.ts          the laptop screen's video (hidden <video> -> texture, autoplay unlock, colour sampling)
  hero.css          scoped styles (.hero-cinematic)
  shaders/
    common.glsl     hash, tiled value noise, fbm, domain-warped cloud field
    fullscreen.vert
    scene.frag      layers: sky drift, veil, stars, moon, light grading, grass, laptop
    rays.frag       half-res god rays
    blur.frag       quarter-res bloom
    clouds.frag     the transition's atmosphere: a cloud volume composited against the photo's depth (half res)
    final.frag      CA, vignette, tone shoulder, grain, fade, clouds over all
    particles.vert/.frag
```

## Pipeline per frame

1. **Scene** (capped at 1.8 MP with the base photo, 8.4 MP on the high tier once the sharp photo has streamed in): the photo, decomposed by the masks and
   animated. Output is linear HDR; alpha = sky transmittance.
2. **Particles** drawn into the same target (dust and fireflies additive, leaves occlude).
3. **God rays** at 1/2 res: radial gather toward the moon, weighted by transmittance.
4. **Bloom** at 1/4 res: separable gaussian of the moon and screen.
5. **Final** at full DPR (max 2): aberration, vignette, tone shoulder, sRGB, grain, fade.

## The moon

The moon is a **lit sphere** rendered in scene.frag (`moonFace()`), not a
picture: a seamless equirectangular colour map and normal map
(`src/assets/moon/`) wrapped on a sphere, turned by `moon.rotation`, lit by one
sun from `moon.lightAngle` at `moon.phase` with a Lunar-Lambert model
(`limbDarkening`), a soft terminator (`terminator`), earthshine on the night
side, then graded pale warm silver (`kelvin`, pulled toward the photo's cloud
highlights by `sceneMatch`, times `tint`). Texture gradients are analytic, so
mipmaps and anisotropic filtering never jump at the limb or the longitude seam:
no lines. The limb is feathered (`feather`, render px), followed by a thin
scatter ring and a wide halo whose colour comes from the sky behind it
(`halo.skyColor`). It sits behind every cloud: the photographed ones
(`moon-matte.png`) and the drifting wisps; cloud density over it (the same
moving field, read on the CPU) dims, softens and warms it, a clear gap lets it
flare back, and it breathes at `breathHz`.

### Moon maps: NASA CGI Moon Kit (public domain)

From <https://svs.gsfc.nasa.gov/4720> (files under
`https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/`), download into
**`scripts/source/moon/`** (build inputs only; they never ship):

| File | What | Size |
|---|---|---|
| `lroc_color_poles_4k.tif` (or `_8k.tif`) | LROC WAC colour, 4096 x 2048 (8192 x 4096) | tens of MB |
| `ldem_16_uint.tif` | LOLA elevation, 16 px/deg (5760 x 2880), uint16 half-metres above 1727.4 km | ~33 MB |

Then run `node scripts/prepare-moon.mjs` (add `--size 4096` for 4K maps). It
downsamples them (Lanczos) into `src/assets/moon/albedo.png` (lossless PNG),
`normal.png` (normals from the elevation, half size), `reference.png` (the
flat-lit near side for the `?debug` split view) and `meta.json`. Until then a
procedural stand-in built from real selenography is used (`?debug` > Info >
moon maps says which). Credit: *NASA's Scientific Visualization Studio*.

2048 maps are the default because the moon covers at most ~240 device px and
only half the map is ever visible: 2048 is already ~4x oversampled; bigger maps
only cost memory.

### The clean plate

`npm run hero` (`scripts/prepare-hero.mjs`, run after `prepare-moon.mjs`)
removes the photographed moon from `public/hero/night.original.webp` into
`src/assets/hero.jpg`: its glow is measured ring by ring and subtracted (never
below the measured sky floor), the moonlit pixels of the old disk and the
leftover glow ring around it are replaced by a sky model fitted to the clear sky
around it, made seamless by Poisson blending, with the sky's own grain copied
in by PatchMatch. The cumulus that crossed in front of the old moon is kept and
becomes the new moon's silver lining. It then writes `moon-matte.png` (cloud in
front of the NEW moon, read off the finished plate, out to 3 radii) and the
stills `public/hero/night-*.{jpg,webp}` with the sphere moon composited in.
It reads `moon.pos` / `moon.radius` from `config.ts`: **after moving the moon,
rerun it.** `src/hero/tools/out/moon-inpaint-mask.png` is the replaced region,
if you would rather inpaint by hand.

## 8K-looking image

Real 8K cannot come from a 1672 px photo; the engine delivers the look
(analytic moon, micro-detail, clarity, CAS sharpening, grain as dither, bloom,
tone roll-off) and streams sharper tiers when you supply them:

1. Upscale `public/hero/night.original.webp` to **7680 px wide** (keep the 16:9
   framing): Topaz Gigapixel (*Standard* or *High fidelity*, 4.6x, face
   recovery off) or Real-ESRGAN
   (`realesrgan-ncnn-vulkan -i night.original.webp -o up.png -n realesrgan-x4plus -s 4`,
   then resize to 7680 x 4322 with Lanczos). Clean any halos or smeared
   grass in Photoshop; a source with the moon removed is fine too.
2. `npm run hero -- path/to/up.png` writes `src/assets/hero-hi/{2k,4k,8k}.{avif,webp}`
   (clean plates). With KTX-Software's `toktx` on PATH it also writes
   `8k.ktx2` (UASTC + zstd, mipmapped, about a quarter of the GPU memory) and
   copies the Basis transcoder to `public/hero/basis/`.
3. The engine downloads the selected tier alongside the base maps. Selection
   includes the viewport's cover crop, DPR, closest visible zoom and near-layer
   magnification (`resolution.ts`). A normal Full HD desktop push selects 8K;
   phones / Lite cap at 4K. GPU texture limits are checked before downloading.
   Formats fall back from KTX2 to AVIF to WebP, then to smaller supported tiers.
   The base is replaced over `perf.swapSeconds`; resizing can request a larger
   tier. Failed upgrades retain the working photo.

The supplied 8K files are **7680 x 4322**, preserving the original 1672:941
framing without cropping to 4320. Pixel dimensions alone do not establish
native 8K detail: the original source is 1672 x 941. The existing artwork is
retained unchanged; a genuinely detailed replacement master is required to
recover more source detail. Neither sharpening nor larger render targets can
reconstruct missing information or guarantee lossless zoom on every display.

The default camera push uses no motion blur or depth-of-field blur. Photo
sampling uses explicit camera gradients so mip selection remains stable inside
sky/grass mask branches. Film chromatic separation is limited to half an output
pixel. Camera framing, zoom path, colors, and cloud choreography are unchanged.

## Sky motion

Clouds drift right to left in three depth layers split by the depth map
(`sky.split`): far (high sky, the moon's clouds), mid (horizon banks), near
(cloud sea), each with its own travel (`advect`), warp drift, roll
(`displace`) and morph (`billow`). The flow amount comes from very wide masks,
so the photo never stretches into ripples at a cloud edge, the cliff or the
figure. Rims facing the moon catch its light (`sky.rim`), bellies low in the
frame catch a warm under-light; both shimmer with the moving field. Stars
twinkle, a rare shooting star crosses the dark upper sky (`stars.meteor`;
`?debug` > G > *Shooting star now*), grass and leaves follow the same wind.
`prefers-reduced-motion` freezes all of it except the moon's glow.

## Performance

Scene pass capped by `perf.maxScenePixels(Hi)`, DPR <= 2 (1.5 in Lite).
With the sharp photo loaded, high / integrated / Lite budgets are 8.4 / 4.2 /
2.1 MP. Adaptive resolution preserves at least one scene sample per CSS pixel
where that fits within the device budget. High-DPR or larger displays may still
require downsampling; quality and frame rate depend on the GPU.

Rays and transition clouds start at half scene resolution, bloom at quarter;
these soft effects scale further with adaptive quality, independently of the
scene's detail floor. Shader warm-up includes the cloud pass before scrolling.
While the photo covers the viewport, the fixed WebGL stage behind it is not
rendered. Adaptation lowers quality during sustained slow frames and restores
it with headroom; an ineffective reduction is undone. `?debug` > Info shows
the photo tier, scene resolution, frame time and current quality.

Run `npm run test:hero` (Node 22.18+ or 24+) for zoom/crop tier selection,
GPU fallback, resolution floors and asset-dimension checks. Run `npm run build`
for TypeScript and bundling. Visual QA should cover the opening frame, slow
and fast scrolling in both directions, the closest visible push, portrait
layout, resize, and Lite mode. Build checks do not measure GPU frame rate.

## The screen video

Drop the video at **`public/video/screen.mp4`** (H.264, full resolution;
optionally `screen.webm` too). It must be a file: no YouTube / Vimeo / Drive
embeds. Without one, the screen keeps its art. It plays muted and looped from
page load, in real time (never scrubbed); pauses and leaves the GPU once About
has taken over, resumes when you scroll back; pauses when the tab is hidden.
If autoplay is blocked, the first frame shows and playback starts on the first
scroll, touch or key press.

It is warped onto the screen from `video.corners` (image uv, TL TR BR BL),
cover-fitted to `video.screenAspect` and masked to the panel. Align the
corners with `?debug` > K. Screen video: drag the four handles (freeze the
scroll transition mid-dive for precision); releasing one prints the corners
to the console (and the clipboard) to paste into `config.ts`. `emissive`,
`bloom` and `spill` set how bright it reads, how much it glows, and how much
of its (average) colour falls on the hands, face and grass.

## Maps you should supply

Put them in **`src/assets/hero-maps/`** with exactly these names. They are
picked up automatically at build time; anything missing falls back to a
temporary map (the `?debug` panel's Info > maps line shows which are in use).
Same aspect as the photo (16:9 at 1672 x 941). Any resolution works; 1672 px
wide or larger is ideal. Grayscale PNG; only the red channel is read.

| File | White means | Notes |
|---|---|---|
| `sky-mask.png` | sky and every cloud (including the cloud sea and the mist under the island) | Black = island rock, grass, the figure, the floating rock, hanging debris. Leave grass wisps black. Feather 2 to 4 px. |
| `depth.png` | near | Far sky black, horizon dark grey, island mid grey, bottom-corner clouds near white. Smooth; no hard steps. |
| `grass-mask.png` | grass | Only the grass on the island top and the strands hanging over its front edge. Black on the figure and laptop. |
| `protect-mask.png` *(optional)* | never warp | The figure and laptop with about 8 px padding. Without it, an ellipse from `config.scene.person` is used. |

### How to make them

**Depth (Depth Anything V2)**: already generated. `src/assets/hero-maps/depth.png`
was made by `src/hero/tools/make-depth.py` (setup steps in its header). Re-run
it whenever `hero.jpg` changes, then copy the `personDepth` it prints into
`config.ts`. To make one by hand instead:

1. Open the Depth Anything V2 demo on Hugging Face
   (`depth-anything/Depth-Anything-V2`), or run it locally:
   `pip install transformers torch pillow`, then
   `pipeline("depth-estimation", model="depth-anything/Depth-Anything-V2-Large-hf")`.
2. Feed it `src/assets/hero.jpg` and save the grayscale output. It already
   uses white = near.
3. In Photoshop: Image > Adjustments > Levels so the sky is near black and
   the bottom clouds near white. Gaussian blur 2 to 4 px. Paint the figure
   one flat grey matching the grass around them (they should move as one
   piece). Export as `depth.png`.

**Sky mask (Photoshop)**

1. Select > Subject (or Object Selection on the island) gives you the island
   and figure. Add the small floating rock and the hanging debris on the left
   with the Quick Selection tool.
2. Select > Inverse, fill white on a black layer.
3. Hand-paint the edge: grass tips above the island top stay **black**
   (otherwise they would drift like cloud). The mist under the rock can be white.
4. Select and Mask > Feather 2 px. Export as `sky-mask.png`.

**Grass mask**

1. Select > Color Range on the greens of the grass (fuzziness about 60),
   intersected with the island top.
2. Paint the figure, the laptop and the rock face black. Soft brush 1 to 2 px.
   Export as `grass-mask.png`.

Check each one live with `?debug` > Info > view (sky mask / depth / grass mask / protect mask).

## Tuning

Open the site with `?debug` (for example `http://localhost:5199/?debug`).
Every slider edits `heroConfig` live; **Copy config** puts the JSON on the
clipboard (and logs it) so you can paste the values back into `config.ts`.
**Essentials** holds the ones to reach for first (drift per layer, billow, rim
light, moon response, god rays, twinkle, grain, bloom). **B. Moon > Compare
with reference** is a split view of the live moon against the flat-lit lunar
reference. In the console, `__hero.cfg` is the live config.

## Scroll transition (hero to About)

`transition.ts` owns one scrubbed ScrollTrigger over the hero track (a tall
section with a sticky stage; About starts exactly where the pin releases).
Progress 0..1 drives everything through `shot.ts`, a pure function of
progress shared by the engine and the DOM, so scrolling back replays it and
nothing keeps moving once the scroll settles. It is shot as one camera move,
with no cuts:

| Beat | What happens |
|---|---|
| Stillness | 0 to `hold`: the idle hero; the screen glow pulses a little harder |
| Movement | The camera eases out of rest (`move.easeIn`): no lurch |
| Push | It travels toward the figure; each depth layer of the photo zooms by its own power (sky barely, near grass fastest), with a barely-there radial blur and depth of field |
| Depth | The air between camera and sky thickens: the far sky hazes first and the moon dims to a glow in the mist, while the island stays crisp in front of it; thin veils drift in from the depth and past the lens |
| Passage | The bank rolls over the back of the island, swallows the figure (the laptop's light diffuses in it, then fades behind the fog), and the camera flies into it; the photo is gone |
| Transformation | Inside, moonlight dies with depth and About's indigo glows through the bank's far side |
| Reveal | The camera leaves the bank; its last layers stream past onto About's world, and the camera settles (`move.settle`). About's page is held still in frame the whole time (lifted by exactly the distance it still sits below the fold), so it is discovered in place, never scrolled in; its kicker and heading rise in with the camera's settle |

**Why it reads as space, not an overlay.** `clouds.frag` knows how far away
the scene is along every pixel: the depth map, through the same dive the scene
pass draws, places the figure `atmosphere.scene.figure` units away and the sky
`scene.sky`. The atmosphere is a density profile along the view axis (the main
bank, thin leading veils, one trailing veil, in bank coordinates), integrated
analytically from the camera to that distance, so mist only covers what lies
behind it. The integral is split into depth slices fixed in the cloud world,
each a sheet of billows seen in perspective: far slices are fine texture,
near ones swell and stream past the frame edges, and the one being crossed
thins to nothing, because its opacity comes from the (continuous) integral.

Tune with `?debug` > **J. Scroll transition**: tick *freeze frame* and drag
*progress* to inspect any frame. `target` is image uv with y down (the figure's
back is near 0.50, 0.40); `frame` is where it lands on screen. **Timing** holds
the camera's ease-in and settle; **Atmosphere** the camera path through the
bank, the distances, density, light and colour.

Phones, tablets and Lite integrate fewer slices (`atmosphere.slicesLow`) and
push less (`mobile.zoom`). Reduced motion (and `?static`) skips the shot: a
400 ms crossfade instead.
