import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { Sketch } from '../../editor/sketch/model'
import type { Mat4 } from '../matrix'
import type { MeshHealth } from '../../editor/health'
import type { Op, BooleanParams, ExtrudeOp, RevolveOp, MirrorOp, LinearPatternOp, CircularPatternOp, OffsetOp, HollowOp } from '../../editor/stack'
import { featureToOp } from '../../editor/stack'
import { buildExtrude, type EdgeBreak, type ExtrudeParams } from './extrude'
import { buildRevolve, type RevolveParams } from './revolve'
import { applyBoolean, type ToolOperand } from './ops/boolean'
import { applyMirror } from './ops/mirror'
import { applyLinearPattern, applyCircularPattern } from './ops/pattern'
import { applyOffset } from './ops/offset'
import { applyHollow } from './ops/hollow'
import { identityMat4, relativeMatrix } from '../matrix'
import { PrefixCache } from './cache'

export { PrefixCache }

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

export interface ToolObjectInfo {
  solid: Manifold
  matrix: Mat4
  name: string
  health?: MeshHealth
  signature?: string
}

export interface EvaluationContext {
  w: ManifoldToplevel
  targetId?: string
  sourceKey?: string
  sketches?: Sketch[] | Record<string, Sketch> | Map<string, Sketch>
  targetMatrix?: Mat4
  toolObjects?: Map<string, ToolObjectInfo>
  quality?: 'coarse' | 'fine'
  cache?: PrefixCache
  onRecomputeOp?: (opIndex: number) => void
}

export interface EvaluateStackResult {
  solid?: Manifold
  failedIndex?: number
  failedOpId?: string
  failedReason?: string
  failedParams?: Record<string, string | number>
  warning?: string
  recomputedCount?: number
}

function computeStepKey(
  prefixKey: string,
  op: Op,
  ctx: EvaluationContext,
  sketchMap: Map<string, Sketch>,
): string {
  let extraKey = ''
  if (op.kind === 'boolean') {
    const targetMatKey = ctx.targetMatrix?.join(',') ?? ''
    const toolsKey =
      (op as any).params.tools
        ?.map((tId: string) => {
          const tObj = ctx.toolObjects?.get(tId)
          return `${tId}:mat=${tObj?.matrix?.join(',') ?? ''}:sig=${tObj?.signature ?? ''}`
        })
        .join(';') ?? ''
    extraKey = `targetMat=${targetMatKey}|tools=${toolsKey}`
  } else if (op.kind === 'extrude' || op.kind === 'revolve') {
    const sketchId = (op as any).params.sketchId
    const s = sketchId ? sketchMap.get(sketchId) : undefined
    if (s) {
      extraKey = `sketch=${JSON.stringify(s)}`
    }
  }

  return `${prefixKey}|op:${op.id}:${op.kind}:${JSON.stringify(op.params)}:${op.enabled}:${extraKey}`
}

