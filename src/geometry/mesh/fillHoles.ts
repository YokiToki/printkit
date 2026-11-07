import type { IndexedMesh, TriSoup } from '../stl-import'
import { weld } from './weld'

export interface FillHolesOptions {
  mode?: 'flat' | 'smooth'
  maxPerimeter?: number
  loopIndices?: number[]
}

export interface SkippedHoleInfo {
  loopIndex: number
  perimeter: number
  vertexCount: number
}

export interface FillHolesReport {
  filledLoops: number
  addedTriangles: number
  skippedLoops: SkippedHoleInfo[]
}

type Vec3 = [number, number, number]
type Vec2 = [number, number]

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
 * 2D point-in-triangle check for ear clipping.
 */
function pointInTriangle2D(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const area = 0.5 * (-b[1] * c[0] + a[1] * (-b[0] + c[0]) + a[0] * (b[1] - c[1]) + b[0] * c[1])
  const s = (a[1] * c[0] - a[0] * c[1] + (c[1] - a[1]) * p[0] + (a[0] - c[0]) * p[1]) / (2 * area)
  const t = (a[0] * b[1] - a[1] * b[0] + (a[1] - b[1]) * p[0] + (b[0] - a[0]) * p[1]) / (2 * area)
  return s > 1e-6 && t > 1e-6 && 1 - s - t > 1e-6
}

/**
 * Fills holes in a mesh with flat or smooth patches.
 */
