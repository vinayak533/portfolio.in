// Shared hero helpers. The noise below is mirrored line for line in
// src/hero/noise.ts so the CPU can read the same cloud field at the moon.
#define TAU 6.28318530718

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Dave Hoskins' hash without sine: stable across GPUs for lattice inputs.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Value noise on a lattice that tiles every `tile` cells, so drift offsets can
// wrap at `tile` with no seam.
float vnoise(vec2 p, float tile) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, tile);
  vec2 i1 = mod(i + 1.0, tile);
  float a = hash12(i0);
  float b = hash12(vec2(i1.x, i0.y));
  float c = hash12(vec2(i0.x, i1.y));
  float d = hash12(i1);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm2(vec2 p, float tile) {
  return 0.6666667 * vnoise(p, tile) + 0.3333333 * vnoise(p * 2.0, tile * 2.0);
}

float fbm3(vec2 p, float tile) {
  return 0.5714286 * vnoise(p, tile) + 0.2857143 * vnoise(p * 2.0, tile * 2.0) + 0.1428571 * vnoise(p * 4.0, tile * 4.0);
}

// Dive parallax: zoom exponent for a depth (1 = laptop plane). The sky (depth
// 0) gets `kFar` and barely moves; the nearest rock gets `kNear` and rushes past.
float diveK(float d, float kFar, float kNear, float dp) {
  return d < dp ? mix(kFar, 1.0, pow(clamp(d / dp, 0.0, 1.0), 1.5)) : mix(1.0, kNear, clamp((d - dp) / (1.0 - dp), 0.0, 1.0));
}

// Rounded-box distance in px for a parallelogram frame: `q` is the point in the
// frame's unit coords (-0.5..0.5), `len` the frame edge lengths, `r` the radius.
float frameDist(vec2 q, vec2 len, float r) {
  vec2 h = len * 0.5;
  r = min(r, min(h.x, h.y));
  vec2 d = abs(q * len) - h + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// Wind-sheared wisps (thin cirrus / stratus streaks): anisotropic,
// domain-warped fbm cut by a soft threshold, with fibres running along the
// wind, gathered into loose groups with clear sky between them. `p` is image
// uv * aspect; L = scale (cells per image height), stretch (along-wind
// elongation), threshold, softness. Returns density 0..1 and, in `raw`, the
// unthresholded field (the haze the moon's glow lives in). `tile` must be a
// multiple of 4. Mirrored in src/hero/noise.ts so the CPU knows when one
// crosses the moon.
float wispField(vec2 p, vec4 L, vec2 drift, float evo, float tile, out float raw) {
  // A slight shear, so the streaks lean the way wind-torn cirrus does.
  vec2 q = vec2(p.x / L.y, p.y + p.x * 0.12) * L.x + drift;
  vec2 w = vec2(fbm2(q * 0.5 + vec2(evo, 0.0), tile * 0.5), fbm2(q * 0.5 + vec2(evo + 3.7, 1.9), tile * 0.5)) - 0.5;
  raw = fbm3(q + w * vec2(2.4, 1.6), tile);
  float fib = fbm2(vec2(q.x * 2.0, q.y * 5.0) + w * 3.0, tile * 2.0);
  float group = fbm2(q * 0.25 + vec2(7.0 + evo * 0.5, 2.1), tile * 0.25);
  return smoothstep(L.z, L.z + L.w, raw) * (0.3 + 0.7 * fib) * smoothstep(0.45, 0.68, group);
}

// Domain-warped cloud field. `drift` slides the whole field (clouds travel),
// `evo` slides only the warp input (shapes morph). Returns density 0..1 and
// the warp vector (-0.5..0.5) used for displacement.
float cloudField(vec2 q, float tile, vec2 drift, vec2 evo, float warpAmt, out vec2 w) {
  vec2 qd = q + drift;
  w = vec2(fbm2(qd + evo, tile), fbm2(qd + evo + vec2(5.2, 1.3), tile)) - 0.5;
  return fbm3(qd + warpAmt * w, tile);
}
