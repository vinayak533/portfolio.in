import { signals } from '../store/useStore'
import { onTick, damp } from './clock'

/** Normalised pointer (-1..1, y up) with damped velocity, shared by DOM and WebGL. */
export function initPointer() {
  const p = signals.pointer
  let rawVx = 0
  let rawVy = 0

  const move = (e: PointerEvent) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1
    const ny = -((e.clientY / window.innerHeight) * 2 - 1)
    rawVx += nx - p.nx
    rawVy += ny - p.ny
    p.x = e.clientX
    p.y = e.clientY
    p.nx = nx
    p.ny = ny
    p.lastMove = performance.now()
    p.active = true
  }
  const leave = () => (p.active = false)

  window.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerleave', leave)

  const stop = onTick((_, dt) => {
    // Velocity in normalised units per second, damped for a weighty feel.
    p.vx = damp(p.vx, rawVx / Math.max(dt, 1e-3), 10, dt)
    p.vy = damp(p.vy, rawVy / Math.max(dt, 1e-3), 10, dt)
    rawVx = 0
    rawVy = 0
  }, -90)

  return () => {
    window.removeEventListener('pointermove', move)
    document.removeEventListener('pointerleave', leave)
    stop()
  }
}
