// The atmosphere of the hero -> About shot, at half res: a cloud volume with
// real depth, composited against the photo's own depth, never laid over it.
//
// Every pixel knows how far away the scene is along its ray (the depth map,
// through the very same dive the scene pass draws). The volume is a density
// profile along the view axis (a main bank, thin veils ahead of it, one
// behind; see shot.ts), integrated analytically between the camera and that
// distance, so the far sky hazes first, mist rolls over the back of the
// island before its front, and the figure is swallowed before the grass at
// the lens. The integral is split into depth slices fixed in the cloud world;
// each slice is a sheet of billows seen in perspective, so slices far away
// are fine texture, near ones swell, stream past the frame edges and thin to
// nothing as the camera crosses them. Nothing pops: slice opacity comes from
// the integral, which is continuous, and the farthest slices relax to smooth
// haze before they are re-indexed.
//
// Light: moonlight from its direction on screen (silver shoulders, forward
// scattering, a moon-glow in the haze) dies with depth into the bank; from the
// far side, About's indigo glows through; the laptop's light diffuses in the
// mist around the figure. Output: linear, premultiplied (light, coverage).
#include "./common.glsl"

uniform float uAspect;
uniform vec2 uCentre;     // heading (vanishing point), screen uv, y up
uniform float uCamX;      // camera, bank coordinates
uniform vec4 uBands[4];   // from, to, ramp, density (bank coordinates, per unit)
uniform float uDensMax;   // the main bank's density
uniform float uSlices;    // depth slices integrated (quality)
uniform float uTime;      // seconds, unwrapped
uniform vec2 uWind;       // lateral drift, cloud units
uniform vec2 uMoon;       // moon, screen uv, y up (may lie outside 0..1)
uniform vec3 uMoonCol;    // moonlight, linear
uniform vec3 uAmbient;    // moonlit mist body
uniform vec3 uDeep;       // the heart of the bank
uniform vec3 uGlow;       // About's light through the far side
uniform vec4 uLaptop;     // screen uv (y up), radius (viewport heights), strength
uniform vec3 uLaptopCol;
uniform vec4 uShape;      // scale, softness, structure, bank depth
uniform vec4 uLight;      // silver, scatter, moon reach, glow reach

// The scene's depth, through the same camera as scene.frag.
uniform sampler2D uDepth;   // 1 = near
uniform sampler2D uProtect; // the figure: one rigid plane
uniform vec4 uCover;        // image uv = screen uv * xy + zw
uniform vec4 uDive;         // log(zoom), far exponent, near exponent, -
uniform vec2 uDiveTarget;
uniform float uPersonDepth;
uniform vec3 uDist;         // figure distance at rest, depth spread, far cap (bank units)
uniform float uFigure;      // the figure's distance now

varying vec2 vUv;

const int MAX_SLICES = 16;
const float TILE = 1024.0;

float fbm4(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p, TILE);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s * 1.0666667;
}

float fbm3u(vec2 p) {
  return 0.5714286 * vnoise(p, TILE) + 0.2857143 * vnoise(p * 2.03 + vec2(17.1, 9.2), TILE) + 0.1428571 * vnoise(p * 4.12 + vec2(51.7, 27.9), TILE);
}

// Distance from the camera to the scene along this pixel, in bank units.
float sceneDistance() {
  vec2 uvC = vec2(vUv.x, 1.0 - vUv.y) * uCover.xy + uCover.zw;
  float protect = texture(uProtect, uvC).r;
  float depth = mix(textureLod(uDepth, uvC, 2.0).r, uPersonDepth, protect);
  if (uDive.x > 1e-4) {
    vec2 rel = uvC - uDiveTarget;
    for (int i = 0; i < 2; i++) {
      vec2 uvD = uDiveTarget + rel * exp(uDive.x * (1.0 - diveK(depth, uDive.y, uDive.z, uPersonDepth)));
      protect = texture(uProtect, uvD).r;
      depth = mix(textureLod(uDepth, uvD, 2.0).r, uPersonDepth, protect);
    }
  }
  // At rest: the figure at uDist.x, nearer and farther layers spread exponentially.
  // The push brings each layer closer by its own zoom.
  float d0 = uDist.x * exp(uDist.y * (uPersonDepth - depth));
  return min(d0 * exp(-uDive.x * diveK(depth, uDive.y, uDive.z, uPersonDepth)), uDist.z);
}

// Optical depth: each band ramps up over [from, from + ramp], holds, ramps down
// over [to - ramp, to]. Closed-form integral (mirrored in shot.ts).
float rampIntegral(float z, float a, float r) {
  float t = clamp(z - a, 0.0, r);
  return t * t / (2.0 * r) + max(z - a - r, 0.0);
}
float bandIntegral(float z, vec4 B) {
  float r = max(1e-3, min(B.z, (B.y - B.x) * 0.5));
  return B.w * (rampIntegral(z, B.x, r) - rampIntegral(z, B.y - r, r));
}
float optical(float a, float b) {
  float s = 0.0;
  for (int i = 0; i < 4; i++) s += bandIntegral(b, uBands[i]) - bandIntegral(a, uBands[i]);
  return s;
}
float density(float z) {
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 B = uBands[i];
    float r = max(1e-3, min(B.z, (B.y - B.x) * 0.5));
    s += B.w * (clamp((z - B.x) / r, 0.0, 1.0) - clamp((z - B.y + r) / r, 0.0, 1.0));
  }
  return s;
}

