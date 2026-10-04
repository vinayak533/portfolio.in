// Lit impostor sphere with noise-eroded edges. Wrapped key light from the
// moon's bearing shapes the towers; deep navy bellies; a silver lining on the
// edges that face the moon on screen, strongest for clouds close to it, and a
// glow through thin parts when backlit. Far clouds sink into the horizon haze.
uniform float uTime;
uniform float uOpacity;
uniform vec3 uKeyDir;
uniform vec3 uMoonDir;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamBack;
uniform vec3 uShadow;
uniform vec3 uLit;
uniform vec3 uSilver;
uniform vec3 uHaze;
uniform vec3 uWarm;
uniform sampler2D uNoise;

varying vec2 vUv;
varying float vSeed;
varying float vHeight;
varying float vFade;
varying float vDepth;
varying float vKind;
varying vec2 vMoonVec;
varying vec3 vView;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  vec2 q = p * 0.55 + vec2(vSeed * 7.0, vSeed * 3.0) + vec2(uTime * 0.006, 0.0);
  vec4 n1 = texture2D(uNoise, q);
  // Rotated octaves so the value-noise lattice never lines up into blocks.
  const mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  vec4 n2 = texture2D(uNoise, rot * q * 2.3 + 0.37);
  vec4 n3 = texture2D(uNoise, rot * rot * q * 5.1 + 0.71);
  float n = n1.g * 0.45 + n1.b * 0.2 + n2.b * 0.2 + n3.a * 0.15;
  float edge = r + (n - 0.5) * (vKind > 0.5 ? 0.9 : 0.75);
  float density = smoothstep(1.0, 0.48, edge) * smoothstep(1.0, 0.74, r);
  if (vKind > 0.5) density *= 0.2 * smoothstep(0.2, 0.7, n2.g + 0.25);
  if (density < 0.004) discard;

  // Flattened impostor normal: enough to model the billows, not so much that
  // every puff reads as a separate ball.
  vec3 nv = normalize(vec3(p * 0.6, 1.0));
  vec3 nw = normalize(nv.x * uCamRight + nv.y * uCamUp + nv.z * uCamBack);
  float tops = smoothstep(-0.8, 0.8, nw.y);
  float side = clamp(dot(nw, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
  // Cluster-level gradient does most of the work: dark bellies, lit crowns.
  float body = mix(0.18, 1.0, smoothstep(0.0, 0.95, vHeight));
  float light = body * (0.62 + 0.25 * tops + 0.13 * side);
  // Soft texture inside a puff; depth comes from puff-to-puff variation.
  light *= 0.72 + 0.38 * n1.r * (0.6 + 0.4 * n2.g);
  light *= 0.7 + 0.48 * fract(vSeed * 7.7);

  // Silver lining on the crowns that face the moon, by closeness to it in view.
  float toMoon = max(dot(vView, uMoonDir), 0.0);
  float near = pow(toMoon, 8.0) * 0.3 + pow(toMoon, 60.0) * 0.8 + pow(toMoon, 300.0) * 1.1 + 0.04;
  float facing = dot(normalize(p + 1e-4), normalize(vMoonVec + 1e-4)) * 0.5 + 0.5;
  float crown = smoothstep(0.45, 0.95, vHeight + nw.y * 0.3);
  float rim = smoothstep(0.6, 0.97, edge) * facing * facing * facing * near * crown;
  float thin = 0.0;

  vec3 col = mix(uShadow, uLit, light * light);
  col += uWarm * 0.05 * smoothstep(45.0, 95.0, vDepth) * (1.0 - vHeight);
  float haze = smoothstep(24.0, 105.0, vDepth);
  col = mix(col, uHaze, haze * 0.82);

  float alpha = density * vFade * uOpacity;
  vec3 glow = uSilver * (rim + thin) * sqrt(alpha) * (1.0 - haze * 0.6);
  gl_FragColor = vec4(col * alpha + glow, alpha);
}
