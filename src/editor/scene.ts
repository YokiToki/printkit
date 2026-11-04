import type { Mat4 } from 'manifold-3d'

export type { Mat4 }

export interface Transform {
  position: [number, number, number]
  rotation: [number, number, number] // degrees, intrinsic XYZ
  scale: [number, number, number]
}

export const DEFAULT_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
}

export type MeshSource = {
  kind: 'mesh'
  meshId: string
  unit: 'mm' | 'in'
}

export type PrimitiveShape = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus' | 'wedge'

export type PrimitiveSource = {
  kind: 'primitive'
  shape: PrimitiveShape
  params: Record<string, number>
}

export type ObjectSource = MeshSource | PrimitiveSource

export interface EditorObject {
  id: string
  name: string
  visible: boolean
  locked: boolean
  color: number
  source: ObjectSource
  transform: Transform
}

export interface SceneDoc {
  schema: 1
  objects: EditorObject[]
}

export const createEmptyScene = (): SceneDoc => ({
  schema: 1,
  objects: [],
})

/**
 * Вычисляет матрицу 4x4 (column-major Mat4, как у three.js и Manifold) из Transform: T * R * S,
 * где R = Rx * Ry * Rz (intrinsic XYZ Euler в градусах).
 */
export function matrixOf(t: Transform): Mat4 {
  const radX = (t.rotation[0] * Math.PI) / 180
  const radY = (t.rotation[1] * Math.PI) / 180
  const radZ = (t.rotation[2] * Math.PI) / 180

  const c1 = Math.cos(radX)
  const s1 = Math.sin(radX)
  const c2 = Math.cos(radY)
  const s2 = Math.sin(radY)
  const c3 = Math.cos(radZ)
  const s3 = Math.sin(radZ)

  const [sx, sy, sz] = t.scale
  const [tx, ty, tz] = t.position

  const z0 = (v: number) => (v === 0 ? 0 : v)

  return [
    z0(c2 * c3 * sx),
    z0((c1 * s3 + s1 * s2 * c3) * sx),
    z0((s1 * s3 - c1 * s2 * c3) * sx),
    0,

    z0(-c2 * s3 * sy),
    z0((c1 * c3 - s1 * s2 * s3) * sy),
    z0((s1 * c3 + c1 * s2 * s3) * sy),
    0,

    z0(s2 * sz),
    z0(-s1 * c2 * sz),
    z0(c1 * c2 * sz),
    0,

    tx,
    ty,
    tz,
    1,
  ]
}

/**
 * Подбирает уникальное имя вида "Box", "Box 2", "Box 3".
 */
export function newName(base: string, existingNames: Iterable<string>): string {
  const set = new Set(existingNames)
  if (!set.has(base)) return base

  // Если имя уже заканчивается на " N", отсекаем его для генерации следующего номера
  const match = base.match(/^(.*?)(?: (\d+))?$/)
  const root = match ? match[1] : base
  let counter = 2
  while (set.has(`${root} ${counter}`)) {
    counter++
  }
  return `${root} ${counter}`
}

export function addObject(doc: SceneDoc, object: EditorObject): SceneDoc {
  return {
    ...doc,
    objects: [...doc.objects, object],
  }
}

export function removeObjects(doc: SceneDoc, ids: Iterable<string>): SceneDoc {
  const toRemove = new Set(ids)
  return {
    ...doc,
    objects: doc.objects.filter((obj) => !toRemove.has(obj.id)),
  }
}

export function updateObject(doc: SceneDoc, id: string, patch: Partial<EditorObject>): SceneDoc {
  return {
    ...doc,
    objects: doc.objects.map((obj) => (obj.id === id ? { ...obj, ...patch } : obj)),
  }
}

export function duplicateObject(
  doc: SceneDoc,
  id: string,
  newId: string = crypto.randomUUID()
): { doc: SceneDoc; duplicate: EditorObject } | null {
  const original = doc.objects.find((obj) => obj.id === id)
  if (!original) return null

  const existingNames = doc.objects.map((o) => o.name)
  const name = newName(original.name, existingNames)

  const duplicate: EditorObject = {
    ...original,
    id: newId,
    name,
    transform: {
      position: [original.transform.position[0] + 10, original.transform.position[1], original.transform.position[2]],
      rotation: [...original.transform.rotation],
      scale: [...original.transform.scale],
    },
    // Primitive source params are deep-copied
    source:
      original.source.kind === 'primitive'
        ? {
            kind: 'primitive',
            shape: original.source.shape,
            params: { ...original.source.params },
          }
        : { ...original.source },
  }

  return {
    doc: addObject(doc, duplicate),
    duplicate,
  }
}

export function reorderObjects(doc: SceneDoc, fromIndex: number, toIndex: number): SceneDoc {
  if (fromIndex < 0 || fromIndex >= doc.objects.length || toIndex < 0 || toIndex >= doc.objects.length) {
    return doc
  }
  if (fromIndex === toIndex) return doc

  const next = [...doc.objects]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)

  return {
    ...doc,
    objects: next,
  }
}
