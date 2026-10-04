import { BlendFunction, Effect } from 'postprocessing'
import { Uniform } from 'three'

/**
 * Final display-referred pass: monochrome film grain weighted toward the
 * mid-tones (shadows stay inky, highlights stay clean) and a soft oval
 * vignette. Replaces the stock RGB noise, which speckles bright glows.
 */
const fragment = /* glsl */ `
uniform float uGrain;
uniform float uVignette;
uniform float uSeed;

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;

  vec2 d = (uv - 0.5) * vec2(aspect, 1.0) / max(aspect, 1.0);
  float v = smoothstep(0.95, 0.18, length(d) * 1.25);
  c *= mix(1.0 - uVignette, 1.0, v);

  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float g = grainHash(floor(uv * resolution) + uSeed * 1013.0) - 0.5;
  float weight = smoothstep(0.0, 0.18, l) * (1.0 - smoothstep(0.55, 1.0, l)) + 0.22;
  c += g * uGrain * weight;

  outputColor = vec4(c, inputColor.a);
}
`

export class FilmEffect extends Effect {
  private frame = 0
  constructor({ grain = 0.06, vignette = 0.55 } = {}) {
    super('FilmEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['uGrain', new Uniform(grain)],
        ['uVignette', new Uniform(vignette)],
        ['uSeed', new Uniform(0)],
      ]),
    })
  }

  update() {
    // 24 fps grain cadence feels like film rather than TV static.
    this.frame++
    if (this.frame % 2 === 0) this.uniforms.get('uSeed')!.value = Math.random()
  }
}
