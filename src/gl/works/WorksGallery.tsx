import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3, type PerspectiveCamera } from 'three'
import { projects, type Project } from '../../content'
import { visibility } from '../../theme'
import { colors, world } from '../world'
import { signals, useStore } from '../../store/useStore'
import { damp } from '../../core/clock'
import { worksTrack } from '../../core/timeline'
import { useAct } from '../useAct'
import { createScreenMaterial } from './screenMaterial'
import { exhibitRects } from '../../core/registry'
import screenVert from '../shaders/works/screen.vert'
import frameFrag from '../shaders/works/frame.frag'

const displayFont = '/fonts/bricolage-grotesque-latin-600-normal.woff'
const W = 4.6
const H = 2.88
const ASPECT = W / H

/** Act III. Five floating glass exhibits the camera tracks past. */
export function WorksGallery() {
  const { ref } = useAct(visibility.works)
  return (
    <group ref={ref}>
      {projects.map((p, i) => (
        <Exhibit key={p.id} project={p} index={i} />
      ))}
    </group>
  )
}

function Exhibit({ project, index }: { project: Project; index: number }) {
  const group = useRef<Group>(null)
  const screen = useRef<Mesh>(null)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const geo = useMemo(() => new PlaneGeometry(W, H), [])
  const frameGeo = useMemo(() => new PlaneGeometry(W + 0.14, H + 0.14), [])
  const mat = useMemo(() => createScreenMaterial(project.visual, ASPECT), [project.visual])
  const frameMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: screenVert,
        fragmentShader: frameFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uHover: { value: 0 },
          uFocus: { value: 0 },
          uAspect: { value: (W + 0.14) / (H + 0.14) },
          uTime: { value: 0 },
          uAccent: { value: colors.accent },
          uInk: { value: colors.ink },
        },
      }),
    [],
  )
  const st = useMemo(() => ({ hover: 0, focus: 0, tiltX: 0, tiltY: 0, mouse: new Vector3(0.5, 0.5, 0) }), [])
  const base = useMemo(
    () => new Vector3(world.works.startX + index * world.works.spacing, (index % 2 === 0 ? 0.12 : -0.18), world.works.z - (index % 2) * 0.6),
    [index],
  )

  // Register a screen-rect getter for the shared-element overlay transition.
  useEffect(() => {
    const v = new Vector3()
    exhibitRects[index] = () => {
      const m = screen.current
      if (!m) return null
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const [x, y] of [[-W / 2, -H / 2], [W / 2, -H / 2], [-W / 2, H / 2], [W / 2, H / 2]]) {
        v.set(x, y, 0).applyMatrix4(m.matrixWorld).project(camera)
        const sx = (v.x * 0.5 + 0.5) * size.width
        const sy = (-v.y * 0.5 + 0.5) * size.height
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx)
        minY = Math.min(minY, sy); maxY = Math.max(maxY, sy)
      }
      return new DOMRect(minX, minY, maxX - minX, maxY - minY)
    }
    return () => {
      exhibitRects[index] = () => null
    }
  }, [index, camera, size])

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const time = state.clock.elapsedTime
    const s = useStore.getState()
    const { k } = worksTrack(signals.progress.works)
    const focusTarget = 1 - Math.min(1, Math.abs(k - index))
    const hovered = s.hoveredWork === index
    st.focus = damp(st.focus, focusTarget, 4, dt)
    st.hover = damp(st.hover, hovered ? 1 : 0, hovered ? 6 : 3, dt)
    const isOpen = s.openWork === index

    // Float, and lean toward the cursor while hovered.
    const p = signals.pointer
    st.tiltX = damp(st.tiltX, -p.ny * 0.12 * st.hover, 4, dt)
    st.tiltY = damp(st.tiltY, p.nx * 0.18 * st.hover - (1 - st.focus) * 0.22 * Math.sign(k - index), 3, dt)
    g.position.set(base.x, base.y + Math.sin(time * 0.5 + index * 1.7) * 0.08, base.z + st.hover * 0.35)
    g.rotation.set(st.tiltX, st.tiltY, Math.sin(time * 0.3 + index) * 0.008)

    const u = mat.uniforms
    u.uTime.value = time
    u.uHover.value = st.hover
    u.uFocus.value = 0.25 + st.focus * 0.75
    u.uMouse.value.set(st.mouse.x, st.mouse.y)
    u.uOpacity.value = isOpen ? 0 : 1
    frameMat.uniforms.uHover.value = st.hover
    frameMat.uniforms.uFocus.value = st.focus
    frameMat.uniforms.uTime.value = time
  })

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    useStore.getState().set({ hoveredWork: index, cursor: 'view', cursorLabel: 'Open' })
  }
  const out = () => {
    const s = useStore.getState()
    if (s.hoveredWork === index) s.set({ hoveredWork: null, cursor: 'default', cursorLabel: '' })
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (e.uv) st.mouse.set(e.uv.x, e.uv.y, 0)
  }
  const click = (e: ThreeEvent<MouseEvent>) => {
    const target = e.nativeEvent.target as HTMLElement | null
    if (target?.closest('a, button, [role="dialog"]')) return
    e.stopPropagation()
    useStore.getState().set({ openWork: index, hoveredWork: null, cursor: 'default', cursorLabel: '' })
  }

  return (
    <group ref={group}>
      <Text
        font={displayFont}
        fontSize={2.6}
        letterSpacing={-0.06}
        anchorX="left"
        anchorY="bottom"
        position={[-W / 2 - 0.35, H / 2 - 0.55, -1.4]}
        fillOpacity={0}
        strokeWidth={0.012}
        strokeColor={colors.ink}
        strokeOpacity={0.32}
        renderOrder={1}
      >
        {String(index + 1).padStart(2, '0')}
      </Text>
      <mesh geometry={frameGeo} material={frameMat} position={[0, 0, -0.02]} renderOrder={2} />
      <mesh
        ref={screen}
        geometry={geo}
        material={mat}
        onPointerOver={over}
        onPointerOut={out}
        onPointerMove={move}
        onClick={click}
      />
    </group>
  )
}
