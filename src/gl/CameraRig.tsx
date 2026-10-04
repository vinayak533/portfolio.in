import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { useMemo } from 'react'
import { makePose, poseAt } from './cameraPath'
import { signals } from '../store/useStore'
import { damp } from '../core/clock'

/**
 * Samples the authored camera path at the global scroll parameter, then adds
 * weight (damping), pointer parallax, an intro push-in and a speed-driven FOV kick.
 */
export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const state = useMemo(
    () => ({
      target: makePose(),
      pos: new Vector3(0, 0, 16),
      look: new Vector3(0, 0, 0),
      fov: 38,
      roll: 0,
      px: 0,
      py: 0,
      first: true,
    }),
    [],
  )
  const right = useMemo(() => new Vector3(), [])
  const up = useMemo(() => new Vector3(), [])
  const back = useMemo(() => new Vector3(), [])

  useFrame((frame, dt) => {
    const aspect = camera.aspect
    const tgt = poseAt(signals.t, aspect, state.target)
    const time = frame.clock.elapsedTime

    // Intro: the camera starts further out and higher, then settles as the loader hands over.
    const intro = 1 - signals.intro
    back.copy(tgt.pos).sub(tgt.look).normalize()
    tgt.pos.addScaledVector(back, intro * intro * 7)
    tgt.pos.y += intro * 1.6

    // Idle drift while resting on the hero: the sky is never still.
    const rest = 1 - Math.min(1, signals.progress.hero / 0.2)
    if (rest > 0) {
      tgt.pos.x += Math.sin(time * 0.07) * 0.55 * rest
      tgt.pos.y += Math.sin(time * 0.11 + 1.2) * 0.22 * rest
      tgt.pos.z += Math.cos(time * 0.06) * 0.35 * rest
    }

    if (state.first) {
      state.pos.copy(tgt.pos)
      state.look.copy(tgt.look)
      state.first = false
    }

    const l = 7
    state.pos.set(damp(state.pos.x, tgt.pos.x, l, dt), damp(state.pos.y, tgt.pos.y, l, dt), damp(state.pos.z, tgt.pos.z, l, dt))
    state.look.set(damp(state.look.x, tgt.look.x, l, dt), damp(state.look.y, tgt.look.y, l, dt), damp(state.look.z, tgt.look.z, l, dt))
    const speed = Math.min(Math.abs(signals.velocity), 3)
    state.fov = damp(state.fov, tgt.fov + speed * 2.2, 5, dt)
    state.roll = damp(state.roll, tgt.roll, 5, dt)

    // Pointer parallax: shift the eye, keep the gaze, so depth layers slide.
    const pr = signals.pointer
    state.px = damp(state.px, pr.nx, 2.6, dt)
    state.py = damp(state.py, pr.ny, 2.6, dt)

    camera.position.copy(state.pos)
    camera.lookAt(state.look)
    right.setFromMatrixColumn(camera.matrix, 0)
    up.setFromMatrixColumn(camera.matrix, 1)
    camera.position.addScaledVector(right, state.px * 0.42).addScaledVector(up, state.py * 0.26)
    camera.lookAt(state.look)
    camera.rotateZ(state.roll)

    if (Math.abs(camera.fov - state.fov) > 1e-3) {
      camera.fov = state.fov
      camera.updateProjectionMatrix()
    }
  }, -50)

  return null
}
