varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
