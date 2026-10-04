import { BlendFunction, Effect, ShaderPass } from 'postprocessing'
import { HalfFloatType, ShaderMaterial, Uniform, Vector2, WebGLRenderTarget, type TextureDataType, type WebGLRenderer } from 'three'

/**
 * Screen-space light scattering from the moon (GPU Gems 3, ch. 13). The bright
 * parts of the frame (the moon, its halo, silver cloud edges) are smeared along
 * lines toward the moon at reduced resolution, so shafts only appear where light
 * actually gets through gaps in the clouds. The result is added in the merged
 * effect pass before tone mapping.
 */
const rayFrag = /* glsl */ `
uniform sampler2D inputBuffer;
uniform vec2 uLight;
uniform float uThreshold;
uniform float uDensity;
uniform float uDecay;
uniform float uAspect;
varying vec2 vUv;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 delta = (vUv - uLight) * uDensity / float(SAMPLES);
  vec2 coord = vUv - delta * hash(gl_FragCoord.xy);
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < SAMPLES; i++) {
    coord -= delta;
    vec3 s = texture2D(inputBuffer, coord).rgb;
    float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
    acc += s * (max(l - uThreshold, 0.0) / max(l, 1e-4)) * illum;
    illum *= uDecay;
  }
  acc /= float(SAMPLES);
  float fall = exp(-length((vUv - uLight) * vec2(uAspect, 1.0)) * 1.5);
  gl_FragColor = vec4(acc * fall, 1.0);
}
`

const rayVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`

const mergeFrag = /* glsl */ `
uniform sampler2D tRays;
uniform float uIntensity;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(texture2D(tRays, uv).rgb * uIntensity, inputColor.a);
}
`

export class MoonRaysEffect extends Effect {
  private target: WebGLRenderTarget
  private pass: ShaderPass
  private material: ShaderMaterial
  private scale: number
  /** Moon position in screen uv (0..1). */
  readonly light: Vector2
  intensity = 0

  constructor({ samples = 40, resolutionScale = 0.5, threshold = 0.55 } = {}) {
    const tRays = new Uniform<WebGLRenderTarget['texture'] | null>(null)
    super('MoonRaysEffect', mergeFrag, {
      blendFunction: BlendFunction.ADD,
      uniforms: new Map<string, Uniform>([
        ['tRays', tRays],
        ['uIntensity', new Uniform(0)],
      ]),
    })
    this.scale = resolutionScale
    this.target = new WebGLRenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType })
    this.target.texture.name = 'MoonRays.Target'
    tRays.value = this.target.texture
    this.light = new Vector2(0.7, 0.8)
    this.material = new ShaderMaterial({
      vertexShader: rayVert,
      fragmentShader: rayFrag,
      defines: { SAMPLES: String(samples) },
      depthTest: false,
      depthWrite: false,
      uniforms: {
        inputBuffer: { value: null },
        uLight: { value: this.light },
        uThreshold: { value: threshold },
        uDensity: { value: 0.92 },
        uDecay: { value: 0.972 },
        uAspect: { value: 1 },
      },
    })
    this.pass = new ShaderPass(this.material)
  }

  update(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget) {
    this.uniforms.get('uIntensity')!.value = this.intensity
    if (this.intensity < 1e-3) return
    this.pass.render(renderer, inputBuffer, this.target)
  }

  setSize(width: number, height: number) {
    this.target.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)))
    this.material.uniforms.uAspect.value = width / Math.max(height, 1)
  }

  initialize(renderer: WebGLRenderer, alpha: boolean, frameBufferType: TextureDataType) {
    this.pass.initialize(renderer, alpha, frameBufferType)
  }

  dispose() {
    this.target.dispose()
    this.material.dispose()
    super.dispose()
  }
}
