#include "../common/utils.glsl"
uniform float uTime;
uniform float uIntensity;
uniform vec3 uAccent;
uniform vec3 uInk;
varying vec2 vUv;

void main() {
  float y = abs(vUv.y - 0.5);
  float core = exp(-y * 140.0);
  float halo = exp(-y * 14.0) * 0.35;
  float ends = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float flicker = 0.85 + 0.15 * sin(uTime * 37.0 + vUv.x * 60.0) * sin(uTime * 13.0);
  // Data ticks running along the beam.
  float ticks = step(0.92, fract(vUv.x * 48.0 - uTime * 1.5)) * exp(-y * 40.0) * 0.6;
  vec3 col = uInk * core * 5.0 + mix(uAccent, uInk, 0.25) * (halo * 2.2 + ticks * 2.0);
  gl_FragColor = vec4(col * ends * flicker * uIntensity, 1.0);
}
