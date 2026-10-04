import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PerspectiveCamera,
  ShaderMaterial,
} from 'three'
import { experience, sections } from '../../content'
import { signals } from '../../store/useStore'
import { shatter } from '../../core/registry'
import { crystalGeometry } from '../geometry'
import { colors } from '../world'
import { makePose, poseAt } from '../cameraPath'
import shardVert from '../shaders/experience/shard.vert'
import shardFrag from '../shaders/experience/shard.frag'

const SECTION_INDEX = sections.findIndex((s) => s.id === 'experience')
/** Distance in front of the camera at which the card's letters are rebuilt. */
const DEPTH = 3.2

/** One burst per experience card. */
export function CardShatter() {
  return (
    <>
      {experience.map((r, i) => (
        <Burst key={r.company} index={i} />
      ))}
    </>
  )
}

function Burst({ index }: { index: number }) {
  const group = useRef<Group>(null)
  const mesh = useRef<Mesh>(null)
  const size = useThree((s) => s.size)
  const built = useRef({ version: -1, count: 0 })
  const crystal = useMemo(() => crystalGeometry('octa', 1), [])
  const geo = useMemo(() => {
    const g = new InstancedBufferGeometry()
    g.setAttribute('position', crystal.attributes.position)
    g.setAttribute('normal', crystal.attributes.normal)
    g.setAttribute('bary', crystal.attributes.bary)
    g.instanceCount = 0
    return g
  }, [crystal])
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: shardVert,
        fragmentShader: shardFrag,
        uniforms: {
          uP: { value: 0 },
          uTime: { value: 0 },
          uSize: { value: 0.01 },
          uAccent: { value: colors.accent },
          uInk: { value: colors.ink },
        },
      }),
    [],
  )
  const pose = useMemo(() => makePose(), [])
  const rig = useMemo(() => new PerspectiveCamera(), [])

  /** Rebuild shards from the card's glyphs, in the camera frame of the blast moment. */
  const build = () => {
    const sampler = shatter.sample[index]
    if (!sampler) return
    const { points: pts, spacing } = sampler()
    const n = pts.length / 2
    const aspect = size.width / size.height
    poseAt(SECTION_INDEX + shatter.start[index], aspect, pose)
    const halfH = DEPTH * Math.tan((pose.fov * Math.PI) / 360)
    const halfW = halfH * aspect

    const start = new Float32Array(n * 3)
    const dir = new Float32Array(n * 3)
    const seed = new Float32Array(n * 4)
    let cx = 0
    let cy = 0
    for (let i = 0; i < n; i++) {
      const x = (pts[i * 2] / size.width) * 2 - 1
      const y = -((pts[i * 2 + 1] / size.height) * 2 - 1)
      start.set([x * halfW, y * halfH, -DEPTH], i * 3)
      cx += x * halfW
      cy += y * halfH
    }
    cx /= Math.max(n, 1)
    cy /= Math.max(n, 1)
    let maxD = 0
    for (let i = 0; i < n; i++) maxD = Math.max(maxD, Math.hypot(start[i * 3] - cx, start[i * 3 + 1] - cy))
    for (let i = 0; i < n; i++) {
      const dx = start[i * 3] - cx
      const dy = start[i * 3 + 1] - cy
      const d = Math.hypot(dx, dy) || 1
      // Outward from the blast centre, with spray in depth (mostly away from the eye).
      const vx = (dx / d) * 0.75 + (Math.random() - 0.5) * 0.7
      const vy = (dy / d) * 0.75 + (Math.random() - 0.5) * 0.7 + 0.15
      const vz = (Math.random() - 0.65) * 1.3
      const l = Math.hypot(vx, vy, vz)
      dir.set([vx / l, vy / l, vz / l], i * 3)
      seed.set([Math.random(), Math.random(), Math.random(), d / (maxD || 1)], i * 4)
    }
    geo.setAttribute('aStart', new InstancedBufferAttribute(start, 3))
    geo.setAttribute('aDir', new InstancedBufferAttribute(dir, 3))
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4))
    geo.instanceCount = n

    // Shard size from sample spacing so the letters read solid at t = 0.
    const worldPerPx = (2 * halfH) / size.height
    mat.uniforms.uSize.value = Math.min(0.03, Math.max(0.004, spacing * worldPerPx * 0.62))

    // Freeze the blast in world space where the camera was looking at that moment.
    rig.fov = pose.fov
    rig.position.copy(pose.pos)
    rig.lookAt(pose.look)
    rig.rotateZ(pose.roll)
    rig.updateMatrixWorld()
    const g = group.current!
    g.matrix.copy(rig.matrixWorld)
    g.matrixWorldNeedsUpdate = true

    built.current = { version: shatter.version, count: n }
  }

  useFrame((state) => {
    const p = signals.shatter[index]?.p ?? 0
    const m = mesh.current!
    const active = p > 0.0005 && p < 0.999
    m.visible = active
    if (!active) return
    if (built.current.version !== shatter.version) build()
    mat.uniforms.uP.value = p
    mat.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <group ref={group} matrixAutoUpdate={false}>
      <mesh ref={mesh} geometry={geo} material={mat} frustumCulled={false} visible={false} />
    </group>
  )
}
