import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BackSide,
  CustomBlending,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Uniform,
  Vector2,
  Vector3,
  Vector4,
  type Color,
  type DirectionalLight,
  type Mesh,
  type PerspectiveCamera,
} from 'three'
import skyVert from '../shaders/night/sky.vert'
import skyFrag from '../shaders/night/sky.frag'
import cloudVert from '../shaders/night/cloud.vert'
import cloudFrag from '../shaders/night/cloud.frag'
import grassVert from '../shaders/night/grass.vert'
import grassFrag from '../shaders/night/grass.frag'
import leafVert from '../shaders/night/leaf.vert'
import leafFrag from '../shaders/night/leaf.frag'
import { keyDir, moonDir, night, world } from '../world'
import { visibility } from '../../theme'
import { signals, useStore } from '../../store/useStore'
import { complete } from '../../core/loading'
import { smoothstep } from '../../core/clock'
import { getNoiseTexture } from '../noiseTexture'
import { useAct } from '../useAct'
import {
  FIGURE_SCALE,
  RADIUS,
  bladeGeometry,
  figureGeometry,
  figureSpot,
  grassInstances,
  hangingGeometry,
  islandGeometry,
  mulberry32,
  rockChunk,
} from './island'

type Quality = 'high' | 'mid' | 'low'

const ISLAND = world.hero.island
/** Wind blows left to right across the opening frame, a little away from the lens. */
const WIND = new Vector3(1, 0, -0.22).normalize()

/**
 * Act I. A small floating island far above an ocean of cloud at night: one
 * person in the grass with a laptop, a low full moon half hidden by towering
 * cumulonimbus, wind combing the long grass and carrying leaves past the lens.
 * The camera dives down through the cloud sea into the About act.
 */
export function HeroNight() {
  const { ref } = useAct(visibility.hero)
  const quality = useStore((s) => (s.lite ? 'low' : s.quality))
  const fade = useRef(1)

  useEffect(() => complete('glyphs'), [])

  useFrame(() => {
    // Below the cloud sea the night gives way to the inner void of the site.
    fade.current = 1 - smoothstep(0.42, 0.66, signals.progress.hero)
  })

  return (
    <group ref={ref}>
      <NightDome fade={fade} />
      <CloudField fade={fade} quality={quality} />
      <Island quality={quality} />
      <Leaves fade={fade} quality={quality} />
    </group>
  )
}

function NightDome({ fade }: { fade: React.RefObject<number> }) {
  const mesh = useRef<Mesh>(null)
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 1 },
          uMoonDir: { value: moonDir },
          uZenith: { value: night.zenith },
          uHorizon: { value: night.horizon },
          uWarm: { value: night.warm },
          uMoon: { value: night.moon },
          uNoise: { value: getNoiseTexture() },
        },
      }),
    [],
  )
  const geo = useMemo(() => new SphereGeometry(90, 48, 24), [])
  useFrame((state) => {
    const m = mesh.current!
    m.position.copy(state.camera.position)
    mat.uniforms.uTime.value = state.clock.elapsedTime
    mat.uniforms.uOpacity.value = fade.current
    m.visible = fade.current > 0.002
  })
  return <mesh ref={mesh} geometry={geo} material={mat} renderOrder={-900} frustumCulled={false} />
}

// ------------------------------------------------------------------ clouds

interface Puff {
  c: Vector3
  size: number
  seed: number
  speed: number
  h: number
  kind: number
}

const WRAP_MIN = -70
const WRAP_SPAN = 140

