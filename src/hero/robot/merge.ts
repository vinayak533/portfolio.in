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
import { AttachedBindMode, Bone, Box3, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, Object3D, ShaderChunk, Skeleton, SkinnedMesh, Uint16BufferAttribute, type BufferGeometry, type Material } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** One original mesh inside a merged one: its transform in the merged mesh's frame and its geometry's bounds. */
interface Part {
  matrix: Matrix4
  box: Box3
}

const PARTS = new WeakMap<Object3D, Part[]>()
/** The layer the skinned parts' bones are moved to: no camera renders it. */
const BONE_LAYER = 31
const BONE_MATERIAL = new MeshBasicMaterial()
/** A skinned mesh's parts (its bones, undrawn): its bounds are theirs. */
const SKINNED = new WeakMap<Object3D, Object3D[]>()
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
  const bones = SKINNED.get(object)
  if (bones) {
    // (Each part is also met where it hangs in the scene: a box's union with itself is the same box.)
    for (const b of bones) expand(b, target)
    return
  }
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

/**
 * Fewer draws still, for what moves. The opaque parts left after mergeStatic ride on held groups (the limbs'
 * segments, the fingers, the head's pieces), one draw each: here those within one visibility domain (anything
 * the engine shows or hides on its own: a domain's parts are always shown and hidden together) are drawn as
 * one skinned mesh per material and shadow role. Each part keeps its place in the scene, undrawn, as the bone
 * its own vertices are bound to (weight 1): every vertex lands where the part would have drawn it, and its
 * normal is transformed by the inverse transpose, as three does per object (some segments are scaled along
 * their length). The skinned mesh is a child of its domain, so hiding the domain hides it.
 *
 * Kept as they are: held meshes, `skip`, custom shaders, multi-material, mirrored or hooked meshes (and the
 * other blending kind: opaque and transparent parts are merged in separate passes). Returns the geometries and skeletons it created (the caller owns them).
 */
export function skinParts(root: Object3D, held: Set<Object3D>, domainOf: (o: Object3D) => Object3D | null, skip: Set<Object3D>, transparent = true) {
  root.updateMatrixWorld(true)
  const groups = new Map<string, { domain: Object3D; material: Material; meshes: Mesh[]; proto: Mesh }>()
  const all: Mesh[] = []
  root.traverse((o) => {
    if ((o as Mesh).isMesh) all.push(o as Mesh)
  })
  const why: Record<string, number> = {}
  const no = (r: string) => ((why[r] = (why[r] ?? 0) + 1), true)
  for (const o of all) {
    if (Array.isArray(o.material)) continue
    const m = o.material
    // (A custom shader would have to read the bones itself: its parts stay as they are.)
    if ((m.transparent && !transparent) || (m as Material & { isShaderMaterial?: boolean }).isShaderMaterial) continue
    if ((held.has(o) && no('held')) || (skip.has(o) && no('skip'))) continue
    if ((o as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh || (o as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh) continue
    if (o.onBeforeRender !== plainRender || o.customDepthMaterial || o.customDistanceMaterial) continue
    const g = o.geometry
    if (Object.keys(g.morphAttributes).length || !g.attributes.position || !g.attributes.normal) continue
    const domain = domainOf(o)
    let visible = true
    for (let x: Object3D | null = o; x && x !== root; x = x.parent) visible &&= x.visible
    if ((!domain && no('nodomain')) || (!visible && no('hidden')) || (o.matrixWorld.determinant() <= 0 && no('mirrored'))) continue
    const key = [domain!.id, m.uuid, +o.castShadow, +o.receiveShadow, o.renderOrder, o.layers.mask, skinSignature(g, m)].join('|')
    let entry = groups.get(key)
    if (!entry) groups.set(key, (entry = { domain: domain!, material: m, meshes: [], proto: o }))
    entry.meshes.push(o)
  }
  for (const e of groups.values()) if (e.meshes.length < 2) no('alone')

  // One skeleton per domain: its bones are the parts (one bone texture upload a frame per domain).
  const skeletons = new Map<Object3D, { bones: Object3D[]; index: Map<Object3D, number>; skeleton?: Skeleton }>()
  // A lone part whose material is skinned elsewhere is skinned too (alone in its group): three re-resolves the
  // program on every switch between a skinned and a plain mesh of one material.
  const skinnedMats = new Set([...groups.values()].filter((e) => e.meshes.length >= 2).map((e) => e.material))
  const used = [...groups.values()].filter((e) => e.meshes.length >= 2 || skinnedMats.has(e.material))
  for (const e of used) {
    let s = skeletons.get(e.domain)
    if (!s) skeletons.set(e.domain, (s = { bones: [], index: new Map() }))
    for (const o of e.meshes) if (!s.index.has(o)) s.index.set(o, s.bones.push(o) - 1)
  }
  for (const s of skeletons.values()) s.skeleton = stillSkeleton(new Skeleton(s.bones as Bone[], s.bones.map(() => new Matrix4())))

  const created: BufferGeometry[] = []
  const patched = new Set<Material>()
  let parts = 0
  for (const { domain, material, meshes, proto } of used) {
    const s = skeletons.get(domain)!
    const keep = skinAttributes(material)
    const pieces = meshes.map((o) => {
      const g = o.geometry.clone()
      // Only what the material reads, each indexed (the parts differ in both; the drawn result does not).
      for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name)
      g.clearGroups()
      const n = g.attributes.position.count
      if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i))
      const index = new Uint16Array(n * 4)
      const weight = new Float32Array(n * 4)
      const bone = s.index.get(o)!
      for (let i = 0; i < n; i++) {
        index[i * 4] = bone
        weight[i * 4] = 1
      }
      g.setAttribute('skinIndex', new Uint16BufferAttribute(index, 4))
      g.setAttribute('skinWeight', new Float32BufferAttribute(weight, 4))
      return g
    })
    const g = mergeGeometries(pieces, false)
    pieces.forEach((p) => p.dispose())
    if (!g) continue
    const out = new SkinnedMesh(g, material)
    out.name = 'skinned'
    out.bindMode = AttachedBindMode
    out.castShadow = proto.castShadow
    out.receiveShadow = proto.receiveShadow
    out.renderOrder = proto.renderOrder
    out.layers.mask = proto.layers.mask
    // (The robot is always in frame; the parts' own bounds still serve the layout, below.)
    out.frustumCulled = false
    domain.add(out)
    out.updateMatrixWorld(true)
    out.bind(s.skeleton!, new Matrix4())
    // Its bounds are its parts' wherever they are now (boundsOf: the layout, and what the dissolve puts away).
    SKINNED.set(out, meshes)
    created.push(g)
    for (const o of meshes) {
      // Undrawn, by a layer no camera sees (not by `visible`: a part's children, if it has any, still draw), and
      // with one shared stand-in material: three's compile() walks every mesh, drawn or not, and would build
      // each part's own program a second time (unskinned) for nothing.
      o.layers.set(BONE_LAYER)
      o.material = BONE_MATERIAL
      // (Marked: code that shows or hides meshes by their material must leave the bones alone.)
      o.userData.skinBone = true
    }
    parts += meshes.length
    if (!patched.has(material)) {
      patched.add(material)
      skinNormals(material)
    }
  }
  return { created, skeletons: [...skeletons.values()].map((s) => s.skeleton!), parts, meshes: created.length, why }
}

