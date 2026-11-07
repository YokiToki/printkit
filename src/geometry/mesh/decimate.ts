import type { ManifoldToplevel } from 'manifold-3d'
import { toManifold, type IndexedMesh, type TriSoup } from '../stl-import'
import { analyze } from './analyze'
import { weld } from './weld'

export interface DecimateOptions {
  /** Target triangle ratio between 0 and 1 (e.g. 0.5 for 50%) */
  targetRatio?: number
  /** Direct target triangle count */
  targetTriangles?: number
  /** Direct tolerance in mm. If provided, skips bisection */
  tolerance?: number
  /** Maximum bisection iterations. Default: 8 */
  maxBisections?: number
}

export interface DecimateReport {
  initialTriangles: number
  finalTriangles: number
  tolerance: number
  maxDeviation: number
  bisectionCount: number
}

export class DecimateNonManifoldError extends Error {
  constructor(message?: string) {
    super(message ?? 'Mesh is not a closed manifold solid. Auto repair first.')
    this.name = 'DecimateNonManifoldError'
  }
}

/**
 * Decimates a closed manifold mesh to a target ratio or tolerance using Manifold.simplify.
 * Refuses non-manifold / open meshes.
 */
export function decimate(
  w: ManifoldToplevel,
  mesh: TriSoup | IndexedMesh,
  options: DecimateOptions = {}
): { mesh: IndexedMesh; report: DecimateReport } {
  const welded = 'triVerts' in mesh ? mesh : weld(mesh).mesh

  // Health check: must be solid and manifold
  const health = analyze(welded)
  if (!health.isSolid) {
    throw new DecimateNonManifoldError()
  }

  const initialTriangles = welded.triVerts.length / 3

  // Load into Manifold
  const solid = toManifold(w, welded)

  if (options.tolerance !== undefined) {
    const dec = solid.simplify(options.tolerance)
    const outMesh = dec.getMesh()
    return {
      mesh: { vertProperties: outMesh.vertProperties, triVerts: outMesh.triVerts },
      report: {
        initialTriangles,
        finalTriangles: outMesh.numTri,
        tolerance: options.tolerance,
        maxDeviation: options.tolerance,
        bisectionCount: 1,
      },
    }
  }

  // Bisection search for tolerance
  const target = options.targetTriangles ?? Math.max(4, Math.round(initialTriangles * (options.targetRatio ?? 0.5)))
  let tolMin = 0.0001
  let tolMax = 5.0
  let bestTol = tolMin
  let bisections = 0
  const maxIters = options.maxBisections ?? 8

  for (let i = 0; i < maxIters; i++) {
    bisections++
    const mid = (tolMin + tolMax) / 2
    const simplified = solid.simplify(mid)
    const count = simplified.numTri()
    bestTol = mid

    if (count > target) {
      tolMin = mid
    } else {
      tolMax = mid
    }
  }

  const finalSolid = solid.simplify(bestTol)
  const finalMesh = finalSolid.getMesh()

  return {
    mesh: { vertProperties: finalMesh.vertProperties, triVerts: finalMesh.triVerts },
    report: {
      initialTriangles,
      finalTriangles: finalMesh.numTri,
      tolerance: bestTol,
      maxDeviation: bestTol,
      bisectionCount: bisections,
    },
  }
}
