#include "../common/utils.glsl"

attribute vec3 bary;
attribute vec3 aTarget;
attribute vec3 aDust;
attribute vec3 aColor;
attribute vec4 aData; // lum, seedA, seedB, v

uniform float uTime;
uniform float uScan;      // 0..1 beam sweep, scrubbed by scroll
uniform float uShimmer;   // 0..1 second pass
uniform float uSize;
uniform vec3 uPointer;    // local space
uniform float uPointerStrength;
uniform float uIdle;      // 0..1 breathing amount after assembly

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying vec3 vBary;
varying float vLum;
varying float vEnergy;
varying float vSparkle;
varying float vArrive;

void main() {
  float lum = aData.x;
  float sa = aData.y;
  float sb = aData.z;
  float v = aData.w;

  // The beam travels a little past both edges so the first and last rows get a full flight.
  float beam = uScan * 1.3 - 0.12;
  float flight = remap01(beam - v, 0.0, 0.12 + sa * 0.16);
  float arrive = easeInOutCubic(flight);
  float arc = sin(arrive * PI);

  // Curl-noise flight from dust to target.
  vec3 base = mix(aDust, aTarget, arrive);
  vec3 flow = curlTrig(base * 0.42 + vec3(sa * 7.0, sb * 7.0, uTime * 0.1));
  vec3 pos = base + flow * arc * (0.55 + sb * 0.7);
  // Before arrival the dust drifts lazily.
  pos += (1.0 - arrive) * vec3(sin(uTime * 0.21 + sa * 31.0), cos(uTime * 0.17 + sb * 29.0), sin(uTime * 0.13 + sa * 17.0)) * 0.32;

  // Second pass: a depth shimmer wave rolling down the assembled face.
  float sw = exp(-pow((v - (uShimmer * 1.35 - 0.18)) * 8.0, 2.0)) * step(0.001, uShimmer) * step(uShimmer, 0.999);
  pos.z += sw * (0.18 + lum * 0.55) * arrive;

  // Breathing + twinkle drift once assembled.
  pos.z += sin(uTime * 0.85 + v * 5.5 + sa * 0.8) * 0.03 * arrive * uIdle;
  pos.xy += vec2(sin(uTime * 0.6 + sb * 40.0), cos(uTime * 0.5 + sa * 40.0)) * 0.006 * arrive;

  // Cursor scatter. The pointer itself is spring-damped on the CPU, so the
  // field eases in and particles settle back as it leaves.
  vec2 dp = pos.xy - uPointer.xy;
  float dist2 = dot(dp, dp);
  float push = exp(-dist2 * 2.6) * uPointerStrength * arrive;
  vec2 dir = dp / (sqrt(dist2) + 1e-3);
  pos.xy += dir * push * (0.35 + sb * 0.45);
  pos.z += push * (0.9 + sa * 0.8);

  // Orientation: tumbling in flight, nearly still once locked in.
  float spin = sa * TAU + uTime * (0.25 + sa * 0.9) * (1.0 - arrive * 0.9) + push * 2.0;
  mat3 R = rotAxis(vec3(sa - 0.5, sb - 0.5, 0.4), spin);
  float size = uSize * mix(0.62, 1.18, lum) * (0.75 + sb * 0.5);
  size *= mix(0.55, 1.0, arrive);
  size *= sb > 0.986 ? 2.4 : 1.0; // rare large shards make the crystal nature readable
  vec3 local = R * (position * vec3(0.9, 1.5, 0.9)) * size;

  vec4 world = modelMatrix * vec4(pos + local, 1.0);
  vNormal = normalize(mat3(modelMatrix) * (R * normal));
  vView = normalize(cameraPosition - world.xyz);
  vColor = aColor;
  vBary = bary;
  vLum = lum;
  vArrive = arrive;

  float nearBeam = exp(-abs(v - beam) * 26.0) * step(0.001, uScan) * step(uScan, 0.999);
  vEnergy = nearBeam * 1.6 + arc * 0.9 + sw * 0.8 + push * 0.9;
  vSparkle = step(0.988, hash11(sa * 97.13 + floor(uTime * 2.4 + sb * 9.0))) * arrive * (0.6 + lum);

  gl_Position = projectionMatrix * viewMatrix * world;
}
