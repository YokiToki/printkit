import type { IndexedMesh, TriSoup } from '../stl-import'
import { weld } from './weld'

export interface SmoothOptions {
  /** Smoothing strength from 0 to 1. Default: 0.5 */
  strength?: number
  /** Number of Taubin iterations (1 to 50). Default: 10 */
  iterations?: number
  /** Dihedral angle threshold in degrees for sharp edges to preserve. Default: 35 */
  sharpAngleDeg?: number
}

export interface SmoothReport {
  iterations: number
  strength: number
  initialVolume: number
  finalVolume: number
  volumeChangePercent: number
  pinnedVertices: number
}

type Vec3 = [number, number, number]

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
 * Volume computation for a triangle mesh.
 */
function computeVolume(vertProperties: Float32Array, triVerts: Uint32Array): number {
  let vol = 0
  for (let t = 0; t < triVerts.length; t += 3) {
    const i0 = triVerts[t] * 3
    const i1 = triVerts[t + 1] * 3
    const i2 = triVerts[t + 2] * 3
    const ax = vertProperties[i0], ay = vertProperties[i0 + 1], az = vertProperties[i0 + 2]
    const bx = vertProperties[i1], by = vertProperties[i1 + 1], bz = vertProperties[i1 + 2]
    const cx = vertProperties[i2], cy = vertProperties[i2 + 1], cz = vertProperties[i2 + 2]
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return vol
}

/**
 * Feature-preserving Taubin (lambda/mu) mesh smoothing.
 * Boundary loops and sharp edges (> sharpAngleDeg) remain fixed.
 */
export function smooth(
  mesh: TriSoup | IndexedMesh,
  options: SmoothOptions = {}
): { mesh: IndexedMesh; report: SmoothReport } {
  const welded = 'triVerts' in mesh ? mesh : weld(mesh).mesh
  const { vertProperties, triVerts } = welded
  const numVerts = vertProperties.length / 3
  const numTris = triVerts.length / 3

  if (numVerts === 0 || numTris === 0) {
    return {
      mesh: welded,
      report: {
        iterations: 0,
        strength: 0,
        initialVolume: 0,
        finalVolume: 0,
        volumeChangePercent: 0,
        pinnedVertices: 0,
      },
    }
  }

  const initialVolume = computeVolume(vertProperties, triVerts)

  const strength = Math.max(0, Math.min(1, options.strength ?? 0.5))
  const iterations = Math.max(1, Math.min(50, Math.round(options.iterations ?? 10)))
  const sharpAngleRad = ((options.sharpAngleDeg ?? 35) * Math.PI) / 180
  const cosSharp = Math.cos(sharpAngleRad)

  // Precompute triangle normals
  const triNormals: Vec3[] = new Array(numTris)
  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3] * 3
    const i1 = triVerts[t * 3 + 1] * 3
    const i2 = triVerts[t * 3 + 2] * 3

    const e1: Vec3 = [
      vertProperties[i1] - vertProperties[i0],
      vertProperties[i1 + 1] - vertProperties[i0 + 1],
      vertProperties[i1 + 2] - vertProperties[i0 + 2],
    ]
    const e2: Vec3 = [
      vertProperties[i2] - vertProperties[i0],
      vertProperties[i2 + 1] - vertProperties[i0 + 1],
      vertProperties[i2 + 2] - vertProperties[i0 + 2],
    ]
    triNormals[t] = normalize(cross(e1, e2))
  }

  // Edge map: find boundary edges and sharp edges
  interface EdgeInfo {
    u: number
    v: number
    tris: number[]
  }

  const edgeMap = new Map<string, EdgeInfo>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)

  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3], i1 = triVerts[t * 3 + 1], i2 = triVerts[t * 3 + 2]
    const edges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]]
    for (const [u, v] of edges) {
      const k = edgeKey(u, v)
      let info = edgeMap.get(k)
      if (!info) {
        info = { u, v, tris: [] }
        edgeMap.set(k, info)
      }
      info.tris.push(t)
    }
  }

  // Pinned vertices: boundary vertices and sharp edge vertices
  const pinned = new Uint8Array(numVerts)

  for (const edge of edgeMap.values()) {
    if (edge.tris.length === 1) {
      // Boundary edge -> pin both vertices
      pinned[edge.u] = 1
      pinned[edge.v] = 1
    } else if (edge.tris.length === 2) {
      const n0 = triNormals[edge.tris[0]]
      const n1 = triNormals[edge.tris[1]]
      const cosAngle = dot(n0, n1)
      if (cosAngle < cosSharp) {
        // Sharp edge
        pinned[edge.u] = 1
        pinned[edge.v] = 1
      }
    } else {
      // Non-manifold edge
      pinned[edge.u] = 1
      pinned[edge.v] = 1
    }
  }

  let pinnedCount = 0
  for (let i = 0; i < numVerts; i++) {
    if (pinned[i]) pinnedCount++
  }

  // Build vertex neighbor adjacency
  const neighbors: Set<number>[] = Array.from({ length: numVerts }, () => new Set<number>())
  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3], i1 = triVerts[t * 3 + 1], i2 = triVerts[t * 3 + 2]
    neighbors[i0].add(i1); neighbors[i0].add(i2)
    neighbors[i1].add(i0); neighbors[i1].add(i2)
    neighbors[i2].add(i0); neighbors[i2].add(i1)
  }

  // Taubin parameters: lambda > 0, mu < -lambda to prevent shrinkage
  const lambda = 0.5 * strength
  const mu = -1.02 * lambda

  const pos = new Float32Array(vertProperties)
  const tempPos = new Float32Array(vertProperties.length)

  for (let iter = 0; iter < iterations; iter++) {
    // Step 1: Shrinking step (lambda)
    for (let i = 0; i < numVerts; i++) {
      if (pinned[i]) {
        tempPos[i * 3] = pos[i * 3]
        tempPos[i * 3 + 1] = pos[i * 3 + 1]
        tempPos[i * 3 + 2] = pos[i * 3 + 2]
        continue
      }

      const adj = neighbors[i]
      if (adj.size === 0) continue

      let sumX = 0, sumY = 0, sumZ = 0
      for (const j of adj) {
        sumX += pos[j * 3]
        sumY += pos[j * 3 + 1]
        sumZ += pos[j * 3 + 2]
      }
      const invCount = 1 / adj.size
      const dx = sumX * invCount - pos[i * 3]
      const dy = sumY * invCount - pos[i * 3 + 1]
      const dz = sumZ * invCount - pos[i * 3 + 2]

      tempPos[i * 3] = pos[i * 3] + lambda * dx
      tempPos[i * 3 + 1] = pos[i * 3 + 1] + lambda * dy
      tempPos[i * 3 + 2] = pos[i * 3 + 2] + lambda * dz
    }

    // Step 2: Expansion step (mu)
    for (let i = 0; i < numVerts; i++) {
      if (pinned[i]) {
        pos[i * 3] = tempPos[i * 3]
        pos[i * 3 + 1] = tempPos[i * 3 + 1]
        pos[i * 3 + 2] = tempPos[i * 3 + 2]
        continue
      }

      const adj = neighbors[i]
      if (adj.size === 0) continue

      let sumX = 0, sumY = 0, sumZ = 0
      for (const j of adj) {
        sumX += tempPos[j * 3]
        sumY += tempPos[j * 3 + 1]
        sumZ += tempPos[j * 3 + 2]
      }
      const invCount = 1 / adj.size
      const dx = sumX * invCount - tempPos[i * 3]
      const dy = sumY * invCount - tempPos[i * 3 + 1]
      const dz = sumZ * invCount - tempPos[i * 3 + 2]

      pos[i * 3] = tempPos[i * 3] + mu * dx
      pos[i * 3 + 1] = tempPos[i * 3 + 1] + mu * dy
      pos[i * 3 + 2] = tempPos[i * 3 + 2] + mu * dz
    }
  }

  const finalVolume = computeVolume(pos, triVerts)
  const volDiff = Math.abs(finalVolume - initialVolume)
  const volumeChangePercent = initialVolume !== 0 ? (volDiff / Math.abs(initialVolume)) * 100 : 0

  return {
    mesh: {
      vertProperties: pos,
      triVerts,
    },
    report: {
      iterations,
      strength,
      initialVolume: Number(initialVolume.toFixed(6)),
      finalVolume: Number(finalVolume.toFixed(6)),
      volumeChangePercent: Number(volumeChangePercent.toFixed(4)),
      pinnedVertices: pinnedCount,
    },
  }
}
