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
