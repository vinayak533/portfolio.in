// The photograph, decomposed into layers and brought to life. Output is
// linear HDR colour; alpha carries sky transmittance for the god-ray pass.
//
// Depth order in the sky, back to front: the photographed sky and its clouds
// (drifting in three depth layers) -> fixed stars, a faint Milky Way and the
// odd shooting star -> the moon, a lit sphere behind every cloud -> its
// scatter ring and halo, born in the haze -> mid-altitude streaks ->
// foreground wisps that drift across the disk, lit from behind -> camera.
#include "./common.glsl"

#define PI 3.14159265359

uniform sampler2D uImage;     // sRGB, mipmapped (sampled as linear); the clean plate, no moon
uniform float uImgLod;        // log2(texture width / source width): fixed blurs stay in source px at any resolution
uniform sampler2D uImageHi;   // the sharper tier fading in over uImage (only while uImgMix > 0)
uniform float uImgLodHi;
uniform float uImgMix;        // 0 = uImage only .. 1 = uImageHi only
uniform sampler2D uSkyMask;   // 1 = sky / cloud
uniform sampler2D uDepth;     // 1 = near
uniform sampler2D uGrassMask; // 1 = grass
uniform sampler2D uProtect;   // 1 = never warp (figure + laptop)
uniform sampler2D uMoonMatte; // 1 = photographed cloud in front of the moon
uniform sampler2D uMoonAlbedo; // seamless equirect lunar colour, sRGB, mipmapped + anisotropic
uniform sampler2D uMoonNormal; // matching tangent-space normals (x east, y north)

uniform vec2 uRef;            // source px
uniform vec4 uCover;          // image uv = screen uv * xy + zw
uniform vec2 uParallax;       // image-uv shift per unit of (depth - focus)
uniform float uFocus;
uniform float uPersonDepth;
uniform float uTime;          // seconds, wrapped at uWrap
uniform float uWrap;
uniform float uMotion;        // 0 when reduced motion freezes the frame
uniform float uPxPerH;        // render-target px per image height

// A. three sky layers: far, mid, near
uniform vec4 uLayerF;         // freq, tile, warp, displace px
uniform vec4 uLayerM;
uniform vec4 uLayerN;
uniform vec3 uDrift;          // far, mid, near warp-field offsets (noise cells, wrapped)
uniform vec3 uEvo;            // far, mid, near shape morph (cells, wrapped)
uniform vec3 uSplit;          // far->mid depth, mid->near depth, blend
uniform vec4 uAdvect;         // far, mid, near px/s, cycle s
uniform vec3 uSea;            // cloud-sea shadow: threshold, softness, amount
uniform vec4 uRim;            // rim amount, reach (image heights), warm under-light, shimmer
uniform vec3 uUnderCol;       // colour of the under-light (luminance 1)
uniform vec2 uDetail;         // micro-detail amount, -

uniform vec4 uWispMid;        // scale, stretch, threshold, softness
uniform vec4 uWispNear;
uniform vec4 uWispDrift;      // mid.xy, near.zw (cells, wrapped)
uniform vec2 uWispEvo;        // mid, near
uniform vec4 uWispOpt;        // mid density, near density, mid parallax, near parallax
uniform vec3 uWispLight;      // backlight scattering, ambient, self-shadow

// B. the moon
uniform vec2 uMoonPos;        // image uv
uniform float uMoonRadius;    // image heights
uniform vec2 uMoonRot;        // cos, sin of the position angle
uniform vec3 uMoonSun;        // direction toward the sun, screen frame (x right, y up, z toward the viewer)
uniform vec4 uMoonShade;      // terminator softness, Lommel-Seeliger weight (1 - limb darkening), earthshine, relief
uniform vec3 uEarthCol;       // earthshine colour
uniform vec3 uMoonCol;        // face colour (luminance 1) * brightness * breath / mean albedo
uniform vec3 uMoonHue;        // the moon's colour at luminance 1 (scatter ring, halo)
uniform float uMapSat;        // how much of the map's own colour survives
uniform float uFeather;       // limb feather, render px
uniform vec2 uScatter;        // amount, width (moon radii)
uniform vec4 uHalo;           // amp, scale, amp, scale: two exponentials in limb distance (moon radii)
uniform vec3 uHaloOpt;        // haze response, occlusion by cloud in front, colour from the sky behind (0..1)
uniform float uHaloSoft;      // >= 1: thick cloud widens the halo
uniform float uMoonGlow;      // halo + ring strength: cloud response, breath, dive fade
uniform vec3 uMoonTint;       // the light the moon throws (cools when clear, warms under cloud)
uniform float uMoonI;         // light reaching the scene (dims under cloud)
uniform float uMoonDiskI;     // the moon's light on the haze and wisps
uniform float uWispTint;      // 0 the moon's light on the wisps .. 1 the halo colour
uniform float uKnee;          // final.frag's tone shoulder, inverted for the disk

