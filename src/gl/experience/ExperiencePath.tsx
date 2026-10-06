import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three'
import { visibility } from '../../theme'
import { colors } from '../world'
import { signals, useStore } from '../../store/useStore'
import { damp, smoothstep } from '../../core/clock'
import { experienceCurve } from '../cameraPath'
import { experienceHead, waypointU } from '../../core/timeline'
import { crystalGeometry, withFacets } from '../geometry'
import { createCrystalMaterial } from '../crystalMaterial'
import { useAct } from '../useAct'
import { CardShatter } from './CardShatter'
import beamVert from '../shaders/experience/beam.vert'
import beamFrag from '../shaders/experience/beam.frag'
import splinterVert from '../shaders/experience/splinter.vert'
import shardFrag from '../shaders/experience/shard.frag'

/** Act IV. The camera rides a single beam of light; each role ignites as it passes. */
export function ExperiencePath() {
  const { ref } = useAct(visibility.experience)

  const beam = useMemo(() => {
    const g = new TubeGeometry(experienceCurve, 600, 0.045, 10, false)
    const m = new ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHead: { value: 0 },
        uIntensity: { value: 1 },
        uAccent: { value: colors.accent },
        uInk: { value: colors.ink },
      },
    })
    // Two faint companion rails give the path depth and parallax.
    const rails = [new Vector3(0.9, 0.5, 0), new Vector3(-0.8, -0.6, 0)].map((o) => {
      const pts = experienceCurve.getSpacedPoints(120).map((p) => p.clone().add(o))
      const curve = experienceCurve.clone()
      curve.points = pts
      const rg = new TubeGeometry(curve, 300, 0.012, 6, false)
      const rm = m.clone()
      rm.uniforms.uIntensity.value = 0.35
      return { g: rg, m: rm }
    })
    return { g, m, rails }
  }, [])

  useFrame((state) => {
    if (!ref.current?.visible) return
    const head = experienceHead(signals.progress.experience)
    const t = state.clock.elapsedTime
    beam.m.uniforms.uTime.value = t
    beam.m.uniforms.uHead.value = head
    beam.rails.forEach((r) => {
      r.m.uniforms.uTime.value = t
      r.m.uniforms.uHead.value = head
    })
  })

  return (
    <group ref={ref}>
      <mesh geometry={beam.g} material={beam.m} frustumCulled={false} renderOrder={3} />
      {beam.rails.map((r, i) => (
        <mesh key={i} geometry={r.g} material={r.m} frustumCulled={false} renderOrder={3} />
      ))}
      <CardShatter />
      {waypointU.map((u, i) => (
        <Waypoint key={i} u={u} index={i} />
      ))}
    </group>
  )
}

function Waypoint({ u, index }: { u: number; index: number }) {
  const crystal = useRef<Mesh>(null)
  const core = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  // Subdivided once so it comes apart into 32 facets rather than 8.
  const geo = useMemo(() => withFacets(crystalGeometry('octa', 0.34, 1)), [])
  const mat = useMemo(() => createCrystalMaterial({ facets: true }), [])
  const coreGeo = useMemo(() => crystalGeometry('icosa', 0.13), [])
  const coreMat = useMemo(() => createCrystalMaterial(), [])
  const ringGeo = useMemo(() => new TorusGeometry(0.7, 0.006, 6, 96), [])
  const ringMat = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uColor: { value: colors.accent.clone() }, uAlpha: { value: 0 } },
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; void main(){ gl_FragColor = vec4(uColor * uAlpha, 1.0); }',
      }),
    [],
  )
  const splinters = useSplinters()
  const pos = useMemo(() => experienceCurve.getPointAt(u), [u])
  const st = useMemo(() => ({ ignite: 0, pulse: 0 }), [])

  useFrame((state, dt) => {
    const head = experienceHead(signals.progress.experience)
    const target = smoothstep(u - 0.05, u, head)
    st.ignite = damp(st.ignite, target, 3, dt)
    st.pulse = damp(st.pulse, Math.exp(-Math.abs(head - u) * 14), 5, dt)
    const t = state.clock.elapsedTime
    mat.uniforms.uTime.value = t
    mat.uniforms.uEnergy.value = 0.15 + st.ignite * 1.3 + Math.exp(-Math.abs(head - u) * 40) * 1.2
    // Facets burst apart as the beam passes, then hang as a loose shell.
    mat.uniforms.uSplit.value = st.ignite * 0.28 + st.pulse * 0.75
    const c = crystal.current!
    c.rotation.set(t * 0.2 + index, t * 0.35, 0)
    c.scale.setScalar(0.7 + st.ignite * 0.45)
    const k = core.current!
    k.rotation.set(-t * 0.5, t * 0.7 + index, 0)
    k.scale.setScalar(0.4 + st.ignite * 0.5 + st.pulse * 0.6)
    coreMat.uniforms.uTime.value = t
    coreMat.uniforms.uEnergy.value = 0.6 + st.ignite * 1.6 + st.pulse * 2.4
    const r = ring.current!
    r.rotation.set(Math.PI / 2 + Math.sin(t * 0.4 + index) * 0.3, t * 0.3, 0)
    r.scale.setScalar(0.6 + st.ignite * 0.6)
    ringMat.uniforms.uAlpha.value = st.ignite * 1.6
    splinters.mat.uniforms.uTime.value = t
    splinters.mat.uniforms.uSplit.value = st.ignite
    splinters.mat.uniforms.uFlare.value = st.pulse
  })

  return (
    <group position={pos}>
      <mesh ref={crystal} geometry={geo} material={mat} />
      <mesh ref={core} geometry={coreGeo} material={coreMat} />
      <mesh ref={ring} geometry={ringGeo} material={ringMat} />
      <mesh geometry={splinters.geo} material={splinters.mat} frustumCulled={false} />
    </group>
  )
}

/** A halo of crystal splinters that separate from a waypoint as it ignites. */
function useSplinters() {
  const count = useStore((s) => (s.lite || s.quality === 'low' ? 36 : s.quality === 'mid' ? 64 : 96))
  const crystal = useMemo(() => crystalGeometry('tetra', 1), [])
  const geo = useMemo(() => {
    const g = new InstancedBufferGeometry()
    g.setAttribute('position', crystal.attributes.position)
    g.setAttribute('normal', crystal.attributes.normal)
    g.setAttribute('bary', crystal.attributes.bary)
    const seed = new Float32Array(count * 4)
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random()
    g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4))
    g.instanceCount = count
    return g
  }, [crystal, count])
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: splinterVert,
        fragmentShader: shardFrag,
        uniforms: {
          uSplit: { value: 0 },
          uFlare: { value: 0 },
          uTime: { value: 0 },
          uSize: { value: 0.022 },
          uAccent: { value: colors.accent },
          uInk: { value: colors.ink },
        },
      }),
    [],
  )
  return { geo, mat }
}
