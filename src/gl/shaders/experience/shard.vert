// A card's letters as crystal shards. Starts exactly on the glyphs (placed in
// the camera frame of the moment the explosion begins), then separates in
// three beats: the text cracks into glass slabs along glowing fracture lines,
// the slabs drift apart tumbling as rigid pieces, and each slab crumbles into
// shards that burst outward on curl-noise paths. All motion is here.
#include "../common/utils.glsl"

attribute vec3 bary;
attribute vec3 aStart;
attribute vec3 aDir;
attribute vec4 aSeed;
attribute vec4 aChunkC; // slab centre xyz, slab random
attribute vec4 aChunkD; // slab drift direction xyz, seam (1 on a crack line)

uniform float uP;      // 0..1 explosion progress (scroll-scrubbed)
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
  float e = uP;
  float sr = aChunkC.w;
  float seam = aChunkD.w;

  // 1. Crack: hairline gaps open between the slabs.
  float crack = smoothstep(0.0, 0.14, e);
  // 2. Drift: whole slabs separate and tumble about their own centres.
  float drift = smoothstep(0.05, 0.75, e - sr * 0.06);
  // 3. Crumble: shards break free, the fracture lines first, outer slabs next.
  float t0 = max(0.02, 0.2 + sr * 0.2 + aSeed.w * 0.08 - seam * 0.17);
  float local = clamp((e - t0) / (1.0 - t0), 0.0, 1.0);
  float k = 1.0 - pow(1.0 - local, 2.6);

  vec3 slabAxis = vec3(aChunkD.y, -aChunkD.x, 0.35 + sr);
  float slabTurn = crack * (sr - 0.5) * 0.18 + drift * (0.6 + sr * 1.8) * sign(sr - 0.45);
  mat3 S = rotAxis(slabAxis, slabTurn);
  vec3 slabOff = aChunkD.xyz * (crack * 0.045 + drift * (0.3 + sr * 0.8));
  vec3 pos = aChunkC.xyz + S * (aStart - aChunkC.xyz) + slabOff;

  pos += aDir * k * (1.2 + aSeed.x * 3.2);
  pos += curlTrig(aStart * 1.4 + aSeed.yzx * 6.0 + uTime * 0.05) * k * 0.45;
  pos.y -= local * local * 0.55;

  float spin = k * (5.0 + aSeed.y * 12.0) + aSeed.z * TAU;
  mat3 R = S * rotAxis(vec3(aSeed.x - 0.5, aSeed.y - 0.5, aSeed.z), spin);
  float grow = smoothstep(0.0, 0.025, e);
  float shrink = 1.0 - smoothstep(0.5, 1.0, local);
  float size = uSize * (0.55 + aSeed.x * 0.9) * grow * shrink * (1.0 + (1.0 - k) * 0.4);
  vec3 local3 = R * (position * vec3(0.8, 1.35, 0.8)) * size;

  vec4 world = modelMatrix * vec4(pos + local3, 1.0);
  vNormal = normalize(mat3(modelMatrix) * (R * normal));
  vView = normalize(cameraPosition - world.xyz);
  vBary = bary;
  // Hot white text that cools into violet glass as the slabs drift.
  vEnergy = exp(-local * 7.0) * (2.6 - drift * 1.3) + 0.25;
  vSparkle = step(0.93, hash11(aSeed.z * 53.0 + floor(uTime * 6.0 + aSeed.x * 9.0))) * (1.0 - local);
  vFade = shrink;
  // Fracture lines flare as they open, then die down.
  vSeam = seam * crack * (1.0 - smoothstep(0.1, 0.45, e)) * (1.0 - local);
  gl_Position = projectionMatrix * viewMatrix * world;
}
