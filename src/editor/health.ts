import type { IndexedMesh, TriSoup } from '../geometry/stl-import'

export interface MeshHealth {
  triangles: number
  openEdges: number
  nonManifoldEdges: number
  degenerate: number
  volume: number
  closed: boolean
}

/**
 * Анализирует геометрию сетки (TriSoup или IndexedMesh) и возвращает отчёт о здоровье:
 * число треугольников, открытых и неманифолдных рёбер, вырожденных треугольников, знаковый объём и признак замкнутости.
 */
export function meshHealth(mesh: TriSoup | IndexedMesh): MeshHealth {
  let positions: Float32Array
  if ('positions' in mesh) {
    positions = mesh.positions
  } else {
    // Из IndexedMesh формируем координаты треугольников
    const { vertProperties, triVerts } = mesh
    positions = new Float32Array(triVerts.length * 3)
    for (let i = 0; i < triVerts.length; i++) {
      const vid = triVerts[i] * 3
      positions[i * 3] = vertProperties[vid]
      positions[i * 3 + 1] = vertProperties[vid + 1]
      positions[i * 3 + 2] = vertProperties[vid + 2]
    }
  }

  const numTriangles = Math.floor(positions.length / 9)
  if (numTriangles === 0) {
    return {
      triangles: 0,
      openEdges: 0,
      nonManifoldEdges: 0,
      degenerate: 0,
      volume: 0,
      closed: false,
    }
  }

  // Сварка вершин для точного поиска смежных рёбер
  let min = Infinity,
    max = -Infinity
  for (let i = 0; i < positions.length; i++) {
    const val = positions[i]
    if (val < min) min = val
    if (val > max) max = val
  }
  const tol = Math.max(max - min, 1) * 1e-6
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`

  const index = new Map<string, number>()
  const verts: number[] = []
  const vid = (x: number, y: number, z: number) => {
    const k = key(x, y, z)
    let id = index.get(k)
    if (id === undefined) {
      id = verts.length / 3
      index.set(k, id)
      verts.push(x, y, z)
    }
    return id
  }

  let degenerate = 0
  const validTris: [number, number, number][] = []

  for (let t = 0; t < numTriangles; t++) {
    const idx = t * 9
    const a = vid(positions[idx], positions[idx + 1], positions[idx + 2])
    const b = vid(positions[idx + 3], positions[idx + 4], positions[idx + 5])
    const c = vid(positions[idx + 6], positions[idx + 7], positions[idx + 8])

    if (a === b || b === c || a === c) {
      degenerate++
      continue
    }
    validTris.push([a, b, c])
  }

  // Подсчёт рёбер
  const edgeCounts = new Map<string, number>()
  const edgeKey = (u: number, v: number) => (u < v ? `${u}_${v}` : `${v}_${u}`)

  for (const [a, b, c] of validTris) {
    const e1 = edgeKey(a, b)
    const e2 = edgeKey(b, c)
    const e3 = edgeKey(c, a)

    edgeCounts.set(e1, (edgeCounts.get(e1) ?? 0) + 1)
    edgeCounts.set(e2, (edgeCounts.get(e2) ?? 0) + 1)
    edgeCounts.set(e3, (edgeCounts.get(e3) ?? 0) + 1)
  }

  let openEdges = 0
  let nonManifoldEdges = 0

  for (const count of edgeCounts.values()) {
    if (count === 1) {
      openEdges++
    } else if (count > 2) {
      nonManifoldEdges++
    }
  }

  // Знаковый объём
  let vol = 0
  for (const [a, b, c] of validTris) {
    const ax = verts[a * 3],
      ay = verts[a * 3 + 1],
      az = verts[a * 3 + 2]
    const bx = verts[b * 3],
      by = verts[b * 3 + 1],
      bz = verts[b * 3 + 2]
    const cx = verts[c * 3],
      cy = verts[c * 3 + 1],
      cz = verts[c * 3 + 2]

    vol +=
      (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) /
      6
  }

  const closed =
    validTris.length > 0 &&
    openEdges === 0 &&
    nonManifoldEdges === 0 &&
    degenerate === 0

  return {
    triangles: numTriangles,
    openEdges,
    nonManifoldEdges,
    degenerate,
    volume: Number(vol.toFixed(6)),
    closed,
  }
}

/**
 * Проверяет, является ли сетка замкнутым твёрдым телом с положительным объёмом.
 */
export function isSolid(meshOrHealth: MeshHealth | TriSoup | IndexedMesh): boolean {
  const health = 'openEdges' in meshOrHealth ? meshOrHealth : meshHealth(meshOrHealth)
  return (
    health.closed &&
    health.volume > 0 &&
    health.openEdges === 0 &&
    health.nonManifoldEdges === 0 &&
    health.degenerate === 0
  )
}
