import type { IndexedMesh } from '../stl-import'

export type Vec3 = [number, number, number]

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len < 1e-9) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

/**
 * Euclidean distance between two 3D points in mm.
 */
export function measureDistance(p1: Vec3, p2: Vec3): number {
  return Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2])
}

/**
 * Angle at vertex B formed by rays BA and BC in degrees (0 to 180).
 */
export function measureAngle(pA: Vec3, pVertex: Vec3, pC: Vec3): number {
  const v1 = normalize(sub(pA, pVertex))
  const v2 = normalize(sub(pC, pVertex))
  const cosTheta = Math.max(-1, Math.min(1, dot(v1, v2)))
  return (Math.acos(cosTheta) * 180) / Math.PI
}

export interface CircleFitResult {
  center: Vec3
  radius: number
  diameter: number
  residual: number
  normal: Vec3
}

/**
 * Fits a 3D circle to 3 or more points using least-squares projection.
 */
export function fitCircle3D(points: Vec3[]): CircleFitResult | null {
  if (points.length < 3) return null

  // Compute centroid
  let cx = 0, cy = 0, cz = 0
  for (const p of points) {
    cx += p[0]; cy += p[1]; cz += p[2]
  }
  cx /= points.length; cy /= points.length; cz /= points.length
  const centroid: Vec3 = [cx, cy, cz]

  // Newell's method for best-fit normal
  let nx = 0, ny = 0, nz = 0
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i]
    const p2 = points[(i + 1) % points.length]
    nx += (p1[1] - p2[1]) * (p1[2] + p2[2])
    ny += (p1[2] - p2[2]) * (p1[0] + p2[0])
    nz += (p1[0] - p2[0]) * (p1[1] + p2[1])
  }
  const normal = normalize([nx, ny, nz])

  // Coordinate basis (u, v) on the best-fit plane
  const arbitrary: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const uAxis = normalize(cross(normal, arbitrary))
  const vAxis = normalize(cross(normal, uAxis))

  // Project points to 2D
  const pts2D: [number, number][] = []
  for (const p of points) {
    const rel = sub(p, centroid)
    pts2D.push([dot(rel, uAxis), dot(rel, vAxis)])
  }

  // Kåsa 2D circle fit: solve linear system for (u_c, v_c, c_0)
  // 2 u u_c + 2 v v_c + c_0 = u^2 + v^2
  let s_u = 0, s_v = 0, s_uu = 0, s_vv = 0, s_uv = 0
  let s_ur = 0, s_vr = 0, s_r = 0
  const n = pts2D.length

  for (const [u, v] of pts2D) {
    const r2 = u * u + v * v
    s_u += u
    s_v += v
    s_uu += u * u
    s_vv += v * v
    s_uv += u * v
    s_ur += u * r2
    s_vr += v * r2
    s_r += r2
  }

  // Linear system:
  // [ 2*s_uu  2*s_uv  s_u ] [ uc ]   [ s_ur ]
  // [ 2*s_uv  2*s_vv  s_v ] [ vc ] = [ s_vr ]
  // [ 2*s_u   2*s_v   n   ] [ c0 ]   [ s_r  ]
  const A = [
    [2 * s_uu, 2 * s_uv, s_u],
    [2 * s_uv, 2 * s_vv, s_v],
    [2 * s_u, 2 * s_v, n],
  ]
  const B = [s_ur, s_vr, s_r]

  // Solve 3x3 via Cramer's rule
  const det3 = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])

  const d = det3(A)
  if (Math.abs(d) < 1e-12) return null

  const replaceCol = (col: number) => {
    const m = A.map((r) => [...r])
    for (let i = 0; i < 3; i++) m[i][col] = B[i]
    return m
  }

  const uc = det3(replaceCol(0)) / d
  const vc = det3(replaceCol(1)) / d
  const c0 = det3(replaceCol(2)) / d

  const radiusSquared = c0 + uc * uc + vc * vc
  if (radiusSquared <= 0) return null
  const radius = Math.sqrt(radiusSquared)

  // Residual
  let residualSum = 0
  for (const [u, v] of pts2D) {
    const dist = Math.hypot(u - uc, v - vc)
    residualSum += (dist - radius) * (dist - radius)
  }
  const residual = Math.sqrt(residualSum / n)

  // Center in 3D: centroid + uc * uAxis + vc * vAxis
  const center: Vec3 = [
    centroid[0] + uc * uAxis[0] + vc * vAxis[0],
    centroid[1] + uc * uAxis[1] + vc * vAxis[1],
    centroid[2] + uc * uAxis[2] + vc * vAxis[2],
  ]

  return {
    center,
    radius,
    diameter: radius * 2,
    residual,
    normal,
  }
}

/**
 * Measures wall thickness by casting ray inward (-normal) from a point.
 */
