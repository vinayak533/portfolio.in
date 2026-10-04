// Grass shading, all by hand: wrapped moonlight, backlit translucency (the
// moon sits behind the island, so blade tips glow silver-green), a sheen that
// follows the gusts, the laptop's cool pool of light, and soft analytic
// shadows from the seated figure for both lights.
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uMoonDir;
uniform vec3 uAmbientSky;
uniform vec3 uAmbientGround;
uniform vec3 uLaptopPos;   // island space
uniform vec3 uLaptopColor;
uniform float uLaptopPower;
uniform vec4 uOcc0;        // island-space spheres approximating the figure
uniform vec4 uOcc1;
uniform vec3 uRoot;
uniform vec3 uMid;
uniform vec3 uTip;
uniform vec3 uDry;
uniform vec3 uHaze;

varying vec3 vWorld;
varying vec3 vLocal;
varying vec3 vNormal;
varying float vT;
varying float vSeed;
varying float vGust;

// Soft shadow of a sphere along a ray: closest-approach distance, feathered.
float sphereShadow(vec3 p, vec3 dir, float maxT, vec4 s) {
  vec3 oc = s.xyz - p;
  float b = dot(oc, dir);
  if (b < 0.0 || b > maxT) return 1.0;
  float d = length(oc - dir * b);
  return smoothstep(s.w * 0.55, s.w * 1.9, d);
}

float figureShadow(vec3 p, vec3 dir, float maxT) {
  return min(sphereShadow(p, dir, maxT, uOcc0), sphereShadow(p, dir, maxT, uOcc1));
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);

  float hue = fract(vSeed * 7.13);
  vec3 tip = mix(uTip, uDry, smoothstep(0.72, 1.0, hue) * 0.75);
  vec3 alb = mix(uRoot, mix(uMid, tip, smoothstep(0.35, 1.0, vT)), smoothstep(0.0, 0.45, vT));
  alb *= 0.75 + 0.5 * fract(vSeed * 13.7);
  float ao = mix(0.1, 1.0, pow(vT, 0.85));

  // Moon key.
  float keyShadow = figureShadow(vLocal, uKeyDir, 4.0);
  float ndl = dot(N, uKeyDir);
  float diff = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
  float sheen = vGust * smoothstep(0.35, 1.0, vT);
  float trans = pow(clamp(dot(-V, uMoonDir), 0.0, 1.0), 3.0) * (0.25 + 0.75 * vT);
  vec3 H = normalize(uKeyDir + V);
  float spec = pow(max(dot(N, H), 0.0), 36.0) * smoothstep(0.45, 1.0, vT);

  vec3 amb = mix(uAmbientGround, uAmbientSky, N.y * 0.5 + 0.5);
  vec3 col = alb * amb * ao;
  col += alb * uKeyColor * diff * ao * keyShadow * (0.75 + 0.55 * sheen);
  col += alb * uKeyColor * trans * 1.6 * keyShadow;
  col += uKeyColor * (spec * 0.18 + sheen * sheen * 0.03) * keyShadow;

  // Laptop glow: short, soft falloff; blades pass light through, so wrap it.
  vec3 dl = uLaptopPos - vLocal;
  float dist = length(dl);
  vec3 L = dl / max(dist, 1e-4);
  float att = uLaptopPower / (1.0 + dist * dist * 16.0) * smoothstep(2.2, 0.15, dist);
  float lam = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  float lapShadow = figureShadow(vLocal, L, dist);
  col += alb * uLaptopColor * att * lam * mix(0.25, 1.0, vT) * lapShadow;

  // Atmospheric perspective.
  float far = length(cameraPosition - vWorld);
  col = mix(col, uHaze, smoothstep(16.0, 46.0, far) * 0.6);

  gl_FragColor = vec4(col, 1.0);
}
