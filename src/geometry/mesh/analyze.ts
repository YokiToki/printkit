import type { IndexedMesh, TriSoup } from '../stl-import'

export interface BoundaryLoop {
  /** Ordered list of edge vertices [x, y, z] */
  points: [number, number, number][]
  perimeter: number
  /** Indices into unique vertices */
  vertexIndices: number[]
}

export interface ShellInfo {
  id: number
  triangleCount: number
  volume: number
  isClosed: boolean
}

export interface MeshAnalysis {
  triangles: number
  vertices: number
  duplicateVertices: number
  openEdges: number
  boundaryLoops: BoundaryLoop[]
  nonManifoldEdges: number
  nonManifoldVertices: number
  degenerateTriangles: number
  duplicateTriangles: number
  inconsistentTriangles: number
  isNegativeVolume: boolean
  shells: ShellInfo[]
  surfaceArea: number
  volume: number
  isSolid: boolean

  // Highlighting data
  openEdgeLines: Float32Array
  nonManifoldEdgeLines: Float32Array
  degenerateTriIndices: number[]
  duplicateTriIndices: number[]
  flippedTriIndices: number[]
}

export interface AnalyzeOptions {
  tolerance?: number
}

/**
 * Detailed diagnosis of a mesh.
 * Builds an edge map, finds open edges and boundary loops, non-manifold edges/vertices,
 * degenerate/duplicate triangles, consistent winding, shells, area and volume.
 */
