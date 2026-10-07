import { Suspense, useEffect, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { NoToneMapping, SRGBColorSpace } from 'three'
import { onTick } from '../core/clock'
import { scrollToY } from '../core/scroll'
import { complete } from '../core/loading'
import { tier } from '../core/quality'
import { signals, useStore } from '../store/useStore'
import { palette } from '../theme'
import { CameraRig } from './CameraRig'
import { Atmosphere } from './Atmosphere'
import { Effects } from './Effects'
import { PortraitScan } from './about/PortraitScan'
import { WorksGallery } from './works/WorksGallery'
import { ExperiencePath } from './experience/ExperiencePath'

/** Drives R3F from the shared GSAP ticker; skips frames while fully covered or hidden. */
function Driver() {
  const advance = useThree((s) => s.advance)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(
    () =>
      onTick((time) => {
        if (signals.paused || signals.heroCovers || signals.contactCovers || document.hidden) return
        advance(time)
      }, 100),
    [advance],
  )
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

/** Compiles every program up front (async where supported) so scrolling never hitches. */
function Warmup() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        await gl.compileAsync(scene, camera)
      } catch {
        gl.compile(scene, camera)
      }
      if (!cancelled) complete('compile')
    }
    run()
    return () => {
      cancelled = true
    }
  }, [gl, scene, camera])
  return null
}

/** Dev-only switches for profiling: ?nosky, ?nopost. */
const debug = new URLSearchParams(import.meta.env.DEV ? location.search : '')
const deviceDpr = () => window.devicePixelRatio || 1

export default function Stage() {
  const quality = useStore((s) => (s.lite ? 'low' : s.quality))
  const cfg = tier[quality]
  const [dpr, setDpr] = useState(() => Math.min(deviceDpr(), cfg.startDpr))

  useEffect(() => setDpr(Math.min(deviceDpr(), cfg.startDpr)), [cfg.startDpr])

  return (
    <div data-stage className="fixed inset-0 z-0" aria-hidden="true">
      <Canvas
        frameloop="never"
        dpr={dpr}
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
          gl.setClearColor(palette.base)
        }}
      >
        <Driver />
        <PerformanceMonitor
          bounds={() => [50, 58]}
          flipflops={4}
          onDecline={() => setDpr((d) => Math.max(cfg.minDpr, +(d - 0.15).toFixed(2)))}
          onIncline={() => setDpr((d) => Math.min(cfg.maxDpr, deviceDpr(), +(d + 0.15).toFixed(2)))}
          onFallback={() => setDpr(cfg.minDpr)}
        />
        <CameraRig />
        {!debug.has('nosky') && <Atmosphere />}
        <Suspense fallback={null}>
          <PortraitScan />
          <WorksGallery />
          <ExperiencePath />
          <Warmup />
        </Suspense>
        {!debug.has('nopost') && <Effects />}
      </Canvas>
    </div>
  )
}
