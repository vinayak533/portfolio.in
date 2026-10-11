/**
 * Soft industrial forms for the robot (model.ts): superellipsoids ("blobs"),
 * panels that hug their curved fronts, and hairline seams that follow them.
 *
 * A blob is |x/a|^e + |y/b|^ey + |z/c|^e = 1, with its own exponent above and
 * below the equator (a flatter top, a flatter sole) and an optional taper
 * that narrows it toward the bottom. Higher exponents are squarer.
 */
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Quaternion, SphereGeometry, TubeGeometry, Vector3 } from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface Blob {
  /** Half width, half height, half depth. */
  a: number
  b: number
  c: number
  /** Exponent around the sides (x, z). */
  e: number
  /** Exponent for y above and below the equator (default e). */
  eTop?: number
  eBottom?: number
  /** Width and depth grow by this share at the top and shrink by it at the bottom. */
  taper?: number
}

const pw = (v: number, e: number) => Math.pow(Math.abs(v), e)
const ey = (s: Blob, y: number) => (y >= 0 ? (s.eTop ?? s.e) : (s.eBottom ?? s.e))
const taperAt = (s: Blob, y: number) => 1 + ((s.taper ?? 0) * y) / s.b

/** The blob as a smooth mesh (a sphere pushed out onto the surface, seams merged, normals rebuilt). */
export function blobGeometry(s: Blob, widthSegments = 56, heightSegments = 40): BufferGeometry {
  const sphere = new SphereGeometry(1, widthSegments, heightSegments)
  sphere.deleteAttribute('normal')
  sphere.deleteAttribute('uv')
  const pos = sphere.attributes.position
  const hiBound = Math.max(s.a, s.b, s.c) * 1.5
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i)
    const dy = pos.getY(i)
    const dz = pos.getZ(i)
    const e2 = ey(s, dy)
    const A = pw(dx / s.a, s.e) + pw(dz / s.c, s.e)
    const B = pw(dy / s.b, e2)
    let lo = 0
    let hi = hiBound
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (A * Math.pow(mid, s.e) + B * Math.pow(mid, e2) > 1) hi = mid
      else lo = mid
    }
    const y = dy * lo
    const t = taperAt(s, y)
    pos.setXYZ(i, dx * lo * t, y, dz * lo * t)
  }
  const merged = mergeVertices(sphere, 1e-5)
  sphere.dispose()
  merged.computeVertexNormals()
  return merged
}

/** The front (+z) surface's depth at (x, y), blob-local; 0 outside the silhouette. */
export function frontZ(s: Blob, x: number, y: number) {
  const t = taperAt(s, y)
  const r = 1 - pw(x / (s.a * t), s.e) - pw(y / s.b, ey(s, y))
  return r <= 0 ? 0 : s.c * t * Math.pow(r, 1 / s.e)
}

const Z = new Vector3(0, 0, 1)
const n = new Vector3()

/** A point on the front surface (lifted along z), and the turn that faces +z out of the surface there. */
export function onFront(s: Blob, x: number, y: number, lift = 0, quat?: Quaternion) {
  const z = frontZ(s, x, y)
  if (quat) {
    const h = 1e-3
    const dzx = (frontZ(s, x + h, y) - frontZ(s, x - h, y)) / (2 * h)
    const dzy = (frontZ(s, x, y + h) - frontZ(s, x, y - h)) / (2 * h)
    quat.setFromUnitVectors(Z, n.set(-dzx, -dzy, 1).normalize())
  }
  return new Vector3(x, y, z + lift)
}

/**
 * A curved panel on the blob's front: the area between two closed outlines
 * (`inner` may be a single point for a solid panel), each a function of
 * u in [0, 1), filled in `steps` bands and lifted off the surface by
 * `lift(x, y)`. UVs are planar across `box` [x0, y0, w, h].
 */
export function frontPanel(
  s: Blob,
  inner: (u: number) => [number, number],
  outer: (u: number) => [number, number],
  lift: (x: number, y: number) => number,
  box: [number, number, number, number],
  segments = 96,
  steps = 8,
): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const [x0, y0, w, h] = box
  for (let j = 0; j <= steps; j++) {
    const f = j / steps
    for (let i = 0; i < segments; i++) {
      const u = i / segments
      const [ix, iy] = inner(u)
      const [ox, oy] = outer(u)
      const x = ix + (ox - ix) * f
      const y = iy + (oy - iy) * f
      positions.push(x, y, frontZ(s, x, y) + lift(x, y))
      uvs.push((x - x0) / w, (y - y0) / h)
    }
  }
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * segments + i
      const b = j * segments + ((i + 1) % segments)
      const c = a + segments
      const d = b + segments
      index.push(a, c, b, b, c, d)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** A curved rectangle on the blob's front (a displaced grid), UVs 0..1 across it. */
