import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { HalfFloatType, NoToneMapping, SRGBColorSpace, WebGLRenderTarget } from 'three'
import { createPacer, onTick } from '../core/clock'
import { scrollToY } from '../core/scroll'
import { complete } from '../core/loading'
import { labOff } from '../core/perfLab'
import { tier } from '../core/quality'
import { signals, useStore } from '../store/useStore'
import { palette } from '../theme'
import { CameraRig } from './CameraRig'
import { Atmosphere } from './Atmosphere'
import { Effects, warmPost } from './Effects'
import { PortraitScan } from './about/PortraitScan'
import { WorksGallery } from './works/WorksGallery'
import { ExperiencePath } from './experience/ExperiencePath'

/** Drives R3F from the shared GSAP ticker; skips frames while fully covered or hidden. */
function Driver() {
  const advance = useThree((s) => s.advance)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    // Paced with the hero (clock.ts): about 60 frames a second on any display, ~30 once locked.
    const pace = createPacer()
    return onTick((time) => {
      if (signals.paused || signals.heroCovers || signals.contactCovers || document.hidden || labOff('sections')) return
      if (pace(performance.now())) advance(time)
    }, 100)
  }, [advance])
  useEffect(() => {
    if (!import.meta.env.DEV) return
    // Dev-only probe: true per-frame cost, independent of rAF throttling.
    const w = window as unknown as Record<string, unknown>
    w.__lattice = {
      signals,
      gl,
      scene,
      /** Jump to section id at local progress p, bypassing smoothing. */
      go(id: string, p: number) {
        const el = document.getElementById(id)
        if (el) scrollToY(el.offsetTop + el.offsetHeight * p, true)
      },
      measure(frames = 30, t?: number) {
        const ctx = gl.getContext()
        const px = new Uint8Array(4)
        if (t !== undefined) signals.t = t
        const times: number[] = []
        let clock = performance.now() / 1000
        for (let i = 0; i < frames; i++) {
          const s = performance.now()
          clock += 1 / 60
          advance(clock)
          ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px)
          times.push(performance.now() - s)
        }
        times.sort((a, b) => a - b)
        return { median: +times[frames >> 1].toFixed(2), p90: +times[Math.floor(frames * 0.9)].toFixed(2), info: gl.info.render }
      },
      /** GPU time per frame via EXT_disjoint_timer_query_webgl2 (not vsync-bound). */
      async gpu(frames = 40, t?: number, scan?: number) {
        const ctx = gl.getContext() as WebGL2RenderingContext
        const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2')
        if (!ext) return 'timer query unavailable'
        if (t !== undefined) signals.t = t
        const results: number[] = []
        let clock = performance.now() / 1000
        for (let i = 0; i < frames; i++) {
          const q = ctx.createQuery()!
          if (t !== undefined) signals.t = t
          if (scan !== undefined) signals.scan = scan
          ctx.beginQuery(ext.TIME_ELAPSED_EXT, q)
          clock += 1 / 60
          advance(clock)
          ctx.endQuery(ext.TIME_ELAPSED_EXT)
          await new Promise<void>((resolve) => {
            const poll = () => {
              if (ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)) {
                if (!ctx.getParameter(ext.GPU_DISJOINT_EXT)) results.push(ctx.getQueryParameter(q, ctx.QUERY_RESULT) / 1e6)
                ctx.deleteQuery(q)
                resolve()
              } else setTimeout(poll, 1)
            }
            poll()
          })
        }
        results.sort((a, b) => a - b)
        return { median: +results[results.length >> 1]?.toFixed(2), min: +results[0]?.toFixed(2), n: results.length, calls: gl.info.render.calls, size: [ctx.drawingBufferWidth, ctx.drawingBufferHeight] }
      },
    }
  }, [gl, advance, scene])
  return null
}

/**
 * Compiles every program up front (async where supported) so scrolling never
 * hitches. three only compiles visible objects, and every act but the current
 * one is hidden, so all of them are revealed while the compile is queued.
 */
