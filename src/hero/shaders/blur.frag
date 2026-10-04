// Separable 9-tap gaussian for the quarter-res bloom. The first pass also
// thresholds with a soft knee so only the moon and the screen bloom.
#include "./common.glsl"

uniform sampler2D uSrc;
uniform vec2 uStep;        // texel step in source uv, along one axis
uniform float uThreshold;
uniform float uPrefilter;  // 1 on the first pass

varying vec2 vUv;

vec3 pick(vec2 uv) {
  vec3 c = texture(uSrc, uv).rgb;
  if (uPrefilter < 0.5) return c;
  float l = luma(c);
  float knee = uThreshold * 0.5;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-5);
  return c * max(soft, l - uThreshold) / max(l, 1e-4);
}

void main() {
  vec3 c = pick(vUv) * 0.2270270;
  c += (pick(vUv + uStep * 1.3846154) + pick(vUv - uStep * 1.3846154)) * 0.3162162;
  c += (pick(vUv + uStep * 3.2307692) + pick(vUv - uStep * 3.2307692)) * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}
