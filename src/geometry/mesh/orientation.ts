import type { IndexedMesh, TriSoup } from '../stl-import'
import { planarRegion } from './planarRegion'
import { weld } from './weld'

type Vec3 = [number, number, number]
type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number,
]

export interface OrientationSuggestion {
  rotation: Vec3 // [rx, ry, rz] in degrees (XYZ Euler)
  score: number
  overhangArea: number
  height: number
  contactArea: number
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
 * Creates 3x3 rotation matrix from Rodrigues axis-angle.
 */
function axisAngleToMatrix(axis: Vec3, angleRad: number): Mat3 {
  const [x, y, z] = normalize(axis)
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  const t = 1 - c

  return [
    t * x * x + c,     t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c,     t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ]
}

/**
 * Converts 3x3 rotation matrix to intrinsic XYZ Euler angles in degrees.
 */
export function matrixToEulerXYZ(m: Mat3): Vec3 {
  // m is row-major:
  // [ m00, m01, m02,
  //   m10, m11, m12,
  //   m20, m21, m22 ]
  // R = Rx * Ry * Rz
  // R02 = sin(y)
  const s2 = Math.max(-1, Math.min(1, m[2]))
  const yRad = Math.asin(s2)
  let xRad = 0
  let zRad = 0

  if (Math.abs(s2) < 0.99999) {
    xRad = Math.atan2(-m[5], m[8])
    zRad = Math.atan2(-m[1], m[0])
  } else {
    // Gimbal lock
    xRad = Math.atan2(m[7], m[4])
    zRad = 0
  }

  const toDeg = (r: number) => {
    let d = (r * 180) / Math.PI
    // Normalize to -180..180
    d = ((d + 180) % 360) - 180
    return Math.abs(d) < 1e-4 ? 0 : Number(d.toFixed(2))
  }

  return [toDeg(xRad), toDeg(yRad), toDeg(zRad)]
}

/**
 * Calculates rotation [rx, ry, rz] taking normal vector n to -Z [0, 0, -1].
 */
export function rotationToDownZ(n: Vec3): Vec3 {
  const normN = normalize(n)
  const target: Vec3 = [0, 0, -1]

  const cosTheta = dot(normN, target)
  if (cosTheta > 0.99999) {
    return [0, 0, 0]
  }
  if (cosTheta < -0.99999) {
    return [180, 0, 0]
  }

  const axis = cross(normN, target)
  const angle = Math.acos(Math.max(-1, Math.min(1, cosTheta)))
  const mat = axisAngleToMatrix(axis, angle)
  return matrixToEulerXYZ(mat)
}

/**
 * Lay on face: finds connected planar region starting at triIndex,
 * and returns the Euler rotation [rx, ry, rz] that lays its normal flat on the bed (-Z).
 */
export function layOnFace(
  mesh: TriSoup | IndexedMesh,
  triIndex: number,
  toleranceDeg = 1.0
): { rotation: Vec3; regionNormal: Vec3; regionArea: number } {
  const region = planarRegion(mesh, triIndex, { angleToleranceDeg: toleranceDeg })
  const rot = rotationToDownZ(region.normal)
  return {
    rotation: rot,
    regionNormal: region.normal,
    regionArea: region.area,
  }
}

/**
 * Evaluates candidate orientations and returns top 3 suggestions scored by:
 * score = a * overhangArea + b * height - c * contactArea
 */
export function bestOrientations(
  mesh: TriSoup | IndexedMesh,
  weights: { a?: number; b?: number; c?: number } = {}
): OrientationSuggestion[] {
  const welded = 'triVerts' in mesh ? mesh : weld(mesh).mesh
  const { vertProperties, triVerts } = welded
  const numTris = triVerts.length / 3

  if (numTris === 0) return []

  // Weights: a * overhangArea + b * height - c * contactArea
  const a = weights.a ?? 1.0
  const b = weights.b ?? 5.0
  const c = weights.c ?? 0.5

  // 1. Six axis-aligned rotations
  const candidateRotations: Vec3[] = [
    [0, 0, 0],
    [180, 0, 0],
    [90, 0, 0],
    [-90, 0, 0],
    [0, 90, 0],
    [0, -90, 0],
  ]

  // 2. Discover planar regions to add surface-normal candidates
  const visitedTris = new Uint8Array(numTris)
  const flatNormals: Vec3[] = []

  for (let t = 0; t < numTris && flatNormals.length < 18; t++) {
    if (visitedTris[t]) continue
    const reg = planarRegion(welded, t, { angleToleranceDeg: 1.0 })
    for (const idx of reg.triangleIndices) visitedTris[idx] = 1
    if (reg.triangleIndices.length >= 2 && reg.area > 1.0) {
      flatNormals.push(reg.normal)
    }
  }

  for (const fn of flatNormals) {
    candidateRotations.push(rotationToDownZ(fn))
  }

  // Pre-calculate triangle normals and areas in model space
  const triNormals: Vec3[] = new Array(numTris)
  const triAreas = new Float64Array(numTris)
  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3] * 3
    const i1 = triVerts[t * 3 + 1] * 3
    const i2 = triVerts[t * 3 + 2] * 3