function Warmup({ post }: { post: boolean }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let cancelled = false
    const timers: number[] = []
    const run = async (first: boolean) => {
      // Let late materials (glyph text, shards) attach first.
      await new Promise((r) => setTimeout(r, 0))
      if (cancelled) return
      // A synchronous query (it waits for the GPU to catch up): asked once here, while this context has nothing
      // queued, three keeps the answer. Asked first by the works' textures, it held a hand-off frame 40 ms+.
      if (first) gl.capabilities.getMaxAnisotropy()
      const revealAll = () => {
        const hidden: { visible: boolean }[] = []
        scene.traverse((o) => {
          if (!o.visible) {
            hidden.push(o)
            o.visible = true
          }
        })
        return () => hidden.forEach((o) => (o.visible = false))
      }
      // With post on, the scene renders into a linear HDR target, which is a
      // different program variant from the canvas one: compile that variant.
      const target = post ? new WebGLRenderTarget(64, 64, { type: HalfFloatType }) : null
      const previous = gl.getRenderTarget()
      let restore = revealAll()
      gl.setRenderTarget(target)
      try {
        // The traversal happens synchronously inside the call; the wait is only for the driver.
        const pending = gl.compileAsync(scene, camera)
        restore()
        gl.setRenderTarget(previous)
        await pending
      } catch {
        restore = revealAll()
        gl.setRenderTarget(target)
        gl.compile(scene, camera)
        restore()
        gl.setRenderTarget(previous)
      }
      // Then draw everything once, off screen. ANGLE on D3D11 (Chrome on
      // Windows) builds the final pixel shader at a program's first draw, which
      // otherwise lands mid-scroll as a 100 ms+ freeze.
      if (target && !cancelled) {
        restore = revealAll()
        const culled: { frustumCulled: boolean }[] = []
        scene.traverse((o) => {
          if (o.frustumCulled) {
            culled.push(o)
            o.frustumCulled = false
          }
        })
        gl.setRenderTarget(target)
        gl.render(scene, camera)
        gl.setRenderTarget(previous)
        culled.forEach((o) => (o.frustumCulled = true))
        restore()
      }
      target?.dispose()
      if (first && !cancelled) complete('compile')
      // Then the post passes (Effects.tsx), when the page is idle, while the hero still covers the stage.
      if (post && !cancelled) {
        const covered = () => !cancelled && signals.heroCovers && !document.hidden
        // (Safari has no requestIdleCallback.)
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => void warmPost(gl, covered), { timeout: 3000 })
        else setTimeout(() => void warmPost(gl, covered), 200)
      }
    }
    run(true)
    // Some meshes only exist once async data lands (portrait particles, glyph
    // text, shards): sweep again so they are compiled before they are seen.
    // Programs already built are cache hits, so a sweep costs little.
    for (const ms of [2000, 5000, 9000]) timers.push(window.setTimeout(() => run(false), ms))
    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [gl, scene, camera, post])
  return null
}

/** Dev-only switches for profiling: ?nosky, ?nopost. */
const debug = new URLSearchParams(import.meta.env.DEV ? location.search : labOff('post') ? '?nopost' : '')
const deviceDpr = () => window.devicePixelRatio || 1

type TierConfig = (typeof tier)[keyof typeof tier]

/**
 * Adaptive resolution, applied through R3F's own store. Holding the DPR in
 * Stage state re-rendered the whole tree on every step, which rebuilt the post
 * chain (a shader recompile: a 100 ms+ freeze), which dropped the frame rate,
 * which stepped the DPR again: a stutter loop.
 */
function AdaptiveDpr({ cfg }: { cfg: TierConfig }) {
  const setDpr = useThree((s) => s.setDpr)
  const dpr = useRef(Math.min(deviceDpr(), cfg.startDpr))
  const want = useRef(dpr.current)
  const still = useRef(0)
  useEffect(() => {
    dpr.current = want.current = Math.min(deviceDpr(), cfg.startDpr)
    setDpr(dpr.current)
  }, [cfg, setDpr])
  // A resolution step reallocates every post buffer (~70 ms on integrated
  // GPUs): take it only once scrolling has settled, never mid-gesture.
  useFrame((_, dt) => {
    still.current = Math.abs(signals.velocity) < 0.02 ? still.current + dt : 0
    if (want.current !== dpr.current && still.current > 0.35) {
      dpr.current = want.current
      setDpr(dpr.current)
    }
  })
  const apply = (d: number) => {
    want.current = d
  }
  return (
    <PerformanceMonitor
      bounds={() => [50, 58]}
      flipflops={4}
      onDecline={() => apply(Math.max(cfg.minDpr, +(want.current - 0.15).toFixed(2)))}
      onIncline={() => apply(Math.min(cfg.maxDpr, deviceDpr(), +(want.current + 0.15).toFixed(2)))}
      onFallback={() => apply(cfg.minDpr)}
    />
  )
}

export default function Stage() {
  const quality = useStore((s) => (s.lite ? 'low' : s.quality))
  const cfg = tier[quality]
  const [startDpr] = useState(() => Math.min(deviceDpr(), cfg.startDpr))

  return (
    // Sized to the large viewport, not inset-0: a phone's URL bar showing or hiding
    // must not resize the canvas (that reallocates every post buffer mid-scroll).
    <div data-stage className="fixed inset-x-0 top-0 z-0 h-lvh" aria-hidden="true">
      <Canvas
        frameloop="never"
        dpr={startDpr}
        flat
        eventSource={document.getElementById('root')!}
        eventPrefix="client"
        camera={{ fov: 38, near: 0.1, far: 140, position: [0, 0, 16] }}
        gl={{
          antialias: false,
          alpha: false,
          stencil: false,
          depth: true,
          powerPreference: 'high-performance',
          toneMapping: NoToneMapping,
          outputColorSpace: SRGBColorSpace,
        }}
        onCreated={({ gl }) => {
          // Shader diagnostics in development only: in production each program's first use would wait on
          // synchronous GL queries (its info logs), as the hero's renderer already avoids (engine.ts).
          gl.debug.checkShaderErrors = import.meta.env.DEV
          gl.setClearColor(palette.base)
        }}
      >
        <Driver />
        <AdaptiveDpr cfg={cfg} />
        <CameraRig />
        {!debug.has('nosky') && <Atmosphere />}
        <Suspense fallback={null}>
          <PortraitScan />
          <WorksGallery />
          <ExperiencePath />
          <Warmup post={!debug.has('nopost')} />
        </Suspense>
        {!debug.has('nopost') && <Effects />}
      </Canvas>
    </div>
  )
}
