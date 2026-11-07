import type { IndexedMesh, TriSoup } from '../stl-import'
import { weld } from './weld'

export interface OrientReport {
  flippedTriangles: number
  invertedShells: number
  nonManifoldEdgesBroken: number
}

/**
 * Fixes triangle orientations across manifold edges to ensure consistent outward winding.
 * Flipped shells with negative volume are inverted.
 */
export function fixOrientation(
  mesh: TriSoup | IndexedMesh
): { mesh: IndexedMesh; report: OrientReport } {
  const welded = 'triVerts' in mesh ? mesh : weld(mesh).mesh
  const { vertProperties, triVerts } = welded
  const numTris = triVerts.length / 3

  if (numTris === 0) {
    return {
      mesh: { vertProperties: new Float32Array(0), triVerts: new Uint32Array(0) },
      report: { flippedTriangles: 0, invertedShells: 0, nonManifoldEdgesBroken: 0 },
    }
  }

  // Work with mutable triangles: [v0, v1, v2]
  const triangles: [number, number, number][] = new Array(numTris)
  for (let t = 0; t < numTris; t++) {
    triangles[t] = [triVerts[t * 3], triVerts[t * 3 + 1], triVerts[t * 3 + 2]]
  }

  // Build edge-to-triangle map
  interface DirectedEdge {
    tri: number
    from: number
    to: number
  }

  const edgeMap = new Map<string, DirectedEdge[]>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let t = 0; t < numTris; t++) {
    const [a, b, c] = triangles[t]
    const edges: [number, number][] = [[a, b], [b, c], [c, a]]
    for (const [from, to] of edges) {
      const k = edgeKey(from, to)
      let list = edgeMap.get(k)
      if (!list) {
        list = []
        edgeMap.set(k, list)
      }
      list.push({ tri: t, from, to })
    }
  }

  let nonManifoldEdgesBroken = 0
  for (const list of edgeMap.values()) {
    if (list.length > 2) nonManifoldEdgesBroken++
  }

  // Build adjacency graph for 2-manifold edges
  const adj = new Map<number, { neighborTri: number; edgeKey: string }[]>()
  for (const [k, list] of edgeMap.entries()) {
    if (list.length === 2) {
      const t0 = list[0].tri
      const t1 = list[1].tri
      let a0 = adj.get(t0)
      if (!a0) { a0 = []; adj.set(t0, a0) }
      a0.push({ neighborTri: t1, edgeKey: k })

      let a1 = adj.get(t1)
      if (!a1) { a1 = []; adj.set(t1, a1) }
      a1.push({ neighborTri: t0, edgeKey: k })
    }
  }

  // BFS across connected components to propagate consistent winding
  const visited = new Uint8Array(numTris)
  let flippedTriangles = 0
  const shells: number[][] = []

  for (let t = 0; t < numTris; t++) {
    if (visited[t]) continue

    const shell: number[] = []
    const queue: number[] = [t]
    visited[t] = 1

    while (queue.length > 0) {
      const curr = queue.shift()!
      shell.push(curr)

      const [ca, cb, cc] = triangles[curr]
      const currEdges: [number, number][] = [[ca, cb], [cb, cc], [cc, ca]]

      const neighbors = adj.get(curr)
      if (!neighbors) continue

      for (const { neighborTri, edgeKey: ek } of neighbors) {
        if (visited[neighborTri]) continue

        // Shared edge between curr and neighborTri
        const [uStr, vStr] = ek.split('_')
        const u = Number(uStr), v = Number(vStr)

        // Determine current direction of edge (u, v) in curr
        const currTraversesUtoV =
          (ca === u && cb === v) ||
          (cb === u && cc === v) ||
          (cc === u && ca === v)

        // Determine current direction of edge in neighborTri
        const [na, nb, nc] = triangles[neighborTri]
        const neighborTraversesUtoV =
          (na === u && nb === v) ||
          (nb === u && nc === v) ||
          (nc === u && na === v)

        // For consistent manifold winding, one triangle must traverse u -> v,
        // and the other must traverse v -> u.
        // If both traverse in the same direction, neighbor must be flipped!
        if (currTraversesUtoV === neighborTraversesUtoV) {
          triangles[neighborTri] = [na, nc, nb]
          flippedTriangles++
        }

        visited[neighborTri] = 1
        queue.push(neighborTri)
      }
    }

    shells.push(shell)
  }

  // Calculate volume of each shell and flip if negative
  let invertedShells = 0

  for (const shell of shells) {
    let vol = 0
    for (const t of shell) {
      const [i0, i1, i2] = triangles[t]
      const ax = vertProperties[i0 * 3], ay = vertProperties[i0 * 3 + 1], az = vertProperties[i0 * 3 + 2]
      const bx = vertProperties[i1 * 3], by = vertProperties[i1 * 3 + 1], bz = vertProperties[i1 * 3 + 2]
      const cx = vertProperties[i2 * 3], cy = vertProperties[i2 * 3 + 1], cz = vertProperties[i2 * 3 + 2]
      vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    }

    if (vol < -1e-6) {
      // Entire shell has inward normals -> flip all triangles in shell
      invertedShells++
      for (const t of shell) {
        const [a, b, c] = triangles[t]
        triangles[t] = [a, c, b]
        flippedTriangles++
      }
    }
  }

  // Pack final triVerts
  const newTriVerts = new Uint32Array(numTris * 3)
  for (let t = 0; t < numTris; t++) {
    newTriVerts[t * 3] = triangles[t][0]
    newTriVerts[t * 3 + 1] = triangles[t][1]
    newTriVerts[t * 3 + 2] = triangles[t][2]
  }

  return {
    mesh: {
      vertProperties,
      triVerts: newTriVerts,
    },
    report: {
      flippedTriangles,
      invertedShells,
      nonManifoldEdgesBroken,
    },
  }
}
