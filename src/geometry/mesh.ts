import type { Manifold, Mat4 } from 'manifold-3d'

export type { Mat4 }

export interface Bounds3 {
  min: [number, number, number]
  max: [number, number, number]
}

/** Сетка модели в виде, который можно передать между потоками. Все длины в мм. */
export interface MeshData {
  vertProperties: Float32Array
  triVerts: Uint32Array
  numProp: number
  min: [number, number, number]
  max: [number, number, number]
  volume: number
}

export function meshOf(m: Manifold): MeshData {
  const mesh = m.getMesh()
  const bb = m.boundingBox()
  return {
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
    numProp: mesh.numProp,
    min: [bb.min[0], bb.min[1], bb.min[2]],
    max: [bb.max[0], bb.max[1], bb.max[2]],
    volume: m.volume(),
  }
}

export const transferables = (m: MeshData): ArrayBuffer[] => [m.vertProperties.buffer as ArrayBuffer, m.triVerts.buffer as ArrayBuffer]

export const transferablesOf = (ms: MeshData[]): ArrayBuffer[] => ms.flatMap(transferables)

export function meshBounds(meshOrVerts: MeshData | Float32Array, numProp = 3): Bounds3 {
  const verts = 'vertProperties' in meshOrVerts ? meshOrVerts.vertProperties : meshOrVerts
  const stride = 'numProp' in meshOrVerts ? meshOrVerts.numProp : numProp
  if (verts.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] }
  }
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (let i = 0; i < verts.length; i += stride) {
    const x = verts[i]
    const y = verts[i + 1]
    const z = verts[i + 2]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  }
}

export function matrixDeterminant3x3(m: Mat4): number {
  return (
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5])
  )
}

/**
 * Применяет матрицу 4x4 к сетке MeshData: трансформирует координаты вершин,
 * обновляет габариты, инвертирует обход треугольников при отрицательном детерминанте (отражение)
 * и масштабирует объём.
 */
export function applyMatrix(mesh: MeshData, m: Mat4): MeshData {
  const { vertProperties, triVerts, numProp } = mesh
  const count = vertProperties.length
  const newVerts = new Float32Array(count)

  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity

  for (let i = 0; i < count; i += numProp) {
    const x = vertProperties[i]
    const y = vertProperties[i + 1]
    const z = vertProperties[i + 2]

    const tx = m[0] * x + m[4] * y + m[8] * z + m[12]
    const ty = m[1] * x + m[5] * y + m[9] * z + m[13]
    const tz = m[2] * x + m[6] * y + m[10] * z + m[14]

    newVerts[i] = tx
    newVerts[i + 1] = ty
    newVerts[i + 2] = tz

    // Копируем дополнительные свойства (нормали, цвета и т.д.), если есть
    for (let p = 3; p < numProp; p++) {
      newVerts[i + p] = vertProperties[i + p]
    }

    if (tx < minX) minX = tx
    if (tx > maxX) maxX = tx
    if (ty < minY) minY = ty
    if (ty > maxY) maxY = ty
    if (tz < minZ) minZ = tz
    if (tz > maxZ) maxZ = tz
  }

  const det = matrixDeterminant3x3(m)
  const newTriVerts = new Uint32Array(triVerts.length)
  newTriVerts.set(triVerts)

  if (det < 0) {
    for (let t = 0; t < newTriVerts.length; t += 3) {
      const tmp = newTriVerts[t + 1]
      newTriVerts[t + 1] = newTriVerts[t + 2]
      newTriVerts[t + 2] = tmp
    }
  }

  const volume = Math.abs(mesh.volume * Math.abs(det))

  return {
    vertProperties: newVerts,
    triVerts: newTriVerts,
    numProp,
    min: count > 0 ? [minX, minY, minZ] : [0, 0, 0],
    max: count > 0 ? [maxX, maxY, maxZ] : [0, 0, 0],
    volume,
  }
}
