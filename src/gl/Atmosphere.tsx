import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import skyVert from './shaders/atmosphere/sky.vert'
import skyFrag from './shaders/atmosphere/sky.frag'
import dustVert from './shaders/atmosphere/dust.vert'
import dustFrag from './shaders/atmosphere/dust.frag'
import { colors } from './world'
import { signals, useStore } from '../store/useStore'
import { smoothstep } from '../core/clock'
import { tier } from '../core/quality'
import { getNoiseTexture } from './noiseTexture'

/** Fullscreen volumetric sky (light shafts + haze) and depth dust along the whole flight. */
export function Atmosphere() {
  const camera = useThree((s) => s.camera)
  const dpr = useThree((s) => s.viewport.dpr)
  const quality = useStore((s) => (s.lite ? 'low' : s.quality))

  const sky = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const m = new ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInvProj: { value: camera.projectionMatrixInverse },
        uCamWorld: { value: camera.matrixWorld },
        uTime: { value: 0 },
        uBase: { value: colors.base },
        uAccent: { value: colors.accent },
        uInk: { value: colors.ink },
        uGlow: { value: 1 },
        uNoise: { value: getNoiseTexture() },
      },
    })
    return { g, m }
  }, [camera])

  const dust = useMemo(() => {
    const count = tier[quality].dust
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -14 + Math.random() * 64
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20
      pos[i * 3 + 2] = 16 - Math.random() * 200
      seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new BufferAttribute(seed, 4))
    const m = new ShaderMaterial({
      vertexShader: dustVert,
      fragmentShader: dustFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 26 },
        uPixelRatio: { value: 1 },
        uInk: { value: colors.ink },
        uAccent: { value: colors.accent },
        uOpacity: { value: 1 },
      },
    })
    return { g, m }
  }, [quality])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    sky.m.uniforms.uTime.value = t
    dust.m.uniforms.uTime.value = t
    dust.m.uniforms.uPixelRatio.value = dpr
    // The night act has its own wind-borne leaves; the dust arrives with the dive.
    dust.m.uniforms.uOpacity.value = smoothstep(0.3, 0.6, signals.progress.hero)
  })

  return (
    <>
      <mesh geometry={sky.g} material={sky.m} frustumCulled={false} renderOrder={-1000} />
      <points geometry={dust.g} material={dust.m} frustumCulled={false} renderOrder={5} />
    </>
  )
}
