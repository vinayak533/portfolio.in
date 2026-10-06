import { ShaderMaterial } from 'three'
import vert from './shaders/crystal/solid.vert'
import facetVert from './shaders/crystal/facet.vert'
import frag from './shaders/crystal/solid.frag'
import { colors } from './world'

/**
 * Single glass crystal (waypoints, contact seed). Pair with crystalGeometry().
 * With `facets`, the geometry must also go through withFacets(); uSplit then
 * pulls its facets apart.
 */
export function createCrystalMaterial({ facets = false } = {}) {
  return new ShaderMaterial({
    vertexShader: facets ? facetVert : vert,
    fragmentShader: frag,
    uniforms: {
      uEnergy: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uEdge: { value: 1 },
      uSplit: { value: 0 },
      uAccent: { value: colors.accent },
      uInk: { value: colors.ink },
    },
  })
}