function buildPuffs(scale: number): Puff[] {
  const rand = mulberry32(21)
  const puffs: Puff[] = []
  const cluster = (c: Vector3, r: number, n: number, sMin: number, sMax: number, speed: number, tall = 0.55, kind = 0) => {
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2
      const d = Math.sqrt(rand()) * r
      const h = Math.pow(rand(), 1.4)
      const p = new Vector3(Math.cos(a) * d, h * r * tall - r * 0.08, Math.sin(a) * d * 0.8)
      const s = (sMin + (sMax - sMin) * rand()) * (1 - 0.35 * h) * (1 - 0.25 * (d / r))
      puffs.push({ c: c.clone().add(p), size: s, seed: rand(), speed, h, kind })
    }
  }
  const count = (n: number) => Math.max(1, Math.round(n * scale))
  // Towers read as isolated balls when thinned, so lower tiers trim them gently.
  const tower = (n: number) => Math.max(1, Math.round(n * Math.sqrt(scale)))
  const base = world.hero.cloudBase
  const flat = new Vector3(moonDir.x, 0, moonDir.z).normalize()
  const side = new Vector3(-flat.z, 0, flat.x)

  // The sea around and beyond the island, out to mid distance.
  for (let i = 0; i < count(34); i++) {
    const c = new Vector3(-48 + rand() * 96, base + rand() * 0.9, -40 + rand() * 50)
    cluster(c, 2.6 + rand() * 2.6, Math.round(9 + rand() * 6), 1.8, 3.6, 0.05 + rand() * 0.09, 0.45)
  }
  // Far sea, rolling out to the horizon: few, large, flat.
  for (let i = 0; i < count(26); i++) {
    const c = new Vector3(WRAP_MIN + rand() * WRAP_SPAN, base + 0.4 + rand() * 1.6, -105 + rand() * 62)
    cluster(c, 6 + rand() * 4, Math.round(7 + rand() * 4), 4, 7.5, 0.02 + rand() * 0.03, 0.32)
  }
  // Towering bank around the moon: mostly to its right, rising to its height.
  const towers: [number, number, number, number][] = [
    // [distance, side offset, radius, tall]
    [52, 3.5, 6.2, 1.4],
    [58, 13, 7, 1.55],
    [48, 22, 6, 1.35],
    [62, -9, 6.5, 1.1],
    [55, 31, 6.4, 1.6],
    [66, -22, 7, 1.25],
  ]
  for (const [dist, off, r, tall] of towers) {
    const c = ISLAND.clone().addScaledVector(flat, dist).addScaledVector(side, off)
    c.y = base + 0.3 + rand() * 0.8
    cluster(c, r, tower(20 + rand() * 8), 3.4, 6.0, 0.008, tall)
  }
  // Towers off to the left.
  for (let i = 0; i < 4; i++) {
    const c = new Vector3(-34 + rand() * 14, base + 0.3, -30 - rand() * 22)
    cluster(c, 4.5 + rand() * 1.8, tower(15 + rand() * 6), 2.8, 5.0, 0.01, 1.2 + rand() * 0.4)
  }
  // Midground flanks rising to about the island's height.
  const flanks: [number, number, number, number][] = [
    [12.5, -9, 3.6, 1.1],
    [15, -15, 3.8, 1.25],
    [-12, -6, 3.2, 1.0],
    [-15.5, -12, 3.5, 1.15],
  ]
  for (const [x, z, r, tall] of flanks) cluster(new Vector3(x, base + 0.4, z), r, tower(14), 1.8, 3.4, 0.02, tall)
  // Foreground framing in the lower corners.
  const front: [number, number, number, number][] = [
    [-7.6, 2.1, 4.6, 2.3],
    [7.8, 1.9, 4.2, 2.5],
    [0.8, 1.2, 3.8, 2.1],
  ]
  for (const [x, y, z, r] of front) cluster(new Vector3(x, y, z), r, count(10), 1.2, 2.3, 0.03, 0.7)
  // Collar hugging the island's underside.
  for (let i = 0; i < count(10); i++) {
    const a = (i / 10) * Math.PI * 2 + rand() * 0.4
    const rr = RADIUS * (0.75 + rand() * 0.6)
    const c = new Vector3(ISLAND.x + Math.cos(a) * rr, base + 1.3 + rand() * 1.1, ISLAND.z + Math.sin(a) * rr)
    cluster(c, 1.8 + rand(), Math.round(7 + rand() * 5), 1.0, 2.0, 0.025, 0.5)
  }
  // Thin mist veils wrapping the rock at mid height.
  for (let i = 0; i < count(16); i++) {
    const a = rand() * Math.PI * 2
    const rr = RADIUS * (0.8 + rand() * 0.7)
    const c = new Vector3(ISLAND.x + Math.cos(a) * rr, ISLAND.y - 1.4 - rand() * 1.6, ISLAND.z + Math.sin(a) * rr * 0.8)
    puffs.push({ c, size: 0.9 + rand() * 0.8, seed: rand(), speed: 0.05 + rand() * 0.04, h: 0.5, kind: 1 })
  }
  return puffs
}

