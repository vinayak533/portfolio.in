import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import {
  Color,
  Group,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  VideoTexture,
  type Intersection,
  type Object3D,
  type PerspectiveCamera,
  type Raycaster,
} from 'three'
import { projects, type Project } from '../../content'
import { layout, visibility, worksWide } from '../../theme'
import { colors, world } from '../world'
import { signals, useStore } from '../../store/useStore'
import { damp } from '../../core/clock'
import { worksTrack } from '../../core/timeline'
import { useAct } from '../useAct'
import { createScreenMaterial } from './screenMaterial'
import { exhibitRects } from '../../core/registry'
import { driveExhibits, hiResExhibits, peekReel } from '../../core/reels'
import screenVert from '../shaders/works/screen.vert'
import frameFrag from '../shaders/works/frame.frag'

const displayFont = '/fonts/bricolage-grotesque-latin-600-normal.woff'
/** The reels are 16:9; the screen matches so the whole frame shows, uncropped. */
const ASPECT = 16 / 9
/** The reel spans the whole card; a thin frame border sits around it. */
const W = layout.worksScreen
const H = W / ASPECT
const INSET = 0.07
const FRAME_W = W + INSET * 2
const FRAME_H = H + INSET * 2

/**
 * "Details" chip in each reel's bottom-right corner. It has no handlers of its
 * own, so pointer events fall through to the screen, which opens the case study.
 */
const CHIP_W = 1.24
const CHIP_H = 0.36
const CHIP_MARGIN = 0.16
/** A solid violet pill with bright type, so it reads over any frame of the reel. */
const chipEdge = new Color(colors.accent).lerp(colors.ink, 0.55)

/**
 * R3F raycasts every mesh with handlers, visible or not. The exhibits only take
 * the pointer while Act III is actually on screen: never through the hero or
 * Contact covers, and never from a slice of the timeline where they are hidden.
 */
function interactive(obj: Object3D) {
  const [a, b] = visibility.works
  if (signals.heroCovers || signals.contactCovers || signals.t < a || signals.t > b) return false
  for (let o: Object3D | null = obj; o; o = o.parent) if (!o.visible) return false
  return true
}

function gatedRaycast(this: Mesh, raycaster: Raycaster, hits: Intersection[]) {
  if (interactive(this)) Mesh.prototype.raycast.call(this, raycaster, hits)
}

/** Posters decode off the main thread, so they never hitch the scroll. */
const posterLoader = new ImageBitmapLoader().setOptions({ imageOrientation: 'flipY' })
function loadPoster(url: string) {
  return new Promise<Texture>((resolve, reject) =>
    posterLoader.load(
      url,
      (bitmap) => {
        const t = new Texture(bitmap)
        t.flipY = false
        t.colorSpace = SRGBColorSpace
        t.needsUpdate = true
        resolve(t)
      },
      undefined,
      reject,
    ),
  )
}

/**
 * GPU uploads (posters, first video frames) are spread one per frame: five
 * landing together would stall a frame for tens of milliseconds.
 */
const uploads: (() => void)[] = []
const queueUpload = (fn: () => void) => uploads.push(fn)

