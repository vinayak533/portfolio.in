import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending,
  Box3,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
} from 'three'
import { samplePortrait, type PortraitSample } from './samplePortrait'
import { crystalGeometry } from '../geometry'
import crystalVert from '../shaders/portrait/crystal.vert'
import crystalFrag from '../shaders/portrait/crystal.frag'
import beamVert from '../shaders/portrait/beam.vert'
import beamFrag from '../shaders/portrait/beam.frag'
import { visibility } from '../../theme'
import { colors, world } from '../world'
import { about } from '../../content'
import { signals, useStore } from '../../store/useStore'
import { tier } from '../../core/quality'
import { track, complete } from '../../core/loading'
import { damp, smoothstep } from '../../core/clock'
import { useAct } from '../useAct'
import { fit } from '../cameraPath'

/** The locked crystals' depth in the portrait's local space (crystal.vert: z eased 80% toward 0.7). */
const LOCKED_Z = 0.6

/**
 * The portrait is never shown flat: tens of thousands of instanced crystals
 * fly in on curl-noise paths behind a scan beam and lock into the photo.
 * All motion is in the vertex shader; the CPU only writes a handful of uniforms.
 */
export function PortraitScan() {
  const quality = useStore((s) => (s.lite ? 'low' : s.quality))
  const [sample, setSample] = useState<PortraitSample | null>(null)
  const { ref, presence } = useAct(visibility.about)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)

  useEffect(() => {
    let alive = true
    track('portrait', samplePortrait(about.photo.cutout, tier[quality].particles))
      .then((s) => alive && setSample(s))
      .catch((e) => {
        console.warn('[portrait] sampling failed', e)
        complete('portrait')
      })
    return () => {
      alive = false
    }
  }, [quality])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: crystalVert,
        fragmentShader: crystalFrag,
        uniforms: {
          uTime: { value: 0 },
          uScan: { value: 0 },
          uShimmer: { value: 0 },
          uSize: { value: 0.03 },
          uPointer: { value: new Vector3(99, 99, 0) },
          uPointerStrength: { value: 0 },
          uIdle: { value: 0 },
          uOpacity: { value: 1 },
          uAccent: { value: colors.accent },
          uInk: { value: colors.ink },
          uPhoto: { value: null as Texture | null },
          uPhotoSize: { value: new Vector2(1, 1) },
        },
      }),
    [],
  )

  const geometry = useMemo(() => {
    if (!sample) return null
    const base = crystalGeometry('octa', 1)
    const g = new InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.attributes.position)
    g.setAttribute('normal', base.attributes.normal)
    g.setAttribute('bary', base.attributes.bary)
    g.setAttribute('aTarget', new InstancedBufferAttribute(sample.target, 3))
    g.setAttribute('aDust', new InstancedBufferAttribute(sample.dust, 3))
    g.setAttribute('aColor', new InstancedBufferAttribute(sample.color, 3))
    g.setAttribute('aData', new InstancedBufferAttribute(sample.data, 4))
    g.setAttribute('aScale', new InstancedBufferAttribute(sample.scale, 1))
    g.instanceCount = sample.count
    // Real bounds: every crystal lies between its dust and target positions,
    // plus the flow arc, pointer push and its own size. With them three can
    // cull the whole instanced draw once the camera has moved on to Works,
    // instead of drawing tens of thousands of crystals off screen.
    const box = new Box3()
    const v = new Vector3()
    for (const a of [sample.target, sample.dust]) for (let i = 0; i < a.length; i += 3) box.expandByPoint(v.set(a[i], a[i + 1], a[i + 2]))
    g.boundingSphere = box.expandByScalar(2.5).getBoundingSphere(new Sphere())
    material.uniforms.uSize.value = sample.spacing * 0.74
    material.uniforms.uPhotoSize.value.set(sample.width, sample.height)
    return g
  }, [sample, material])

  // Settled crystals sample the full-resolution cutout, so the assembled portrait is the photo.
  useEffect(() => {
    if (!sample) return
    const photo = new Texture(sample.image)
    photo.colorSpace = SRGBColorSpace
    photo.needsUpdate = true
    material.uniforms.uPhoto.value = photo
    return () => photo.dispose()
  }, [sample, material])

  const beam = useMemo(() => {
    const m = new ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uAccent: { value: colors.accent },
        uInk: { value: colors.ink },
      },
    })
    return { m, g: new PlaneGeometry(1, 1) }
  }, [])

  const pointer = useMemo(() => ({ local: new Vector3(99, 99, 0), strength: 0, ndc: new Vector3(), dir: new Vector3() }), [])
  const corner = useMemo(() => new Vector3(), [])

  useFrame((state, dt) => {
    const g = ref.current
    if (!g || !g.visible || !sample) return
    const u = material.uniforms
    const time = state.clock.elapsedTime
    u.uTime.value = time
    u.uScan.value = signals.scan
    u.uShimmer.value = signals.shimmer
    u.uIdle.value = smoothstep(0.85, 1, signals.scan)
    u.uOpacity.value = 0.25 + 0.75 * presence.current

    // Layout: centred in the right half on wide screens, with headroom under the
    // nav; on phones it fills the slot the copy leaves above itself (About.tsx).
    const aspect = camera.aspect
    const wide = aspect > 1.05
    const slot = signals.aboutSlot
    if (!wide && slot) {
      // Sized at the end of the About dolly (cameraPath.ts), when it is largest,
      // so the push-in never carries it over the copy.
      const halfH = Math.tan((38 * Math.PI) / 360) * (11.5 * fit(aspect) - 1.1)
      const s = Math.min((slot.h * 2 * halfH) / sample.height, (slot.w * 2 * halfH * aspect) / sample.width)
      g.position.set((slot.x - 0.5) * 2 * halfH * aspect, (0.5 - slot.y) * 2 * halfH, world.about.center.z)
      g.scale.setScalar(s)
    } else {
      const halfH = Math.tan((38 * Math.PI) / 360) * 11.5 // About pose: fov 38, 11.5 back (cameraPath.ts)
      g.position.set(wide ? halfH * aspect * 0.5 : 0, wide ? -0.32 : 2.8, world.about.center.z)
      g.scale.setScalar(wide ? 0.8 : 0.58)
    }

    // The rig (CameraRig, which runs first) leaves the camera's matrices half-updated: its second lookAt refreshes
    // them from the parallaxed position but the previous rotation, so the sharp photo's box landed ~30 px off the
    // crystals (a double image). Rebuild them here from this frame's pose, the one the render will use.
    camera.updateMatrixWorld()

    // Pointer onto the portrait plane, in local space, spring-damped.
    const pr = signals.pointer
    pointer.ndc.set(pr.nx, pr.ny, 0.5).unproject(camera)
    pointer.dir.copy(pointer.ndc).sub(camera.position).normalize()
    const planeZ = g.position.z + 0.4
    const k = (planeZ - camera.position.z) / pointer.dir.z
    const hitX = (camera.position.x + pointer.dir.x * k - g.position.x) / g.scale.x
    const hitY = (camera.position.y + pointer.dir.y * k - g.position.y) / g.scale.y
    pointer.local.x = damp(pointer.local.x, hitX, 9, dt)
    pointer.local.y = damp(pointer.local.y, hitY, 9, dt)
    const speed = Math.min(Math.hypot(pr.vx, pr.vy), 4)
    const idle = performance.now() - pr.lastMove > 1400
    const target = pr.active && !idle ? 0.55 + speed * 0.35 : 0
    pointer.strength = damp(pointer.strength, target, target > pointer.strength ? 6 : 2.2, dt)
    u.uPointer.value.copy(pointer.local)
    u.uPointerStrength.value = pointer.strength

    // Where the settled portrait is on screen, for its sharp copy (About.tsx): the photo plane's corners at the
    // locked crystals' depth, and whether they are all locked and still (the scan and the shimmer pass done, no
    // cursor scatter reaching the photo).
    const out = signals.aboutPhoto
    g.updateMatrixWorld()
    const hw = sample.width / 2
    const hh = sample.height / 2
    corner.set(-hw, hh, LOCKED_Z).applyMatrix4(g.matrixWorld).project(camera)
    const x0 = (corner.x * 0.5 + 0.5) * size.width
    const y0 = (-corner.y * 0.5 + 0.5) * size.height
    corner.set(hw, -hh, LOCKED_Z).applyMatrix4(g.matrixWorld).project(camera)
    out.x = x0
    out.y = y0
    out.w = (corner.x * 0.5 + 0.5) * size.width - x0
    out.h = (-corner.y * 0.5 + 0.5) * size.height - y0
    const dx = Math.max(Math.abs(pointer.local.x) - hw, 0)
    const dy = Math.max(Math.abs(pointer.local.y) - hh, 0)
    const reach = Math.exp(-(dx * dx + dy * dy) * 2.6) * pointer.strength
    out.settled = signals.scan >= 0.999 && (signals.shimmer <= 0 || signals.shimmer >= 0.999) && reach < 0.03 && presence.current > 0.98
    out.frame = performance.now()

    // Beam follows the exact same mapping as the vertex shader.
    const scan = signals.scan
    beam.m.uniforms.uTime.value = time
    beam.m.uniforms.uIntensity.value = smoothstep(0, 0.04, scan) * (1 - smoothstep(0.93, 1, scan))
  })

  if (!sample || !geometry) return <group ref={ref} />

  const beamY = (0.5 - (signals.scan * 1.42 - 0.12)) * sample.height
  return (
    <group ref={ref}>
      <mesh geometry={geometry} material={material} />
      <BeamMesh sample={sample} beam={beam} initialY={beamY} />
    </group>
  )
}

function BeamMesh({
  sample,
  beam,
  initialY,
}: {
  sample: PortraitSample
  beam: { m: ShaderMaterial; g: PlaneGeometry }
  initialY: number
}) {
  const { ref } = useBeamFollow(sample)
  return (
    <mesh
      ref={ref}
      geometry={beam.g}
      material={beam.m}
      position={[0, initialY, 0.5]}
      scale={[sample.width * 1.9, 0.9, 1]}
      renderOrder={10}
      frustumCulled={false}
    />
  )
}

function useBeamFollow(sample: PortraitSample) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    const b = signals.scan * 1.42 - 0.12
    ref.current.position.y = (0.5 - b) * sample.height
    ref.current.visible = signals.scan > 0.001 && signals.scan < 0.999
  })
  return { ref }
}
