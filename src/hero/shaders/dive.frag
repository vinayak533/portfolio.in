// Half-res lens for the dive: a radial streak toward the zoom centre that
// grows with zoom speed, plus a golden-angle disc of depth of field that
// opens away from the screen. The final pass blends it in only where the
// blur is wider than a couple of pixels, so the laptop stays sharp.
#include "./common.glsl"

uniform sampler2D uScene;
uniform vec2 uAnchor;    // zoom centre, screen uv (y up)
uniform float uAspect;
uniform float uMotion;   // streak length as a fraction of the distance to the anchor
uniform float uDof;      // max disc radius, viewport heights
uniform float uFocus;    // sharp radius around the anchor, viewport heights

varying vec2 vUv;

const int TAPS = 12;

void main() {
  vec2 d = vUv - uAnchor;
  float r = length(d * vec2(uAspect, 1.0));
  float dof = uDof * smoothstep(uFocus, uFocus + 0.45, r);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 acc = vec3(0.0);
  for (int i = 0; i < TAPS; i++) {
    float f = (float(i) + jitter) / float(TAPS);
    float a = float(i) * 2.39996323 + jitter * TAU;
    vec2 o = -d * uMotion * f + vec2(cos(a), sin(a)) * sqrt(f) * dof / vec2(uAspect, 1.0);
    acc += texture(uScene, vUv + o).rgb;
  }
  gl_FragColor = vec4(acc / float(TAPS), 1.0);
}
