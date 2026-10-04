// A card's letters as crystal shards. Starts exactly on the glyphs (placed in
// the camera frame of the moment the explosion begins), then bursts outward on
// curl-noise paths, tumbling, flaring and fading. All motion is here.
#include "../common/utils.glsl"

attribute vec3 bary;
attribute vec3 aStart;
attribute vec3 aDir;
attribute vec4 aSeed;

uniform float uP;      // 0..1 explosion progress (scroll-scrubbed)
uniform float uTime;
uniform float uSize;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying float vEnergy;
varying float vSparkle;
varying float vFade;

void main() {
  float e = uP;
  // Each shard leaves a touch later the further it is from the blast centre.
  float local = clamp((e - aSeed.w * 0.12) / (1.0 - aSeed.w * 0.12), 0.0, 1.0);
  float k = 1.0 - pow(1.0 - local, 2.6);

  vec3 pos = aStart + aDir * k * (1.4 + aSeed.x * 3.4);
  pos += curlTrig(aStart * 1.4 + aSeed.yzx * 6.0 + uTime * 0.05) * k * 0.45;
  pos.y -= local * local * 0.55;

  float spin = k * (5.0 + aSeed.y * 12.0) + aSeed.z * TAU;
  mat3 R = rotAxis(vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z), spin);
  float grow = smoothstep(0.0, 0.025, e);
  float shrink = 1.0 - smoothstep(0.5, 1.0, local);
  float size = uSize * (0.55 + aSeed.x * 0.9) * grow * shrink * (1.0 + (1.0 - k) * 0.4);
  vec3 local3 = R * (position * vec3(0.8, 1.35, 0.8)) * size;

  vec4 world = modelMatrix * vec4(pos + local3, 1.0);
  vNormal = normalize(mat3(modelMatrix) * (R * normal));
  vView = normalize(cameraPosition - world.xyz);
  vBary = bary;
  vEnergy = exp(-local * 7.0) * 2.6 + 0.25;
  vSparkle = step(0.93, hash11(aSeed.z * 53.0 + floor(uTime * 6.0 + aSeed.x * 9.0))) * (1.0 - local);
  vFade = shrink;
  gl_Position = projectionMatrix * viewMatrix * world;
}
