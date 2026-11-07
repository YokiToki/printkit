import { matrixOf, type EditorObject, type SceneDoc } from '../../editor/scene'
import { applyMatrix, type MeshData } from '../../geometry/mesh'
import type { PartMesh } from '../../geometry/model'

export interface EditorPartsOptions {
  selectionOnly?: boolean
  selection?: string[]
  includePins?: boolean
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

  // Find all objects used as tools in enabled boolean operations
  const toolObjectIds = new Set<string>()
  for (const o of doc.objects) {
    for (const op of o.stack ?? []) {
      if (op.enabled && op.kind === 'boolean') {
        const tools = (op as any).params?.tools
        if (Array.isArray(tools)) {
          for (const t of tools) {
            toolObjectIds.add(t)
          }
        }
      }
    }
  }

  const targetObjects = doc.objects.filter((obj) => {
    if (selectionOnly) {
      return selectedSet.has(obj.id)
    }
    // Export skips tool objects unless explicitly selected
    if (toolObjectIds.has(obj.id)) {
      return false
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

  // Include loose pins as separate exportable parts
  if (options?.includePins !== false && doc.cuts) {
    for (const group of doc.cuts) {
      if (group.includePins === false) continue
      const prefix1 = `${group.id}:pin:`
      const prefix2 = `${group.name ?? 'Part'} Pin `

      const entries: [string, MeshData][] =
        meshes instanceof Map
          ? Array.from(meshes.entries())
          : Object.entries(meshes)

      for (const [key, mesh] of entries) {
        if (key.startsWith(prefix1) || key.startsWith(prefix2)) {
          let label = key.startsWith(prefix1)
            ? `${group.name ?? 'Part'} Pin ${Number(key.slice(prefix1.length)) + 1}`
            : key
          let counter = 2
          while (usedLabels.has(label)) {
            label = `${label} ${counter}`
            counter++
          }
          usedLabels.add(label)
          parts.push({
            label,
            col: 0,
            row: 0,
            oversize: false,
            mesh,
          })
        }
      }
    }
  }

  return parts
}
