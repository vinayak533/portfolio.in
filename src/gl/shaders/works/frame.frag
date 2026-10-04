// Glass frame around each exhibit: hairline border, brighter corner brackets,
// a faint fresnel-like sheen that brightens on hover.
uniform float uHover;
uniform float uFocus;
uniform float uAspect;
uniform float uTime;
uniform vec3 uAccent;
uniform vec3 uInk;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 b = vec2(uAspect, 1.0) * 0.5 - 0.004;
  vec2 d = abs(p) - b;
  float edge = abs(max(d.x, d.y));
  float px = fwidth(edge);
  float border = smoothstep(px * 1.5, 0.0, edge);
  vec2 ap = abs(p);
  float corner = step(b.x - 0.16, ap.x) * step(b.y - 0.16, ap.y);
  float sweep = smoothstep(0.08, 0.0, abs(fract(vUv.x * 0.5 + vUv.y * 0.5 - uTime * 0.06) - 0.5));
  vec3 col = mix(uAccent, uInk, 0.35) * border * (0.25 + corner * 1.2 + uHover * 0.8 + sweep * 0.5);
  col += uInk * sweep * 0.015 * (1.0 - border);
  gl_FragColor = vec4(col * (0.4 + 0.6 * uFocus), 1.0);
}