export async function evaluateStack(
  initialSolid: Manifold | null,
  ops: Op[],
  rollback: number | null | undefined,
  ctx: EvaluationContext,
): Promise<EvaluateStackResult> {
  const { w, targetId = 'obj', quality = 'fine', cache } = ctx

  const sketchMap = new Map<string, Sketch>()
  if (ctx.sketches) {
    if (ctx.sketches instanceof Map) {
      for (const [k, v] of ctx.sketches.entries()) sketchMap.set(k, v)
    } else if (Array.isArray(ctx.sketches)) {
      for (const s of ctx.sketches) sketchMap.set(s.id, s)
    } else {
      for (const [k, v] of Object.entries(ctx.sketches)) sketchMap.set(k, v)
    }
  }

  const options =
    quality === 'coarse'
      ? { chordTolerance: 0.5, segments: 24, circleSegments: 24 }
      : { chordTolerance: 0.1, segments: 64, circleSegments: 64 }

  const sphereSegments = quality === 'coarse' ? 16 : 24

  // Limit ops by rollback index
  const effectiveOps =
    rollback !== null && rollback !== undefined && rollback >= 0 && rollback < ops.length
      ? ops.slice(0, rollback)
      : ops

  let baseKey = `obj:${targetId}:src=${ctx.sourceKey ?? ''}:q=${quality}`
  let currentSolid: Manifold | null = initialSolid ? initialSolid.asOriginal() : null
  let lastWarning: string | undefined
  let recomputedCount = 0

  // Longest cached prefix search
  let startIndex = 0
  if (cache) {
    // Check if initial solid can be cached
    const initKey = `${baseKey}:init`
    if (initialSolid) {
      const cachedInit = cache.get(initKey)
      if (cachedInit) {
        if (currentSolid) currentSolid.delete()
        currentSolid = cachedInit.asOriginal()
      } else {
        cache.set(initKey, initialSolid)
      }
    }

    let prefixKey = initKey
    for (let i = 0; i < effectiveOps.length; i++) {
      const op = effectiveOps[i]
      const stepKey = computeStepKey(prefixKey, op, ctx, sketchMap)
      const cachedSolid = cache.get(stepKey)
      if (cachedSolid && startIndex === i) {
        if (currentSolid) currentSolid.delete()
        currentSolid = cachedSolid.asOriginal()
        startIndex = i + 1
        prefixKey = stepKey
      } else {
        break
      }
    }
  }

  // Evaluate remaining ops
  let prefixKey = `${baseKey}:init`
  for (let i = 0; i < startIndex; i++) {
    prefixKey = computeStepKey(prefixKey, effectiveOps[i], ctx, sketchMap)
  }

  for (let i = startIndex; i < effectiveOps.length; i++) {
    const op = effectiveOps[i]
    recomputedCount++
    if (ctx.onRecomputeOp) ctx.onRecomputeOp(i)

    if (!op.enabled) {
      // Disabled op: solid passes through unchanged
      prefixKey = computeStepKey(prefixKey, op, ctx, sketchMap)
      if (cache && currentSolid) {
        cache.set(prefixKey, currentSolid)
      }
      continue
    }

    let nextSolid: Manifold | undefined

    if (op.kind === 'extrude') {
      const p = (op as ExtrudeOp).params
      if (i === 0 && !currentSolid && p.op !== 'new') {
        return {
          solid: currentSolid ?? undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'sketch.error.firstFeatureMustBeNew',
          recomputedCount,
        }
      }
      const sketch = p.sketchId ? sketchMap.get(p.sketchId) : undefined
      if (!sketch) {
        return {
          solid: currentSolid ?? undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'sketch.error.sketchNotFound',
          recomputedCount,
        }
      }
      if (Object.keys(sketch.curves).length === 0) {
        return {
          solid: currentSolid ?? undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'sketch.error.emptySketch',
          recomputedCount,
        }
      }
      const res = await buildExtrude(sketch, p, options)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid ?? undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: res.error || 'sketch.error.featureFailed',
          warning: res.warning ?? lastWarning,
          recomputedCount,
        }
      }
      if (res.warning) lastWarning = res.warning

      if (!currentSolid || p.op === 'new') {
        if (currentSolid) currentSolid.delete()
        nextSolid = res.solid
      } else if (p.op === 'join') {
        nextSolid = currentSolid.add(res.solid)
        currentSolid.delete()
        res.solid.delete()
      } else if (p.op === 'cut') {
        nextSolid = currentSolid.subtract(res.solid)
        currentSolid.delete()
        res.solid.delete()
      } else if (p.op === 'intersect') {
        nextSolid = currentSolid.intersect(res.solid)
        currentSolid.delete()
        res.solid.delete()
      }
    } else if (op.kind === 'revolve') {
      const p = (op as RevolveOp).params
      if (i === 0 && !currentSolid && p.op !== 'new') {
        return {
          solid: currentSolid ?? undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'sketch.error.firstFeatureMustBeNew',
          recomputedCount,
        }
      }
      const sketch = p.sketchId ? sketchMap.get(p.sketchId) : undefined
      if (!sketch) {
        return {
          solid: currentSolid ?? undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'sketch.error.sketchNotFound',
          recomputedCount,
        }
      }
      const res = await buildRevolve(sketch, p, options)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid ?? undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: res.error || 'sketch.error.featureFailed',
          warning: lastWarning,
          recomputedCount,
        }
      }

      if (!currentSolid || p.op === 'new') {
        if (currentSolid) currentSolid.delete()
        nextSolid = res.solid
      } else if (p.op === 'join') {
        nextSolid = currentSolid.add(res.solid)
        currentSolid.delete()
        res.solid.delete()
      } else if (p.op === 'cut') {
        nextSolid = currentSolid.subtract(res.solid)
        currentSolid.delete()
        res.solid.delete()
      } else if (p.op === 'intersect') {
        nextSolid = currentSolid.intersect(res.solid)
        currentSolid.delete()
        res.solid.delete()
      }
    } else if (op.kind === 'boolean') {
      if (!currentSolid) {
        return {
          solid: undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'stack.error.targetEmpty',
          recomputedCount,
        }
      }
      const p = (op as any).params as BooleanParams
      const toolOperands: ToolOperand[] = []
      const targetMat = ctx.targetMatrix ?? identityMat4()

      for (const toolId of p.tools) {
        const toolInfo = ctx.toolObjects?.get(toolId)
        if (!toolInfo) {
          return {
            solid: currentSolid,
            failedIndex: i,
            failedOpId: op.id,
            failedReason: 'stack.error.toolMissing',
            failedParams: { id: toolId },
            recomputedCount,
          }
        }
        toolOperands.push({
          id: toolId,
          name: toolInfo.name,
          solid: toolInfo.solid,
          relativeMatrix: relativeMatrix(targetMat, toolInfo.matrix),
          health: toolInfo.health,
        })
      }

      const res = applyBoolean(currentSolid, p, toolOperands)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: res.error || 'stack.error.booleanFailed',
          failedParams: res.errorParams,
          recomputedCount,
        }
      }
      currentSolid.delete()
      nextSolid = res.solid
    } else if (op.kind === 'mirror') {
      if (!currentSolid) {
        return {
          solid: undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'stack.error.targetEmpty',
          recomputedCount,
        }
      }
      const res = applyMirror(w, currentSolid, (op as MirrorOp).params)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: res.error,
          failedParams: res.errorParams,
          recomputedCount,
        }
      }
      currentSolid.delete()
      nextSolid = res.solid
    } else if (op.kind === 'linearPattern') {
      if (!currentSolid) {
        return {
          solid: undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'stack.error.targetEmpty',
          recomputedCount,
        }
      }
      const res = applyLinearPattern(w, currentSolid, (op as LinearPatternOp).params)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: res.error,
          failedParams: res.errorParams,
          recomputedCount,
        }
      }
      currentSolid.delete()
      nextSolid = res.solid
    } else if (op.kind === 'circularPattern') {
      if (!currentSolid) {
        return {
          solid: undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'stack.error.targetEmpty',
          recomputedCount,
        }
      }
      const res = applyCircularPattern(w, currentSolid, (op as CircularPatternOp).params)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: res.error,
          failedParams: res.errorParams,
          recomputedCount,
        }
      }
      currentSolid.delete()
      nextSolid = res.solid
    } else if (op.kind === 'offset') {
      if (!currentSolid) {
        return {
          solid: undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'stack.error.targetEmpty',
          recomputedCount,
        }
      }
      const res = applyOffset(w, currentSolid, (op as OffsetOp).params, sphereSegments)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: res.error,
          failedParams: res.errorParams,
          recomputedCount,
        }
      }
      currentSolid.delete()
      nextSolid = res.solid
    } else if (op.kind === 'hollow') {
      if (!currentSolid) {
        return {
          solid: undefined,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: 'stack.error.targetEmpty',
          recomputedCount,
        }
      }
      const res = applyHollow(w, currentSolid, (op as HollowOp).params, sphereSegments)
      if (res.error || !res.solid) {
        return {
          solid: currentSolid,
          failedIndex: i,
          failedOpId: op.id,
          failedReason: res.error,
          failedParams: res.errorParams,
          recomputedCount,
        }
      }
      currentSolid.delete()
      nextSolid = res.solid
    } else {
      // Unknown op kind
      return {
        solid: currentSolid ?? undefined,
        failedIndex: i,
        failedOpId: op.id,
        failedReason: 'stack.error.unknownOp',
        failedParams: { kind: op.kind },
        recomputedCount,
      }
    }

    currentSolid = nextSolid ?? null

    prefixKey = computeStepKey(prefixKey, op, ctx, sketchMap)
    if (cache && currentSolid) {
      cache.set(prefixKey, currentSolid)
    }
  }

  return {
    solid: currentSolid ?? undefined,
    warning: lastWarning,
    recomputedCount,
  }
}

/**
 * Legacy compatibility helper for 40 features
 */
export async function evaluateFeatures(
  features: Feature[],
  sketches: Sketch[] | Record<string, Sketch>,
  quality: 'coarse' | 'fine' = 'fine',
): Promise<{ solid?: Manifold; failedIndex?: number; failedReason?: string; warning?: string }> {
  const { getWasm } = await import('../wasm')
  const w = await getWasm()

  const ops = features.map(featureToOp)
  const res = await evaluateStack(null, ops, null, {
    w,
    sketches,
    quality,
  })

  return {
    solid: res.solid,
    failedIndex: res.failedIndex,
    failedReason: res.failedReason,
    warning: res.warning,
  }
}
