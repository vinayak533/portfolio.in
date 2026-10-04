// Dust and fireflies are additive (alpha 0 under premultiplied blending);
// leaves are opaque-ish silhouettes that occlude.
varying float vKind;
varying float vAlpha;
varying float vSoft;
varying float vAngle;
varying float vSquash;
varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  if (vKind > 1.5) {
    float cs = cos(vAngle);
    float sn = sin(vAngle);
    c = mat2(cs, -sn, sn, cs) * c;
    c.y /= max(0.22, abs(vSquash)); // flattens as it turns edge-on
    float d = length(c * vec2(1.0, 2.4));
    float a = (1.0 - smoothstep(0.72 - vSoft * 0.5, 0.8, d)) * vAlpha * mix(1.0, 0.55, vSoft);
    gl_FragColor = vec4(vColor * a, a);
  } else {
    float d = length(c);
    float core = exp(-d * d * mix(10.0, 3.5, vSoft));
    float a = core * (1.0 - smoothstep(0.8, 1.0, d)) * vAlpha;
    gl_FragColor = vec4(vColor * a, 0.0);
  }
}
