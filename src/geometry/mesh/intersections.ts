import type { IndexedMesh, TriSoup } from '../stl-import'

export interface IntersectionOptions {
  pairCap?: number
  onProgress?: (fraction: number) => void
  isAborted?: () => boolean
}

export interface IntersectionResult {
  count: number
  pairs: [number, number][]
  capped: boolean
  aborted: boolean
}

type Vec3 = [number, number, number]

const EPSILON = 1e-6

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

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/**
 * Möller triangle-triangle intersection test.
 * Returns true if triangle V and triangle U strictly intersect (not just touching at boundary/coplanar disjoint).
 */
export function triTriIntersect(
  v0: Vec3, v1: Vec3, v2: Vec3,
  u0: Vec3, u1: Vec3, u2: Vec3
): boolean {
  // Plane equation for U: n2 . x + d2 = 0
  const e1 = sub(u1, u0)
  const e2 = sub(u2, u0)
  const n2 = cross(e1, e2)
  const d2 = -dot(n2, u0)

  // Distances of V to plane U
  const dv0 = dot(n2, v0) + d2
  const dv1 = dot(n2, v1) + d2
  const dv2 = dot(n2, v2) + d2

  const dv0nz = Math.abs(dv0) > EPSILON ? dv0 : 0
  const dv1nz = Math.abs(dv1) > EPSILON ? dv1 : 0
  const dv2nz = Math.abs(dv2) > EPSILON ? dv2 : 0

  // Same side check
  if ((dv0nz > 0 && dv1nz > 0 && dv2nz > 0) || (dv0nz < 0 && dv1nz < 0 && dv2nz < 0)) {
    return false
  }

  // Plane equation for V: n1 . x + d1 = 0
  const f1 = sub(v1, v0)
  const f2 = sub(v2, v0)
  const n1 = cross(f1, f2)
  const d1 = -dot(n1, v0)

  // Distances of U to plane V
  const du0 = dot(n1, u0) + d1
  const du1 = dot(n1, u1) + d1
  const du2 = dot(n1, u2) + d1

  const du0nz = Math.abs(du0) > EPSILON ? du0 : 0
  const du1nz = Math.abs(du1) > EPSILON ? du1 : 0
  const du2nz = Math.abs(du2) > EPSILON ? du2 : 0

  if ((du0nz > 0 && du1nz > 0 && du2nz > 0) || (du0nz < 0 && du1nz < 0 && du2nz < 0)) {
    return false
  }

  // Direction of intersection line
  const d = cross(n1, n2)
  const lenD = Math.hypot(d[0], d[1], d[2])

  // Coplanar check
  if (lenD < EPSILON) {
    // Triangles are coplanar. If touching on a face boundary, not a self-intersection.
    return false
  }

  // Compute intervals on line L: proj(X) = dot(d, X)
  function getInterval(p0: Vec3, p1: Vec3, p2: Vec3, dp0: number, dp1: number, dp2: number): [number, number] {
    const vals: number[] = []
    const pts = [p0, p1, p2]
    const dists = [dp0, dp1, dp2]

    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3
      const di = dists[i]
      const dj = dists[j]

      if (di * dj < 0) {
        // Edge intersects plane
        const t = di / (di - dj)
        const pt: Vec3 = [
          pts[i][0] + t * (pts[j][0] - pts[i][0]),
          pts[i][1] + t * (pts[j][1] - pts[i][1]),
          pts[i][2] + t * (pts[j][2] - pts[i][2]),
        ]
        vals.push(dot(d, pt))
      } else if (Math.abs(di) < EPSILON) {
        vals.push(dot(d, pts[i]))
      }
    }

    if (vals.length < 2) return [0, 0]
    return [Math.min(vals[0], vals[1]), Math.max(vals[0], vals[1])]
  }

  const [t0, t1] = getInterval(v0, v1, v2, dv0nz, dv1nz, dv2nz)
  const [u_min, u_max] = getInterval(u0, u1, u2, du0nz, du1nz, du2nz)

  // Strictly overlapping interval
  const overlapMin = Math.max(t0, u_min)
  const overlapMax = Math.min(t1, u_max)

  return overlapMax - overlapMin > EPSILON * lenD
}

/**
 * Finds self-intersecting triangle pairs in a mesh.
 */
