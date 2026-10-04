#include "../common/utils.glsl"

uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uTime;
uniform vec3 uBase;
uniform vec3 uAccent;
uniform vec3 uInk;
uniform float uGlow;
uniform sampler2D uNoise;
varying vec2 vNdc;

void main() {
  vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
  v /= v.w;
  vec3 dir = normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);

  vec3 col = uBase;

  // Volumetric light shafts falling from a source high above and ahead.
  vec3 L = normalize(vec3(-0.22, 0.86, -0.46));
  float d = dot(dir, L);
  float cone = smoothstep(-0.1, 1.0, d);
  vec3 t1 = normalize(cross(L, vec3(0.0, 0.0, 1.0)));
  vec3 t2 = cross(L, t1);
  float ang = atan(dot(dir, t2), dot(dir, t1)) / TAU;
  vec4 nr = texture2D(uNoise, vec2(ang, uTime * 0.004));
  float rays = pow(nr.g, 3.0) * 1.6 + pow(nr.b, 4.0) * 0.8;
  col += mix(uAccent, uInk, 0.35) * cone * cone * cone * (0.012 + rays * 0.05) * uGlow;

  // Slow violet haze from a spherical lookup (u wraps seamlessly: the texture tiles).
  vec2 suv = vec2(atan(dir.z, dir.x) / TAU, dir.y * 0.35);
  vec4 nh = texture2D(uNoise, suv + vec2(uTime * 0.002, 0.0));
  float haze = nh.r * 0.65 + nh.g * 0.35;
  col += uAccent * smoothstep(0.5, 0.92, haze) * 0.016 * uGlow;

  // A whisper of light from above so the void has an up and a down.
  col += uInk * 0.004 * smoothstep(-0.3, 0.9, dir.y);

  // Dither kills banding in the gradients.
  col += (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
