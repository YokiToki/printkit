import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { LinearPatternParams, CircularPatternParams } from '../../../editor/stack'

export const MAX_PATTERN_TRIS = 6_000_000

export interface PatternOpResult {
  solid?: Manifold
  error?: string
  errorParams?: Record<string, string | number>
}

export function applyLinearPattern(
  w: ManifoldToplevel,
  solid: Manifold,
  params: LinearPatternParams,
): PatternOpResult {
  if (solid.isEmpty()) {
    return { error: 'stack.error.targetEmpty' }
  }

  const count = Math.max(2, Math.min(200, Math.round(params.count)))
  const totalTris = solid.numTri() * count
  if (totalTris > MAX_PATTERN_TRIS) {
    return {
      error: 'stack.error.tooMany',
      errorParams: {
        limit: '6000000',
        count: totalTris,
      },
    }
  }

  const spacing = params.mode === 'total' ? params.step / (count - 1) : params.step

  const copies: Manifold[] = []
  for (let i = 0; i < count; i++) {
    const offset = params.symmetric ? (i - (count - 1) / 2) * spacing : i * spacing

    let trans: [number, number, number] = [0, 0, 0]
    if (params.axis === 'x') trans = [offset, 0, 0]
    else if (params.axis === 'y') trans = [0, offset, 0]
    else trans = [0, 0, offset]

    copies.push(solid.translate(trans))
  }

  let result: Manifold
  if (params.merge) {
    result = w.Manifold.union(copies)
    for (const c of copies) c.delete()
  } else {
    result = w.Manifold.compose(copies)
  }

  return { solid: result }
}

export function applyCircularPattern(
  w: ManifoldToplevel,
  solid: Manifold,
  params: CircularPatternParams,
): PatternOpResult {
  if (solid.isEmpty()) {
    return { error: 'stack.error.targetEmpty' }
  }

  const count = Math.max(2, Math.min(200, Math.round(params.count)))
  const totalTris = solid.numTri() * count
  if (totalTris > MAX_PATTERN_TRIS) {
    return {
      error: 'stack.error.tooMany',
      errorParams: {
        limit: '6000000',
        count: totalTris,
      },
    }
  }

  const angleStep = Math.abs(params.angle - 360) < 1e-6 ? 360 / count : params.angle / (count - 1)

  const copies: Manifold[] = []
  for (let i = 0; i < count; i++) {
    const angle = i * angleStep
    let rot: [number, number, number] = [0, 0, 0]
    if (params.axis === 'x') rot = [angle, 0, 0]
    else if (params.axis === 'y') rot = [0, angle, 0]
    else rot = [0, 0, angle]

    copies.push(solid.rotate(rot))
  }

  let result: Manifold
  if (params.merge) {
    result = w.Manifold.union(copies)
    for (const c of copies) c.delete()
  } else {
    result = w.Manifold.compose(copies)
  }

  return { solid: result }
}
