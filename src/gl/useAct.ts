import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { signals } from '../store/useStore'

/**
 * Hides an act's group outside its slice of the global timeline, so off-screen
 * scenes cost nothing on the GPU. Returns the group ref and a live 0..1
 * "presence" (fades over the first and last 0.15 of the range).
 */
export function useAct(range: readonly [number, number]) {
  const ref = useRef<Group>(null)
  const presence = useRef(0)
  useFrame(() => {
    const t = signals.t
    const [a, b] = range
    const inside = t >= a && t <= b
    if (ref.current) ref.current.visible = inside
    const f = 0.15
    presence.current = inside ? Math.min(1, (t - a) / f, (b - t) / f) : 0
  }, -40)
  return { ref, presence }
}
