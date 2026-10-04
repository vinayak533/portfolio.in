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
  debug.ts          lil-gui panel, moon split view, video corner handles; only with ?debug
  video.ts          the laptop screen's video (hidden <video> -> texture, autoplay unlock, colour sampling)
  hero.css          scoped styles (.hero-cinematic)
  shaders/
    common.glsl     hash, tiled value noise, fbm, domain-warped cloud field
    fullscreen.vert
    scene.frag      layers: sky drift, veil, stars, moon, light grading, grass, laptop
    rays.frag       half-res god rays
    blur.frag       quarter-res bloom
    final.frag      CA, vignette, tone shoulder, grain, fade
    particles.vert/.frag
```

## Pipeline per frame

1. **Scene** (capped at 1.8 MP with the base photo, 5 MP once 4K / 8K has streamed in): the photo, decomposed by the masks and
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
3. The engine shows the base photo first, then streams the tier the device
   deserves (`perf.hiRes`: phones / Lite 2k, desktops 4k, large or retina
   screens >= `perf.bigScreen` device px 8k; KTX2, then AVIF, then WebP) and
   crossfades to it over `perf.swapSeconds`: no pop. A plain resample adds no
   detail, so it is not worth shipping.

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

Scene pass capped by `perf.maxScenePixels(Hi)`, DPR <= 2, rays at 1/2, bloom
at 1/4. With `perf.adaptive` the scene resolution steps down 20% at a time
(to `minScale`) while frames run over `targetMs`, and back up after a long
stretch of headroom; if a step does not help (a throttled display, not the
GPU) it is undone and adaptation stops. `?debug` > Info shows frame ms and the
current quality.

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
Progress 0..1 drives everything, so scrolling back replays it:

| Progress | Phase | What happens |
|---|---|---|
| 0 to `hold` | Hold | Idle hero; the screen glow pulses a little harder |
| to `dive` | Dive | Shader zoom to `maxZoom` toward `target`; each depth layer zooms by its own power (sky barely, near rock fastest); half-res radial motion blur + DOF; vignette tightens, rays fade |
| to `portal` | Portal | The screen opens from its centre in its own perspective, then grows to the viewport; the canvas is transparent there, so About's world shows through, settling from `settleScale` to 1 |
| to 1 | Arrive | The stage fades out, the render loop stops at `renderUntil`, the pin releases onto About |

Tune with `?debug` > **J. Scroll transition**: tick *freeze frame* and drag
*progress* to inspect any frame. `zoom target` is image uv with y down (the
laptop screen is at 0.516, 0.412). The portal shape is the four screen corners
in source px (`transition.portal.corners`).

Reduced motion (and `?static`) skips the dive: a 400 ms crossfade instead.
