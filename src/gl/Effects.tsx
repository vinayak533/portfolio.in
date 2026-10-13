import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ChromaticAberration, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode, type ChromaticAberrationEffect, type EffectComposer as EffectComposerImpl } from 'postprocessing'
import { HalfFloatType, Mesh, OrthographicCamera, PlaneGeometry, Scene, Vector2, WebGLRenderTarget, type Material, type WebGLRenderer } from 'three'
import { useStore, signals } from '../store/useStore'
import { tier } from '../core/quality'
import { damp } from '../core/clock'
import { FilmEffect } from './post/FilmEffect'
import { LeanBloom } from './post/LeanBloom'

/** The live composer (Effects sets it), for the start-up warm-up below. */
const post: { composer: EffectComposerImpl | null; warmed: boolean } = { composer: null, warmed: false }

/**
 * Builds the post passes' programs before they are first needed. The stage draws nothing while the hero covers
 * it, so its first frame is the hero's hand-off, and compiling the bloom's and the composite's shaders there held
 * a mid-range phone's main thread for 90 ms+. Here their materials compile in the background (three's
 * compileAsync: KHR_parallel_shader_compile where there is one), then one frame is drawn while the hero still
 * covers this canvas (nobody sees it), so the driver also builds what it builds on a program's first draw.
 * Once only; skipped if the stage is already on screen (its own frames have done it).
 */
export async function warmPost(gl: WebGLRenderer, covered: () => boolean) {
  const composer = post.composer
  if (!composer || post.warmed || !covered()) return
  post.warmed = true
  const materials = new Set<Material>()
  const seen = new Set<unknown>()
  type Node = Record<string, unknown> & { isMaterial?: boolean; isObject3D?: boolean; isMesh?: boolean; isTexture?: boolean; isRenderTarget?: boolean; isBufferGeometry?: boolean }
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 5) return
    seen.add(v)
    const o = v as Node
    if (o.isMaterial) return void materials.add(o as unknown as Material)
    if (o.isTexture || o.isRenderTarget || o.isBufferGeometry || (o.isObject3D && !o.isMesh)) return
    for (const k of Object.keys(o)) if (k !== 'renderer' && k !== 'parent') walk(o[k], depth + 1)
  }
  for (const pass of composer.passes) walk(pass, 0)
  // Each on a full-screen quad, for both kinds of target a pass draws into (an internal buffer, the canvas).
  const scene = new Scene()
  const quad = new Mesh(new PlaneGeometry(2, 2))
  quad.frustumCulled = false
  scene.add(quad)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const target = new WebGLRenderTarget(4, 4, { type: HalfFloatType })
  const previous = gl.getRenderTarget()
  try {
    for (const m of materials) {
      quad.material = m
      for (const t of [target, null]) {
        gl.setRenderTarget(t)
        const pending = gl.compileAsync(scene, camera)
        gl.setRenderTarget(previous)
        await pending.catch(() => {})
      }
    }
  } finally {
    gl.setRenderTarget(previous)
    target.dispose()
    quad.geometry.dispose()
  }
  if (covered() && post.composer === composer) composer.render(0)
}

/** Cinematic post stack: bloom, scroll-reactive chromatic aberration, ACES, then mono film grain + vignette. */
export function Effects() {
  const quality = useStore((s) => (s.lite ? 'low' : s.quality))
  const cfg = tier[quality]
  const ca = useRef<ChromaticAberrationEffect>(null)
  const setComposer = (c: EffectComposerImpl | null) => {
    if (c && c !== post.composer) post.warmed = false
    post.composer = c
  }
  const offset = useRef(new Vector2(0.0004, 0.0003))
  const amount = useRef(0)

  useFrame((_, dt) => {
    if (!ca.current) return
    const v = Math.min(Math.abs(signals.velocity), 4)
    amount.current = damp(amount.current, 0.00035 + v * 0.0011, 6, dt)
    ca.current.offset.set(amount.current, amount.current * 0.6)
  })

  const bloomFx = useMemo(
    () => new LeanBloom({ intensity: quality === 'low' ? 0.7 : 0.85, luminanceThreshold: 0.62, luminanceSmoothing: 0.28, radius: 0.66, levels: cfg.bloomLevels }),
    [quality, cfg.bloomLevels],
  )
  useEffect(() => () => bloomFx.dispose(), [bloomFx])
  const bloom = <primitive object={bloomFx} />
  const film = useMemo(() => new FilmEffect({ grain: 0.07, vignette: 0.6 }), [])
  const tone = <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
  const grain = <primitive object={film} />

  return cfg.ca ? (
    <EffectComposer ref={setComposer} multisampling={cfg.msaa} enableNormalPass={false}>
      {bloom}
      <ChromaticAberration ref={ca} offset={offset.current} radialModulation modulationOffset={0.25} />
      {tone}
      {grain}
    </EffectComposer>
  ) : (
    <EffectComposer ref={setComposer} multisampling={cfg.msaa} enableNormalPass={false}>
      {bloom}
      {tone}
      {grain}
    </EffectComposer>
  )
}