/** Act III. Five floating glass exhibits the camera tracks past. */
export function WorksGallery() {
  const { ref } = useAct(visibility.works)
  useEffect(driveExhibits, [])
  useFrame(() => uploads.shift()?.(), -50)
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
  // Small screens get a DOM Details button instead (Works.tsx).
  const showDetails = worksWide(size.width / size.height, size.width)
  const geo = useMemo(() => new PlaneGeometry(W, H), [])
  const frameGeo = useMemo(() => new PlaneGeometry(FRAME_W, FRAME_H), [])
  const chip = useRef<Group>(null)
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
          uAspect: { value: FRAME_W / FRAME_H },
          uTime: { value: 0 },
          uAccent: { value: colors.accent },
          uInk: { value: colors.ink },
        },
      }),
    [],
  )
  const st = useMemo(() => ({ hover: 0, focus: 0, tiltX: 0, tiltY: 0, mouse: new Vector3(0.5, 0.5, 0) }), [])
  const gl = useThree((s) => s.gl)
  // Poster first (fades in over the generative scene), then the live reel once
  // it is decoded at the poster's frame, so the swap is invisible.
  const media = useMemo(() => ({ asked: false, pending: false, poster: null as Texture | null, video: null as VideoTexture | null, mix: 0 }), [])
  useEffect(
    () => () => {
      media.poster?.dispose()
      media.video?.dispose()
    },
    [media],
  )
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
    // Scrolled away while hovered (no pointer move to trigger the out event).
    if (hovered && screen.current && !interactive(screen.current)) s.set({ hoveredWork: null, cursor: 'default', cursorLabel: '' })

    // Float, and lean toward the cursor while hovered.
    const p = signals.pointer
    st.tiltX = damp(st.tiltX, -p.ny * 0.12 * st.hover, 4, dt)
    st.tiltY = damp(st.tiltY, p.nx * 0.18 * st.hover - (1 - st.focus) * 0.22 * Math.sign(k - index), 3, dt)
    g.position.set(base.x, base.y + Math.sin(time * 0.5 + index * 1.7) * 0.08, base.z + st.hover * 0.35)
    g.rotation.set(st.tiltX, st.tiltY, Math.sin(time * 0.3 + index) * 0.008)

    const u = mat.uniforms
    const m = project.media
    if (m?.poster && !media.asked && signals.t > visibility.works[0] - 0.8) {
      media.asked = true
      loadPoster(m.poster)
        .then((t) => {
          t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
          queueUpload(() => {
            gl.initTexture(t)
            media.poster = t
            if (!media.video) u.uMedia.value = t
          })
        })
        .catch(() => {})
    }
    const r = peekReel(index)
    if (r?.ready && !media.video && !media.pending && r.video.videoWidth) {
      media.pending = true
      queueUpload(() => {
        // Hi-res tier: mipmapped + anisotropic, so UI text stays crisp when the
        // screen is small or tilted instead of shimmering. Uploaded before it is
        // on screen, one texture per frame.
        const hi = hiResExhibits()
        const v = new VideoTexture(r.video, undefined, undefined, undefined, LinearFilter, hi ? LinearMipmapLinearFilter : LinearFilter)
        v.generateMipmaps = hi
        if (hi) v.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
        v.needsUpdate = true
        gl.initTexture(v)
        media.video = v
        u.uMedia.value = v
        u.uMediaDecode.value = 1
        u.uMediaAspect.value = r.video.videoWidth / r.video.videoHeight
      })
    }
    media.mix = damp(media.mix, u.uMedia.value ? 1 : 0, 2.2, dt)
    u.uMediaMix.value = media.mix > 0.998 ? 1 : media.mix
    u.uTime.value = time
    u.uHover.value = st.hover
    u.uFocus.value = 0.25 + st.focus * 0.75
    u.uMouse.value.set(st.mouse.x, st.mouse.y)
    u.uOpacity.value = isOpen ? 0 : 1
    frameMat.uniforms.uHover.value = st.hover
    frameMat.uniforms.uFocus.value = st.focus
    frameMat.uniforms.uTime.value = time
    if (chip.current) chip.current.visible = !isOpen
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
      {showDetails && (
        <group ref={chip} position={[W / 2 - CHIP_MARGIN - CHIP_W / 2, -H / 2 + CHIP_MARGIN + CHIP_H / 2, 0]}>
          <mesh position={[0, 0, 0.004]} renderOrder={3}>
            <planeGeometry args={[CHIP_W + 0.02, CHIP_H + 0.02]} />
            <meshBasicMaterial color={chipEdge} transparent opacity={0.9} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.006]} renderOrder={3}>
            <planeGeometry args={[CHIP_W, CHIP_H]} />
            <meshBasicMaterial color={colors.accent} transparent opacity={0.96} depthWrite={false} />
          </mesh>
          <Text font={displayFont} fontSize={0.13} letterSpacing={0.04} color="#ffffff" anchorX="center" anchorY="middle" position={[0, 0, 0.01]} renderOrder={4}>
            {'Details  →'}
          </Text>
        </group>
      )}
      <mesh
        ref={screen}
        geometry={geo}
        material={mat}
        raycast={gatedRaycast}
        onPointerOver={over}
        onPointerOut={out}
        onPointerMove={move}
        onClick={click}
      />
    </group>
  )
}
