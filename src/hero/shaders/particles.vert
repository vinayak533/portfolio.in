// Sparse atmosphere: dust motes riding the wind, fireflies over the grass,
// a few leaves tumbling past the lens. Positions live in image uv so they
// share the photo's parallax; every path loops on the shared period.
#include "./common.glsl"

attribute vec4 aSeed;    // x, y (image uv), depth, random
attribute vec4 aParams;  // kind (0 dust, 1 firefly, 2 leaf), speed, size, phase

uniform float uTime;
uniform float uWrap;
uniform vec4 uCover;
uniform vec2 uParallax;
uniform float uFocus;
uniform vec2 uRef;
uniform float uPxScale;  // render-target px per source px
uniform float uWind;     // -1 right to left, 1 left to right
uniform vec2 uMoonPos;
uniform float uLight;
uniform float uBright;
uniform vec3 uSpeed;     // dust speed, leaf speed, leaf flutter (multipliers)
uniform vec4 uDive;      // log(zoom), far exponent, near exponent, laptop depth
uniform vec2 uDiveTarget;

varying float vKind;
varying float vAlpha;
varying float vSoft;
varying float vAngle;
varying float vSquash;
varying vec3 vColor;

float ang(float hz) { return TAU * floor(hz * uWrap + 0.5) / uWrap; }

void main() {
  float kind = aParams.x;
  float depth = aSeed.z;
  float ph = aParams.w * TAU;
  vec2 p;
  float size;
  float alpha;
  vec3 color;

  if (kind < 0.5) {
    // Dust: crossings per loop are whole numbers so the wrap never pops.
    float cyc = max(1.0, floor(uWrap * 0.0035 * uSpeed.x * aParams.y * mix(0.5, 1.0, depth) + 0.5));
    float x = fract(aSeed.x + uWind * uTime * cyc / uWrap);
    p = vec2(x * 1.2 - 0.1, aSeed.y + 0.022 * sin(uTime * ang(0.04 + 0.05 * aParams.y) + ph));
    size = mix(1.6, 5.5, depth * depth) * aParams.z;
    float moon = exp(-length((p - uMoonPos) * vec2(uRef.x / uRef.y, 1.0)) / 0.3);
    alpha = (0.1 + 0.35 * moon) * uLight * smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.92, x);
    color = vec3(0.72, 0.78, 0.95);
    vAngle = 0.0;
    vSquash = 1.0;
  } else if (kind < 1.5) {
    // Fireflies: slow wander around a home over the grass, glowing on and off.
    p = aSeed.xy + vec2(
      0.022 * sin(uTime * ang(0.021 + 0.02 * aParams.y) + ph) + 0.008 * sin(uTime * ang(0.09) + ph * 2.0),
      0.014 * sin(uTime * ang(0.033 + 0.02 * aParams.y) + ph * 3.0)
    );
    size = mix(7.0, 14.0, depth) * aParams.z;
    float glow = 0.5 + 0.5 * sin(uTime * ang(0.08 + 0.1 * aParams.y) + ph * 5.0);
    alpha = pow(glow, 4.0) * 0.55;
    color = vec3(1.0, 0.86, 0.42);
    vAngle = 0.0;
    vSquash = 1.0;
  } else {
    // Leaves: near the lens, faster, tumbling, falling slightly.
    float cyc = max(1.0, floor(uWrap * 0.006 * uSpeed.y * aParams.y + 0.5));
    float x = fract(aSeed.x + uWind * uTime * cyc / uWrap);
    // Flutter: a slow drift plus a quicker eddy, so leaves ride the gusts instead of gliding.
    float y = aSeed.y + 0.05 * uSpeed.z * sin(uTime * ang(0.07 + 0.05 * aParams.y) + ph)
      + 0.018 * uSpeed.z * sin(uTime * ang(0.31 + 0.2 * aParams.y) + ph * 3.0)
      + (uWind < 0.0 ? 1.0 - x : x) * 0.1;
    p = vec2(x * 1.3 - 0.15, y);
    size = mix(9.0, 24.0, depth * depth) * aParams.z;
    vAngle = uTime * ang((0.15 + 0.25 * aParams.y) * sqrt(uSpeed.y)) + ph;
    vSquash = sin(uTime * ang((0.11 + 0.2 * aParams.y) * sqrt(uSpeed.y)) + ph * 2.0);
    alpha = 0.85 * smoothstep(0.0, 0.06, x) * smoothstep(1.0, 0.94, x);
    color = mix(vec3(0.012, 0.018, 0.006), vec3(0.11, 0.15, 0.035), 0.4 + 0.6 * uLight);
  }

  vKind = kind;
  vSoft = clamp(abs(depth - uFocus) * 1.6, 0.0, 1.0); // out-of-focus blur on both sides of the island
  vAlpha = alpha * uBright;
  vColor = color;

  vec2 img = p - uParallax * (depth - uFocus);
  // Dive: the cover is the laptop plane's; each particle zooms by its own depth's power.
  float layer = exp(uDive.x * (diveK(depth, uDive.y, uDive.z, uDive.w) - 1.0));
  img = uDiveTarget + (img - uDiveTarget) * layer;
  vec2 s = (img - uCover.zw) / uCover.xy;
  gl_Position = vec4(s.x * 2.0 - 1.0, 1.0 - s.y * 2.0, 0.0, 1.0);
  gl_PointSize = min(size * uPxScale * layer * (1.0 + vSoft * 0.6), 240.0);
}
