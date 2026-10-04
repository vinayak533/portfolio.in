import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, Group, PlaneGeometry, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { visibility } from '../../theme'
import { colors, world } from '../world'
import { signals } from '../../store/useStore'
import { damp } from '../../core/clock'
import { crystalGeometry } from '../geometry'
import { createCrystalMaterial } from '../crystalMaterial'
import { useAct } from '../useAct'

/**
 * Act V. A last crystal, alone in the dark. It follows the cursor on a
 * critically-damped spring, tumbling with its own momentum, and drifts home to
 * rest when the pointer goes quiet.
 */
export function ContactSeed() {
  const { ref } = useAct(visibility.contact)
  const seed = useRef<Group>(null)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const geo = useMemo(() => crystalGeometry('icosa', 0.62, 0), [])
  const inner = useMemo(() => crystalGeometry('octa', 0.3), [])
  const mat = useMemo(() => createCrystalMaterial(), [])
  const innerMat = useMemo(() => {
    const m = createCrystalMaterial()
    m.uniforms.uEdge.value = 0.6
    return m
  }, [])
  const halo = useMemo(
    () => ({
      g: new PlaneGeometry(1, 1),
      m: new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uAccent: { value: colors.accent }, uInk: { value: colors.ink }, uPulse: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 uAccent; uniform vec3 uInk; uniform float uPulse; varying vec2 vUv; void main(){ float d = length(vUv - 0.5); float g = exp(-d * 9.0) * 0.5 + exp(-d * 30.0) * 0.6; gl_FragColor = vec4(mix(uAccent, uInk, 0.2) * g * (0.6 + uPulse), 1.0); }',
      }),
    }),
    [],
  )
  const st = useMemo(
    () => ({ pos: new Vector3(), vel: new Vector3(), target: new Vector3(), rot: new Vector3(), tmp: new Vector3(), dir: new Vector3(), energy: 0, first: true }),
    [],
  )

  useFrame((state, dt) => {
    const g = seed.current
    if (!g || !ref.current?.visible) return
    const t = state.clock.elapsedTime
    const c = world.contact.center
    const wide = size.width / size.height > 1.05
    const home = st.tmp.set(c.x + (wide ? 3.1 : 0.4), c.y + (wide ? -1.25 : -1.9), c.z)

    // Pointer onto the seed's plane.
    const p = signals.pointer
    const idle = !p.active || performance.now() - p.lastMove > 2200
    if (idle) st.target.copy(home)
    else {
      st.dir.set(p.nx, p.ny, 0.5).unproject(camera).sub(camera.position).normalize()
      const k = (c.z - camera.position.z) / st.dir.z
      st.target.copy(camera.position).addScaledVector(st.dir, k)
      st.target.lerp(home, 0.15)
    }
    if (st.first) {
      st.pos.copy(home)
      st.first = false
    }

    // Spring: stiffness k, damping just under critical for a single soft settle.
    const step = Math.min(dt, 1 / 30)
    const kS = idle ? 10 : 22
    const cD = 2 * Math.sqrt(kS) * 0.85
    st.vel.x += ((st.target.x - st.pos.x) * kS - st.vel.x * cD) * step
    st.vel.y += ((st.target.y - st.pos.y) * kS - st.vel.y * cD) * step
    st.pos.addScaledVector(st.vel, step)

    const speed = st.vel.length()
    st.energy = damp(st.energy, Math.min(speed * 0.35, 1.4), 4, dt)
    g.position.set(st.pos.x, st.pos.y + Math.sin(t * 0.8) * 0.06, c.z)
    st.rot.x += (0.15 + st.vel.y * 0.6) * dt
    st.rot.y += (0.22 + st.vel.x * 0.6) * dt
    g.rotation.set(st.rot.x, st.rot.y, Math.sin(t * 0.3) * 0.2)

    mat.uniforms.uTime.value = t
    mat.uniforms.uEnergy.value = 0.35 + st.energy
    innerMat.uniforms.uTime.value = t
    innerMat.uniforms.uEnergy.value = 1.2 + st.energy * 1.5
    halo.m.uniforms.uPulse.value = st.energy + Math.sin(t * 1.4) * 0.08
  })

  return (
    <group ref={ref}>
      <group ref={seed}>
        <mesh geometry={geo} material={mat} />
        <mesh geometry={inner} material={innerMat} rotation={[0.6, 0.3, 0]} />
      </group>
      <Halo seed={seed} halo={halo} />
    </group>
  )
}

function Halo({ seed, halo }: { seed: React.RefObject<Group | null>; halo: { g: PlaneGeometry; m: ShaderMaterial } }) {
  const ref = useRef<import('three').Mesh>(null)
  useFrame(({ camera }) => {
    if (!ref.current || !seed.current) return
    ref.current.position.copy(seed.current.position)
    ref.current.position.z -= 0.6
    ref.current.quaternion.copy(camera.quaternion)
  })
  return <mesh ref={ref} geometry={halo.g} material={halo.m} scale={4.2} renderOrder={2} />
}