export function measureWallThickness(
  point: Vec3,
  normal: Vec3,
  mesh: IndexedMesh
): number | null {
  const { vertProperties, triVerts } = mesh
  const numTris = triVerts.length / 3

  const rayOrig = point
  const rayDir = normalize([-normal[0], -normal[1], -normal[2]])

  let closestHit: number | null = null

  // Möller-Trumbore ray-triangle intersection
  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3] * 3
    const i1 = triVerts[t * 3 + 1] * 3
    const i2 = triVerts[t * 3 + 2] * 3

    const v0: Vec3 = [vertProperties[i0], vertProperties[i0 + 1], vertProperties[i0 + 2]]
    const v1: Vec3 = [vertProperties[i1], vertProperties[i1 + 1], vertProperties[i1 + 2]]
    const v2: Vec3 = [vertProperties[i2], vertProperties[i2 + 1], vertProperties[i2 + 2]]

    const edge1 = sub(v1, v0)
    const edge2 = sub(v2, v0)
    const pvec = cross(rayDir, edge2)
    const det = dot(edge1, pvec)

    if (Math.abs(det) < 1e-9) continue
    const invDet = 1 / det

    const tvec = sub(rayOrig, v0)
    const u = dot(tvec, pvec) * invDet
    if (u < 0 || u > 1) continue

    const qvec = cross(tvec, edge1)
    const v = dot(rayDir, qvec) * invDet
    if (v < 0 || u + v > 1) continue

    const dist = dot(edge2, qvec) * invDet
    // Ignore hits too close to origin (self-intersection with starting face)
    if (dist > 0.05) {
      if (closestHit === null || dist < closestHit) {
        closestHit = dist
      }
    }
  }

  return closestHit
}

export type SnapKind = 'vertex' | 'edge' | 'face' | 'free'

export interface SnappedPoint {
  point: Vec3
  kind: SnapKind
}

/**
 * Snaps a picked point to nearest vertex, edge midpoint, or face center
 * within screen pixel threshold.
 */
export function snapToMesh(
  hitPoint: Vec3,
  hitTriIndex: number,
  mesh: IndexedMesh,
  project: (p: Vec3) => { x: number; y: number },
  pixelThreshold = 8
): SnappedPoint {
  const { vertProperties, triVerts } = mesh
  const numTris = triVerts.length / 3

  if (hitTriIndex < 0 || hitTriIndex >= numTris) {
    return { point: hitPoint, kind: 'free' }
  }

  const i0 = triVerts[hitTriIndex * 3] * 3
  const i1 = triVerts[hitTriIndex * 3 + 1] * 3
  const i2 = triVerts[hitTriIndex * 3 + 2] * 3

  const v0: Vec3 = [vertProperties[i0], vertProperties[i0 + 1], vertProperties[i0 + 2]]
  const v1: Vec3 = [vertProperties[i1], vertProperties[i1 + 1], vertProperties[i1 + 2]]
  const v2: Vec3 = [vertProperties[i2], vertProperties[i2 + 1], vertProperties[i2 + 2]]

  const hitScreen = project(hitPoint)

  // 1. Check vertices
  const vertices: Vec3[] = [v0, v1, v2]
  for (const v of vertices) {
    const sc = project(v)
    const d = Math.hypot(sc.x - hitScreen.x, sc.y - hitScreen.y)
    if (d <= pixelThreshold) {
      return { point: v, kind: 'vertex' }
    }
  }

  // 2. Check edge midpoints
  const midpoints: Vec3[] = [
    [0.5 * (v0[0] + v1[0]), 0.5 * (v0[1] + v1[1]), 0.5 * (v0[2] + v1[2])],
    [0.5 * (v1[0] + v2[0]), 0.5 * (v1[1] + v2[1]), 0.5 * (v1[2] + v2[2])],
    [0.5 * (v2[0] + v0[0]), 0.5 * (v2[1] + v0[1]), 0.5 * (v2[2] + v0[2])],
  ]
  for (const m of midpoints) {
    const sc = project(m)
    const d = Math.hypot(sc.x - hitScreen.x, sc.y - hitScreen.y)
    if (d <= pixelThreshold) {
      return { point: m, kind: 'edge' }
    }
  }

  // 3. Check face center
  const center: Vec3 = [
    (v0[0] + v1[0] + v2[0]) / 3,
    (v0[1] + v1[1] + v2[1]) / 3,
    (v0[2] + v1[2] + v2[2]) / 3,
  ]
  const cScreen = project(center)
  if (Math.hypot(cScreen.x - hitScreen.x, cScreen.y - hitScreen.y) <= pixelThreshold) {
    return { point: center, kind: 'face' }
  }

  return { point: hitPoint, kind: 'free' }
}
