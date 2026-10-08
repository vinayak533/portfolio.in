import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ChromaticAberration, EffectComposer, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode, type ChromaticAberrationEffect } from 'postprocessing'
import { Vector2 } from 'three'
import { useStore, signals } from '../store/useStore'
import { tier } from '../core/quality'
import { damp } from '../core/clock'
import { FilmEffect } from './post/FilmEffect'
import { LeanBloom } from './post/LeanBloom'

/** Cinematic post stack: bloom, scroll-reactive chromatic aberration, ACES, then mono film grain + vignette. */
export function Effects() {
  const quality = useStore((s) => (s.lite ? 'low' : s.quality))
  const cfg = tier[quality]
  const ca = useRef<ChromaticAberrationEffect>(null)
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
    <EffectComposer multisampling={cfg.msaa} enableNormalPass={false}>
      {bloom}
      <ChromaticAberration ref={ca} offset={offset.current} radialModulation modulationOffset={0.25} />
      {tone}
      {grain}
    </EffectComposer>
  ) : (
    <EffectComposer multisampling={cfg.msaa} enableNormalPass={false}>
      {bloom}
      {tone}
      {grain}
    </EffectComposer>
  )
}