uniform float uLightRel;
uniform float uSceneResp;
uniform float uRimGain;

uniform vec4 uGrass;          // amp px, freq Hz, gust, gust Hz
uniform vec2 uWindDir;

uniform vec4 uLaptop;         // centre uv, half size (image heights)
uniform float uLaptopPulse;
uniform float uLaptopPool;

uniform vec4 uDive;           // log(zoom), far exponent, near exponent, depth lod offset
uniform vec2 uDiveTarget;     // image uv the camera dives toward
uniform float uDiveIter;      // fixed-point steps that find the visible layer
uniform vec2 uScreenC;        // laptop screen centre, source px
uniform mat2 uScreenInv;      // source px offset -> screen frame unit coords
uniform vec2 uScreenLen;      // screen frame edge lengths, source px
uniform float uScreenR;       // screen corner radius, source px
uniform vec4 uScreenGlow;     // emissive colour, amount
uniform vec4 uVideoGlow;      // K. the screen video's average emission (linear HDR), amount: feeds the bloom
uniform vec4 uSpill;          // K. its light on the hands, face edge and grass: linear colour, amount

uniform vec4 uStars;          // twinkle, density, brightness, milky way
uniform vec4 uMeteor;         // head (image heights, x right y down), direction of travel (unit)
uniform vec2 uMeteorK;        // current tail length (image heights), intensity (0 = none)
uniform vec2 uGrade;          // sky colour grade amount, -
uniform float uExposure;
uniform float uView;          // debug: 0 final, 1 sky, 2 depth, 3 grass, 4 protect, 5 wisps, 6 light

varying vec2 vUv;

const float WISP_TILE = 32.0;

// ---- the photo, with the sharper tier crossfading in over the base (no pop)
vec3 photo(vec2 uv) {
  vec3 c = texture(uImage, uv).rgb;
  if (uImgMix > 0.0) c = mix(c, texture(uImageHi, uv).rgb, uImgMix);
  return c;
}
// `lod` in source px terms (0 = the 1672 px photo), at any texture resolution.
vec3 photoLod(vec2 uv, float lod) {
  vec3 c = textureLod(uImage, uv, lod + uImgLod).rgb;
  if (uImgMix > 0.0) c = mix(c, textureLod(uImageHi, uv, lod + uImgLodHi).rgb, uImgMix);
  return c;
}

// Dive depth near the figure: either the figure plane or the far sky, never between.
float figureDepth(float dm, float protect) {
  float fig = smoothstep(uPersonDepth - 0.12, uPersonDepth - 0.06, dm);
  return mix(dm, mix(min(dm, uPersonDepth - 0.16), uPersonDepth, fig), protect);
}

// Inverse of final.frag's shoulder(): the disk is given in display terms, so
// after the tone shoulder it lands on screen exactly as computed.
vec3 unshoulder(vec3 c, float knee) {
  float mm = min(max(max(c.r, c.g), c.b), 0.995);
  if (mm <= knee) return c;
  float k = smoothstep(0.9, 1.0, mm) * 0.35;
  vec3 o = max((c - mm * k) / (1.0 - k), 0.0);
  float m = knee - log(1.0 - (mm - knee) / (1.0 - knee)) * (1.0 - knee);
  return o * (m / mm);
}

// Display values roll off toward 0.97 above 0.72: the brightest rays never clip.
float rolloff(float v) { return v <= 0.72 ? v : 0.72 + 0.25 * (1.0 - exp(-(v - 0.72) / 0.25)); }

// Angular frequency quantised to the loop period so every oscillator wraps cleanly.
float ang(float hz) { return TAU * floor(hz * uWrap + 0.5) / uWrap; }