function CloudField({ fade, quality }: { fade: React.RefObject<number>; quality: Quality }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const puffs = useMemo(() => buildPuffs(quality === 'high' ? 1 : quality === 'mid' ? 0.72 : 0.45), [quality])
  const n = puffs.length

  const { geo, centers, data, kinds } = useMemo(() => {
    const quad = new PlaneGeometry(2, 2)
    const g = new InstancedBufferGeometry()
    g.index = quad.index
    g.setAttribute('position', quad.attributes.position)
    g.setAttribute('uv', quad.attributes.uv)
    const c = new InstancedBufferAttribute(new Float32Array(n * 3), 3)
    const d = new InstancedBufferAttribute(new Float32Array(n * 4), 4)
    const k = new InstancedBufferAttribute(new Float32Array(n), 1)
    for (const a of [c, d, k]) a.setUsage(DynamicDrawUsage)
    g.setAttribute('aCenter', c)
    g.setAttribute('aData', d)
    g.setAttribute('aKind', k)
    g.instanceCount = n
    return { geo: g, centers: c, data: d, kinds: k }
  }, [n])

  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: cloudVert,
        fragmentShader: cloudFrag,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 1 },
          uWrap: { value: [WRAP_MIN, WRAP_SPAN] },
          uCamRight: { value: new Vector3() },
          uCamUp: { value: new Vector3() },
          uCamBack: { value: new Vector3() },
          uMoonNdc: { value: new Vector2() },
          uAspect: { value: 1 },
          uKeyDir: { value: keyDir },
          uMoonDir: { value: moonDir },
          uShadow: { value: night.cloudShadow },
          uLit: { value: night.cloudLit },
          uSilver: { value: night.silver.clone().multiplyScalar(1.25) },
          uHaze: { value: night.haze },
          uWarm: { value: night.warm },
          uNoise: { value: getNoiseTexture() },
        },
      }),
    [],
  )

  const sort = useMemo(() => ({ order: new Uint16Array(n), depth: new Float32Array(n), fwd: new Vector3(), moon: new Vector3() }), [n])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const u = mat.uniforms
    u.uTime.value = t
    u.uOpacity.value = fade.current
    u.uAspect.value = camera.aspect
    camera.updateMatrixWorld()
    const e = camera.matrixWorld.elements
    u.uCamRight.value.set(e[0], e[1], e[2]).normalize()
    u.uCamUp.value.set(e[4], e[5], e[6]).normalize()
    u.uCamBack.value.set(e[8], e[9], e[10]).normalize()
    sort.moon.copy(camera.position).addScaledVector(moonDir, 100).project(camera)
    u.uMoonNdc.value.set(sort.moon.x, sort.moon.y)

    // Back-to-front order for correct soft blending (same drift formula as the shader).
    const fwd = sort.fwd.copy(u.uCamBack.value).negate()
    const cp = camera.position
    for (let i = 0; i < n; i++) {
      const p = puffs[i]
      const x = WRAP_MIN + ((((p.c.x - WRAP_MIN + t * p.speed) % WRAP_SPAN) + WRAP_SPAN) % WRAP_SPAN)
      sort.depth[i] = (x - cp.x) * fwd.x + (p.c.y - cp.y) * fwd.y + (p.c.z - cp.z) * fwd.z
      sort.order[i] = i
    }
    sort.order.sort((a, b) => sort.depth[b] - sort.depth[a])
    const ca = centers.array as Float32Array
    const da = data.array as Float32Array
    const ka = kinds.array as Float32Array
    for (let k = 0; k < n; k++) {
      const p = puffs[sort.order[k]]
      ca[k * 3] = p.c.x
      ca[k * 3 + 1] = p.c.y
      ca[k * 3 + 2] = p.c.z
      da[k * 4] = p.size
      da[k * 4 + 1] = p.seed
      da[k * 4 + 2] = p.speed
      da[k * 4 + 3] = p.h
      ka[k] = p.kind
    }
    centers.needsUpdate = true
    data.needsUpdate = true
    kinds.needsUpdate = true
  })

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={8} />
}

