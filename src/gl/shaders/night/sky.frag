// Night dome: midnight-navy gradient with a faint warm horizon, sparse
// twinkling stars that thin out near the moon, and a large, properly exposed
// full moon (limb darkening, maria, a tight silver halo and a wide glow).
// Linear HDR out; the moon is bright enough to bloom and seed the light rays.
#include "../common/utils.glsl"

uniform float uTime;
uniform float uOpacity;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uWarm;
uniform vec3 uMoon;
uniform sampler2D uNoise;
varying vec3 vDir;

#define MOON_R 0.0235

float stars(vec3 d, float scale, float threshold) {
  vec3 p = d * scale;
  vec3 id = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash21(id.xy + id.z * 17.31);
  if (h < threshold) return 0.0;
  vec3 o = (vec3(hash21(id.yz + 3.1), hash21(id.zx + 7.7), hash21(id.xy + 1.3)) - 0.5) * 0.6;
  float r = length(f - o);
  float tw = 0.6 + 0.4 * sin(uTime * (0.8 + h * 2.5) + h * 40.0);
  return smoothstep(0.075, 0.0, r) * tw * (h - threshold) / (1.0 - threshold);
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;

  // Gradient: near-black navy overhead, a grey-blue band at the horizon.
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.04, 0.55, y), 0.55));
  col *= 0.55 + 0.45 * smoothstep(-0.35, 0.0, y);
  // A low, very slight warmth along the horizon, stronger away from the moon.
  float md = dot(d, uMoonDir);
  col += uWarm * exp(-abs(y - 0.012) * 26.0) * (0.05 + 0.04 * (1.0 - md));
  // Moonlit air: wide cool glow around the moon.
  col += uMoon * (exp((md - 1.0) * 160.0) * 0.07 + exp((md - 1.0) * 22.0) * 0.03 + exp((md - 1.0) * 4.0) * 0.01);

  // Stars: sparse, turning slowly, washed out near the moon and the horizon.
  float a = uTime * 0.003;
  vec3 sd = vec3(d.x * cos(a) - d.z * sin(a), d.y, d.x * sin(a) + d.z * cos(a));
  float s = stars(sd, 240.0, 0.9915) * 1.1 + stars(sd, 470.0, 0.9955) * 0.7;
  s *= smoothstep(0.04, 0.3, y) * smoothstep(0.9986, 0.975, md);
  col += uMoon * s * 0.55;

  // Moon disc.
  vec3 mr = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 mu = cross(mr, uMoonDir);
  vec2 mp = vec2(dot(d, mr), dot(d, mu)) / MOON_R;
  float rr = dot(mp, mp);
  float disc = smoothstep(1.0, 0.94, rr) * step(0.0, md);
  if (disc > 0.0) {
    float limb = sqrt(max(1.0 - rr, 0.0));
    vec2 q = mp * 0.42 + 0.31;
    float maria = texture2D(uNoise, q).r * 0.55 + texture2D(uNoise, q * 2.1 + 0.17).g * 0.3 + texture2D(uNoise, q * 5.3).b * 0.15;
    float dark = smoothstep(0.42, 0.66, maria) * 0.42;
    float craters = smoothstep(0.62, 0.8, texture2D(uNoise, q * 9.0 + 0.5).a) * 0.12;
    float albedo = (1.0 - dark - craters) * (0.62 + 0.38 * pow(limb, 0.55));
    col = mix(col, uMoon * 2.6 * albedo, disc);
  }
  // Tight halo hugging the disc.
  col += uMoon * exp(-max(sqrt(rr) - 1.0, 0.0) * 5.5) * 0.22 * (1.0 - disc);

  // Rare, faint shooting star.
  float cycle = floor(uTime / 19.0);
  float tt = fract(uTime / 19.0) * 19.0;
  if (tt < 0.8) {
    vec3 start = normalize(vec3(hash11(cycle) - 0.6, 0.42 + hash11(cycle + 4.0) * 0.25, -0.7 - hash11(cycle + 9.0) * 0.3));
    vec3 dir = normalize(cross(start, vec3(0.2, 1.0, 0.1)));
    vec3 head = normalize(start + dir * tt * 0.4);
    vec3 tail = normalize(start + dir * max(tt * 0.4 - 0.1, 0.0));
    vec3 pa = d - tail;
    vec3 ba = head - tail;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
    float dist = length(pa - ba * h);
    float fade = sin(tt / 0.8 * PI);
    col += uMoon * smoothstep(0.0012, 0.0, dist) * h * h * fade * 1.2;
  }

  col += (hash21(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(col * uOpacity, uOpacity);
}