/**
 * The bones' matrices are their parts' world matrices (each bone's inverse is the identity); the bone texture is
 * uploaded only when one has moved (three re-uploads it on every render otherwise: the chair, the table and a
 * resting head never move).
 */
function stillSkeleton(skeleton: Skeleton) {
  skeleton.update = () => {
    const { bones, boneMatrices } = skeleton
    if (!boneMatrices) return
    let moved = false
    for (let i = 0; i < bones.length; i++) {
      const e = bones[i].matrixWorld.elements
      const o = i * 16
      for (let j = 0; j < 16; j++) {
        // (The texture holds 32-bit floats: compare what it would hold.)
        const v = Math.fround(e[j])
        if (boneMatrices[o + j] !== v) {
          boneMatrices[o + j] = v
          moved = true
        }
      }
    }
    if (moved && skeleton.boneTexture) skeleton.boneTexture.needsUpdate = true
  }
  return skeleton
}

/** The attributes a skinned part keeps: its position and normal, and its uv when the material samples a map. */
function skinAttributes(m: Material) {
  const maps = Object.entries(m).some(([k, v]) => k.endsWith('Map') && k !== 'envMap' && !!v)
  return maps ? ['position', 'normal', 'uv'] : ['position', 'normal']
}
function skinSignature(g: BufferGeometry, m: Material) {
  return skinAttributes(m)
    .map((n) => {
      const a = g.attributes[n] as { itemSize: number; normalized: boolean; array: ArrayLike<number> } | undefined
      return a ? `${n}:${a.itemSize}:${+a.normalized}:${a.array.constructor.name}` : `${n}:-`
    })
    .join(',')
}

/** A part's normal through its bone as three transforms an object's: by the inverse transpose (exact under any scale). */
const SKIN_NORMAL = ShaderChunk.skinnormal_vertex.replace(
  'objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;',
  'objectNormal = transpose( inverse( mat3( skinMatrix ) ) ) * objectNormal;',
)
function skinNormals(m: Material) {
  const own = m.onBeforeCompile.bind(m)
  const ownKey = m.customProgramCacheKey.bind(m)
  m.onBeforeCompile = (shader, r) => {
    own(shader, r)
    shader.vertexShader = shader.vertexShader.replace('#include <skinnormal_vertex>', SKIN_NORMAL)
  }
  m.customProgramCacheKey = () => `${ownKey()}|skinnormal`
}
