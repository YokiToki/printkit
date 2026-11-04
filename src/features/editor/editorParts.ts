import { matrixOf, type EditorObject, type SceneDoc } from '../../editor/scene'
import { applyMatrix, type MeshData } from '../../geometry/mesh'
import type { PartMesh } from '../../geometry/model'

export interface EditorPartsOptions {
  selectionOnly?: boolean
  selection?: string[]
}

/**
 * Преобразует объекты документа в массив PartMesh для экспорта,
 * применяя матрицы трансформации к вершинам и гарантируя уникальность меток.
 */
export function editorParts(
  doc: SceneDoc,
  meshes: Map<string, MeshData> | Record<string, MeshData>,
  options?: EditorPartsOptions,
): PartMesh[] {
  const selectionOnly = !!options?.selectionOnly
  const selectedSet = new Set(options?.selection ?? [])

  const targetObjects = doc.objects.filter((obj) => {
    if (selectionOnly) {
      return selectedSet.has(obj.id)
    }
    return obj.visible !== false
  })

  const getMesh = (obj: EditorObject): MeshData | undefined => {
    if (meshes instanceof Map) {
      return meshes.get(obj.id) ?? (obj.source.kind === 'mesh' ? meshes.get(obj.source.meshId) : undefined)
    }
    return meshes[obj.id] ?? (obj.source.kind === 'mesh' ? meshes[obj.source.meshId] : undefined)
  }

  const parts: PartMesh[] = []
  const usedLabels = new Set<string>()

  for (const obj of targetObjects) {
    const rawMesh = getMesh(obj)
    if (!rawMesh) continue

    const m = matrixOf(obj.transform)
    const transformed = applyMatrix(rawMesh, m)

    const baseName = obj.name.trim() || 'Object'
    let label = baseName
    let counter = 2
    while (usedLabels.has(label)) {
      label = `${baseName} ${counter}`
      counter++
    }
    usedLabels.add(label)

    parts.push({
      label,
      col: 0,
      row: 0,
      oversize: false,
      mesh: transformed,
    })
  }

  return parts
}
