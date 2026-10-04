attribute vec3 bary;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying vec3 vLocal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  vBary = bary;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * world;
}
