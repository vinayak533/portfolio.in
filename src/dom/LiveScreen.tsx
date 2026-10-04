import { useEffect, useRef } from 'react'
import { ACESFilmicToneMapping, Mesh, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { createScreenMaterial } from '../gl/works/screenMaterial'
import { onTick } from '../core/clock'
import type { VisualKind } from '../content'

/**
 * A tiny standalone renderer running the exact exhibit shader on the same
 * clock as the main scene, so the overlay media is a live continuation of the
 * 3D screen it grew out of. Falls back to a still poster without WebGL.
 */
export function LiveScreen({ kind, poster }: { kind: VisualKind; poster?: string }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // A fresh canvas per run: a context lost in cleanup can never be reused.
    const canvas = document.createElement('canvas')
    canvas.className = 'block h-full w-full'
    canvas.setAttribute('aria-hidden', 'true')
    host.current!.appendChild(canvas)

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' })
    } catch {
      canvas.remove()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.toneMapping = ACESFilmicToneMapping
    renderer.outputColorSpace = SRGBColorSpace
    const scene = new Scene()
    const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const mat = createScreenMaterial(kind, 1.6, true)
    const mesh = new Mesh(new PlaneGeometry(2, 2), mat)
    scene.add(mesh)

    const resize = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      mat.uniforms.uAspect.value = w / h
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const stop = onTick((time) => {
      mat.uniforms.uTime.value = time
      renderer.render(scene, cam)
    })
    return () => {
      stop()
      ro.disconnect()
      mat.dispose()
      mesh.geometry.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }, [kind])

  return (
    <div
      ref={host}
      className="h-full w-full bg-[var(--base)]"
      style={poster ? { backgroundImage: `url(${poster})`, backgroundSize: 'cover' } : undefined}
    />
  )
}
