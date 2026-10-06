// solid.vert for a crystal that can come apart: each facet lifts off along its
// own normal and tilts about its centroid as uSplit rises (see withFacets()).
#include "../common/utils.glsl"
attribute vec3 bary;
attribute vec4 aFace; // facet centroid xyz, random
uniform float uSplit;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying vec3 vLocal;
void main() {
  vec3 c = aFace.xyz;
  float r = aFace.w;
  vec3 n = normalize(c);
  float s = uSplit * (0.55 + r * 0.9);
  vec3 axis = cross(n, normalize(vec3(r - 0.5, 0.7, 0.31)));
  float turn = s * (0.7 + r * 1.4) * sign(r - 0.5) + sin(uTime * (0.6 + r) + r * TAU) * 0.12 * uSplit;
  mat3 R = rotAxis(axis + vec3(1e-4, 0.0, 0.0), turn);
  vec3 p = c + R * (position - c);
  p += n * s * 0.6 + curlTrig(c * 3.0 + uTime * 0.25) * 0.05 * uSplit;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vNormal = normalize(mat3(modelMatrix) * (R * normal));
  vView = normalize(cameraPosition - world.xyz);
  vBary = bary;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * world;
}
