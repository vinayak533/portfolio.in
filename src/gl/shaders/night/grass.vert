// Instanced grass blade. Each blade is a tapered strip bent along a quadratic
// curve; a steady wind leans the field one way while travelling gusts and
// scrolling noise patches push it further, so waves visibly sweep across.
#include "../common/utils.glsl"

attribute vec4 aRoot;   // island-space root xyz, rim 0..1
attribute vec4 aParams; // height, width, facing yaw, seed

uniform float uTime;
uniform sampler2D uNoise;
uniform vec2 uWind; // unit wind direction on the ground plane (island space)

varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNormal;
varying float vT;
varying float vSeed;
varying float vGust;

void main() {
  float side = position.x;
  float t = position.y;
  float h = aParams.x;
  float yaw = aParams.z;
  float seed = aParams.w;
  vec3 root = aRoot.xyz;
  float rim = aRoot.w;

  // Wind field: noise patches drifting downwind plus long rolling bands.
  vec2 wp = root.xz;
  float along = dot(wp, uWind);
  float n1 = texture2D(uNoise, wp * 0.055 - uWind * uTime * 0.038).g;
  float n2 = texture2D(uNoise, wp * 0.17 - uWind * uTime * 0.1 + 0.37).b;
  float band = sin(along * 1.1 - uTime * 1.9 + n1 * 3.0) * 0.5 + 0.5;
  float gust = clamp((n1 - 0.35) * 1.6 + band * band * 0.55 + (n2 - 0.5) * 0.35, 0.0, 1.3);
  float flutter = sin(uTime * (3.4 + seed * 2.6) + seed * 40.0 + along * 2.3) * (0.05 + gust * 0.07);

  vec2 natural = vec2(cos(seed * 19.0), sin(seed * 19.0));
  vec2 outward = root.xz / max(length(root.xz), 1e-3);
  vec2 push = natural * (0.25 + 0.3 * fract(seed * 3.7)) + uWind * (0.22 + gust * 0.8) + outward * rim * 1.1;
  float lean = clamp(length(push) * (0.35 + 0.65 * fract(seed * 7.1)), 0.0, 1.25) + flutter;
  vec2 ld = normalize(push);
  vec3 leanDir = vec3(ld.x, 0.0, ld.y);

  // Quadratic curve from the root: straight up at first, tip bowed downwind.
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 tipDir = normalize(up * cos(lean) + leanDir * sin(lean));
  vec3 p1 = up * h * 0.5;
  vec3 p2 = tipDir * h * (1.0 - 0.1 * lean);
  // Rim blades droop over the edge.
  p2.y -= rim * h * 0.28;
  vec3 b = 2.0 * (1.0 - t) * t * p1 + t * t * p2;
  vec3 db = 2.0 * (1.0 - t) * p1 + 2.0 * t * (p2 - p1);
  vec3 tangent = normalize(db);

  vec3 face = vec3(cos(yaw), 0.0, sin(yaw));
  vec3 sideAxis = normalize(cross(up, face));
  sideAxis = normalize(sideAxis - tangent * dot(sideAxis, tangent));
  float width = aParams.y * (1.0 - pow(t, 1.4) * 0.85);
  vec3 pos = root + b + sideAxis * side * width * 0.5;

  vec3 nrm = normalize(cross(sideAxis, tangent));
  // Cheap roundness across the blade.
  nrm = normalize(nrm + sideAxis * side * 0.5);

  vec4 world = modelMatrix * vec4(pos, 1.0);
  vWorld = world.xyz;
  vLocal = pos;
  vNormal = normalize(mat3(modelMatrix) * nrm);
  vT = t;
  vSeed = seed;
  vGust = gust;
  gl_Position = projectionMatrix * viewMatrix * world;
}