export function frontRect(s: Blob, cx: number, cy: number, w: number, h: number, lift: (x: number, y: number) => number, nx = 24, ny = 16) {
  const positions: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = cx - w / 2 + (w * i) / nx
      const y = cy - h / 2 + (h * j) / ny
      positions.push(x, y, frontZ(s, x, y) + lift(x, y))
      uvs.push(i / nx, j / ny)
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i
      index.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** A superellipse outline (half sizes w, h; exponent p), as a function of u in [0, 1). */
export const squircle = (w: number, h: number, p: number, cx = 0, cy = 0) => (u: number): [number, number] => {
  const t = u * Math.PI * 2
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [cx + w * Math.sign(c) * pw(c, 2 / p), cy + h * Math.sign(s) * pw(s, 2 / p)]
}

/** How far (x, y) is out toward a squircle's edge: 0 at its centre, 1 on it. */
export const squircleR = (x: number, y: number, w: number, h: number, p: number) => Math.pow(pw(x / w, p) + pw(y / h, p), 1 / p)

/** The outward surface normal at a point on the (untapered) blob. */
function normalAt(s: Blob, p: Vector3, out: Vector3) {
  const e2 = ey(s, p.y)
  return out
    .set(
      (Math.sign(p.x) * s.e * pw(p.x / s.a, s.e - 1)) / s.a,
      (Math.sign(p.y) * e2 * pw(p.y / s.b, e2 - 1)) / s.b,
      (Math.sign(p.z) * s.e * pw(p.z / s.c, s.e - 1)) / s.c,
    )
    .normalize()
}

/**
 * A hairline seam: a thin tube round the blob where it is cut by the plane
 * z = level (axis 'z') or y = level (axis 'y'), standing just proud of the
 * surface. For tapered blobs use axis 'y' (the cut is scaled with the taper).
 */
export function seamGeometry(s: Blob, axis: 'y' | 'z', level: number, radius: number, segments = 180) {
  const pts: Vector3[] = []
  const nrm = new Vector3()
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const c = Math.cos(t)
    const sn = Math.sin(t)
    const p = new Vector3()
    if (axis === 'z') {
      const k = 1 - pw(level / s.c, s.e)
      const e2 = ey(s, sn)
      p.set(s.a * Math.pow(k, 1 / s.e) * Math.sign(c) * pw(c, 2 / s.e), s.b * Math.pow(k, 1 / e2) * Math.sign(sn) * pw(sn, 2 / e2), level)
      normalAt(s, p, nrm)
    } else {
      const k = 1 - pw(level / s.b, ey(s, level))
      const r = Math.pow(k, 1 / s.e)
      p.set(s.a * r * Math.sign(c) * pw(c, 2 / s.e), level, s.c * r * Math.sign(sn) * pw(sn, 2 / s.e))
      normalAt(s, p, nrm)
      const t2 = taperAt(s, level)
      p.x *= t2
      p.z *= t2
    }
    pts.push(p.addScaledVector(nrm, radius * 0.6))
  }
  return new TubeGeometry(new CatmullRomCurve3(pts, true), segments, radius, 5, true)
}

/** A point on the blob along a direction from its centre (taper applied). */
function blobPoint(s: Blob, dx: number, dy: number, dz: number, out: Vector3) {
  const e2 = ey(s, dy)
  const A = pw(dx / s.a, s.e) + pw(dz / s.c, s.e)
  const B = pw(dy / s.b, e2)
  let lo = 0
  let hi = Math.max(s.a, s.b, s.c) * 1.5
  for (let k = 0; k < 36; k++) {
    const mid = (lo + hi) / 2
    if (A * Math.pow(mid, s.e) + B * Math.pow(mid, e2) > 1) hi = mid
    else lo = mid
  }
  const y = dy * lo
  const t = taperAt(s, y)
  return out.set(dx * lo * t, y, dz * lo * t)
}

const pA = new Vector3()
const pB = new Vector3()
const pC = new Vector3()
const pD = new Vector3()
const du = new Vector3()
const dv = new Vector3()

/**
 * A panel of a blob's surface between two azimuths and two polar angles, so
 * shells can be split into plates with clean, even gaps along the parameter
 * lines. Azimuth is measured from the front (+z) toward +x; polar from the top
 * (+y). Normals are taken from the surface itself (not the mesh), so plates cut
 * from the same blob shade as one continuous form. UVs run 0..1 across it.
 */
export function blobPatch(s: Blob, az0: number, az1: number, th0: number, th1: number, nu = 32, nv = 24): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const index: number[] = []
  const at = (az: number, th: number, out: Vector3) => {
    const t = Math.min(Math.PI - 1e-3, Math.max(1e-3, th))
    return blobPoint(s, Math.sin(az) * Math.sin(t), Math.cos(t), Math.cos(az) * Math.sin(t), out)
  }
  const h = 1e-3
  for (let j = 0; j <= nv; j++) {
    const th = th0 + ((th1 - th0) * j) / nv
    for (let i = 0; i <= nu; i++) {
      const az = az0 + ((az1 - az0) * i) / nu
      at(az, th, pA)
      positions.push(pA.x, pA.y, pA.z)
      du.subVectors(at(az + h, th, pB), at(az - h, th, pC))
      dv.subVectors(at(az, th + h, pB), at(az, th - h, pD))
      const n = pB.crossVectors(dv, du).normalize()
      if (n.lengthSq() < 0.5 || n.dot(pA) < 0) n.copy(pA).normalize()
      normals.push(n.x, n.y, n.z)
      uvs.push(i / nu, 1 - j / nv)
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i
      const b = a + 1
      const c = a + nu + 1
      const d = c + 1
      index.push(a, c, b, b, c, d)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  g.setIndex(index)
  return g
}