// One layer of stars: sparse cells, each with a point of light at a random
// spot, brightness from a steep power law (many faint, a few bright), colour
// from blue-white to warm white. Sized in render px so they stay points.
vec3 starLayer(vec2 p, float cells, float prob, float bright, float seed) {
  vec2 g = p * cells;
  vec2 cell = floor(g);
  float h = hash12(cell + seed);
  if (h < 1.0 - prob) return vec3(0.0);
  vec2 sp = vec2(hash12(cell + seed + 3.1), hash12(cell + seed + 7.7)) * 0.8 + 0.1;
  float d = length(fract(g) - sp) / cells * uPxPerH; // render px from the star
  float mag = pow(hash12(cell + seed + 1.9), 3.0);
  float core = exp(-d * d / 0.55);
  float tw = 1.0 + uStars.x * 0.35 * mag * sin(uTime * ang(0.6 + 1.7 * hash12(cell + seed + 5.3)) + h * 50.0);
  vec3 temp = mix(vec3(0.78, 0.86, 1.0), vec3(1.0, 0.93, 0.82), hash12(cell + seed + 9.1));
  return temp * core * (0.15 + mag) * bright * tw;
}

// ---- B. the moon as a lit sphere

// Equirect uv of a point on the disk (x right, y up, |q| <= 1), face turned by the position angle.
vec2 moonUV(vec2 q, out vec3 s) {
  q *= min(1.0, 0.9995 / max(length(q), 1e-6)); // the feathered rim samples the limb, never past it
  float nz = sqrt(max(0.0, 1.0 - dot(q, q)));
  s = vec3(uMoonRot.x * q.x - uMoonRot.y * q.y, uMoonRot.y * q.x + uMoonRot.x * q.y, nz);
  return vec2(atan(s.x, s.z) / TAU + 0.5, 0.5 - asin(clamp(s.y, -1.0, 1.0)) / PI);
}

// The lit face in display terms (what lands on screen after the tone shoulder).
// `dqx`, `dqy`: q per render px, for analytic texture gradients: the mip and
// anisotropy never jump at the limb or the longitude seam, so no lines.
vec3 moonFace(vec2 q, vec2 dqx, vec2 dqy) {
  vec3 s;
  vec3 s1;
  vec2 muv = moonUV(q, s);
  vec2 gx = moonUV(q + dqx, s1) - muv;
  vec2 gy = moonUV(q + dqy, s1) - muv;
  gx.x -= floor(gx.x + 0.5); // across the seam the step is short the other way round
  gy.x -= floor(gy.x + 0.5);
  vec3 alb = textureGrad(uMoonAlbedo, muv, gx, gy).rgb;
  vec3 tn = textureGrad(uMoonNormal, muv, gx, gy).xyz * 2.0 - 1.0;

  // Bumped normal: tangent frame on the sphere (selenographic), then back to the screen frame.
  vec3 east = vec3(s.z, 0.0, -s.x);
  float el = length(east);
  east = el > 1e-4 ? east / el : vec3(1.0, 0.0, 0.0);
  vec3 north = cross(s, east);
  vec3 b = normalize(east * tn.x * uMoonShade.w + north * tn.y * uMoonShade.w + s * max(tn.z, 0.05));
  vec3 nv = vec3(uMoonRot.x * b.x + uMoonRot.y * b.y, -uMoonRot.y * b.x + uMoonRot.x * b.y, b.z);
  vec3 ng = vec3(q, s.z); // the smooth sphere, for the terminator and earthshine

  // Lunar-Lambert: Lommel-Seeliger (the flat full moon) mixed with a little
  // Lambert (gentle limb darkening); a soft quadratic knee at the terminator.
  float t = max(uMoonShade.x, 1e-3);
  float x = dot(nv, uMoonSun);
  float mu0 = x >= t ? x : x <= -t ? 0.0 : (x + t) * (x + t) / (4.0 * t);
  float mu = max(ng.z, 0.02);
  float LL = uMoonShade.y;
  float refl = (1.0 - LL) * mu0 + LL * 2.0 * mu0 / (mu0 + mu + 1e-4);
  float night = 1.0 - smoothstep(-t, 2.0 * t, dot(ng, uMoonSun));

  float al = luma(alb);
  alb = mix(vec3(al), alb, uMapSat);
  vec3 c = alb * uMoonCol * refl + alb * uMoonCol * uEarthCol * uMoonShade.z * night;
  float lo = luma(c);
  return lo > 0.0 ? c * (rolloff(lo) / lo) : c;
}

// ---- G. a shooting star: a thin streak, brightest at the head
vec3 meteor(vec2 pa) {
  vec2 rel = pa - uMeteor.xy;
  float behind = -dot(rel, uMeteor.zw);
  float across = dot(rel, vec2(-uMeteor.w, uMeteor.z));
  float len = max(uMeteorK.x, 1e-4);
  float w = 0.8 / uPxPerH; // ~0.8 render px
  float tail = smoothstep(-w, w, behind) * pow(clamp(1.0 - behind / len, 0.0, 1.0), 2.0);
  // Widens a little along the tail; clamped so ahead of the head it never divides by <= 0 (inf * 0 = NaN, a black frame).
  float line = exp(-across * across / (w * w * (1.0 + 2.0 * clamp(behind / len, 0.0, 1.0))));
  float head = exp(-dot(rel, rel) / (w * w * 4.0));
  return vec3(0.86, 0.92, 1.0) * (line * tail * 0.6 + head) * uMeteorK.y;
}

