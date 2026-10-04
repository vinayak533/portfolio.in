uniform vec3 uInk;
uniform vec3 uAccent;
uniform float uOpacity;
varying float vAlpha;
varying float vTwinkle;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float core = smoothstep(0.5, 0.0, r);
  core *= core;
  vec3 col = mix(uAccent, uInk, 0.55 + 0.45 * vTwinkle);
  gl_FragColor = vec4(col * core * vAlpha * vTwinkle * 0.9 * uOpacity, 1.0);
}
