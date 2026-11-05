import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { OffsetParams } from '../../../editor/stack'

export const MAX_OFFSET_BODY_TRIS = 200_000

export interface OffsetOpResult {
  solid?: Manifold
  error?: string
  errorParams?: Record<string, string | number>
}

export function applyOffset(
  w: ManifoldToplevel,
  solid: Manifold,
  params: OffsetParams,
  segments: number = 16,
): OffsetOpResult {
  if (solid.isEmpty()) {
    return { error: 'stack.error.targetEmpty' }
  }

  const d = params.distance
  if (Math.abs(d) < 1e-6) {
    return { solid: solid.asOriginal() }
  }

  const tris = solid.numTri()
  if (tris > MAX_OFFSET_BODY_TRIS || tris * segments > 5_000_000) {
    return {
      error: 'stack.error.tooManyTriangles',
      errorParams: {
        limit: `${MAX_OFFSET_BODY_TRIS}`,
        count: `${tris}`,
      },
    }
  }

  const radius = Math.abs(d)
  const sphere = w.Manifold.sphere(radius, segments)

  let result: Manifold
  try {
    if (d > 0) {
      result = solid.minkowskiSum(sphere)
    } else {
      result = solid.minkowskiDifference(sphere)
    }
  } catch {
    sphere.delete()
    return { error: 'stack.error.offsetEmpty' }
  } finally {
    sphere.delete()
  }

  if (result.isEmpty() || result.status() !== 'NoError' || result.volume() <= 1e-6) {
    result.delete()
    return { error: 'stack.error.offsetEmpty' }
  }

  return { solid: result }
}