// ---- micro-detail: value noise anchored to the image, faded in octave by octave
// as the camera magnifies it, so a close view keeps grain instead of smearing.
// `mag` = render px per source px here.
float microDetail(vec2 p, float mag, float t) {
  float d = 0.0;
  float wsum = 0.0;
  for (int k = 0; k < 3; k++) {
    float f = 941.0 * exp2(float(k)); // cells per image height: 1, 2, 4 per source px
    float pxPerCell = mag * 941.0 / f;
    float w = smoothstep(2.0, 5.0, pxPerCell);
    if (w <= 0.0) continue;
    d += w * (vnoise(p * f + vec2(t * 0.7, t * 0.31) + float(k) * 17.0, 65536.0) - 0.5);
    wsum += w;
  }
  return wsum > 0.0 ? d / max(wsum, 1.0) * 2.0 * min(wsum, 1.0) : 0.0;
}

void main() {
  float aspect = uRef.x / uRef.y;
  vec2 toA = vec2(aspect, 1.0);
  vec2 px = 1.0 / uRef;

  // ---- camera: cover-fit + dolly, then depth parallax
  vec2 suv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 uvC = suv * uCover.xy + uCover.zw;
  float protect = texture(uProtect, uvC).r;
  float depth = textureLod(uDepth, uvC, 1.0).r;
  depth = mix(depth, uPersonDepth, protect); // the figure moves as one rigid piece

  // ---- J. dive: every depth layer zooms by its own power of the camera zoom
  // (sky barely, the laptop plane exactly, the near rock fastest). Backward
  // mapping, so a few fixed-point steps find which layer is visible here.
  if (uDive.x > 1e-4) {
    vec2 rel = uvC - uDiveTarget;
    float lod = 1.0 + uDive.w;
    // Inside the figure zone, snap to exactly two layers: the figure, or the sky
    // behind it. The depth map's soft edge would otherwise zoom a halo of sky
    // at an in-between rate, and a zone that swallowed sky would zoom a bubble.
    float dm = textureLod(uDepth, uvC, lod).r;
    depth = figureDepth(dm, protect);
    for (int i = 0; i < 4; i++) {
      if (float(i) >= uDiveIter) break;
      vec2 uvD = uDiveTarget + rel * exp(uDive.x * (1.0 - diveK(depth, uDive.y, uDive.z, uPersonDepth)));
      protect = texture(uProtect, uvD).r;
      dm = textureLod(uDepth, uvD, lod).r;
      depth = figureDepth(dm, protect);
    }
    uvC = uDiveTarget + rel * exp(uDive.x * (1.0 - diveK(depth, uDive.y, uDive.z, uPersonDepth)));
  }

  vec2 uv = uvC + uParallax * (depth - uFocus);
  vec2 pa = uv * toA;
  // Image heights per render px (taken here, in uniform control flow).
  vec2 dpx = dFdx(pa);
  vec2 dpy = dFdy(pa);
  // Render px per source px at this depth: the dive magnifies each layer by its own power.
  float mag = uPxPerH / uRef.y * exp(uDive.x * (diveK(depth, uDive.y, uDive.z, uPersonDepth) - 1.0));

  float sky = texture(uSkyMask, uv).r;
  float protectSoft = textureLod(uProtect, uv, 3.0).r;

  vec2 mc = uMoonPos * toA;    // moon centre, image heights
  vec2 md = pa - mc;
  float r = length(md);
  float R = uMoonRadius;
  float limb = max(r - R, 0.0); // image heights outside the limb

  // ---- E. grass sway (midground)
  float grass = texture(uGrassMask, uv).r * (1.0 - protect);
  float tip = 0.0;
  vec2 offs = vec2(0.0);
  if (grass > 0.003) {
    float above = texture(uGrassMask, uv - vec2(0.0, 12.0 * px.y)).r;
    tip = clamp((grass - above) * 1.8, 0.0, 1.0);
    float strand = smoothstep(0.02, 0.18, luma(photo(uv)));
    float w = grass * (0.3 + 0.7 * max(tip, strand)) * (1.0 - protectSoft);
    float along = dot(pa, uWindDir);
    float phase = vnoise(pa * 7.0, 4096.0) * TAU;
    // Gust fronts roll across the field in the wind direction.
    float gust = 0.5 + 0.5 * sin(along * 6.0 - uTime * ang(uGrass.w) + vnoise(pa * 2.5, 4096.0) * 2.0);
    gust = smoothstep(0.45, 1.0, gust);
    float sway = 0.6 * sin(uTime * ang(uGrass.y) + phase + along * 14.0) + 0.25 * sin(uTime * ang(uGrass.y * 2.3) + phase * 1.7);
    float push = (0.35 + sway) * (0.5 + uGrass.z * gust);
    offs = uWindDir * push * uGrass.x * w;
    offs.y = abs(offs.x) * 0.35; // tips dip as they bend
    offs *= uMotion;
  }
  vec3 col = photo(uv - offs * px);
  // Micro-detail on the grass, riding the sway.
  if (grass > 0.003 && uDetail.x > 0.0) col *= 1.0 + uDetail.x * grass * microDetail(pa - offs * px.y, mag, 0.0);

  // ---- A. the photographed sky in three depth layers: far (the high sky and
  // the clouds around the moon) slow, mid (the horizon banks) medium, near (the
  // cloud sea) fastest. Clear dark sky barely moves, so the stars stay put.
  float shadow = 0.0;
  float occ = 0.0;   // photographed cloud in front of the moon
  float field = 0.5; // the moving cloud field here (lights the cloud rims)
  if (sky > 0.003) {
    float wMid = smoothstep(uSplit.x - uSplit.z, uSplit.x + uSplit.z, depth);
    float wN = smoothstep(uSplit.y - uSplit.z, uSplit.y + uSplit.z, depth);
    float wF = 1.0 - wMid;
    float wM = max(wMid - wN, 0.0);
    float cloudy = smoothstep(0.012, 0.05, luma(photoLod(uv, 3.0)));
    // How much the sky flows here. Built from very wide masks on purpose: a flow
    // amount that changed within a few pixels (at a cloud edge, the cliff, the
    // figure) would stretch and fold the photo into ripples. Clear dark sky
    // flows least, so the photo's stars barely move.
    float cloudyWide = smoothstep(0.012, 0.05, luma(photoLod(uv, 6.0)));
    float flowAmt = smoothstep(0.55, 0.98, textureLod(uSkyMask, uv, 6.0).r) * (1.0 - textureLod(uProtect, uv, 5.0).r) * mix(0.3, 1.0, cloudyWide);
    vec2 disp = vec2(0.0);
    vec2 w;
    field = 0.0;
    if (wF > 0.001) {
      float f = cloudField(pa * uLayerF.x, uLayerF.y, vec2(uDrift.x, 0.0), vec2(0.0, uEvo.x), uLayerF.z, w);
      disp += wF * (w + (f - 0.5) * vec2(1.0, 0.35)) * uLayerF.w;
      field += wF * f;
    }
    if (wM > 0.001) {
      float f = cloudField(pa * uLayerM.x, uLayerM.y, vec2(uDrift.y, 0.0), vec2(0.0, uEvo.y), uLayerM.z, w);
      disp += wM * (w + (f - 0.5) * vec2(1.0, 0.35)) * uLayerM.w;
      field += wM * f;
    }
    if (wN > 0.001) {
      float f = cloudField(pa * uLayerN.x, uLayerN.y, vec2(uDrift.z, 0.0), vec2(0.0, uEvo.z), uLayerN.z, w);
      disp += wN * (w + (f - 0.5) * vec2(1.0, 0.35)) * uLayerN.w;
      field += wN * f;
      shadow = wN * smoothstep(uSea.x - uSea.y, uSea.x + uSea.y, f);
    }
    vec2 uvS = uv + disp * flowAmt * px;

    // Two-phase flow advection: the photographed clouds really travel right to
    // left; each phase resets while its weight is zero, so the loop has no seam.
    float speed = (wF * uAdvect.x + wM * uAdvect.y + wN * uAdvect.z) * flowAmt * uMotion;
    float ph = uTime / uAdvect.w + vnoise(pa * 2.3, 4096.0) * 0.8;
    float p0 = fract(ph);
    float p1 = fract(ph + 0.5);
    vec2 adv = vec2(-uWindDir.x * speed * uAdvect.w, 0.0) * px;
    vec2 uvA = uvS + adv * p0;
    vec2 uvB = uvS + adv * p1;
    float wB = abs(p0 - 0.5) * 2.0;
    vec3 cs = mix(photo(uvA), photo(uvB), wB);
    if (r < R * 3.0) occ = mix(texture(uMoonMatte, uvA).r, texture(uMoonMatte, uvB).r, wB);
    // Cloud shadows rolling over the cloud sea.
    cs *= 1.0 - shadow * uSea.z;

    // Moonlight on the clouds, read from the travelling samples so it moves
    // with them: edges whose neighbour toward the moon is darker catch a rim of
    // it (brighter near the moon); low in the frame, bellies whose neighbour
    // below is darker catch a warm under-light. The cloud field shimmers both.
    if (uRim.x + uRim.z > 0.0 && cloudy > 0.01) {
      // Soft gradients (blurred samples a little apart), so the light wraps the
      // cloud's shoulder instead of drawing an outline along its edge.
      vec2 toM = (mc - pa) / max(r, 1e-4);
      vec2 o = toM / toA * 9.0 * px.y;
      float Lc = luma(mix(photoLod(uvA, 2.0), photoLod(uvB, 2.0), wB));
      float Lm = luma(mix(photoLod(uvA + o, 2.0), photoLod(uvB + o, 2.0), wB));
      float sh = mix(1.0, 0.4 + 1.2 * field, uRim.w);
      float fall = exp(-limb / max(uRim.y, 1e-3));
      vec3 rimLight = uMoonTint * uMoonDiskI;
      cs += rimLight * uRim.x * fall * sh * smoothstep(0.0, 0.25, Lc - Lm) * (Lc + 0.02) * (1.0 - occ * 0.5);
      float low = smoothstep(0.3, 0.75, uv.y);
      if (low > 0.0 && uRim.z > 0.0) {
        vec2 dn = vec2(0.0, 10.0 * px.y);
        float Lb = luma(mix(photoLod(uvA + dn, 2.0), photoLod(uvB + dn, 2.0), wB));
        cs += uUnderCol * uRim.z * low * sh * smoothstep(0.0, 0.25, Lc - Lb) * (Lc + 0.01);
      }
    }

    // Night grade: near-black navy overhead, through midnight blue and indigo,
    // to a cold blue at the horizon. Colour only, on the dark sky, not the lit cloud.
    vec3 grade = mix(vec3(0.5, 0.58, 1.0), vec3(0.62, 0.58, 1.0), smoothstep(0.0, 0.18, uv.y));
    grade = mix(grade, vec3(0.6, 0.72, 1.0), smoothstep(0.16, 0.34, uv.y));
    float dark = 1.0 - smoothstep(0.01, 0.12, luma(cs));
    cs = mix(cs, luma(cs) * grade / luma(grade), uGrade.x * dark);

    // Micro-detail on the cloud texture, travelling with the near-sample flow.
    if (uDetail.x > 0.0) cs *= 1.0 + uDetail.x * cloudy * microDetail(uvS * toA, mag, uTime * 0.05 * uMotion);

    col = mix(col, cs, sky);
  }

  // ---- G. stars, the Milky Way and the odd shooting star: fixed to the sky, never riding the clouds
  if (sky > 0.01 && uv.y < 0.45) {
    float bg = luma(photoLod(uv, 2.5));
    float dark = 1.0 - smoothstep(0.012, 0.05, bg);
    float upper = 1.0 - smoothstep(0.18, 0.42, uv.y);
    // The moon washes the faint ones out.
    float glare = smoothstep(R * 1.6, R * 7.0, r);
    float m = sky * dark * upper * glare;
    if (m > 0.001) {
      // The photo's own stars, gently scintillating.
      float spike = luma(photo(uv)) - bg;
      float h = hash12(floor(uv * uRef / 3.0));
      float tw = 0.5 + 0.5 * sin(uTime * ang(0.25 + 1.1 * h) + h * 60.0);
      col += col * smoothstep(0.01, 0.06, spike) * m * (tw - 0.45) * 0.8 * uStars.x;

      // A restrained Milky Way: a diffuse band with dark dust lanes, high in the clear sky to the left.
      vec2 bandDir = normalize(vec2(-0.62, 1.0));
      vec2 bo = pa - vec2(0.52, -0.02);
      float across = dot(bo, vec2(bandDir.y, -bandDir.x));
      float along = dot(bo, bandDir);
      float band = exp(-across * across / 0.0045) * smoothstep(0.55, 0.05, along);
      float dust = smoothstep(0.42, 0.68, fbm3(vec2(along * 7.0, across * 22.0) + 11.0, 4096.0));
      float mw = band * (0.55 + 0.45 * fbm3(pa * 26.0, 4096.0)) * (1.0 - 0.75 * dust);
      col += vec3(0.62, 0.66, 0.78) * mw * 0.007 * uStars.w * m;

      // New stars at three depths of brightness, denser along the band.
      float dens = uStars.y * (1.0 + 2.5 * band * uStars.w);
      vec3 st = starLayer(pa, 260.0, 0.05 * dens, 0.05, 17.0)
              + starLayer(pa, 120.0, 0.035 * dens, 0.12, 41.0)
              + starLayer(pa, 48.0, 0.03 * uStars.y, 0.4, 73.0);
      col += st * uStars.z * m;
    }
    // Behind the photographed clouds (dark sky only), in front of nothing else.
    if (uMeteorK.y > 0.0) col += meteor(pa) * sky * dark * smoothstep(R * 1.2, R * 3.0, r);
  }

  // ---- C. moonlight cast on the scene: grade lightness, highlights first
  float L = luma(col);
  float hi = smoothstep(0.008, 0.2, L);
  vec2 toMoon = normalize(mc - pa) / toA;
  float skyToward = texture(uSkyMask, uv + toMoon * 10.0 * px.y).r;
  float rimEdge = (1.0 - sky) * skyToward;               // edges whose neighbour toward the moon is sky
  float rim = (1.0 - sky) * (max(rimEdge, tip) + hi * 0.5);

  vec2 ld = pa - uLaptop.xy * toA;
  vec2 lq = abs(ld) - uLaptop.zw;
  float screen = 1.0 - smoothstep(0.0, 0.004, max(lq.x, lq.y));
  float pool = exp(-length(ld * vec2(0.75, 1.5)) / 0.055) * (1.0 - sky);

  float g = 1.0 + (uLightRel - 1.0) * (uSceneResp * mix(0.3, 1.0, hi) + uRimGain * rim);
  g = mix(g, 1.0, clamp(pool * 1.2 + screen, 0.0, 1.0)); // the laptop keeps its own light
  col *= max(g, 0.0);
  // Moonlit highlights pick up the moon's tint.
  col = mix(col, col * uMoonTint / max(luma(uMoonTint), 1e-3), hi * (1.0 - sky) * 0.12);

  // ---- B. the moon: a lit sphere behind every cloud.
  // The halo takes its colour from the sky behind the moon, so it sits in this
  // sky instead of on it; close in it keeps the moon's own colour.
  vec3 skyBehind = photoLod(uMoonPos, 6.0);
  vec3 skyHue = skyBehind / max(luma(skyBehind), 1e-4);
  vec3 haloTint = mix(uMoonHue, skyHue, uHaloOpt.z);
  haloTint /= max(luma(haloTint), 1e-4);
  vec3 haloLight = haloTint / max(max(haloTint.r, haloTint.g), haloTint.b);
  vec3 moonLight = mix(uMoonTint, haloLight, uWispTint * exp(-limb / (R * 1.2))) * uMoonDiskI;
  float wispCover = 0.0;
  float trans = 1.0;
  float disk = 0.0;
  if (sky > 0.003) {
    float fw = max(uFeather, 0.5) / uPxPerH; // feather width, image heights
    if (r < R + fw) {
      // Disk coords with y up, and their step per render px for the texture gradients.
      vec2 q = vec2(md.x, -md.y) / R;
      vec2 dqx = vec2(dpx.x, -dpx.y) / R;
      vec2 dqy = vec2(dpy.x, -dpy.y) / R;
      disk = 1.0 - smoothstep(R - fw * 0.5, R + fw * 0.5, r);
      vec3 moon = unshoulder(moonFace(q, dqx, dqy), uKnee);
      col = mix(col, moon, disk * (1.0 - occ) * sky);
    }
    // The cumulus edges crossing the disk light up where they thin out.
    float thin = occ * (1.0 - occ) * 4.0;
    col += moonLight * thin * exp(-limb / (R * 0.12)) * 0.35 * sky;

    // ---- the haze and the wisps: mid-altitude streaks, then the foreground
    // wisps that cross the disk. Both are lit from behind by the moon: thin
    // edges scatter its light forward and glow, thick cores shadow
    // themselves; far from the moon they fade into the navy.
    float rawM;
    float rawN;
    vec2 pm = pa + uParallax * toA * uWispOpt.z;
    vec2 pn = pa + uParallax * toA * uWispOpt.w;
    float env = 1.0 - smoothstep(0.26, 0.5, uv.y); // they live above the cloud sea
    float dM = wispField(pm, uWispMid, uWispDrift.xy, uWispEvo.x, WISP_TILE, rawM) * env;
    float dN = wispField(pn, uWispNear, uWispDrift.zw, uWispEvo.y, WISP_TILE, rawN) * env;

    // Forward scattering: steep near the moon (the aureole), a long faint tail. In moon radii.
    float phaseF = 1.5 * exp(-limb / (R * 0.26)) + 0.5 * exp(-limb / R) + 0.1 * exp(-limb / (R * 4.8));
    vec3 ambient = vec3(0.02, 0.025, 0.038) * uWispLight.y * (0.6 + 0.4 * uMoonI) * (0.4 + 0.6 * exp(-r / 0.5));

    // Thin atmospheric scatter ring hugging the limb, then the wide halo. Both
    // live in the haze: they swell and thin as it passes, a cloud in front of
    // the moon hides most of them, thick cloud widens (softens) the halo, and
    // neither is ever drawn on the face.
    float haze = 0.35 + 0.65 * smoothstep(0.32, 0.75, rawM) + 0.5 * (dM + dN);
    float hazeK = mix(1.0, haze / 0.7, uHaloOpt.x) * (1.0 - uHaloOpt.y * occ) * (1.0 - disk * (1.0 - occ));
    float hd = limb / R;
    float halo = uHalo.x * exp(-hd / (uHalo.y * uHaloSoft)) + uHalo.z * exp(-hd / (uHalo.w * uHaloSoft));
    float ring = uScatter.x * exp(-hd / max(uScatter.y, 1e-3)) * (1.0 - disk);
    col += (haloTint * halo + uMoonHue * ring) * hazeK * uMoonGlow * sky;

    float tauM = dM * uWispOpt.x;
    float tauN = dN * uWispOpt.y;
    float tM = exp(-tauM);
    float tN = exp(-tauN);
    // Mid layer first (further away), then the near wisps over everything.
    float selfM = mix(1.0, exp(-tauM * 1.5), uWispLight.z);
    col = col * tM + (moonLight * phaseF * uWispLight.x * selfM + ambient) * (1.0 - tM) * sky;
    float selfN = mix(1.0, exp(-tauN * 1.5), uWispLight.z);
    col = col * tN + (moonLight * phaseF * uWispLight.x * selfN + ambient) * (1.0 - tN) * sky;

    trans = mix(1.0, tM * tN, sky);
    wispCover = (1.0 - tM * tN) * sky;
  }

  // ---- F. laptop glow: tiny pulse on the screen and the light pool it throws
  col *= 1.0 + screen * (uLaptopPulse - 1.0);
  col *= 1.0 + pool * (uLaptopPulse - 1.0) * uLaptopPool;
  // ---- K. the video's light on the hands, face edge and grass, in its own colour.
  col += (col + 0.002) * uSpill.rgb * pool * uSpill.a;

  // ---- K. the screen itself becomes the video's (average) emission, so the
  // bloom and the rays pick up its colour; final.frag draws the crisp video over it.
  if (uVideoGlow.a > 0.0) {
    vec2 sq = uScreenInv * (uv * uRef - uScreenC);
    float sd = frameDist(sq, uScreenLen, uScreenR);
    float aa = max(fwidth(sd), 1e-3);
    col = mix(col, uVideoGlow.rgb, (1.0 - smoothstep(-aa, aa, sd)) * uVideoGlow.a);
  }

  // ---- J. the screen turns to light as the camera arrives. The edge is
  // analytic, so it stays razor sharp at any zoom while the photo softens.
  if (uScreenGlow.a > 0.0) {
    vec2 sq = uScreenInv * (uv * uRef - uScreenC);
    float sd = frameDist(sq, uScreenLen, uScreenR);
    float aa = max(fwidth(sd), 1e-3);
    float inside = 1.0 - smoothstep(-aa, aa, sd);
    col = mix(col, uScreenGlow.rgb, inside * uScreenGlow.a);
    col += uScreenGlow.rgb * exp(-max(sd, 0.0) / (uScreenLen.y * 0.5)) * uScreenGlow.a * 0.22 * (1.0 - inside);
  }

  col *= uExposure;

  if (uView > 0.5) {
    float v = uView < 1.5 ? sky : uView < 2.5 ? depth : uView < 3.5 ? grass : uView < 4.5 ? protect : uView < 5.5 ? wispCover + shadow * 0.5 : uView < 6.5 ? g * 0.5 : occ;
    col = vec3(v * v); // squared so the sRGB encode shows the raw value
  }

  gl_FragColor = vec4(col, sky * trans);
}
