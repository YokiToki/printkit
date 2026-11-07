import type { IndexedMesh, TriSoup } from '../stl-import'
import { weld } from './weld'

export interface RemoveDegenerateReport {
  removedDegenerate: number
  removedDuplicates: number
  initialTriangles: number
  finalTriangles: number
}

/**
 * Removes degenerate and duplicate triangles from a mesh, then prunes unreferenced vertices.
 */
export function removeDegenerate(
  mesh: TriSoup | IndexedMesh
): { mesh: IndexedMesh; report: RemoveDegenerateReport } {
  // Ensure mesh is welded first to detect zero-area/identical vertex triangles accurately
  const welded = 'triVerts' in mesh ? mesh : weld(mesh).mesh
  const { vertProperties, triVerts } = welded
  const numTris = triVerts.length / 3

  const validTriangles: [number, number, number][] = []
  const seenTriangles = new Set<string>()

  let removedDegenerate = 0
  let removedDuplicates = 0

  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3]
    const i1 = triVerts[t * 3 + 1]
    const i2 = triVerts[t * 3 + 2]

    // Degenerate index check
    if (i0 === i1 || i1 === i2 || i0 === i2) {
      removedDegenerate++
      continue
    }

    // Degenerate area check
    const ax = vertProperties[i0 * 3], ay = vertProperties[i0 * 3 + 1], az = vertProperties[i0 * 3 + 2]
    const bx = vertProperties[i1 * 3], by = vertProperties[i1 * 3 + 1], bz = vertProperties[i1 * 3 + 2]
    const cx = vertProperties[i2 * 3], cy = vertProperties[i2 * 3 + 1], cz = vertProperties[i2 * 3 + 2]

    const abx = bx - ax, aby = by - ay, abz = bz - az
    const acx = cx - ax, acy = cy - ay, acz = cz - az
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    const area = 0.5 * Math.hypot(nx, ny, nz)

    if (area < 1e-12) {
      removedDegenerate++
      continue
    }

    // Duplicate check
    const sorted = [i0, i1, i2].sort((a, b) => a - b)
    const key = `${sorted[0]}_${sorted[1]}_${sorted[2]}`
    if (seenTriangles.has(key)) {
      removedDuplicates++
      continue
    }
    seenTriangles.add(key)

    validTriangles.push([i0, i1, i2])
  }

  // Prune unused vertices and remap indices
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

  const newTriVerts = new Uint32Array(validTriangles.length * 3)
  for (let t = 0; t < validTriangles.length; t++) {
    const [a, b, c] = validTriangles[t]
    newTriVerts[t * 3] = getNewIndex(a)
    newTriVerts[t * 3 + 1] = getNewIndex(b)
    newTriVerts[t * 3 + 2] = getNewIndex(c)
  }

  return {
    mesh: {
      vertProperties: new Float32Array(newVertProps),
      triVerts: newTriVerts,
    },
    report: {
      removedDegenerate,
      removedDuplicates,
      initialTriangles: numTris,
      finalTriangles: validTriangles.length,
    },
  }
}
