import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { CutGroup } from '../../editor/cuts'
import { cutSolid, sliceSolidN } from './plane'
import { splitSolidGrid } from './split'
import { getCutSection } from './section'
import { applyCutConnectors } from './connectors'

export interface EvaluatedPart {
  label: string
  solid: Manifold
  oversize?: boolean
}

export interface EvaluatedGroupResult {
  parts: EvaluatedPart[]
  loosePins?: Manifold[]
}

let cacheHitCount = 0

export function getCutGroupCacheHitCount(): number {
  return cacheHitCount
}

export function resetCutGroupCacheHitCount(): void {
  cacheHitCount = 0
}

const groupSolidsCache = new Map<string, EvaluatedGroupResult>()

export function clearCutGroupCache(): void {
  for (const res of groupSolidsCache.values()) {
    for (const p of res.parts) {
      try {
        p.solid.delete()
      } catch {
        // already deleted
      }
    }
    if (res.loosePins) {
      for (const pin of res.loosePins) {
        try {
          pin.delete()
        } catch {
          // already deleted
        }
      }
    }
  }
  groupSolidsCache.clear()
  cacheHitCount = 0
}

function cloneResult(res: EvaluatedGroupResult): EvaluatedGroupResult {
  return {
    parts: res.parts.map((p) => ({
      label: p.label,
      solid: p.solid.asOriginal(),
      oversize: p.oversize,
    })),
    loosePins: res.loosePins?.map((pin) => pin.asOriginal()),
  }
}

/**
 * Evaluates a CutGroup on a given sourceSolid.
 * Slices or splits the solid, applies connectors if configured, and caches the result.
 */
export async function evaluateCutGroup(
  w: ManifoldToplevel,
  sourceSolid: Manifold,
  group: CutGroup,
  sourceSignature = ''
): Promise<EvaluatedGroupResult> {
  const cacheKey = `${group.id}:${JSON.stringify(group)}:${sourceSignature}`

  const cached = groupSolidsCache.get(cacheKey)
  if (cached) {
    cacheHitCount++
    return cloneResult(cached)
  }

  let parts: EvaluatedPart[] = []
  let loosePins: Manifold[] | undefined

  if (group.type === 'grid') {
    const grid = group.grid ?? { x: [], y: [], z: [] }
    const margin = group.bed?.margin ?? 5
    const bedWidth = (group.bed?.width ?? 256) - margin * 2
    const bedDepth = (group.bed?.depth ?? 256) - margin * 2
    const bed = { x: bedWidth, y: bedDepth, z: 256 }
    const splitParts = splitSolidGrid(sourceSolid, grid, bed)
    parts = splitParts.map((p) => ({
      label: p.label,
      solid: p.manifold,
      oversize: p.oversize,
    }))
  } else {
    // Plane cut
    const planeDef =
      group.plane?.plane ?? { kind: 'axis', axis: 'z', position: 0 }
    const mode = group.plane?.mode ?? 'both'

    if (mode === 'both') {
      const cutParts = cutSolid(sourceSolid, planeDef, 'both')
      const partA = cutParts.find((p) => p.label === 'A')?.manifold
      const partB = cutParts.find((p) => p.label === 'B')?.manifold

      if (partA && partB && group.connector && (group.connector.positions?.length ?? 0) > 0) {
        const cutSec = getCutSection(sourceSolid, planeDef)
        const connRes = await applyCutConnectors(
          partA,
          partB,
          cutSec.frame,
          cutSec.polygons,
          group.connector
        )
        cutSec.crossSection.delete()
        parts = [
          { label: 'A', solid: connRes.partA },
          { label: 'B', solid: connRes.partB },
        ]
        loosePins = connRes.loosePins
      } else {
        parts = [
          ...(partA ? [{ label: 'A', solid: partA }] : []),
          ...(partB ? [{ label: 'B', solid: partB }] : []),
        ]
      }
    } else if (mode === 'keepNegative') {
      const cutParts = cutSolid(sourceSolid, planeDef, 'keepNegative')
      parts = cutParts.map((p) => ({ label: p.label, solid: p.manifold }))
    } else if (mode === 'keepPositive') {
      const cutParts = cutSolid(sourceSolid, planeDef, 'keepPositive')
      parts = cutParts.map((p) => ({ label: p.label, solid: p.manifold }))
    } else if (mode === 'slice') {
      const count = group.plane?.sliceCount ?? 2
      const axis = planeDef.kind === 'axis' ? planeDef.axis : 'z'
      const sliced = sliceSolidN(sourceSolid, axis, count)
      parts = sliced.map((s) => ({
        label: s.label,
        solid: s.manifold,
      }))
    }
  }

  const result: EvaluatedGroupResult = { parts, loosePins }

  // Store clones in cache so callers can safely mutate or delete their returned solids
  groupSolidsCache.set(cacheKey, cloneResult(result))

  return result
}
