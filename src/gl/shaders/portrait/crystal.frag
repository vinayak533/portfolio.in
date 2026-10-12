#include "../common/utils.glsl"
#include "../crystal/shade.glsl"

uniform float uOpacity;
uniform sampler2D uPhoto;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vColor;
varying vec3 vBary;
varying float vLum;
varying float vEnergy;
varying float vSparkle;
varying float vArrive;
varying float vRim;
varying float vIdle;
varying vec2 vUv;
varying float vLock;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  if (!gl_FrontFacing) N = -N;

  // Locked crystals show the photo itself. Premultiplied, so the soft hair edge darkens into
  // the background instead of carrying the old studio backdrop; outside the matte they vanish.
  vec4 photo = texture2D(uPhoto, vUv);
  if (vLock > 0.5 && photo.a < 0.35) discard;
  vec2 q = vec2(vUv.x, 1.0 - vUv.y);
  // Same oval vignette as the sampler, so the bust still fades out at the shoulders.
  float vig = (1.0 - smoothstep(0.72, 1.0, length(vec2((q.x - 0.46) / 0.56, (q.y - 0.4) / 0.66)))) * (1.0 - smoothstep(0.84, 1.0, q.y));
  float cover = mix(1.0, photo.a * vig, vLock);

  vec3 base = mix(vColor, photo.rgb, vLock) * cover;
  // Particles still in flight read as raw energy rather than photo colour.
  base = mix(mix(uAccent, uInk, 0.4) * 0.6, base, vArrive * 0.85 + 0.15);

  // Photo-faithful crystal: albedo carries the likeness, glass only adds glints.
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  float edge = facetEdge(vBary, 1.0);
  vec3 refl = crystalEnv(reflect(-V, N));
  // Settled crystals flatten their facet shading: random orientations would
  // otherwise read as speckle noise across the face.
  float settle = vArrive * (1.0 - min(vEnergy, 1.0));
  // Facet glare on the sparse lower edge would read as a bright band: keep it quiet.
  settle = max(settle, vRim * 0.6 * vArrive);
  // Once assembled, the static glitter (twinkles, facet glints, edge lines) fades out so the
  // photo reads clean. Beam, shimmer and cursor energy still light the crystals as before.
  float calm = 1.0 - vIdle * (1.0 - min(vEnergy, 1.0));
  vec3 col = base * mix(mix(0.5 + 0.62 * ndv, 0.98 + 0.14 * ndv, settle), 1.0, vLock);
  col += refl * (0.1 + fres * 0.8) * 0.45 * (1.0 - settle * 0.8) * calm;
  col += uAccent * fres * (0.1 * (1.0 - settle * 0.6) * calm + vEnergy * 1.1);
  col += mix(uAccent, uInk, 0.3) * edge * (0.08 * (1.0 - settle * 0.5) * calm + vEnergy * 1.2);
  col += uInk * vSparkle * 2.5 * calm;
  col += mix(uAccent, uInk, 0.55) * vEnergy * 0.8;

  gl_FragColor = vec4(col * uOpacity, 1.0);
}
