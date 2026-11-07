import type { IndexedMesh, TriSoup } from '../stl-import'
import { weld } from './weld'

export interface RemoveShellsOptions {
  /** Remove shells with at most this many triangles */
  maxTriangles?: number
  /** Remove shells with absolute volume at most this value in mm³ */
  maxVolume?: number
  /** Keep only the single largest shell (by volume, or by triangle count if zero volume) */
  keepLargest?: boolean
}

export interface RemoveShellsReport {
  removedShells: number
  keptShells: number
  initialShells: number
}

/**
 * Removes small or disconnected shells based on triangle count, volume, or keeps only the largest.
 */
export function removeShells(
  mesh: TriSoup | IndexedMesh,
  options: RemoveShellsOptions = {}
): { mesh: IndexedMesh; report: RemoveShellsReport } {
  const welded = 'triVerts' in mesh ? mesh : weld(mesh).mesh
  const { vertProperties, triVerts } = welded
  const numTris = triVerts.length / 3

  if (numTris === 0) {
    return {
      mesh: { vertProperties: new Float32Array(0), triVerts: new Uint32Array(0) },
      report: { removedShells: 0, keptShells: 0, initialShells: 0 },
    }
  }

  // Edge map to find connected components
  const edgeToTris = new Map<string, number[]>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3], i1 = triVerts[t * 3 + 1], i2 = triVerts[t * 3 + 2]
    const edges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]]
    for (const [from, to] of edges) {
      const k = edgeKey(from, to)
      let list = edgeToTris.get(k)
      if (!list) {
        list = []
        edgeToTris.set(k, list)
      }
      list.push(t)
    }
  }

  // Union-Find on triangles
  const parent = new Int32Array(numTris)
  for (let i = 0; i < numTris; i++) parent[i] = i

  function find(i: number): number {
    let root = i
    while (root !== parent[root]) root = parent[root]
    let curr = i
    while (curr !== root) {
      const next = parent[curr]
      parent[curr] = root
      curr = next
    }
    return root
  }

  function union(i: number, j: number) {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[rj] = ri
  }

  for (const list of edgeToTris.values()) {
    if (list.length >= 2) {
      for (let i = 1; i < list.length; i++) {
        union(list[0], list[i])
      }
    }
  }

  // Group into shells
  const shellMap = new Map<number, { tris: number[]; volume: number }>()

  for (let t = 0; t < numTris; t++) {
    const root = find(t)
    let s = shellMap.get(root)
    if (!s) {
      s = { tris: [], volume: 0 }
      shellMap.set(root, s)
    }
    s.tris.push(t)

    const i0 = triVerts[t * 3], i1 = triVerts[t * 3 + 1], i2 = triVerts[t * 3 + 2]
    const ax = vertProperties[i0 * 3], ay = vertProperties[i0 * 3 + 1], az = vertProperties[i0 * 3 + 2]
    const bx = vertProperties[i1 * 3], by = vertProperties[i1 * 3 + 1], bz = vertProperties[i1 * 3 + 2]
    const cx = vertProperties[i2 * 3], cy = vertProperties[i2 * 3 + 1], cz = vertProperties[i2 * 3 + 2]
    s.volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }

  const allShells = Array.from(shellMap.values())
  const initialShells = allShells.length

  let keptTris: number[] = []
  let keptShells = 0
  let removedShells = 0

  if (options.keepLargest) {
    // Pick shell with largest abs(volume) or largest tri count
    let bestShell = allShells[0]
    let bestScore = Math.abs(bestShell.volume) > 1e-6 ? Math.abs(bestShell.volume) : bestShell.tris.length

    for (let i = 1; i < allShells.length; i++) {
      const s = allShells[i]
      const score = Math.abs(s.volume) > 1e-6 ? Math.abs(s.volume) : s.tris.length
      if (score > bestScore) {
        bestScore = score
        bestShell = s
      }
    }

    keptTris = bestShell.tris
    keptShells = 1
    removedShells = initialShells - 1
  } else {
    const maxTri = options.maxTriangles ?? 0
    const maxVol = options.maxVolume ?? 0

    for (const s of allShells) {
      const shouldRemove =
        (maxTri > 0 && s.tris.length <= maxTri) ||
        (maxVol > 0 && Math.abs(s.volume) <= maxVol)

      if (shouldRemove) {
        removedShells++
      } else {
        keptShells++
        keptTris.push(...s.tris)
      }
    }
  }

  // Prune unused vertices
  const usedVerts = new Int32Array(vertProperties.length / 3).fill(-1)
  const newVertProps: number[] = []

  function getNewIndex(oldIdx: number): number {
    let nid = usedVerts[oldIdx]
    if (nid === -1) {
      nid = newVertProps.length / 3
      usedVerts[oldIdx] = nid
      newVertProps.push(
        vertProperties[oldIdx * 3],
        vertProperties[oldIdx * 3 + 1],
        vertProperties[oldIdx * 3 + 2]
      )
    }
    return nid
  }

  const newTriVerts = new Uint32Array(keptTris.length * 3)
  for (let t = 0; t < keptTris.length; t++) {
    const origTri = keptTris[t]
    newTriVerts[t * 3] = getNewIndex(triVerts[origTri * 3])
    newTriVerts[t * 3 + 1] = getNewIndex(triVerts[origTri * 3 + 1])
    newTriVerts[t * 3 + 2] = getNewIndex(triVerts[origTri * 3 + 2])
  }

  return {
    mesh: {
      vertProperties: new Float32Array(newVertProps),
      triVerts: newTriVerts,
    },
    report: {
      removedShells,
      keptShells,
      initialShells,
    },
  }
}
