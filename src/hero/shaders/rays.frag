// God rays: half-res radial gather toward the moon. Emitters are bright sky
// pixels near the moon, weighted by sky transmittance (scene alpha), so light
// only streams through gaps between the clouds and the veil.
#include "./common.glsl"

uniform sampler2D uScene;
uniform vec2 uMoon;      // screen uv, y up
uniform float uAspect;
uniform float uLength;
uniform float uDecay;
uniform float uThreshold;
uniform float uReach;

varying vec2 vUv;

const int TAPS = 32;

void main() {
  vec2 delta = (vUv - uMoon) * (uLength / float(TAPS));
  // Interleaved-gradient dither hides tap banding; the film grain covers the rest.
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 p = vUv - delta * jitter;
  float illum = 1.0;
  float sum = 0.0;
  float inv = 1.0 / (uReach * uReach);
  for (int i = 0; i < TAPS; i++) {
    vec4 s = texture(uScene, p);
    vec2 d = (p - uMoon) * vec2(uAspect, 1.0);
    float src = max(luma(s.rgb) - uThreshold, 0.0) * s.a * exp(-dot(d, d) * inv);
    sum += src * illum;
    illum *= uDecay;
    p -= delta;
  }
  gl_FragColor = vec4(sum / float(TAPS), 0.0, 0.0, 1.0);
}
