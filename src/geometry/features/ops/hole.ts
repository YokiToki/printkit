import type { Manifold, ManifoldToplevel, Mat4 } from 'manifold-3d'
import {
  METRIC_THREADS,
  SCREW_CLEARANCE,
  DIN912_HEADS,
  ISO7380_HEADS,
  COUNTERSINK_90,
  HEAT_INSERTS,
  MAGNET_PRESETS,
  type MetricThread,
  type ClearanceFit,
} from '../../holeSpec'

export type HoleKind = 'simple' | 'counterbore' | 'countersink' | 'magnet' | 'insert'

export interface HoleParams {
  point: [number, number, number] // in object-local space
  normal: [number, number, number] // outward normal
  up?: [number, number, number]
  kind: HoleKind
  diameter: number // shank / hole diameter
  depth?: number // blind hole depth, mm
  through?: boolean // if true, extends through entire solid
  cbDiameter?: number // counterbore diameter
  cbDepth?: number // counterbore depth
  csDiameter?: number // countersink diameter
  csAngle?: number // degrees, default 90
  preset?: string
  fit?: ClearanceFit
  headType?: 'din912' | 'iso7380'
  tolerance?: number
}

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len < 1e-9) return [0, 0, 1]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function cross3(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/**
 * Builds a 4x4 matrix mapping tool local space (z pointing along -normal, starting at entry surface)
 * to target object-local space.
 */
function holeToWorldMatrix(
  point: [number, number, number],
  normal: [number, number, number],
  suggestedUp?: [number, number, number]
): Mat4 {
  const n = normalize3(normal)
  // Tool z-axis goes in the direction of the drill (-normal)
  const zAxis: [number, number, number] = [-n[0], -n[1], -n[2]]

  const ref: [number, number, number] =
    suggestedUp ?? (Math.abs(zAxis[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0])
  const xAxis = normalize3(cross3(ref, zAxis))
  const yAxis = normalize3(cross3(zAxis, xAxis))

  // 4x4 column-major matrix
  return [
    xAxis[0], xAxis[1], xAxis[2], 0,
    yAxis[0], yAxis[1], yAxis[2], 0,
    zAxis[0], zAxis[1], zAxis[2], 0,
    point[0], point[1], point[2], 1,
  ]
}

/**
 * Builds the cutter tool solid for a hole operation.
 * In tool-local space: z = 0 is the surface, z > 0 goes into the material (along -normal).
 * Overshoot of 0.2 mm is added above the surface (z = -0.2) to prevent coplanar z-fighting.
 */
export function buildHoleTool(
  w: ManifoldToplevel,
  params: HoleParams,
  targetDiagonal = 100
): Manifold {
  const OVERSHOOT = 0.2 // mm above surface
  const segs = 32

  // Determine hole depth
  const holeDepth = params.through
    ? targetDiagonal + OVERSHOOT * 2
    : Math.max(0.1, params.depth ?? 10)

  let toolSolid: Manifold

  switch (params.kind) {
    case 'simple': {
      const radius = params.diameter / 2
      const totalLen = holeDepth + OVERSHOOT
      // cylinder from z = 0 to totalLen
      const cyl = w.Manifold.cylinder(totalLen, radius, radius, segs, false)
      // shift by -OVERSHOOT so it starts at z = -OVERSHOOT
      toolSolid = cyl.translate([0, 0, -OVERSHOOT])
      break
    }

    case 'counterbore': {
      const shankRadius = params.diameter / 2
      const cbRadius = (params.cbDiameter ?? params.diameter * 1.8) / 2
      const cbDepth = params.cbDepth ?? 3.0

      // 1. Counterbore top cylinder (from -OVERSHOOT to cbDepth)
      const topLen = cbDepth + OVERSHOOT
      const topCyl = w.Manifold.cylinder(topLen, cbRadius, cbRadius, segs, false).translate([0, 0, -OVERSHOOT])

      // 2. Shank cylinder below counterbore (from cbDepth to holeDepth)
      const shankLen = Math.max(0.1, holeDepth - cbDepth)
      const shankCyl = w.Manifold.cylinder(shankLen, shankRadius, shankRadius, segs, false).translate([0, 0, cbDepth])

      toolSolid = w.Manifold.union(topCyl, shankCyl)
      break
    }

    case 'countersink': {
      const shankRadius = params.diameter / 2
      const csRadius = (params.csDiameter ?? params.diameter * 2) / 2
      const angle = params.csAngle ?? 90
      const halfAngleRad = (angle / 2) * (Math.PI / 180)

      // Depth of conical portion from surface: (csRadius - shankRadius) / tan(halfAngle)
      const coneDepth = Math.max(0.1, (csRadius - shankRadius) / Math.tan(halfAngleRad))

      // Overshoot cone from z = -OVERSHOOT with radius expanded by OVERSHOOT * tan(halfAngle)
      const topOvershootRadius = csRadius + OVERSHOOT * Math.tan(halfAngleRad)
      const totalConeLen = coneDepth + OVERSHOOT

      // cylinder(height, radiusLow, radiusHigh):
      // in our local z: z=-OVERSHOOT has topOvershootRadius, z=coneDepth has shankRadius
      const cone = w.Manifold.cylinder(totalConeLen, topOvershootRadius, shankRadius, segs, false).translate([0, 0, -OVERSHOOT])

      // Shank cylinder below cone
      const shankLen = Math.max(0.1, holeDepth - coneDepth)
      const shankCyl = w.Manifold.cylinder(shankLen, shankRadius, shankRadius, segs, false).translate([0, 0, coneDepth])

      toolSolid = w.Manifold.union(cone, shankCyl)
      break
    }

    case 'magnet':
    case 'insert': {
      const radius = params.diameter / 2
      const totalLen = holeDepth + OVERSHOOT
      const cyl = w.Manifold.cylinder(totalLen, radius, radius, segs, false)
      toolSolid = cyl.translate([0, 0, -OVERSHOOT])
      break
    }
  }

  // Transform tool solid into object space
  const mat = holeToWorldMatrix(params.point, params.normal, params.up)
  return toolSolid.transform(mat)
}

/**
 * Applies a hole operation to target solid by subtracting the hole tool solid.
 */
export function applyHole(
  w: ManifoldToplevel,
  target: Manifold,
  params: HoleParams
): { solid?: Manifold; error?: string } {
  if (target.isEmpty() || target.status() !== 'NoError') {
    return { error: 'stack.error.notSolid' }
  }

  const bbox = target.boundingBox()
  const dx = bbox.max[0] - bbox.min[0]
  const dy = bbox.max[1] - bbox.min[1]
  const dz = bbox.max[2] - bbox.min[2]
  const diag = Math.hypot(dx, dy, dz)

  const tool = buildHoleTool(w, params, diag * 1.5)
  const result = target.subtract(tool)
  tool.delete()

  if (result.status() !== 'NoError') {
    result.delete()
    return { error: 'hole.error.cutFailed' }
  }

  return { solid: result }
}
