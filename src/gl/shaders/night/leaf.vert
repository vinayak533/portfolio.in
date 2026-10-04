// Leaves and torn grass carried on the wind. Each instance drifts downwind,
// wraps, bobs on turbulence and tumbles about its own axis. Leaves far from
// the focus plane are drawn softer (a cheap depth of field).
#include "../common/utils.glsl"

attribute vec3 aStart;
attribute vec4 aParams; // size, speed, seed, kind (0 leaf, 1 grass)

uniform float uTime;
uniform vec3 uWind;   // unit direction
uniform vec2 uWrap;   // min, span along the wind
uniform float uFocus; // view depth in focus

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vSeed;
varying float vKind;
varying float vSoft;

void main() {
  float size = aParams.x;
  float speed = aParams.y;
  float seed = aParams.z;
  float kind = aParams.w;
  float t = uTime;

  // Distance travelled along the wind, wrapped into the volume.
  float s0 = dot(aStart, uWind);
  float s = uWrap.x + mod(s0 - uWrap.x + t * speed, uWrap.y);
  vec3 c = aStart + uWind * (s - s0);
  c.y += sin(t * 0.8 + seed * 30.0) * 0.45 + sin(t * 2.1 + seed * 11.0) * 0.12 + (s - uWrap.x) * 0.04;
  c += cross(uWind, vec3(0.0, 1.0, 0.0)) * cos(t * 0.6 + seed * 20.0) * 0.4;

  vec3 axis = normalize(vec3(sin(seed * 12.3), cos(seed * 7.1) + 0.3, sin(seed * 3.7)));
  float ang = t * (1.4 + seed * 2.8) + seed * 20.0;
  mat3 R = rotAxis(axis, ang);
  vec2 shape = kind > 0.5 ? vec2(0.14, 1.0) : vec2(0.5, 1.0);
  vec3 local = R * vec3(position.x * shape.x, position.y * shape.y, 0.0) * size;

  vec4 world = vec4(c + local, 1.0);
  vec4 mv = viewMatrix * world;
  float depth = -mv.z;
  vUv = uv;
  vNormal = R * vec3(0.0, 0.0, 1.0);
  vWorld = world.xyz;
  vSeed = seed;
  vKind = kind;
  vSoft = clamp(abs(depth - uFocus) / (depth < uFocus ? 5.0 : 18.0), 0.06, 0.85);
  // Fade out right at the lens and at the wrap seam.
  float edge = smoothstep(0.0, 2.0, s - uWrap.x) * smoothstep(0.0, 2.0, uWrap.x + uWrap.y - s);
  vSoft = mix(1.0, vSoft, edge * smoothstep(0.5, 1.6, depth));
  gl_Position = projectionMatrix * mv;
}
