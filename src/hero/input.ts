/**
 * Pointer / gyroscope input for the parallax camera. Produces a target in
 * -1..1 on both axes; the engine eases toward it.
 */
export interface ParallaxInput {
  target: { x: number; y: number }
  dispose(): void
}

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

export function createInput(container: HTMLElement, useGyro: () => boolean): ParallaxInput {
  const target = { x: 0, y: 0 }
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    target.x = clamp((e.clientX / window.innerWidth) * 2 - 1)
    target.y = clamp((e.clientY / window.innerHeight) * 2 - 1)
  }
  const onLeave = (e: PointerEvent) => {
    if (!e.relatedTarget) target.x = target.y = 0
  }
  const onBlur = () => (target.x = target.y = 0)

  // Gyroscope: relative to the first reading, so however the phone is held is "centre".
  let base: { b: number; g: number } | null = null
  const onOrient = (e: DeviceOrientationEvent) => {
    if (!useGyro() || e.beta === null || e.gamma === null) return
    if (!base) base = { b: e.beta, g: e.gamma }
    target.x = clamp((e.gamma - base.g) / 18)
    target.y = clamp((e.beta - base.b) / 18)
  }
  const Orientation = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as OrientationCtor | undefined
  let listening = false
  const listen = () => {
    if (listening) return
    listening = true
    window.addEventListener('deviceorientation', onOrient)
  }
  // iOS only grants motion access from a user gesture on the page.
  const onTouch = () => {
    container.removeEventListener('touchend', onTouch)
    Orientation?.requestPermission?.()
      .then((state) => state === 'granted' && listen())
      .catch(() => {})
  }
  if (Orientation && window.matchMedia('(pointer: coarse)').matches) {
    if (typeof Orientation.requestPermission === 'function') container.addEventListener('touchend', onTouch, { passive: true })
    else listen()
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  window.addEventListener('blur', onBlur)

  return {
    target,
    dispose() {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('deviceorientation', onOrient)
      container.removeEventListener('touchend', onTouch)
    },
  }
}
