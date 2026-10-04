#include "../common/utils.glsl"
#include "../crystal/shade.glsl"

uniform float uDuotone;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying vec3 vBary;
varying float vLum;
varying float vEnergy;
varying float vSparkle;
varying float vArrive;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  if (!gl_FrontFacing) N = -N;

  // Spectral duotone: deep violet shadows to white highlights.
  float l = pow(vLum, 0.9);
  vec3 duo = mix(uAccent * 0.08, mix(uAccent * 0.9, uInk * 1.15, smoothstep(0.35, 0.95, l)), smoothstep(0.02, 0.6, l));
  vec3 base = mix(vColor, duo, uDuotone);
  // Particles still in flight read as raw energy rather than photo colour.
  base = mix(mix(uAccent, uInk, 0.4) * 0.6, base, vArrive * 0.85 + 0.15);

  // Photo-faithful crystal: albedo carries the likeness, glass only adds glints.
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float edge = facetEdge(vBary, 1.0);
  vec3 refl = crystalEnv(reflect(-V, N));
  vec3 col = base * (0.5 + 0.62 * ndv);
  col += refl * (0.1 + fres * 0.8) * (0.45 + uDuotone * 0.55);
  col += uAccent * fres * (0.1 + vEnergy * 1.1);
  col += mix(uAccent, uInk, 0.3) * edge * (0.08 + vEnergy * 1.2);
  col += uInk * vSparkle * 4.0;
  col += mix(uAccent, uInk, 0.55) * vEnergy * 0.8;

  gl_FragColor = vec4(col * uOpacity, 1.0);
}