    const v0: Vec3 = [vertProperties[i0], vertProperties[i0 + 1], vertProperties[i0 + 2]]
    const v1: Vec3 = [vertProperties[i1], vertProperties[i1 + 1], vertProperties[i1 + 2]]
    const v2: Vec3 = [vertProperties[i2], vertProperties[i2 + 1], vertProperties[i2 + 2]]

    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]] as Vec3
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]] as Vec3
    const n = cross(e1, e2)
    const len = Math.hypot(n[0], n[1], n[2])
    triAreas[t] = 0.5 * len
    triNormals[t] = len > 1e-9 ? [n[0] / len, n[1] / len, n[2] / len] : [0, 0, 1]
  }

  function eulerToMatrix(deg: Vec3): Mat3 {
    const rx = (deg[0] * Math.PI) / 180
    const ry = (deg[1] * Math.PI) / 180
    const rz = (deg[2] * Math.PI) / 180

    const cx = Math.cos(rx), sx = Math.sin(rx)
    const cy = Math.cos(ry), sy = Math.sin(ry)
    const cz = Math.cos(rz), sz = Math.sin(rz)

    // R = Rx * Ry * Rz
    return [
      cy * cz, -cy * sz, sy,
      sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy,
      -cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy,
    ]
  }

  const results: OrientationSuggestion[] = []
  const seenKeys = new Set<string>()

  for (const rot of candidateRotations) {
    const key = `${Math.round(rot[0])}_${Math.round(rot[1])}_${Math.round(rot[2])}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    const mat = eulerToMatrix(rot)

    // Rotate all vertices to compute height and contact plane
    let minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < vertProperties.length; i += 3) {
      const x = vertProperties[i], y = vertProperties[i + 1], z = vertProperties[i + 2]
      const rz = mat[6] * x + mat[7] * y + mat[8] * z
      if (rz < minZ) minZ = rz
      if (rz > maxZ) maxZ = rz
    }
    const height = maxZ - minZ

    let overhangArea = 0
    let contactArea = 0

    // Overhang angle: 45 degrees. cos(45 deg) = 0.7071
    // Downward normal has rotated nz < 0
    for (let t = 0; t < numTris; t++) {
      const [nx, ny, nz] = triNormals[t]
      const rnz = mat[6] * nx + mat[7] * ny + mat[8] * nz
      const area = triAreas[t]

      // Check if on bed (contact plane)
      if (rnz < -0.99) {
        // Check if vertices of this triangle are near minZ
        const i0 = triVerts[t * 3] * 3
        const z0 = mat[6] * vertProperties[i0] + mat[7] * vertProperties[i0 + 1] + mat[8] * vertProperties[i0 + 2]
        if (Math.abs(z0 - minZ) < 0.1) {
          contactArea += area
          continue
        }
      }

      // Overhang: downward facing beyond 45 degrees
      if (rnz < -0.01 && rnz > -0.95) {
        // angle from vertical: rnz = -cos(theta). If theta > 45 deg, rnz < -0.7071
        if (rnz < -0.7071) {
          overhangArea += area
        }
      }
    }

    const score = a * overhangArea + b * height - c * contactArea

    results.push({
      rotation: rot,
      score: Number(score.toFixed(2)),
      overhangArea: Number(overhangArea.toFixed(2)),
      height: Number(height.toFixed(2)),
      contactArea: Number(contactArea.toFixed(2)),
    })
  }

  // Sort by score ascending (lowest score is best)
  results.sort((p, q) => p.score - q.score)

  return results.slice(0, 3)
}
