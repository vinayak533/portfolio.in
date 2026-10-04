// Camera-facing cumulus puff. Clusters drift along x and wrap; positions stay
// on the GPU, the CPU only sorts draw order for correct blending. Mist puffs
// are the same impostor stretched into a thin horizontal veil.
attribute vec3 aCenter;
attribute vec4 aData; // size, seed, drift speed, height-in-cluster (0 base .. 1 top)
attribute float aKind; // 0 cloud, 1 mist

uniform float uTime;
uniform vec2 uWrap;   // x min, span
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec2 uMoonNdc;
uniform float uAspect;

varying vec2 vUv;
varying float vSeed;
varying float vHeight;
varying float vFade;
varying float vDepth;
varying float vKind;
varying vec2 vMoonVec;
varying vec3 vView;

vec3 driftCenter(vec3 c, float speed) {
  c.x = uWrap.x + mod(c.x - uWrap.x + uTime * speed, uWrap.y);
  return c;
}

void main() {
  vec3 c = driftCenter(aCenter, aData.z);
  float edge = smoothstep(0.0, 10.0, c.x - uWrap.x) * smoothstep(0.0, 10.0, uWrap.x + uWrap.y - c.x);
  float s = aData.x * (1.0 + 0.05 * sin(uTime * 0.25 + aData.y * 31.0));
  vec2 stretch = aKind > 0.5 ? vec2(2.6, 0.62) : vec2(1.0);
  vec3 p = c + (uCamRight * position.x * stretch.x + uCamUp * position.y * stretch.y) * s;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec4 cc = projectionMatrix * viewMatrix * vec4(c, 1.0);
  vMoonVec = (uMoonNdc - cc.xy / max(cc.w, 1e-3)) * vec2(uAspect, 1.0);
  vView = normalize(c - cameraPosition);
  vUv = uv;
  vSeed = aData.y;
  vHeight = aData.w;
  vDepth = -mv.z;
  vKind = aKind;
  // Fade out when the camera flies into a puff, and at the wrap seam.
  vFade = edge * smoothstep(0.4, 2.6, -mv.z - s * 0.4);
  gl_Position = projectionMatrix * mv;
}
