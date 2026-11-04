import type { Manifold } from 'manifold-3d'
import type { Sketch } from '../../editor/sketch/model'
import { buildExtrude, type EdgeBreak, type ExtrudeParams } from './extrude'
import { buildRevolve, type RevolveParams } from './revolve'

export interface BaseFeature {
  id?: string
  sketch: string
  sketchId?: string
  op: 'new' | 'join' | 'cut' | 'intersect'
}

export interface ExtrudeFeature extends BaseFeature {
  kind: 'extrude'
  regions?: 'all' | string[]
  side: 'one' | 'symmetric' | 'two'
  d1: number
  d2?: number
  top?: EdgeBreak
  bottom?: EdgeBreak
}

export interface RevolveFeature extends BaseFeature {
  kind: 'revolve'
  regions?: 'all' | string[]
  axis:
    | { kind: 'line'; curve?: string; curveId?: string }
    | { kind: 'planeAxis'; axis: 'x' | 'y' }
  angle: number
}

export type Feature = ExtrudeFeature | RevolveFeature

export interface EvaluateFeaturesResult {
  solid?: Manifold
  failedIndex?: number
  failedReason?: string
  warning?: string
}

export async function evaluateFeatures(
  features: Feature[],
  sketches: Sketch[] | Record<string, Sketch>,
  quality: 'coarse' | 'fine' = 'fine',
): Promise<EvaluateFeaturesResult> {
  if (features.length === 0) {
    return {}
  }

  // Build sketch lookup map
  const sketchMap = new Map<string, Sketch>()
  if (Array.isArray(sketches)) {
    for (const s of sketches) {
      sketchMap.set(s.id, s)
    }
  } else if (sketches && typeof sketches === 'object') {
    for (const [id, s] of Object.entries(sketches)) {
      sketchMap.set(id, s)
    }
  }

  const options =
    quality === 'coarse'
      ? { chordTolerance: 0.5, segments: 24, circleSegments: 24 }
      : { chordTolerance: 0.1, segments: 64, circleSegments: 64 }

  let currentSolid: Manifold | undefined
  let lastWarning: string | undefined

  for (let i = 0; i < features.length; i++) {
    const f = features[i]
    if (i === 0 && f.op !== 'new') {
      return {
        solid: currentSolid,
        failedIndex: 0,
        failedReason: 'sketch.error.firstFeatureMustBeNew',
      }
    }

    const sketchId = f.sketch || f.sketchId
    const sketch = sketchId ? sketchMap.get(sketchId) : undefined
    if (!sketch) {
      return {
        solid: currentSolid,
        failedIndex: i,
        failedReason: 'sketch.error.sketchNotFound',
      }
    }

    // Check if sketch has curves
    if (Object.keys(sketch.curves).length === 0) {
      return {
        solid: currentSolid,
        failedIndex: i,
        failedReason: 'sketch.error.emptySketch',
      }
    }

    let featureSolid: Manifold | undefined

    if (f.kind === 'extrude') {
      const extrudeParams: ExtrudeParams = {
        sketchId,
        regions: f.regions,
        side: f.side,
        d1: f.d1,
        d2: f.d2,
        op: f.op,
        top: f.top,
        bottom: f.bottom,
      }
      const res = await buildExtrude(sketch, extrudeParams, options)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid,
          failedIndex: i,
          failedReason: res.error || 'sketch.error.featureFailed',
          warning: res.warning ?? lastWarning,
        }
      }
      featureSolid = res.solid
      if (res.warning) lastWarning = res.warning
    } else if (f.kind === 'revolve') {
      const axis =
        f.axis.kind === 'line'
          ? { kind: 'line' as const, curveId: f.axis.curveId || f.axis.curve || '' }
          : f.axis
      const revolveParams: RevolveParams = {
        sketchId,
        regions: f.regions,
        axis,
        angle: f.angle,
        op: f.op,
      }
      const res = await buildRevolve(sketch, revolveParams, options)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid,
          failedIndex: i,
          failedReason: res.error || 'sketch.error.featureFailed',
          warning: lastWarning,
        }
      }
      featureSolid = res.solid
    } else {
      return {
        solid: currentSolid,
        failedIndex: i,
        failedReason: 'sketch.error.unknownFeatureKind',
      }
    }

    // Combine featureSolid with currentSolid
    if (i === 0 || !currentSolid) {
      currentSolid = featureSolid
    } else {
      let combined: Manifold
      if (f.op === 'new') {
        currentSolid.delete()
        currentSolid = featureSolid
      } else if (f.op === 'join') {
        combined = currentSolid.add(featureSolid)
        currentSolid.delete()
        featureSolid.delete()
        currentSolid = combined
      } else if (f.op === 'cut') {
        combined = currentSolid.subtract(featureSolid)
        currentSolid.delete()
        featureSolid.delete()
        currentSolid = combined
      } else if (f.op === 'intersect') {
        combined = currentSolid.intersect(featureSolid)
        currentSolid.delete()
        featureSolid.delete()
        currentSolid = combined
      }
    }
  }

  return { solid: currentSolid, warning: lastWarning }
}
