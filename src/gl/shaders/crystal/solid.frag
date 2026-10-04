#include "../common/utils.glsl"
#include "./shade.glsl"
uniform float uEnergy;
uniform float uTime;
uniform float uOpacity;
uniform float uEdge;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying vec3 vLocal;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  if (!gl_FrontFacing) N = -N;
  float edge = facetEdge(vBary, 1.3) * uEdge;
  // A slow internal caustic: light bands drifting through the volume.
  float band = pow(0.5 + 0.5 * sin(dot(vLocal, vec3(3.1, 2.3, 1.7)) * 2.0 - uTime * 0.8), 6.0);
  vec3 base = mix(uAccent * 0.06, uInk * 0.1, 0.4) + uAccent * band * 0.25 * (0.4 + uEnergy);
  vec3 col = crystalShade(N, V, base, edge, uEnergy, 0.0);
  gl_FragColor = vec4(min(col, vec3(5.0)) * uOpacity, 1.0);
}
