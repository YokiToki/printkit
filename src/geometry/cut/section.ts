import type { CrossSection, Manifold } from 'manifold-3d'
import { normalizePlane, type PlaneDefinition, type Vec3 } from './plane'

export interface PlaneFrame {
  origin: Vec3
  u: Vec3
  v: Vec3
  normal: Vec3
  toWorld: (p: [number, number], zOffset?: number) => Vec3
  toPlane: (p: Vec3) => [number, number]
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
 * Builds an orthonormal frame on the plane such that:
 * - normal is the plane normal
 * - u, v lie in the plane
 * - origin is the closest point on the plane to (0,0,0) (i.e. normal * originOffset)
 */
export function buildPlaneFrame(normal: Vec3, originOffset: number): PlaneFrame {
  const n = normalize3(normal)
  const origin: Vec3 = [n[0] * originOffset, n[1] * originOffset, n[2] * originOffset]

  // Choose an arbitrary vector not parallel to n
  const ref: Vec3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]
  const u = normalize3(cross3(ref, n))
  const v = normalize3(cross3(n, u))

  return {
    origin,
    u,
    v,
    normal: n,
    toWorld: (pt, zOffset = 0) => [
      origin[0] + pt[0] * u[0] + pt[1] * v[0] + zOffset * n[0],
      origin[1] + pt[0] * u[1] + pt[1] * v[1] + zOffset * n[1],
      origin[2] + pt[0] * u[2] + pt[1] * v[2] + zOffset * n[2],
    ],
    toPlane: (p) => {
      const rel: Vec3 = [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]]
      return [dot3(rel, u), dot3(rel, v)]
    },
  }
}

export interface CutSectionResult {
  frame: PlaneFrame
  crossSection: CrossSection
  polygons: [number, number][][]
  area: number
  isEmpty: boolean
}

/**
 * Computes the 2D cross section of a solid at the given cutting plane,
 * expressed in the plane's (u, v) coordinates.
 */
export function getCutSection(
  solid: Manifold,
  planeDef: PlaneDefinition
): CutSectionResult {
  const { normal, originOffset } = normalizePlane(planeDef)
  const frame = buildPlaneFrame(normal, originOffset)

  // 4x4 Column-major transformation matrix mapping World -> Plane Frame coordinates
  const tx = -dot3(frame.origin, frame.u)
  const ty = -dot3(frame.origin, frame.v)
  const tz = -dot3(frame.origin, frame.normal)

  const mat: number[] = [
    frame.u[0], frame.v[0], frame.normal[0], 0,
    frame.u[1], frame.v[1], frame.normal[1], 0,
    frame.u[2], frame.v[2], frame.normal[2], 0,
    tx, ty, tz, 1,
  ]

  // Transform solid into plane frame and slice at z = 0
  const transformed = solid.transform(mat)
  const crossSection = transformed.slice(0)
  const rawPolygons = crossSection.toPolygons()

  // Convert raw polygons to typed arrays
  const polygons: [number, number][][] = []
  for (const loop of rawPolygons) {
    const pts: [number, number][] = []
    for (let i = 0; i < loop.length; i++) {
      pts.push([loop[i][0], loop[i][1]])
    }
    polygons.push(pts)
  }

  return {
    frame,
    crossSection,
    polygons,
    area: crossSection.area(),
    isEmpty: crossSection.isEmpty(),
  }
}

/**
 * Computes inset of a cross section by a margin distance (in mm).
 */
export function insetSection(
  crossSection: CrossSection,
  margin: number
): { crossSection: CrossSection; polygons: [number, number][][]; isEmpty: boolean } {
  if (margin <= 1e-6) {
    const polys = crossSection.toPolygons().map((loop) =>
      loop.map((p) => [p[0], p[1]] as [number, number])
    )
    return {
      crossSection,
      polygons: polys,
      isEmpty: crossSection.isEmpty(),
    }
  }

  const inset = crossSection.offset(-margin)
  const polys = inset.toPolygons().map((loop) =>
    loop.map((p) => [p[0], p[1]] as [number, number])
  )
  return {
    crossSection: inset,
    polygons: polys,
    isEmpty: inset.isEmpty(),
  }
}