void main() {
  float x0 = uCamX;
  float x1 = uCamX + sceneDistance();
  if (optical(x0, x1) < 0.002) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 p = (vUv - uCentre) * vec2(uAspect, 1.0); // view plane, viewport heights
  vec2 toMoon = (uMoon - vUv) * vec2(uAspect, 1.0);
  float moonDist = length(toMoon);
  vec2 ldir = toMoon / max(moonDist, 1e-4);
  float phase = 1.0 + uLight.y * exp(-moonDist * 1.4); // forward scattering toward the moon
  vec2 lp = (vUv - uLaptop.xy) * vec2(uAspect, 1.0);
  float glowL = uLaptop.w * exp(-dot(lp, lp) / max(uLaptop.z * uLaptop.z, 1e-5));
  vec3 haze = uAmbient * 1.15 + uMoonCol * 0.022 * phase;

  int n = int(uSlices);
  float N = uSlices;
  float first = floor(x0) + 1.0; // the first slice boundary ahead of the camera
  vec3 C = vec3(0.0);
  float A = 0.0;

  // Far to near; slice k spans [first + k - 1, first + k] (the camera's own slice
  // starts at the camera), the last one runs on to the scene.
  for (int k = MAX_SLICES; k >= 0; k--) {
    if (k > n) continue;
    float fk = float(k);
    float sa = k == 0 ? x0 : first + fk - 1.0;
    float sb = k == n ? x1 : first + fk;
    float a = max(sa, x0);
    float b = min(sb, x1);
    if (b <= a) continue;
    float tau = optical(a, b);
    if (tau < 0.002) continue;

    // The slice's sheet sits at its far boundary, fixed in the cloud world.
    float id = first + fk - 1.0;
    float dk = max((k == n ? x1 : sb) - x0, 0.04);
    float xm = 0.5 * (a + b);

    vec2 off = vec2(hash12(vec2(id, 1.7)), hash12(vec2(id, 8.3))) * 97.0;
    vec2 w = p * dk * uShape.x + off + uWind * (0.7 + 0.6 * hash12(vec2(id, 4.4)));
    float evo = uTime * 0.018 + id * 3.1;
    vec2 q = vec2(fbm2(w * 0.55 + evo, 512.0), fbm2(w * 0.55 + vec2(5.2, 1.3) - evo, 512.0)) - 0.5;
    vec2 wq = w + q * 1.3;
    float nz = fbm4(wq);

    // Thin veils are wisps with clear air between them; the bank's heart is nearly solid.
    float fill = sqrt(clamp(density(xm) / max(uDensMax, 1e-3), 0.0, 1.0));
    float thr = mix(0.72, 0.42, fill);
    float body = smoothstep(thr - uShape.y, thr + uShape.y, nz);
    // Far slices relax to smooth haze (aerial perspective), so re-indexing them is invisible.
    float structure = uShape.z * (1.0 - smoothstep(N - 5.0, N - 1.5, dk));
    float m = mix(1.0, body * 1.7 + 0.15, structure);
    float alpha = 1.0 - exp(-tau * m);
    if (alpha < 0.001) continue;

    // Light: a step toward the moon with less cloud = a shoulder catching it.
    float nl = fbm3u(wq + ldir * 0.16);
    float lit = clamp((nz - nl) * 3.5 + 0.35, 0.0, 1.0);
    float thin = 1.0 - smoothstep(thr, thr + uShape.y * 1.6, nz);
    float moonK = exp(-max(xm, 0.0) * uLight.z);              // moonlight dies into the bank
    float glowK = exp(-max(uShape.w - xm, 0.0) * uLight.w);    // About's light from the far side
    vec3 col = mix(uAmbient, uDeep, smoothstep(0.0, uShape.w, xm)) * (0.65 + 0.7 * nz);
    col += uMoonCol * (uLight.x * lit * lit * 0.35 + 0.02 + 0.05 * thin) * phase * moonK;
    col += uGlow * glowK * (0.6 + 0.7 * nz);
    // The laptop lights the mist around the figure, not the bank far behind it.
    col += uLaptopCol * glowL * (0.4 + 0.6 * thin) * smoothstep(uFigure + 2.5, uFigure, dk);
    col = mix(col, haze, smoothstep(3.0, 11.0, dk) * 0.55);

    C = col * alpha + C * (1.0 - alpha);
    A = alpha + A * (1.0 - alpha);
  }

  gl_FragColor = vec4(C, A);
}
