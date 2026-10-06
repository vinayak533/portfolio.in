import { BufferAttribute, BufferGeometry, IcosahedronGeometry, OctahedronGeometry, TetrahedronGeometry } from 'three'

/**
 * Non-indexed polyhedron with flat normals and a barycentric attribute so the
 * fragment shader can draw glowing facet edges without extra geometry.
 */
export function crystalGeometry(kind: 'octa' | 'tetra' | 'icosa' = 'octa', radius = 1, detail = 0): BufferGeometry {
  const g =
    kind === 'octa'
      ? new OctahedronGeometry(radius, detail)
      : kind === 'tetra'
        ? new TetrahedronGeometry(radius, detail)
        : new IcosahedronGeometry(radius, detail)
  const geo = g.index ? g.toNonIndexed() : g
  geo.computeVertexNormals()
  const n = geo.attributes.position.count
  const bary = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) bary[i * 3 + (i % 3)] = 1
  geo.setAttribute('bary', new BufferAttribute(bary, 3))
  geo.deleteAttribute('uv')
  return geo
}

/**
 * Tags every triangle of a non-indexed crystal with its centroid and a random
 * value (`aFace`), so a vertex shader can pull the facets apart as rigid pieces.
 */
export function withFacets(geo: BufferGeometry): BufferGeometry {
  const pos = geo.attributes.position
  const face = new Float32Array(pos.count * 4)
  for (let t = 0; t < pos.count; t += 3) {
    const r = Math.random()
    for (let a = 0; a < 3; a++) {
      const v = t + a
      face[v * 4] = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3
      face[v * 4 + 1] = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3
      face[v * 4 + 2] = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3
      face[v * 4 + 3] = r
    }
  }
  geo.setAttribute('aFace', new BufferAttribute(face, 4))
  return geo
}
