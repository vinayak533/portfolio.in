// Splinters shed by a waypoint crystal. Born on its surface, they separate out
// to a loose orbit as the role ignites, flaring while the beam passes. Pairs
// with shard.frag.
#include "../common/utils.glsl"

attribute vec3 bary;
attribute vec4 aSeed;

uniform float uSplit;  // 0..1 how far the splinters have separated
uniform float uFlare;  // 0..1 beam-proximity pulse
uniform float uTime;
uniform float uSize;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying float vEnergy;
varying float vSparkle;
varying float vFade;
varying float vSeam;

void main() {
  float s = remap01(uSplit, aSeed.w * 0.35, aSeed.w * 0.35 + 0.65);
  float k = easeOutCubic(s);
  float dirSign = aSeed.z > 0.5 ? 1.0 : -1.0;
  float a = aSeed.x * TAU + uTime * (0.12 + aSeed.y * 0.3) * dirSign + k * 1.6 * dirSign;
  float tilt = (aSeed.z - 0.5) * 2.4;
  vec3 orbit = vec3(cos(a), sin(a) * cos(tilt), sin(a) * sin(tilt));
  float radius = mix(0.24, 0.65 + aSeed.w * 1.2, k) + uFlare * (0.2 + aSeed.y * 0.35);
  vec3 pos = orbit * radius + curlTrig(orbit * 2.0 + aSeed.yzx * 5.0 + uTime * 0.1) * 0.08 * k;

  float spin = uTime * (0.6 + aSeed.y * 1.5) + k * 4.0 + aSeed.z * TAU;
  mat3 R = rotAxis(vec3(aSeed.y - 0.5, aSeed.x - 0.5, aSeed.z), spin);
  float size = uSize * (0.5 + aSeed.x) * smoothstep(0.0, 0.2, s);
  vec3 local3 = R * (position * vec3(0.45, 1.9, 0.45)) * size;

  vec4 world = modelMatrix * vec4(pos + local3, 1.0);
  vNormal = normalize(mat3(modelMatrix) * (R * normal));
  vView = normalize(cameraPosition - world.xyz);
  vBary = bary;
  vEnergy = 0.3 + (1.0 - k) * 1.4 + uFlare * 1.6;
  vSparkle = step(0.9, hash11(aSeed.y * 71.0 + floor(uTime * 5.0 + aSeed.z * 7.0))) * (0.3 + uFlare);
  vFade = smoothstep(0.0, 0.15, s);
  vSeam = 0.0;
  gl_Position = projectionMatrix * viewMatrix * world;
}
