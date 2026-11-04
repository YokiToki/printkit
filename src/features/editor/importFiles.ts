import { log } from '../../app/activityLog'
import { newName, type EditorObject, type MeshSource } from '../../editor/scene'
import { meshBounds } from '../../geometry/mesh'
import { getModelClient } from '../../app/useModel'
import { parseStl, StlError, type IndexedMesh, type TriSoup } from '../../geometry/stl-import'
import type { MeshStore } from '../cutout/meshStore'

export interface ImportOptions {
  unit: 'mm' | 'in'
  store: MeshStore
  registerMesh?: (id: string, mesh: IndexedMesh) => void
  existingNames?: string[]
}

export interface SizeNotice {
  fileName: string
  kind: 'tooSmall' | 'tooLarge'
  size: number
}

export interface ImportError {
  fileName: string
  error: Error
}

export interface ImportResult {
  objects: EditorObject[]
  notices: SizeNotice[]
  errors: ImportError[]
}

/**
 * Быстрый детерминированный 64-битный хеш полигональной сетки в шестнадцатеричную строку.
 */
export function hashMesh(mesh: IndexedMesh): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c64e6d
  const v = new Uint8Array(
    mesh.vertProperties.buffer,
    mesh.vertProperties.byteOffset,
    mesh.vertProperties.byteLength
  )
  const t = new Uint8Array(
    mesh.triVerts.buffer,
    mesh.triVerts.byteOffset,
    mesh.triVerts.byteLength
  )
  for (let i = 0; i < v.length; i++) {
    h1 = Math.imul(h1 ^ v[i], 2654435761)
    h2 = Math.imul(h2 ^ v[i], 1597334677)
  }
  for (let i = 0; i < t.length; i++) {
    h1 = Math.imul(h1 ^ t[i], 2654435761)
    h2 = Math.imul(h2 ^ t[i], 1597334677)
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/**
 * Только сварка совпадающих вершин с центрированием по XY и установкой на z = 0 (без изменения ориентации).
 */
export function weldMesh(soup: TriSoup, unit: 'mm' | 'in' = 'mm'): IndexedMesh {
  const s = unit === 'in' ? 25.4 : 1
  const p = soup.positions

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < p.length; i++) {
    const val = p[i] * s
    if (val < min) min = val
    if (val > max) max = val
  }

  const tol = Math.max(max - min, 1) * 1e-6
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`

  const index = new Map<string, number>()
  const verts: number[] = []
  const tris: number[] = []

  const vid = (x: number, y: number, z: number) => {
    const k = key(x, y, z)
    let i = index.get(k)
    if (i === undefined) {
      i = verts.length / 3
      index.set(k, i)
      verts.push(x, y, z)
    }
    return i
  }

  for (let t = 0; t < p.length / 9; t++) {
    const a = vid(p[t * 9] * s, p[t * 9 + 1] * s, p[t * 9 + 2] * s)
    const b = vid(p[t * 9 + 3] * s, p[t * 9 + 4] * s, p[t * 9 + 5] * s)
    const c = vid(p[t * 9 + 6] * s, p[t * 9 + 7] * s, p[t * 9 + 8] * s)
    if (a === b || b === c || a === c) continue
    tris.push(a, b, c)
  }

  if (tris.length === 0) {
    throw new StlError('empty', 'The mesh has no valid triangles after welding')
  }

  // Центрирование по XY и опускание на стол z = 0
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity
  let maxX = -Infinity,
    maxY = -Infinity
  for (let i = 0; i < verts.length; i += 3) {
    minX = Math.min(minX, verts[i])
    maxX = Math.max(maxX, verts[i])
    minY = Math.min(minY, verts[i + 1])
    maxY = Math.max(maxY, verts[i + 1])
    minZ = Math.min(minZ, verts[i + 2])
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const outVerts = new Float32Array(verts.length)
  for (let i = 0; i < verts.length; i += 3) {
    outVerts[i] = verts[i] - cx
    outVerts[i + 1] = verts[i + 1] - cy
    outVerts[i + 2] = verts[i + 2] - minZ
  }

  return {
    vertProperties: outVerts,
    triVerts: Uint32Array.from(tris),
  }
}

/**
 * Конвейер импорта нескольких файлов STL: разбор, сварка, сохранение в meshStore,
 * регистрация в воркере и расстановка вдоль оси X с зазором 10 мм.
 */
export async function importFiles(
  files: { name: string; buffer: ArrayBuffer }[],
  options: ImportOptions
): Promise<ImportResult> {
  const objects: EditorObject[] = []
  const notices: SizeNotice[] = []
  const errors: ImportError[] = []

  const reg = options.registerMesh ?? ((id, m) => getModelClient().registerMesh(id, m))
  const names = new Set(options.existingNames ?? [])

  let currentRightEdge: number | null = null

  for (const file of files) {
    try {
      const soup = parseStl(file.buffer)
      const mesh = weldMesh(soup, options.unit)
      const meshId = hashMesh(mesh)

      await options.store.save(meshId, mesh)
      reg(meshId, mesh)

      const b = meshBounds(mesh.vertProperties)
      const width = b.max[0] - b.min[0]
      const depth = b.max[1] - b.min[1]
      const height = b.max[2] - b.min[2]
      const longest = Math.max(width, depth, height)

      // Размерные предупреждения
      if (longest < 1) {
        notices.push({ fileName: file.name, kind: 'tooSmall', size: longest })
      } else if (longest > 1000) {
        notices.push({ fileName: file.name, kind: 'tooLarge', size: longest })
      }

      // Расстановка по X: первый объект центрирован в 0, следующие — с зазором 10 мм
      let posX = 0
      if (currentRightEdge === null) {
        posX = 0
        currentRightEdge = width / 2
      } else {
        posX = currentRightEdge + 10 + width / 2
        currentRightEdge = posX + width / 2
      }

      const baseName = file.name.replace(/\.stl$/i, '')
      const uniqueName = newName(baseName, names)
      names.add(uniqueName)

      const source: MeshSource = {
        kind: 'mesh',
        meshId,
        unit: options.unit,
      }

      const obj: EditorObject = {
        id: crypto.randomUUID(),
        name: uniqueName,
        visible: true,
        locked: false,
        color: 0,
        source,
        transform: {
          position: [posX, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      }

      objects.push(obj)

      log.info('storage', 'log.editor.imported', {
        name: file.name,
        size: `${Math.round(width)}×${Math.round(depth)}×${Math.round(height)} mm`,
      })
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      errors.push({ fileName: file.name, error: err })
      log.error('storage', 'log.editor.importFailed', {
        name: file.name,
        error: err.message,
      })
    }
  }

  return { objects, notices, errors }
}
