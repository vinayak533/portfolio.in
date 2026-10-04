#include "../common/utils.glsl"
#include "../crystal/shade.glsl"

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying float vEnergy;
varying float vSparkle;
varying float vFade;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  if (!gl_FrontFacing) N = -N;
  float edge = facetEdge(vBary, 1.2);
  // Born as hot white text, cooling into violet glass.
  vec3 base = mix(uAccent * 0.25, uInk, clamp(vEnergy - 0.25, 0.0, 1.0) * 0.6);
  vec3 col = crystalShade(N, V, base, edge, vEnergy * 0.6, vSparkle * 3.0);
  col += uInk * max(vEnergy - 0.4, 0.0) * 0.9;
  gl_FragColor = vec4(min(col, vec3(5.0)) * vFade, 1.0);
}
