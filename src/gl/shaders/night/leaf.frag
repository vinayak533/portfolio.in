// Leaf / grass-fragment shape and light: pointed outline with a midrib,
// wrapped moonlight plus translucency when the moon is behind it.
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uMoonDir;
uniform vec3 uAmbient;
uniform vec3 uLeaf;
uniform vec3 uLeafLit;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vSeed;
varying float vKind;
varying float vSoft;

void main() {
  vec2 p = vUv - 0.5;
  // Pointed ellipse: width tapers to both ends, sharper at the tip.
  float y = p.y * 2.0;
  float halfW = 0.5 * pow(max(1.0 - y * y, 0.0), mix(0.75, 0.4, vKind)) * (1.0 - 0.25 * max(y, 0.0));
  float d = abs(p.x) / max(halfW, 1e-3);
  float soft = vSoft;
  float a = smoothstep(1.0, 1.0 - soft, d) * smoothstep(1.0, 1.0 - soft * 0.6, abs(y));
  if (a < 0.01) discard;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float diff = clamp(dot(N, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
  float trans = pow(clamp(dot(-V, uMoonDir), 0.0, 1.0), 2.0) * (0.4 + 0.6 * abs(dot(N, uMoonDir)));
  vec3 alb = mix(uLeaf, uLeafLit, fract(vSeed * 5.3) * 0.6);
  float rib = mix(1.0, 0.7, smoothstep(0.08, 0.0, abs(p.x)) * (1.0 - vKind));
  vec3 col = alb * (uAmbient + uKeyColor * diff * 0.9) * rib + uLeafLit * uKeyColor * trans * 0.9;

  float alpha = a * uOpacity * mix(1.0, 0.55, smoothstep(0.3, 0.85, soft));
  gl_FragColor = vec4(col * alpha, alpha);
}