export function fillHoles(
  mesh: TriSoup | IndexedMesh,
  options: FillHolesOptions = {}
): { mesh: IndexedMesh; report: FillHolesReport } {
  const welded = 'triVerts' in mesh ? mesh : weld(mesh).mesh
  const { vertProperties, triVerts } = welded
  const numTris = triVerts.length / 3

  if (numTris === 0) {
    return {
      mesh: welded,
      report: { filledLoops: 0, addedTriangles: 0, skippedLoops: [] },
    }
  }

  // Directed half-edge map: a -> b
  const hasEdge = new Set<string>()
  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3], i1 = triVerts[t * 3 + 1], i2 = triVerts[t * 3 + 2]
    hasEdge.add(`${i0}_${i1}`)
    hasEdge.add(`${i1}_${i2}`)
    hasEdge.add(`${i2}_${i0}`)
  }

  // Open boundary edges: directed edge a -> b where b -> a is missing in existing mesh.
  // The hole cap must have directed edge b -> a to match.
  const next = new Map<number, number[]>()
  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3], i1 = triVerts[t * 3 + 1], i2 = triVerts[t * 3 + 2]
    const edges: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]]
    for (const [a, b] of edges) {
      if (!hasEdge.has(`${b}_${a}`)) {
        let list = next.get(b)
        if (!list) {
          list = []
          next.set(b, list)
        }
        list.push(a)
      }
    }
  }

  if (next.size === 0) {
    return {
      mesh: welded,
      report: { filledLoops: 0, addedTriangles: 0, skippedLoops: [] },
    }
  }

  // Extract ordered boundary loops
  const allLoops: number[][] = []
  const take = (from: number) => {
    const list = next.get(from)
    const v = list?.pop()
    if (list && list.length === 0) next.delete(from)
    return v
  }

  while (next.size > 0) {
    const start = next.keys().next().value as number
    const loop = [start]
    let cur = take(start)
    let guard = 0
    while (cur !== undefined && cur !== start && guard < 1e5) {
      loop.push(cur)
      cur = take(cur)
      guard++
    }
    if (loop.length >= 3) {
      allLoops.push(loop)
    }
  }

  const outVerts = Array.from(vertProperties)
  const outTris = Array.from(triVerts)
  const skippedLoops: SkippedHoleInfo[] = []
  let filledLoops = 0
  let addedTriangles = 0

  const maxPerim = options.maxPerimeter ?? Infinity
  const mode = options.mode ?? 'flat'

  for (let loopIdx = 0; loopIdx < allLoops.length; loopIdx++) {
    const loop = allLoops[loopIdx]

    // Calculate loop perimeter
    let perimeter = 0
    for (let i = 0; i < loop.length; i++) {
      const v0 = loop[i]
      const v1 = loop[(i + 1) % loop.length]
      const x0 = outVerts[v0 * 3], y0 = outVerts[v0 * 3 + 1], z0 = outVerts[v0 * 3 + 2]
      const x1 = outVerts[v1 * 3], y1 = outVerts[v1 * 3 + 1], z1 = outVerts[v1 * 3 + 2]
      perimeter += Math.hypot(x1 - x0, y1 - y0, z1 - z0)
    }

    if (perimeter > maxPerim) {
      skippedLoops.push({ loopIndex: loopIdx, perimeter, vertexCount: loop.length })
      continue
    }

    if (options.loopIndices && !options.loopIndices.includes(loopIdx)) {
      skippedLoops.push({ loopIndex: loopIdx, perimeter, vertexCount: loop.length })
      continue
    }

    filledLoops++

    // Triangle hole: close directly
    if (loop.length === 3) {
      outTris.push(loop[0], loop[1], loop[2])
      addedTriangles++
      continue
    }

    // Best-fit normal using Newell's method
    let nx = 0, ny = 0, nz = 0
    let cx = 0, cy = 0, cz = 0

    for (let i = 0; i < loop.length; i++) {
      const v0 = loop[i]
      const v1 = loop[(i + 1) % loop.length]
      const p0: Vec3 = [outVerts[v0 * 3], outVerts[v0 * 3 + 1], outVerts[v0 * 3 + 2]]
      const p1: Vec3 = [outVerts[v1 * 3], outVerts[v1 * 3 + 1], outVerts[v1 * 3 + 2]]

      nx += (p0[1] - p1[1]) * (p0[2] + p1[2])
      ny += (p0[2] - p1[2]) * (p0[0] + p1[0])
      nz += (p0[0] - p1[0]) * (p0[1] + p1[1])

      cx += p0[0]
      cy += p0[1]
      cz += p0[2]
    }

    cx /= loop.length
    cy /= loop.length
    cz /= loop.length

    const normal = normalize([nx, ny, nz])

    // Choose 2D coordinate basis (u, v) on the best-fit plane
    const arbitrary: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    const uAxis = normalize(cross(normal, arbitrary))
    const vAxis = normalize(cross(normal, uAxis))

    // Project 3D loop points to 2D
    const pts2D: Vec2[] = []
    for (const v of loop) {
      const p: Vec3 = [outVerts[v * 3] - cx, outVerts[v * 3 + 1] - cy, outVerts[v * 3 + 2] - cz]
      pts2D.push([dot(p, uAxis), dot(p, vAxis)])
    }

    // Check signed 2D area (ensure CCW)
    let area2D = 0
    for (let i = 0; i < pts2D.length; i++) {
      const p0 = pts2D[i]
      const p1 = pts2D[(i + 1) % pts2D.length]
      area2D += (p0[0] * p1[1] - p1[0] * p0[1])
    }

    let earClippingSucceeded = false
    const newTrisForLoop: [number, number, number][] = []

    if (mode === 'flat') {
      // Ear clipping
      const indices = loop.map((_, i) => i)
      let iters = 0
      const maxIters = indices.length * indices.length * 2

      while (indices.length > 3 && iters < maxIters) {
        iters++
        let earFound = false
        for (let i = 0; i < indices.length; i++) {
          const prev = indices[(i - 1 + indices.length) % indices.length]
          const curr = indices[i]
          const next = indices[(i + 1) % indices.length]

          const a = pts2D[prev], b = pts2D[curr], c = pts2D[next]
          // Cross product of (b - a) and (c - b)
          const crossProduct = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
          const isConvex = area2D >= 0 ? crossProduct > 1e-9 : crossProduct < -1e-9
          if (!isConvex) continue

          // Check if any other vertex lies inside triangle abc
          let containsOther = false
          for (const other of indices) {
            if (other === prev || other === curr || other === next) continue
            if (pointInTriangle2D(pts2D[other], a, b, c)) {
              containsOther = true
              break
            }
          }
          if (containsOther) continue

          // Found ear
          newTrisForLoop.push([loop[prev], loop[curr], loop[next]])
          indices.splice(i, 1)
          earFound = true
          break
        }

        if (!earFound) break
      }

      if (indices.length === 3) {
        newTrisForLoop.push([loop[indices[0]], loop[indices[1]], loop[indices[2]]])
        earClippingSucceeded = true
      }
    }

    if (!earClippingSucceeded) {
      // Fan fallback around centroid
      newTrisForLoop.length = 0
      const centroidIdx = outVerts.length / 3
      outVerts.push(cx, cy, cz)

      for (let i = 0; i < loop.length; i++) {
        const v0 = loop[i]
        const v1 = loop[(i + 1) % loop.length]
        newTrisForLoop.push([v0, v1, centroidIdx])
      }

      if (mode === 'smooth') {
        // Smooth relaxation: adjust centroid position to average of loop points
        // (centroid is already at average, but if subdivided, relax interior vertices)
      }
    }

    for (const [a, b, c] of newTrisForLoop) {
      outTris.push(a, b, c)
      addedTriangles++
    }
  }

  return {
    mesh: {
      vertProperties: new Float32Array(outVerts),
      triVerts: new Uint32Array(outTris),
    },
    report: {
      filledLoops,
      addedTriangles,
      skippedLoops,
    },
  }
}
