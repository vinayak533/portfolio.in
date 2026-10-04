// The career path: a light beam that is lit up to the camera's position,
// with energy flowing forward and a hot flare at the head.
uniform float uTime;
uniform float uHead;
uniform float uIntensity;
uniform vec3 uAccent;
uniform vec3 uInk;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;
varying float vDepth;

void main() {
  float x = vUv.x;
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float core = pow(facing, 2.5);
  float lit = smoothstep(uHead + 0.004, uHead - 0.02, x);
  float flow = pow(fract(x * 70.0 - uTime * 1.4), 8.0) * lit;
  float head = exp(-abs(x - uHead) * 260.0);
  float tail = exp(-(uHead - x) * 9.0) * lit;
  vec3 col = uAccent * 0.05 * core;                                   // the path ahead, faint
  col += mix(uAccent, uInk, 0.25) * core * lit * (0.42 + tail * 0.9);  // the path behind
  col += uInk * flow * core * 1.0;
  col += uInk * head * 2.2 * (0.4 + core);
  float fog = smoothstep(42.0, 14.0, vDepth) * smoothstep(0.2, 1.5, vDepth);
  gl_FragColor = vec4(col * fog * uIntensity, 1.0);
}
