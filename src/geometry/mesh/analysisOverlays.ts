import type { IndexedMesh } from '../stl-import'
import type { Mat4 } from '../../editor/scene'
import { measureWallThickness, type Vec3 } from './measure'

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
 * Computes color ramp [r, g, b] for an overhang angle in degrees.
 * thresholdDeg: angle beyond which overhang is risky (default 45°).
 * Returns [r, g, b] in range [0, 1].
 */
export function overhangColorRamp(angleDeg: number, thresholdDeg = 45): [number, number, number] {
  if (angleDeg < thresholdDeg) {
    // Printable (greenish-grey)
    return [0.4, 0.7, 0.5]
  }

  // Risky to severe: threshold -> 90° (yellow to red)
  const t = Math.min(1, Math.max(0, (angleDeg - thresholdDeg) / (90 - thresholdDeg)))
  // Yellow [1, 0.85, 0.1] -> Red [1, 0.15, 0.15]
  const r = 1.0
  const g = 0.85 * (1 - t) + 0.15 * t
  const b = 0.1 * (1 - t) + 0.15 * t
  return [r, g, b]
}

/**
 * Computes color ramp [r, g, b] for wall thickness.
 * thresholdMm: target nozzle / thin-wall threshold (default: 2 * nozzle, e.g. 0.8 mm).
 */
export function thinWallColorRamp(thicknessMm: number, thresholdMm = 0.8): [number, number, number] {
  if (thicknessMm >= thresholdMm) {
    // Normal wall: healthy blue-grey
    return [0.45, 0.65, 0.85]
  }

  // Too thin: red (0 mm) to orange/yellow (at threshold)
  const t = Math.max(0, thicknessMm / thresholdMm)
  // Red [1, 0.1, 0.1] -> Yellow [1, 0.85, 0.1]
  const r = 1.0
  const g = 0.1 + 0.75 * t
  const b = 0.1
  return [r, g, b]
}

/**
 * Computes per-vertex RGB colors for the overhang angle map.
 */
export function computeOverhangMap(
  mesh: IndexedMesh,
  matrix: Mat4,
  thresholdDeg = 45
): Float32Array {
  const { vertProperties, triVerts } = mesh
  const numVerts = vertProperties.length / 3
  const numTris = triVerts.length / 3

  const colors = new Float32Array(numVerts * 3)

  // 3x3 rotation portion of 4x4 matrix
  const m0 = matrix[0], m1 = matrix[1], m2 = matrix[2]
  const m4 = matrix[4], m5 = matrix[5], m6 = matrix[6]
  const m8 = matrix[8], m9 = matrix[9], m10 = matrix[10]

  // Accumulate colors on vertices from incident triangles
  const vertColorCount = new Int32Array(numVerts)

  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3]
    const i1 = triVerts[t * 3 + 1]
    const i2 = triVerts[t * 3 + 2]

    const v0: Vec3 = [vertProperties[i0 * 3], vertProperties[i0 * 3 + 1], vertProperties[i0 * 3 + 2]]
    const v1: Vec3 = [vertProperties[i1 * 3], vertProperties[i1 * 3 + 1], vertProperties[i1 * 3 + 2]]
    const v2: Vec3 = [vertProperties[i2 * 3], vertProperties[i2 * 3 + 1], vertProperties[i2 * 3 + 2]]

    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]] as Vec3
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]] as Vec3
    const n = normalize(cross(e1, e2))

    // World space normal
    const wn: Vec3 = [
      m0 * n[0] + m4 * n[1] + m8 * n[2],
      m1 * n[0] + m5 * n[1] + m9 * n[2],
      m2 * n[0] + m6 * n[1] + m10 * n[2],
    ]
    const normW = normalize(wn)

    // Overhang angle: angle from vertical.
    // Vertical surface (normW.z = 0) is 0° overhang.
    // Horizontal downward surface (normW.z = -1) is 90° overhang.
    let angleDeg = 0
    if (normW[2] < 0) {
      // Angle between normal and horizontal plane
      const horizontalDist = Math.hypot(normW[0], normW[1])
      angleDeg = (Math.atan2(-normW[2], horizontalDist) * 180) / Math.PI
    }

    const [r, g, b] = overhangColorRamp(angleDeg, thresholdDeg)

    for (const vIdx of [i0, i1, i2]) {
      colors[vIdx * 3] += r
      colors[vIdx * 3 + 1] += g
      colors[vIdx * 3 + 2] += b
      vertColorCount[vIdx]++
    }
  }

  for (let i = 0; i < numVerts; i++) {
    const c = vertColorCount[i] || 1
    colors[i * 3] /= c
    colors[i * 3 + 1] /= c
    colors[i * 3 + 2] /= c
  }

  return colors
}

