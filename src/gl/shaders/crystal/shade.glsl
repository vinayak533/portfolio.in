// Shared crystal look: procedural studio environment, fresnel, fake refraction,
// glowing facet edges and sparkle. Needs utils.glsl. Output is linear HDR.
uniform vec3 uAccent;
uniform vec3 uInk;

vec3 crystalEnv(vec3 d) {
  // Dark void with a soft key light top-left, a cool violet rim from below-right.
  float key = pow(max(dot(d, normalize(vec3(-0.45, 0.8, 0.4))), 0.0), 12.0);
  float fill = pow(max(dot(d, normalize(vec3(0.6, -0.35, 0.7))), 0.0), 4.0);
  float horizon = exp(-abs(d.y) * 6.0);
  vec3 c = vec3(0.004, 0.004, 0.008);
  c += uInk * key * 2.4;
  c += uAccent * fill * 0.9;
  c += mix(uAccent, uInk, 0.35) * horizon * 0.12;
  return c;
}

vec3 crystalShade(vec3 N, vec3 V, vec3 base, float edge, float energy, float sparkle) {
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  vec3 refl = crystalEnv(reflect(-V, N));
  // Dispersion: three refraction indices sampled through the environment.
  vec3 rr = refract(-V, N, 0.62);
  vec3 rg = refract(-V, N, 0.66);
  vec3 rb = refract(-V, N, 0.70);
  vec3 refr = vec3(crystalEnv(rr).r, crystalEnv(rg).g, crystalEnv(rb).b);
  vec3 col = base * (0.42 + 0.58 * ndv);
  col += refr * (0.55 + base * 0.6);
  col += refl * (0.25 + fres * 1.6);
  col += uAccent * fres * (0.35 + energy * 1.4);
  col += mix(uAccent, uInk, 0.25) * edge * (0.6 + energy * 2.2);
  col += uInk * sparkle;
  return col;
}

// Facet edge factor from barycentric coordinates.
float facetEdge(vec3 bary, float width) {
  vec3 d = fwidth(bary);
  vec3 a = smoothstep(vec3(0.0), d * width, bary);
  return 1.0 - min(min(a.x, a.y), a.z);
}
