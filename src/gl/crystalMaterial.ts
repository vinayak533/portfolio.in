import { ShaderMaterial } from 'three'
import vert from './shaders/crystal/solid.vert'
import frag from './shaders/crystal/solid.frag'
import { colors } from './world'

/** Single glass crystal (waypoints, contact seed). Pair with crystalGeometry(). */
export function createCrystalMaterial() {
  return new ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uEnergy: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uEdge: { value: 1 },
      uAccent: { value: colors.accent },
      uInk: { value: colors.ink },
    },
  })
}
