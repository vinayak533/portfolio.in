#include "../common/utils.glsl"
attribute vec4 aSeed;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
varying float vAlpha;
varying float vTwinkle;

void main() {
  vec3 p = position;
  p += vec3(sin(uTime * 0.11 + aSeed.x * 40.0), cos(uTime * 0.09 + aSeed.y * 40.0), sin(uTime * 0.07 + aSeed.z * 40.0)) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  gl_PointSize = uSize * uPixelRatio * (0.35 + aSeed.w * aSeed.w * 1.6) / max(depth, 0.1);
  gl_Position = projectionMatrix * mv;
  vAlpha = smoothstep(0.6, 3.0, depth) * (1.0 - smoothstep(24.0, 46.0, depth));
  vTwinkle = 0.45 + 0.55 * sin(uTime * (0.6 + aSeed.x * 2.2) + aSeed.y * TAU);
}
