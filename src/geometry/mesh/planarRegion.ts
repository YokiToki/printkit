import type { IndexedMesh, TriSoup } from '../stl-import'

type Vec3 = [number, number, number]

export interface PlanarRegion {
  triangleIndices: number[]
  normal: Vec3
  planeD: number
  area: number
  vertices: number[] // flat [x, y, z, ...] of all vertices belonging to the region
}

export interface PlanarRegionOptions {
  /** Maximum angular deviation in degrees between face normals. Default 1.0 */
  angleToleranceDeg?: number
  /** Maximum distance of vertices from the seed plane in mm. Default 0.05 */
  distanceTolerance?: number
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len < 1e-9) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

/**
 * Finds a connected planar region on the mesh starting from seedTriIndex.
 * Traverses adjacent triangles across shared edges if their normal and distance
 * to the plane are within tolerance.
 */
export function planarRegion(
  mesh: TriSoup | IndexedMesh,
  seedTriIndex: number,
  options: PlanarRegionOptions = {}
): PlanarRegion {
  const angleTol = (options.angleToleranceDeg ?? 1.0) * (Math.PI / 180)
  const cosTol = Math.cos(angleTol)
  const distTol = options.distanceTolerance ?? 0.05

  // Normalize mesh representation
  let positions: Float32Array
  let triVerts: Uint32Array | null = null

  if ('positions' in mesh) {
    positions = mesh.positions
  } else {
    positions = mesh.vertProperties instanceof Float32Array ? mesh.vertProperties : new Float32Array(mesh.vertProperties)
    triVerts = mesh.triVerts instanceof Uint32Array ? mesh.triVerts : new Uint32Array(mesh.triVerts)
  }

  const numTris = triVerts ? triVerts.length / 3 : Math.floor(positions.length / 9)
  if (seedTriIndex < 0 || seedTriIndex >= numTris) {
    return { triangleIndices: [], normal: [0, 0, 1], planeD: 0, area: 0, vertices: [] }
  }

  function getTriVerts(t: number): [Vec3, Vec3, Vec3] {
    if (triVerts) {
      const i0 = triVerts[t * 3] * 3
      const i1 = triVerts[t * 3 + 1] * 3
      const i2 = triVerts[t * 3 + 2] * 3
      return [
        [positions[i0], positions[i0 + 1], positions[i0 + 2]],
        [positions[i1], positions[i1 + 1], positions[i1 + 2]],
        [positions[i2], positions[i2 + 1], positions[i2 + 2]],
      ]
    } else {
      const idx = t * 9
      return [
        [positions[idx], positions[idx + 1], positions[idx + 2]],
        [positions[idx + 3], positions[idx + 4], positions[idx + 5]],
        [positions[idx + 6], positions[idx + 7], positions[idx + 8]],
      ]
    }
  }

  // Precompute triangle normals, areas, and an edge adjacency map
  const normals: Vec3[] = new Array(numTris)
  const areas = new Float64Array(numTris)

  // Spatial hash to connect identical vertices into shared vertex IDs
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
  const tol = Math.max(diag * 1e-6, 1e-5)
  const invTol = 1 / tol

  const vertexMap = new Map<string, number>()
  function getVId(p: Vec3): number {
    const k = `${Math.round(p[0] * invTol)},${Math.round(p[1] * invTol)},${Math.round(p[2] * invTol)}`
    let id = vertexMap.get(k)
    if (id === undefined) {
      id = vertexMap.size
      vertexMap.set(k, id)
    }
    return id
  }

  // Map edges to triangles
  const edgeToTris = new Map<string, number[]>()
  const triToEdges: string[][] = new Array(numTris)

  for (let t = 0; t < numTris; t++) {
    const [v0, v1, v2] = getTriVerts(t)
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]] as Vec3
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]] as Vec3
    const n = cross(e1, e2)
    const len = Math.hypot(n[0], n[1], n[2])
    areas[t] = 0.5 * len
    normals[t] = len > 1e-9 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 0, 1]

    const i0 = getVId(v0), i1 = getVId(v1), i2 = getVId(v2)
    const eKeys = [
      i0 < i1 ? `${i0}_${i1}` : `${i1}_${i0}`,
      i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`,
      i2 < i0 ? `${i2}_${i0}` : `${i0}_${i2}`,
    ]
    triToEdges[t] = eKeys
    for (const ek of eKeys) {
      let list = edgeToTris.get(ek)
      if (!list) {
        list = []
        edgeToTris.set(ek, list)
      }
      list.push(t)
    }
  }

  // Seed plane
  const seedNormal = normals[seedTriIndex]
  const [s0] = getTriVerts(seedTriIndex)
  const seedD = -dot(seedNormal, s0)

  // BFS region growing
  const visited = new Uint8Array(numTris)
  const queue: number[] = [seedTriIndex]
  visited[seedTriIndex] = 1

  const regionTris: number[] = []
  let totalArea = 0
  const vertCoords: number[] = []
  const includedVertices = new Set<number>()

  while (queue.length > 0) {
    const curr = queue.shift()!
    regionTris.push(curr)
    totalArea += areas[curr]

    const [v0, v1, v2] = getTriVerts(curr)
    for (const v of [v0, v1, v2]) {
      const vid = getVId(v)
      if (!includedVertices.has(vid)) {
        includedVertices.add(vid)
        vertCoords.push(v[0], v[1], v[2])
      }
    }

    // Traverse adjacent triangles
    for (const ek of triToEdges[curr]) {
      const neighbors = edgeToTris.get(ek)
      if (!neighbors) continue
      for (const nbor of neighbors) {
        if (visited[nbor]) continue

        // Check normal alignment with seed normal
        const nborNormal = normals[nbor]
        const cosAngle = dot(seedNormal, nborNormal)
        if (cosAngle < cosTol) continue

        // Check distance of neighbor vertices to the seed plane
        const [u0, u1, u2] = getTriVerts(nbor)
        const d0 = Math.abs(dot(seedNormal, u0) + seedD)
        const d1 = Math.abs(dot(seedNormal, u1) + seedD)
        const d2 = Math.abs(dot(seedNormal, u2) + seedD)
        if (d0 > distTol || d1 > distTol || d2 > distTol) continue

        visited[nbor] = 1
        queue.push(nbor)
      }
    }
  }

  return {
    triangleIndices: regionTris,
    normal: seedNormal,
    planeD: seedD,
    area: Number(totalArea.toFixed(6)),
    vertices: vertCoords,
  }
}
