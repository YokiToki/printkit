import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { HollowParams, DrainHole } from '../../../editor/stack'
import { applyOffset } from './offset'

export interface HollowOpResult {
  solid?: Manifold
  error?: string
  errorParams?: Record<string, string | number>
}

function makeDrainCylinder(
  w: ManifoldToplevel,
  drain: DrainHole,
  length: number,
): Manifold {
  const r = Math.max(0.1, drain.diameter / 2)
  const [nx, ny, nz] = drain.normal
  const len = Math.hypot(nx, ny, nz)
  const normX = len > 1e-6 ? nx / len : 0
  const normY = len > 1e-6 ? ny / len : 0
  const normZ = len > 1e-6 ? nz / len : 1

  // Start cylinder centered around z=0: from -length/2 to +length/2
  const cyl = w.Manifold.cylinder(length, r, r, 24).translate([0, 0, -length / 2])

  // Align from +Z to [normX, normY, normZ]
  let oriented: Manifold
  if (Math.abs(normX) < 1e-6 && Math.abs(normY) < 1e-6) {
    if (normZ < 0) {
      oriented = cyl.rotate([180, 0, 0])
      cyl.delete()
    } else {
      oriented = cyl
    }
  } else {
    // Rotation axis = [0, 0, 1] x [normX, normY, normZ] = [-normY, normX, 0]
    // Axis angle rotation:
    const angleRad = Math.acos(Math.max(-1, Math.min(1, normZ)))
    const angleDeg = (angleRad * 180) / Math.PI

    // Rotation around Z first to azimuth, then around Y to polar, etc.
    const yaw = (Math.atan2(normY, normX) * 180) / Math.PI
    const pitch = (Math.acos(Math.max(-1, Math.min(1, normZ))) * 180) / Math.PI

    // Rotate cyl by pitch around Y, then yaw around Z
    oriented = cyl.rotate([0, pitch, yaw])
    cyl.delete()
  }

  // Translate to drain point
  const placed = oriented.translate(drain.point)
  oriented.delete()
  return placed
}

export function applyHollow(
  w: ManifoldToplevel,
  solid: Manifold,
  params: HollowParams,
  segments: number = 16,
): HollowOpResult {
  if (solid.isEmpty()) {
    return { error: 'stack.error.targetEmpty' }
  }

  const wall = params.wall
  if (wall <= 0) {
    return {
      error: 'stack.error.wallTooThick',
      errorParams: { wall },
    }
  }

  // Cavity is offset by -wall
  const cavityRes = applyOffset(w, solid, { distance: -wall }, segments)
  if (cavityRes.error || !cavityRes.solid) {
    return {
      error: 'stack.error.wallTooThick',
      errorParams: { wall },
    }
  }

  const cavity = cavityRes.solid
  let hollowBody = solid.subtract(cavity)
  cavity.delete()

  if (params.drains && params.drains.length > 0) {
    const bb = solid.boundingBox()
    const maxDim = Math.max(
      bb.max[0] - bb.min[0],
      bb.max[1] - bb.min[1],
      bb.max[2] - bb.min[2],
    )
    const drainLength = Math.max(20, maxDim * 2)

    for (const d of params.drains) {
      const drainCyl = makeDrainCylinder(w, d, drainLength)
      const afterDrain = hollowBody.subtract(drainCyl)
      drainCyl.delete()
      hollowBody.delete()
      hollowBody = afterDrain
    }
  }

  return { solid: hollowBody }
}