/**
 * Computes per-vertex RGB colors for the thin-wall analysis map.
 */
export function computeThinWallMap(
  mesh: IndexedMesh,
  thresholdMm = 0.8,
  sampleCap = 100_000
): Float32Array {
  const { vertProperties, triVerts } = mesh
  const numVerts = vertProperties.length / 3
  const numTris = triVerts.length / 3

  const colors = new Float32Array(numVerts * 3)

  // Compute per-vertex smooth normals
  const vertexNormals = new Float32Array(numVerts * 3)
  for (let t = 0; t < numTris; t++) {
    const i0 = triVerts[t * 3]
    const i1 = triVerts[t * 3 + 1]
    const i2 = triVerts[t * 3 + 2]

    const v0: Vec3 = [vertProperties[i0 * 3], vertProperties[i0 * 3 + 1], vertProperties[i0 * 3 + 2]]
    const v1: Vec3 = [vertProperties[i1 * 3], vertProperties[i1 * 3 + 1], vertProperties[i1 * 3 + 2]]
    const v2: Vec3 = [vertProperties[i2 * 3], vertProperties[i2 * 3 + 1], vertProperties[i2 * 3 + 2]]

    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]] as Vec3
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]] as Vec3
    const n = cross(e1, e2)

    for (const vIdx of [i0, i1, i2]) {
      vertexNormals[vIdx * 3] += n[0]
      vertexNormals[vIdx * 3 + 1] += n[1]
      vertexNormals[vIdx * 3 + 2] += n[2]
    }
  }

  const step = Math.max(1, Math.floor(numVerts / sampleCap))

  for (let i = 0; i < numVerts; i += step) {
    const pt: Vec3 = [vertProperties[i * 3], vertProperties[i * 3 + 1], vertProperties[i * 3 + 2]]
    const norm: Vec3 = normalize([
      vertexNormals[i * 3],
      vertexNormals[i * 3 + 1],
      vertexNormals[i * 3 + 2],
    ])

    const thickness = measureWallThickness(pt, norm, mesh) ?? thresholdMm * 2
    const [r, g, b] = thinWallColorRamp(thickness, thresholdMm)

    for (let k = 0; k < step && i + k < numVerts; k++) {
      const idx = (i + k) * 3
      colors[idx] = r
      colors[idx + 1] = g
      colors[idx + 2] = b
    }
  }

  return colors
}

export interface SectionPlaneConfig {
  axis: 'x' | 'y' | 'z'
  offset: number
  normal: [number, number, number]
  constant: number
}

/**
 * Creates clipping plane parameters from axis and offset.
 */
export function getSectionPlane(
  axis: 'x' | 'y' | 'z',
  offset: number
): SectionPlaneConfig {
  switch (axis) {
    case 'x':
      return { axis, offset, normal: [-1, 0, 0], constant: offset }
    case 'y':
      return { axis, offset, normal: [0, -1, 0], constant: offset }
    case 'z':
      return { axis, offset, normal: [0, 0, -1], constant: offset }
  }
}
