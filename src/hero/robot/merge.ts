/**
 * Fewer draws, the same picture. The procedural robot is ~250 meshes, and three's cost per draw (the
 * renderer's CPU work and the GPU's command stream) was most of a hero frame on a phone. Every opaque
 * mesh that nothing holds (no code moves, hides or restyles it on its own) never moves relative to its
 * nearest ancestor that something does hold: those are baked into that ancestor, with any static groups
 * between, one mesh per material and shadow role. Their geometry is transformed on the CPU once; the
 * shaders see the same vertices in the same places, so the frame is unchanged.
 *
 * Kept as they are: anything reachable from the model's handle (bones, pivots, the face, the keys...),
 * transparent or multi-material meshes, mirrored ones (their winding would flip), and meshes with children
 * or per-object render hooks. `boundsOf` reproduces Box3.setFromObject over the original meshes exactly,
 * so the layout's measurements (engine.ts) do not move by a pixel.
 */
import { Box3, Group, Matrix4, Mesh, Object3D, type BufferGeometry, type Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** One original mesh inside a merged one: its transform in the merged mesh's frame and its geometry's bounds. */
interface Part {
  matrix: Matrix4
  box: Box3
}

const PARTS = new WeakMap<Object3D, Part[]>()
const plainRender = Object3D.prototype.onBeforeRender

/** Every Object3D reachable from `handle` (deep, through plain objects and arrays; skipping `skip`'s keys). */
export function heldObjects(handle: object, skip: string[] = []): Set<Object3D> {
  const held = new Set<Object3D>()
  const seen = new Set<unknown>()
  const visit = (v: unknown) => {
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    if ((v as Object3D).isObject3D) {
      held.add(v as Object3D)
      return
    }
    // Materials, geometries and textures hold no scene objects.
    const any = v as { isMaterial?: boolean; isBufferGeometry?: boolean; isTexture?: boolean }
    if (any.isMaterial || any.isBufferGeometry || any.isTexture) return
    for (const k of Object.keys(v)) if (!skip.includes(k)) visit((v as Record<string, unknown>)[k])
  }
  for (const k of Object.keys(handle)) if (!skip.includes(k)) visit((handle as Record<string, unknown>)[k])
  return held
}

function signature(g: BufferGeometry) {
  const attrs = Object.keys(g.attributes)
    .sort()
    .map((n) => {
      const a = g.attributes[n] as { itemSize: number; normalized: boolean; array: ArrayLike<number> }
      return `${n}:${a.itemSize}:${+a.normalized}:${a.array.constructor.name}`
    })
  return `${attrs.join(',')}|${g.index ? 1 : 0}`
}

/**
 * Bakes the static opaque meshes under `root` into their nearest held ancestor (see above). Returns the
 * geometries it created (the caller owns them) and those no mesh uses any more (the caller disposes them).
 */
export function mergeStatic(root: Object3D, held: Set<Object3D>) {
  // An ancestor of anything held may move or hide (through it): merges stop there.
  const anchors = new Set<Object3D>([root])
  for (const o of held) for (let x: Object3D | null = o; x; x = x.parent) anchors.add(x)
  root.updateMatrixWorld(true)

  const groups = new Map<string, { anchor: Object3D; material: Material; meshes: Mesh[]; rel: Matrix4[]; proto: Mesh }>()
  const all: Mesh[] = []
  root.traverse((o) => {
    if ((o as Mesh).isMesh) all.push(o as Mesh)
  })
  for (const o of all) {
    const m = o.material
    if (held.has(o) || anchors.has(o) || o.children.length || Array.isArray(m) || m.transparent || !o.visible) continue
    if ((o as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh || (o as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) continue
    if (o.onBeforeRender !== plainRender || o.customDepthMaterial || o.customDistanceMaterial) continue
    const g = o.geometry
    // (A single material draws the whole geometry: its groups, if any, do not matter.)
    if (Object.keys(g.morphAttributes).length || !g.attributes.position) continue
    // Its transform in the anchor's frame: its own and every static group's between.
    let anchor = o.parent
    let visible = true
    const rel = o.matrix.clone()
    while (anchor && !anchors.has(anchor)) {
      visible &&= anchor.visible
      rel.premultiply(anchor.matrix)
      anchor = anchor.parent
    }
    if (!anchor || !visible || rel.determinant() <= 0) continue
    const key = [anchor.id, m.uuid, +o.castShadow, +o.receiveShadow, o.renderOrder, +o.frustumCulled, o.layers.mask, signature(g)].join('|')
    let entry = groups.get(key)
    if (!entry) groups.set(key, (entry = { anchor, material: m, meshes: [], rel: [], proto: o }))
    entry.meshes.push(o)
    entry.rel.push(rel)
  }

  const created: BufferGeometry[] = []
  const merged = new Set<Mesh>()
  for (const { anchor, material, meshes, rel, proto } of groups.values()) {
    if (meshes.length < 2) continue
    const parts: Part[] = []
    const baked = meshes.map((o, i) => {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      parts.push({ matrix: rel[i], box: o.geometry.boundingBox!.clone() })
      return o.geometry.clone().applyMatrix4(rel[i])
    })
    const g = mergeGeometries(baked, false)
    baked.forEach((b) => b.dispose())
    if (!g) continue
    const out = new Mesh(g, material)
    out.name = 'merged'
    out.castShadow = proto.castShadow
    out.receiveShadow = proto.receiveShadow
    out.renderOrder = proto.renderOrder
    out.frustumCulled = proto.frustumCulled
    out.layers.mask = proto.layers.mask
    PARTS.set(out, parts)
    anchor.add(out)
    created.push(g)
    for (const o of meshes) {
      o.removeFromParent()
      merged.add(o)
    }
  }

  // Static groups left empty go too (nothing holds them).
  const empty: Object3D[] = []
  root.traverse((o) => {
    if (!(o as Mesh).isMesh && o !== root && !anchors.has(o) && !held.has(o) && o.children.length === 0 && (o as Group).isGroup) empty.push(o)
  })
  for (let o of empty) {
    while (o.parent && o !== root && !anchors.has(o) && !held.has(o) && o.children.length === 0 && (o as Group).isGroup) {
      const p: Object3D = o.parent
      o.removeFromParent()
      o = p
    }
  }

  // Geometries no remaining mesh draws.
  const used = new Set<BufferGeometry>()
  root.traverse((o) => {
    if ((o as Mesh).geometry) used.add((o as Mesh).geometry)
  })
  const unused = new Set<BufferGeometry>()
  for (const o of merged) if (!used.has(o.geometry)) unused.add(o.geometry)
  return { created, unused: [...unused], merged: merged.size, meshes: created.length }
}

const partBox = new Box3()
const partMatrix = new Matrix4()

/** Box3.setFromObject(object), as if the merged meshes were still their parts (same arithmetic, same result). */
export function boundsOf(object: Object3D, target: Box3) {
  target.makeEmpty()
  expand(object, target)
  return target
}

function expand(object: Object3D, target: Box3) {
  object.updateWorldMatrix(false, false)
  const parts = PARTS.get(object)
  if (parts) {
    for (const p of parts) {
      partMatrix.multiplyMatrices(object.matrixWorld, p.matrix)
      target.union(partBox.copy(p.box).applyMatrix4(partMatrix))
    }
  } else {
    const geometry = (object as Mesh).geometry
    if (geometry !== undefined) {
      if (geometry.boundingBox === null) geometry.computeBoundingBox()
      target.union(partBox.copy(geometry.boundingBox!).applyMatrix4(object.matrixWorld))
    }
  }
  for (const c of object.children) expand(c, target)
}
