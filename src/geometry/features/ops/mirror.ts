import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { MirrorParams } from '../../../editor/stack'

export interface MirrorOpResult {
  solid?: Manifold
  error?: string
  errorParams?: Record<string, string | number>
}

export function applyMirror(
  w: ManifoldToplevel,
  solid: Manifold,
  params: MirrorParams,
): MirrorOpResult {
  if (solid.isEmpty()) {
    return { error: 'stack.error.targetEmpty' }
  }

  const bb = solid.boundingBox()
  let normal: [number, number, number] = [1, 0, 0]
  let coord = 0

  if (params.plane === 'YZ') {
    normal = [1, 0, 0]
    if (params.origin === 'bbox') {
      coord = (bb.min[0] + bb.max[0]) / 2
    } else if (typeof params.origin === 'number') {
      coord = params.origin
    }
  } else if (params.plane === 'XZ') {
    normal = [0, 1, 0]
    if (params.origin === 'bbox') {
      coord = (bb.min[1] + bb.max[1]) / 2
    } else if (typeof params.origin === 'number') {
      coord = params.origin
    }
  } else {
    // XY
    normal = [0, 0, 1]
    if (params.origin === 'bbox') {
      coord = (bb.min[2] + bb.max[2]) / 2
    } else if (typeof params.origin === 'number') {
      coord = params.origin
    }
  }

  const transNeg: [number, number, number] = [
    normal[0] * -coord,
    normal[1] * -coord,
    normal[2] * -coord,
  ]
  const transPos: [number, number, number] = [
    normal[0] * coord,
    normal[1] * coord,
    normal[2] * coord,
  ]

  const mirrored = solid
    .translate(transNeg)
    .mirror(normal)
    .translate(transPos)

  let result: Manifold
  if (params.merge) {
    result = solid.add(mirrored)
    mirrored.delete()
  } else {
    // Disjoint union
    result = w.Manifold.compose([solid.asOriginal(), mirrored])
  }

  return { solid: result }
}