export function findIntersections(
  mesh: TriSoup | IndexedMesh,
  options: IntersectionOptions = {}
): IntersectionResult {
  const pairCap = options.pairCap ?? 5_000_000

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
  if (numTris < 2) {
    return { count: 0, pairs: [], capped: false, aborted: false }
  }

  // Pre-extract triangle coords and bboxes
  const triBoxes = new Float32Array(numTris * 6)
  let totalEdgeLen = 0
  let edgeSampleCount = 0

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

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let t = 0; t < numTris; t++) {
    const [v0, v1, v2] = getTriVerts(t)
    const bMinX = Math.min(v0[0], v1[0], v2[0])
    const bMaxX = Math.max(v0[0], v1[0], v2[0])
    const bMinY = Math.min(v0[1], v1[1], v2[1])
    const bMaxY = Math.max(v0[1], v1[1], v2[1])
    const bMinZ = Math.min(v0[2], v1[2], v2[2])
    const bMaxZ = Math.max(v0[2], v1[2], v2[2])

    triBoxes[t * 6] = bMinX; triBoxes[t * 6 + 1] = bMinY; triBoxes[t * 6 + 2] = bMinZ
    triBoxes[t * 6 + 3] = bMaxX; triBoxes[t * 6 + 4] = bMaxY; triBoxes[t * 6 + 5] = bMaxZ

    if (bMinX < minX) minX = bMinX; if (bMaxX > maxX) maxX = bMaxX
    if (bMinY < minY) minY = bMinY; if (bMaxY > maxY) maxY = bMaxY
    if (bMinZ < minZ) minZ = bMinZ; if (bMaxZ > maxZ) maxZ = bMaxZ

    if (t < 500) {
      totalEdgeLen += Math.hypot(v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2])
      edgeSampleCount++
    }
  }

  const avgEdge = edgeSampleCount > 0 ? totalEdgeLen / edgeSampleCount : 1
  const cellSize = Math.max(avgEdge * 1.5, 1e-3)
  const invCell = 1 / cellSize

  // Uniform 3D grid
  const grid = new Map<string, number[]>()
  for (let t = 0; t < numTris; t++) {
    const i6 = t * 6
    const cx0 = Math.floor(triBoxes[i6] * invCell)
    const cx1 = Math.floor(triBoxes[i6 + 3] * invCell)
    const cy0 = Math.floor(triBoxes[i6 + 1] * invCell)
    const cy1 = Math.floor(triBoxes[i6 + 4] * invCell)
    const cz0 = Math.floor(triBoxes[i6 + 2] * invCell)
    const cz1 = Math.floor(triBoxes[i6 + 5] * invCell)

    for (let x = cx0; x <= cx1; x++) {
      for (let y = cy0; y <= cy1; y++) {
        for (let z = cz0; z <= cz1; z++) {
          const k = `${x},${y},${z}`
          let cell = grid.get(k)
          if (!cell) {
            cell = []
            grid.set(k, cell)
          }
          cell.push(t)
        }
      }
    }
  }

  // Generate candidate pairs
  const testedPairs = new Set<string>()
  const intersectingPairs: [number, number][] = []
  let testedCandidateCount = 0

  function sharesVertex(t1: number, t2: number): boolean {
    if (triVerts) {
      const a0 = triVerts[t1 * 3], a1 = triVerts[t1 * 3 + 1], a2 = triVerts[t1 * 3 + 2]
      const b0 = triVerts[t2 * 3], b1 = triVerts[t2 * 3 + 1], b2 = triVerts[t2 * 3 + 2]
      return a0 === b0 || a0 === b1 || a0 === b2 ||
             a1 === b0 || a1 === b1 || a1 === b2 ||
             a2 === b0 || a2 === b1 || a2 === b2
    }
    // For non-indexed soup, compare vertex coordinates
    const [v0, v1, v2] = getTriVerts(t1)
    const [u0, u1, u2] = getTriVerts(t2)
    const isSame = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-5
    return (
      isSame(v0, u0) || isSame(v0, u1) || isSame(v0, u2) ||
      isSame(v1, u0) || isSame(v1, u1) || isSame(v1, u2) ||
      isSame(v2, u0) || isSame(v2, u1) || isSame(v2, u2)
    )
  }

  let totalGridCells = grid.size
  let processedCells = 0

  for (const cellTris of grid.values()) {
    processedCells++
    if (options.isAborted?.()) {
      return { count: intersectingPairs.length, pairs: intersectingPairs, capped: false, aborted: true }
    }
    if (processedCells % 50 === 0) {
      options.onProgress?.(processedCells / totalGridCells)
    }

    const len = cellTris.length
    for (let i = 0; i < len; i++) {
      const t1 = cellTris[i]
      for (let j = i + 1; j < len; j++) {
        const t2 = cellTris[j]
        const a = t1 < t2 ? t1 : t2
        const b = t1 < t2 ? t2 : t1
        const pairKey = `${a}_${b}`

        if (testedPairs.has(pairKey)) continue
        testedPairs.add(pairKey)
        testedCandidateCount++

        if (testedCandidateCount > pairCap) {
          return {
            count: intersectingPairs.length,
            pairs: intersectingPairs,
            capped: true,
            aborted: false,
          }
        }

        // Bbox check
        const iA = a * 6, iB = b * 6
        if (
          triBoxes[iA] > triBoxes[iB + 3] || triBoxes[iA + 3] < triBoxes[iB] ||
          triBoxes[iA + 1] > triBoxes[iB + 4] || triBoxes[iA + 4] < triBoxes[iB + 1] ||
          triBoxes[iA + 2] > triBoxes[iB + 5] || triBoxes[iA + 5] < triBoxes[iB + 2]
        ) {
          continue
        }

        if (sharesVertex(a, b)) continue

        const [v0, v1, v2] = getTriVerts(a)
        const [u0, u1, u2] = getTriVerts(b)

        if (triTriIntersect(v0, v1, v2, u0, u1, u2)) {
          if (intersectingPairs.length < 1000) {
            intersectingPairs.push([a, b])
          }
        }
      }
    }
  }

  options.onProgress?.(1)

  return {
    count: intersectingPairs.length,
    pairs: intersectingPairs,
    capped: false,
    aborted: false,
  }
}