export function analyze(mesh: TriSoup | IndexedMesh, options: AnalyzeOptions = {}): MeshAnalysis {
  // Extract positions
  let rawPositions: Float32Array
  let rawTriVerts: Uint32Array | null = null

  if ('positions' in mesh) {
    rawPositions = mesh.positions
  } else {
    // IndexedMesh
    const { vertProperties, triVerts } = mesh
    rawPositions = vertProperties instanceof Float32Array ? vertProperties : new Float32Array(vertProperties)
    rawTriVerts = triVerts instanceof Uint32Array ? triVerts : new Uint32Array(triVerts)
  }

  const numTris = rawTriVerts ? rawTriVerts.length / 3 : Math.floor(rawPositions.length / 9)

  if (numTris === 0) {
    return {
      triangles: 0,
      vertices: 0,
      duplicateVertices: 0,
      openEdges: 0,
      boundaryLoops: [],
      nonManifoldEdges: 0,
      nonManifoldVertices: 0,
      degenerateTriangles: 0,
      duplicateTriangles: 0,
      inconsistentTriangles: 0,
      isNegativeVolume: false,
      shells: [],
      surfaceArea: 0,
      volume: 0,
      isSolid: false,
      openEdgeLines: new Float32Array(0),
      nonManifoldEdgeLines: new Float32Array(0),
      degenerateTriIndices: [],
      duplicateTriIndices: [],
      flippedTriIndices: [],
    }
  }

  // Determine bounding box for spatial hash tolerance
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let i = 0; i < rawPositions.length; i += 3) {
    const x = rawPositions[i], y = rawPositions[i + 1], z = rawPositions[i + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }

  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
  const tol = options.tolerance ?? Math.max(diag * 1e-6, 1e-6)
  const invTol = 1 / tol

  // Spatial hash welding to identify shared vertices
  const coordMap = new Map<string, number>()
  const uniqueCoords: number[] = []

  function getUniqueVertex(x: number, y: number, z: number): number {
    const k = `${Math.round(x * invTol)},${Math.round(y * invTol)},${Math.round(z * invTol)}`
    let id = coordMap.get(k)
    if (id === undefined) {
      id = uniqueCoords.length / 3
      coordMap.set(k, id)
      uniqueCoords.push(x, y, z)
    }
    return id
  }

  // Map each triangle's 3 vertices to unique vertex indices
  const triUniqueVerts = new Int32Array(numTris * 3)
  const rawVertexCount = rawTriVerts ? rawPositions.length / 3 : numTris * 3
  let duplicateVertices = 0

  if (rawTriVerts) {
    // First map all indexed vertices
    const mappedIndex = new Int32Array(rawPositions.length / 3)
    for (let i = 0; i < mappedIndex.length; i++) {
      mappedIndex[i] = getUniqueVertex(rawPositions[i * 3], rawPositions[i * 3 + 1], rawPositions[i * 3 + 2])
    }
    for (let t = 0; t < numTris; t++) {
      triUniqueVerts[t * 3] = mappedIndex[rawTriVerts[t * 3]]
      triUniqueVerts[t * 3 + 1] = mappedIndex[rawTriVerts[t * 3 + 1]]
      triUniqueVerts[t * 3 + 2] = mappedIndex[rawTriVerts[t * 3 + 2]]
    }
    duplicateVertices = Math.max(0, mappedIndex.length - (uniqueCoords.length / 3))
  } else {
    for (let t = 0; t < numTris; t++) {
      const idx = t * 9
      const v0 = getUniqueVertex(rawPositions[idx], rawPositions[idx + 1], rawPositions[idx + 2])
      const v1 = getUniqueVertex(rawPositions[idx + 3], rawPositions[idx + 4], rawPositions[idx + 5])
      const v2 = getUniqueVertex(rawPositions[idx + 6], rawPositions[idx + 7], rawPositions[idx + 8])
      triUniqueVerts[t * 3] = v0
      triUniqueVerts[t * 3 + 1] = v1
      triUniqueVerts[t * 3 + 2] = v2
    }
    duplicateVertices = Math.max(0, rawVertexCount - (uniqueCoords.length / 3))
  }

  const numUniqueVerts = uniqueCoords.length / 3

  // Identify degenerate and duplicate triangles
  const degenerateTriIndices: number[] = []
  const duplicateTriIndices: number[] = []
  const seenTriangles = new Map<string, number>()

  let surfaceArea = 0
  let totalVolume = 0

  for (let t = 0; t < numTris; t++) {
    const u0 = triUniqueVerts[t * 3]
    const u1 = triUniqueVerts[t * 3 + 1]
    const u2 = triUniqueVerts[t * 3 + 2]

    const ax = uniqueCoords[u0 * 3], ay = uniqueCoords[u0 * 3 + 1], az = uniqueCoords[u0 * 3 + 2]
    const bx = uniqueCoords[u1 * 3], by = uniqueCoords[u1 * 3 + 1], bz = uniqueCoords[u1 * 3 + 2]
    const cx = uniqueCoords[u2 * 3], cy = uniqueCoords[u2 * 3 + 1], cz = uniqueCoords[u2 * 3 + 2]

    // Triangle edge vectors
    const abx = bx - ax, aby = by - ay, abz = bz - az
    const acx = cx - ax, acy = cy - ay, acz = cz - az

    // Cross product
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    const area = 0.5 * Math.hypot(nx, ny, nz)

    if (u0 === u1 || u1 === u2 || u0 === u2 || area < 1e-12) {
      degenerateTriIndices.push(t)
      continue
    }

    surfaceArea += area

    // Signed tetrahedron volume
    const vol = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    totalVolume += vol

    // Duplicate triangle check (same 3 sorted vertex indices)
    const sorted = [u0, u1, u2].sort((a, b) => a - b)
    const triKey = `${sorted[0]}_${sorted[1]}_${sorted[2]}`
    if (seenTriangles.has(triKey)) {
      duplicateTriIndices.push(t)
    } else {
      seenTriangles.set(triKey, t)
    }
  }

  // Edge map: build half-edge data
  // Key: sorted vertex pair u_v (u < v)
  interface EdgeRecord {
    u: number
    v: number
    forwardCount: number // triangles where u -> v
    backwardCount: number // triangles where v -> u
    incidentTris: number[]
  }

  const edgeMap = new Map<string, EdgeRecord>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let t = 0; t < numTris; t++) {
    if (degenerateTriIndices.includes(t)) continue

    const u0 = triUniqueVerts[t * 3]
    const u1 = triUniqueVerts[t * 3 + 1]
    const u2 = triUniqueVerts[t * 3 + 2]

    const edges: [number, number][] = [[u0, u1], [u1, u2], [u2, u0]]
    for (const [from, to] of edges) {
      const k = edgeKey(from, to)
      let rec = edgeMap.get(k)
      if (!rec) {
        const [u, v] = from < to ? [from, to] : [to, from]
        rec = { u, v, forwardCount: 0, backwardCount: 0, incidentTris: [] }
        edgeMap.set(k, rec)
      }
      if (from < to) {
        rec.forwardCount++
      } else {
        rec.backwardCount++
      }
      rec.incidentTris.push(t)
    }
  }

  let openEdges = 0
  let nonManifoldEdges = 0
  let inconsistentTriangles = 0

  const openEdgeList: [number, number][] = [] // directed edges [from, to] for loops
  const openEdgeLinesList: number[] = []
  const nonManifoldEdgeLinesList: number[] = []

  // Check vertices for non-manifoldness (incident open edges > 2 or disconnected fan)
  const vertexOpenEdgeCount = new Int32Array(numUniqueVerts)
  const vertexNonManifoldEdgeCount = new Int32Array(numUniqueVerts)

  for (const rec of edgeMap.values()) {
    const totalCount = rec.forwardCount + rec.backwardCount
    const ux = uniqueCoords[rec.u * 3], uy = uniqueCoords[rec.u * 3 + 1], uz = uniqueCoords[rec.u * 3 + 2]
    const vx = uniqueCoords[rec.v * 3], vy = uniqueCoords[rec.v * 3 + 1], vz = uniqueCoords[rec.v * 3 + 2]

    if (totalCount === 1) {
      openEdges++
      vertexOpenEdgeCount[rec.u]++
      vertexOpenEdgeCount[rec.v]++
      openEdgeLinesList.push(ux, uy, uz, vx, vy, vz)

      // Direct edge according to the single triangle that has it
      if (rec.forwardCount === 1) {
        openEdgeList.push([rec.u, rec.v])
      } else {
        openEdgeList.push([rec.v, rec.u])
      }
    } else if (totalCount === 2) {
      if (rec.forwardCount === 2 || rec.backwardCount === 2) {
        inconsistentTriangles++
      }
    } else if (totalCount > 2) {
      nonManifoldEdges++
      vertexNonManifoldEdgeCount[rec.u]++
      vertexNonManifoldEdgeCount[rec.v]++
      nonManifoldEdgeLinesList.push(ux, uy, uz, vx, vy, vz)
    }
  }

  let nonManifoldVertices = 0
  for (let i = 0; i < numUniqueVerts; i++) {
    if (vertexNonManifoldEdgeCount[i] > 0 || vertexOpenEdgeCount[i] > 2) {
      nonManifoldVertices++
    }
  }

  // Group open edges into boundary loops
  const boundaryLoops: BoundaryLoop[] = []
  if (openEdgeList.length > 0) {
    const adj = new Map<number, number[]>()
    for (const [from, to] of openEdgeList) {
      let list = adj.get(from)
      if (!list) {
        list = []
        adj.set(from, list)
      }
      list.push(to)
    }

    const usedEdges = new Set<string>()
    for (const [startFrom, startTo] of openEdgeList) {
      const eKey = `${startFrom}_${startTo}`
      if (usedEdges.has(eKey)) continue

      const loopVerts: number[] = [startFrom]
      let curr = startTo
      usedEdges.add(eKey)

      while (curr !== startFrom) {
        loopVerts.push(curr)
        const nextList = adj.get(curr)
        if (!nextList || nextList.length === 0) break
        // Find next unused edge
        let foundNext: number | null = null
        for (const n of nextList) {
          const nk = `${curr}_${n}`
          if (!usedEdges.has(nk)) {
            usedEdges.add(nk)
            foundNext = n
            break
          }
        }
        if (foundNext === null) break
        curr = foundNext
      }

      // Compute perimeter and points
      let perimeter = 0
      const points: [number, number, number][] = []
      for (let i = 0; i < loopVerts.length; i++) {
        const v = loopVerts[i]
        const px = uniqueCoords[v * 3], py = uniqueCoords[v * 3 + 1], pz = uniqueCoords[v * 3 + 2]
        points.push([px, py, pz])
        const nextV = loopVerts[(i + 1) % loopVerts.length]
        const nx = uniqueCoords[nextV * 3], ny = uniqueCoords[nextV * 3 + 1], nz = uniqueCoords[nextV * 3 + 2]
        perimeter += Math.hypot(nx - px, ny - py, nz - pz)
      }

      boundaryLoops.push({
        points,
        perimeter,
        vertexIndices: loopVerts,
      })
    }
  }

  // Shells via Disjoint Set (Union-Find) on non-degenerate triangles
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

  // Connect triangles across 2-manifold edges
  for (const rec of edgeMap.values()) {
    if (rec.incidentTris.length >= 2) {
      for (let i = 1; i < rec.incidentTris.length; i++) {
        union(rec.incidentTris[0], rec.incidentTris[i])
      }
    }
  }

  // Aggregate shells
  const shellMap = new Map<number, { triCount: number; volume: number; hasOpenEdge: boolean }>()
  const degenSet = new Set(degenerateTriIndices)

  for (let t = 0; t < numTris; t++) {
    if (degenSet.has(t)) continue
    const root = find(t)
    let s = shellMap.get(root)
    if (!s) {
      s = { triCount: 0, volume: 0, hasOpenEdge: false }
      shellMap.set(root, s)
    }
    s.triCount++

    const u0 = triUniqueVerts[t * 3]
    const u1 = triUniqueVerts[t * 3 + 1]
    const u2 = triUniqueVerts[t * 3 + 2]
    const ax = uniqueCoords[u0 * 3], ay = uniqueCoords[u0 * 3 + 1], az = uniqueCoords[u0 * 3 + 2]
    const bx = uniqueCoords[u1 * 3], by = uniqueCoords[u1 * 3 + 1], bz = uniqueCoords[u1 * 3 + 2]
    const cx = uniqueCoords[u2 * 3], cy = uniqueCoords[u2 * 3 + 1], cz = uniqueCoords[u2 * 3 + 2]
    s.volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }

  // Mark shells that have open edges
  for (const rec of edgeMap.values()) {
    if (rec.incidentTris.length === 1) {
      const t = rec.incidentTris[0]
      const s = shellMap.get(find(t))
      if (s) s.hasOpenEdge = true
    }
  }

  const shells: ShellInfo[] = []
  let shellId = 0
  const flippedTriIndices: number[] = []

  for (const s of shellMap.values()) {
    const isClosed = !s.hasOpenEdge && nonManifoldEdges === 0
    shells.push({
      id: shellId++,
      triangleCount: s.triCount,
      volume: Number(s.volume.toFixed(6)),
      isClosed,
    })
  }

  // Detect flipped shells
  for (const s of shells) {
    if (s.isClosed && s.volume < 0) {
      // Find triangles belonging to this shell
      for (let t = 0; t < numTris; t++) {
        if (!degenSet.has(t)) {
          flippedTriIndices.push(t)
        }
      }
      break
    }
  }

  const isSolid =
    numTris > 0 &&
    openEdges === 0 &&
    nonManifoldEdges === 0 &&
    degenerateTriIndices.length === 0 &&
    duplicateTriIndices.length === 0 &&
    inconsistentTriangles === 0 &&
    totalVolume > 0

  return {
    triangles: numTris,
    vertices: rawVertexCount,
    duplicateVertices,
    openEdges,
    boundaryLoops,
    nonManifoldEdges,
    nonManifoldVertices,
    degenerateTriangles: degenerateTriIndices.length,
    duplicateTriangles: duplicateTriIndices.length,
    inconsistentTriangles,
    isNegativeVolume: totalVolume < 0,
    shells,
    surfaceArea: Number(surfaceArea.toFixed(6)),
    volume: Number(totalVolume.toFixed(6)),
    isSolid,
    openEdgeLines: new Float32Array(openEdgeLinesList),
    nonManifoldEdgeLines: new Float32Array(nonManifoldEdgeLinesList),
    degenerateTriIndices,
    duplicateTriIndices,
    flippedTriIndices,
  }
}
