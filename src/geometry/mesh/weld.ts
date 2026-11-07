import type { IndexedMesh, TriSoup } from '../stl-import'

export interface WeldReport {
  mergedVertices: number
  originalVertices: number
  finalVertices: number
}

/**
 * Welds vertices within tolerance using spatial hashing.
 * Returns a clean IndexedMesh.
 */
export function weld(
  mesh: TriSoup | IndexedMesh,
  tolerance?: number
): { mesh: IndexedMesh; report: WeldReport } {
  let positions: Float32Array
  let triVerts: Uint32Array | null = null

  if ('positions' in mesh) {
    positions = mesh.positions
  } else {
    positions = mesh.vertProperties instanceof Float32Array ? mesh.vertProperties : new Float32Array(mesh.vertProperties)
    triVerts = mesh.triVerts instanceof Uint32Array ? mesh.triVerts : new Uint32Array(mesh.triVerts)
  }

  const rawVertCount = triVerts ? positions.length / 3 : Math.floor(positions.length / 3)
  const numTris = triVerts ? triVerts.length / 3 : Math.floor(positions.length / 9)

  if (numTris === 0) {
    return {
      mesh: { vertProperties: new Float32Array(0), triVerts: new Uint32Array(0) },
      report: { mergedVertices: 0, originalVertices: 0, finalVertices: 0 },
    }
  }

  // Calculate bounding diagonal if tolerance is not provided
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }

  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
  const tol = tolerance ?? Math.max(diag * 1e-4, 1e-5)
  const invTol = 1 / tol

  const vertexMap = new Map<string, number>()
  const uniqueVerts: number[] = []

  function getOrAddVertex(x: number, y: number, z: number): number {
    const k = `${Math.round(x * invTol)},${Math.round(y * invTol)},${Math.round(z * invTol)}`
    let id = vertexMap.get(k)
    if (id === undefined) {
      id = uniqueVerts.length / 3
      vertexMap.set(k, id)
      uniqueVerts.push(x, y, z)
    }
    return id
  }

  const newTriVerts = new Uint32Array(numTris * 3)

  if (triVerts) {
    // Map existing unique indexed vertices
    const mapped = new Int32Array(positions.length / 3)
    for (let i = 0; i < mapped.length; i++) {
      mapped[i] = getOrAddVertex(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    }
    for (let i = 0; i < triVerts.length; i++) {
      newTriVerts[i] = mapped[triVerts[i]]
    }
  } else {
    for (let t = 0; t < numTris; t++) {
      const idx = t * 9
      newTriVerts[t * 3] = getOrAddVertex(positions[idx], positions[idx + 1], positions[idx + 2])
      newTriVerts[t * 3 + 1] = getOrAddVertex(positions[idx + 3], positions[idx + 4], positions[idx + 5])
      newTriVerts[t * 3 + 2] = getOrAddVertex(positions[idx + 6], positions[idx + 7], positions[idx + 8])
    }
  }

  const finalVertCount = uniqueVerts.length / 3
  const merged = Math.max(0, rawVertCount - finalVertCount)

  return {
    mesh: {
      vertProperties: new Float32Array(uniqueVerts),
      triVerts: newTriVerts,
    },
    report: {
      mergedVertices: merged,
      originalVertices: rawVertCount,
      finalVertices: finalVertCount,
    },
  }
}