// ------------------------------------------------------------------ island

/**
 * Moonlit rim for standard materials: a fresnel edge that lights up on the
 * side facing the moon (which sits behind the island), plus optional
 * triplanar-ish noise to break up flat vertex colour on rock.
 */
function withRim(mat: MeshStandardMaterial, keyView: Uniform<Vector3>, rim: Color, rockNoise: boolean) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uKeyView = keyView
    shader.uniforms.uRim = { value: rim }
    shader.uniforms.uNoise = { value: getNoiseTexture() }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;')
    let frag = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nuniform vec3 uKeyView;\nuniform vec3 uRim;\nuniform sampler2D uNoise;')
      .replace(
        '#include <opaque_fragment>',
        `float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        outgoingLight += uRim * fres * clamp(dot(normal, uKeyView) * 0.75 + 0.25, 0.0, 1.0);
        #include <opaque_fragment>`,
      )
    if (rockNoise)
      frag = frag.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 rp = vObjPos;
        float tn = texture2D(uNoise, rp.xz * 0.31 + rp.y * 0.13).r * 0.45
          + texture2D(uNoise, vec2(rp.x + rp.z, rp.y * 1.6) * 0.8).g * 0.35
          + texture2D(uNoise, vec2(rp.z - rp.x, rp.y) * 2.9).b * 0.2;
        diffuseColor.rgb *= 0.55 + 0.9 * tn;`,
      )
    shader.fragmentShader = frag
  }
  return mat
}

function Island({ quality }: { quality: Quality }) {
  const group = useRef<Group>(null)
  const rocks = useRef<Group>(null)
  const moon = useRef<DirectionalLight>(null)
  const camera = useThree((s) => s.camera)
  const keyView = useMemo(() => new Uniform(new Vector3()), [])

  const fig = useMemo(() => figureGeometry(), [])
  const geos = useMemo(
    () => ({ island: islandGeometry(), hanging: hangingGeometry(), chunkA: rockChunk(0.4, 61), chunkB: rockChunk(0.26, 62), chunkC: rockChunk(0.16, 63) }),
    [],
  )
  const rockMat = useMemo(
    () => withRim(new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }), keyView, night.silver.clone().multiplyScalar(0.22), true),
    [keyView],
  )
  const figureMat = useMemo(
    () => withRim(new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }), keyView, night.silver.clone().multiplyScalar(0.34), false),
    [keyView],
  )

  // Figure placement: facing away from the lens and turned to the right, so
  // we see their back and shoulder and the screen's glow beside them.
  const figureYaw = useMemo(() => {
    const d = world.hero.eye.clone().sub(ISLAND)
    return Math.atan2(d.x, d.z) + Math.PI - 0.87
  }, [])
  const toIsland = useMemo(() => {
    const e = new Euler(0, figureYaw, 0)
    return (p: Vector3) => p.clone().multiplyScalar(FIGURE_SCALE).applyEuler(e).add(figureSpot)
  }, [figureYaw])
  const screenLocal = useMemo(() => {
    const n = new Vector3(0, Math.sin(fig.screen.tilt), -Math.cos(fig.screen.tilt))
    return toIsland(fig.screen.position.clone().addScaledVector(n, 0.06))
  }, [fig, toIsland])
  const occluders = useMemo(
    () =>
      fig.occluders.map(([x, y, z, r]) => {
        const p = toIsland(new Vector3(x, y, z))
        return new Vector4(p.x, p.y, p.z, r * FIGURE_SCALE)
      }),
    [fig, toIsland],
  )

  // Grass: dense instanced blades with hand-written shading.
  const grass = useMemo(() => {
    const target = quality === 'high' ? 42000 : quality === 'mid' ? 24000 : 11000
    const data = grassInstances(target, { x: figureSpot.x, z: figureSpot.z, r: 0.17 })
    const blade = bladeGeometry(quality === 'high' ? 5 : quality === 'mid' ? 4 : 3)
    const g = new InstancedBufferGeometry()
    g.index = blade.index
    g.setAttribute('position', blade.attributes.position)
    g.setAttribute('aRoot', new InstancedBufferAttribute(data.root, 4))
    g.setAttribute('aParams', new InstancedBufferAttribute(data.params, 4))
    g.instanceCount = data.count
    const m = new ShaderMaterial({
      vertexShader: grassVert,
      fragmentShader: grassFrag,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uNoise: { value: getNoiseTexture() },
        uWind: { value: new Vector2(WIND.x, WIND.z).normalize() },
        uKeyDir: { value: keyDir },
        uKeyColor: { value: night.silver.clone().multiplyScalar(0.6) },
        uMoonDir: { value: moonDir },
        uAmbientSky: { value: night.ambientSky.clone().multiplyScalar(0.3) },
        uAmbientGround: { value: night.ambientGround },
        uLaptopPos: { value: screenLocal },
        uLaptopColor: { value: night.screenLight },
        uLaptopPower: { value: 3.4 },
        uOcc0: { value: occluders[0] },
        uOcc1: { value: occluders[1] },
        uRoot: { value: night.grassRoot },
        uMid: { value: night.grassMid },
        uTip: { value: night.grassTip },
        uDry: { value: night.grassDry },
        uHaze: { value: night.haze },
      },
    })
    return { g, m }
  }, [quality, screenLocal, occluders])

  // Screen glow: HDR so it blooms, kept small and restrained.
  const screenMat = useMemo(() => new MeshBasicMaterial({ color: night.screen.clone().multiplyScalar(1.05), side: DoubleSide }), [])

  const target = useMemo(() => {
    const o = new Object3D()
    o.position.copy(ISLAND)
    return o
  }, [])
  useEffect(() => {
    if (moon.current) moon.current.target = target
  }, [target])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const g = group.current!
    // Floating: a slow bob and the faintest list.
    g.position.set(ISLAND.x, ISLAND.y + Math.sin(t * 0.35) * 0.07, ISLAND.z)
    g.rotation.set(Math.sin(t * 0.21) * 0.006, 0, Math.sin(t * 0.27) * 0.008)
    const r = rocks.current!
    r.children.forEach((c, i) => {
      c.position.y = c.userData.y + Math.sin(t * (0.42 + i * 0.13) + i * 2.1) * 0.1
      c.rotation.y = c.userData.ry + t * 0.03 * (i % 2 ? -1 : 1)
    })
    grass.m.uniforms.uTime.value = t
    keyView.value.copy(keyDir).transformDirection(camera.matrixWorldInverse)
    // Faint flicker, as if code is scrolling.
    const flick = 0.95 + 0.05 * Math.sin(t * 23) * Math.sin(t * 7.3)
    screenMat.color.copy(night.screen).multiplyScalar(1.05 * flick)
  })

  const lightPos = useMemo(() => ISLAND.clone().addScaledVector(keyDir, 30), [])
  const chunks: [Vector3, number, 'chunkA' | 'chunkB' | 'chunkC'][] = [
    [new Vector3(5.1, -1.7, -0.8), 0.4, 'chunkA'],
    [new Vector3(-4.6, -2.5, 1.4), 1.3, 'chunkB'],
    [new Vector3(3.9, -3.3, 2.1), 2.2, 'chunkC'],
  ]

  return (
    <>
      <directionalLight ref={moon} position={lightPos} intensity={2.2} color={night.silver} />
      <primitive object={target} />
      <hemisphereLight args={[night.ambientSky, night.ambientGround, 1.2]} />
      {/* A whisper of fill from the lens side so the rock face is not a void. */}
      <directionalLight position={[9, 7, 20]} intensity={1.5} color={night.silver} />

      <group ref={group}>
        <mesh geometry={geos.island} material={rockMat} />
        <mesh geometry={geos.hanging} material={rockMat} />
        <mesh geometry={grass.g} material={grass.m} frustumCulled={false} />

        <group position={figureSpot} rotation={[0, figureYaw, 0]} scale={FIGURE_SCALE}>
          <mesh geometry={fig.body} material={figureMat} />
          <mesh position={fig.screen.position} rotation={[fig.screen.tilt, Math.PI, 0]} material={screenMat}>
            <planeGeometry args={fig.screen.size} />
          </mesh>
        </group>
        <pointLight position={screenLocal} intensity={2} distance={2.2} decay={2} color={night.screenLight} />
      </group>

      <group ref={rocks} position={ISLAND}>
        {chunks.map(([p, ry, key]) => (
          <mesh key={key} geometry={geos[key]} material={rockMat} position={p} rotation={[0, ry, 0]} userData={{ y: p.y, ry }} />
        ))}
      </group>
    </>
  )
}

// ------------------------------------------------------------------ leaves

function Leaves({ fade, quality }: { fade: React.RefObject<number>; quality: Quality }) {
  const { geo, mat } = useMemo(() => {
    const count = quality === 'high' ? 72 : quality === 'mid' ? 52 : 30
    const rand = mulberry32(77)
    const start = new Float32Array(count * 3)
    const params = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      start.set([-12 + rand() * 24, 3.6 + rand() * 5.4, -3.5 + rand() * 13], i * 3)
      const grassBit = rand() < 0.35
      params.set([grassBit ? 0.1 + rand() * 0.1 : 0.08 + rand() * 0.08, 1.1 + rand() * 1.8, rand(), grassBit ? 1 : 0], i * 4)
    }
    const quad = new PlaneGeometry(1, 1)
    const g = new InstancedBufferGeometry()
    g.index = quad.index
    g.setAttribute('position', quad.attributes.position)
    g.setAttribute('uv', quad.attributes.uv)
    g.setAttribute('aStart', new InstancedBufferAttribute(start, 3))
    g.setAttribute('aParams', new InstancedBufferAttribute(params, 4))
    g.instanceCount = count
    const m = new ShaderMaterial({
      vertexShader: leafVert,
      fragmentShader: leafFrag,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: WIND },
        uWrap: { value: [-12, 24] },
        uFocus: { value: 11 },
        uKeyDir: { value: keyDir },
        uKeyColor: { value: night.silver.clone().multiplyScalar(0.6) },
        uMoonDir: { value: moonDir },
        uAmbient: { value: night.ambientSky.clone().multiplyScalar(0.3) },
        uLeaf: { value: night.grassMid },
        uLeafLit: { value: night.grassTip },
        uOpacity: { value: 1 },
      },
    })
    return { geo: g, mat: m }
  }, [quality])

  useFrame((state) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime
    mat.uniforms.uOpacity.value = fade.current
  })

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={9} />
}
