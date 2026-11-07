import type { Manifold, ManifoldToplevel } from 'manifold-3d'

export type Vec3 = [number, number, number]

export type PlaneDefinition =
  | { kind: 'axis'; axis: 'x' | 'y' | 'z'; position: number }
  | { kind: 'normalPoint'; normal: Vec3; point: Vec3 }
  | { kind: 'threePoints'; p1: Vec3; p2: Vec3; p3: Vec3 }
  | { kind: 'face'; origin: Vec3; normal: Vec3 }

export interface NormalizedPlane {
  normal: Vec3
  originOffset: number
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len < 1e-9) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/**
 * Normalizes any plane definition into a unit normal and scalar originOffset
 * such that dot(p, normal) = originOffset for any point p on the plane.
 */
export function normalizePlane(def: PlaneDefinition): NormalizedPlane {
  switch (def.kind) {
    case 'axis': {
      if (def.axis === 'x') {
        return { normal: [1, 0, 0], originOffset: def.position }
      }
      if (def.axis === 'y') {
        return { normal: [0, 1, 0], originOffset: def.position }
      }
      return { normal: [0, 0, 1], originOffset: def.position }
    }
    case 'normalPoint': {
      const normal = normalize3(def.normal)
      const originOffset = dot3(normal, def.point)
      return { normal, originOffset }
    }
    case 'face': {
      const normal = normalize3(def.normal)
      const originOffset = dot3(normal, def.origin)
      return { normal, originOffset }
    }
    case 'threePoints': {
      const v1: Vec3 = [
        def.p2[0] - def.p1[0],
        def.p2[1] - def.p1[1],
        def.p2[2] - def.p1[2],
      ]
      const v2: Vec3 = [
        def.p3[0] - def.p1[0],
        def.p3[1] - def.p1[1],
        def.p3[2] - def.p1[2],
      ]
      const normal = normalize3(cross3(v1, v2))
      const originOffset = dot3(normal, def.p1)
      return { normal, originOffset }
    }
  }
}

export type CutMode = 'both' | 'keepNegative' | 'keepPositive'

export interface CutResultPart {
  label: string
  manifold: Manifold
}

export class NotSolidError extends Error {
  constructor(message = 'cut.error.notSolid') {
    super(message)
    this.name = 'NotSolidError'
  }
}

/**
 * Cuts a solid Manifold by a plane.
 * Refuses open or invalid meshes.
 */
export function cutSolid(
  solid: Manifold,
  planeDef: PlaneDefinition,
  mode: CutMode = 'both'
): CutResultPart[] {
  if (solid.isEmpty() || solid.status() !== 'NoError') {
    throw new NotSolidError()
  }

  const { normal, originOffset } = normalizePlane(planeDef)

  if (mode === 'both') {
    const halves = solid.splitByPlane(normal, originOffset)
    // Manifold splitByPlane returns [positiveHalf, negativeHalf]
    // Return A = negative half (dot <= offset), B = positive half (dot >= offset)
    return [
      { label: 'A', manifold: halves[1] },
      { label: 'B', manifold: halves[0] },
    ]
  }

  if (mode === 'keepNegative') {
    const kept = solid.trimByPlane(normal, originOffset)
    return [{ label: 'A', manifold: kept }]
  }

  // keepPositive: flip normal and originOffset
  const invNormal: Vec3 = [-normal[0], -normal[1], -normal[2]]
  const invOffset = -originOffset
  const kept = solid.trimByPlane(invNormal, invOffset)
  return [{ label: 'B', manifold: kept }]
}

/**
 * Slices a solid along an axis into N equal parts.
 */
export function sliceSolidN(
  solid: Manifold,
  axis: 'x' | 'y' | 'z',
  count: number
): CutResultPart[] {
  if (count <= 1) {
    return [{ label: '1', manifold: solid }]
  }

  if (solid.isEmpty() || solid.status() !== 'NoError') {
    throw new NotSolidError()
  }

  const bbox = solid.boundingBox()
  const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const minVal = axisIdx === 0 ? bbox.min[0] : axisIdx === 1 ? bbox.min[1] : bbox.min[2]
  const maxVal = axisIdx === 0 ? bbox.max[0] : axisIdx === 1 ? bbox.max[1] : bbox.max[2]
  const span = maxVal - minVal

  if (span <= 1e-6) {
    return [{ label: '1', manifold: solid }]
  }

  const step = span / count
  const parts: CutResultPart[] = []
  let remainder = solid

  for (let i = 1; i < count; i++) {
    const cutPos = minVal + i * step
    const { normal, originOffset } = normalizePlane({
      kind: 'axis',
      axis,
      position: cutPos,
    })
    const halves = remainder.splitByPlane(normal, originOffset)
    // halves[1] is the slice <= cutPos, halves[0] is the remaining positive part >= cutPos
    parts.push({ label: `${i}`, manifold: halves[1] })
    remainder = halves[0]
  }

  parts.push({ label: `${count}`, manifold: remainder })
  return parts
}
