import type { Manifold } from 'manifold-3d'
import type { Mat4 } from '../../matrix'
import type { BooleanParams } from '../../../editor/stack'
import type { MeshHealth } from '../../../editor/health'
import type { SceneDoc } from '../../../editor/scene'
import { addOp, featureToOp, removeOp, updateOp } from '../../../editor/stack'

export interface ToolOperand {
  id: string
  name: string
  solid: Manifold
  relativeMatrix: Mat4
  health?: MeshHealth
}

export interface BooleanOpResult {
  solid?: Manifold
  error?: string
  errorParams?: Record<string, string | number>
}

export function applyBoolean(
  targetSolid: Manifold,
  params: BooleanParams,
  tools: ToolOperand[],
): BooleanOpResult {
  if (targetSolid.isEmpty()) {
    return {
      error: 'stack.error.targetEmpty',
    }
  }

  // Closed solid check on target
  if (targetSolid.status() !== 'NoError' && (targetSolid.status() as any) !== 0) {
    return {
      error: 'stack.error.notSolid',
      errorParams: { name: 'Target' },
    }
  }

  let current: Manifold = targetSolid.asOriginal()

  for (const tool of tools) {
    // Health guard
    if (tool.health && (!tool.health.closed || tool.health.openEdges > 0)) {
      current.delete()
      return {
        error: 'stack.error.notSolid',
        errorParams: {
          name: tool.name,
          openEdges: tool.health.openEdges,
        },
      }
    }

    if (tool.solid.isEmpty() || (tool.solid.status() !== 'NoError' && (tool.solid.status() as any) !== 0)) {
      current.delete()
      return {
        error: 'stack.error.notSolid',
        errorParams: { name: tool.name, openEdges: tool.health?.openEdges ?? 1 },
      }
    }

    // Place tool in target's local coordinate frame
    const placed = tool.solid.transform(tool.relativeMatrix)

    let next: Manifold
    try {
      if (params.mode === 'union') {
        next = current.add(placed)
      } else if (params.mode === 'subtract') {
        next = current.subtract(placed)
      } else if (params.mode === 'intersect') {
        next = current.intersect(placed)
      } else {
        next = current.add(placed)
      }
    } finally {
      placed.delete()
    }

    current.delete()
    current = next
  }

  return { solid: current }
}

/**
 * Combine command: adds boolean op to target and sets tool objects to hidden / tool state.
 */
export function combineObjects(
  doc: SceneDoc,
  targetId: string,
  toolIds: string[],
  mode: 'union' | 'subtract' | 'intersect',
): SceneDoc {
  const toolSet = new Set(toolIds.filter((id) => id !== targetId))
  if (toolSet.size === 0) return doc

  const opId = crypto.randomUUID()
  const booleanOp = {
    id: opId,
    kind: 'boolean' as const,
    enabled: true,
    params: {
      mode,
      tools: Array.from(toolSet),
    },
  }

  const updatedObjects = doc.objects.map((obj) => {
    if (obj.id === targetId) {
      let currentStack = obj.stack ?? []
      if (obj.source.kind === 'feature') {
        currentStack = [...obj.source.features.map(featureToOp), ...currentStack]
      }
      const nextStack = addOp(currentStack, booleanOp)
      return {
        ...obj,
        source: obj.source.kind === 'feature' ? ({ kind: 'empty' } as const) : obj.source,
        stack: nextStack,
      }
    }
    if (toolSet.has(obj.id)) {
      // Hide tool by default as specified in design
      return { ...obj, visible: false }
    }
    return obj
  })

  return {
    ...doc,
    objects: updatedObjects,
  }
}

/**
 * Release tool: removes the boolean op (or unlinks the tool) and restores tool visibility.
 */
export function releaseTool(
  doc: SceneDoc,
  targetId: string,
  opId: string,
  toolId?: string,
): SceneDoc {
  const target = doc.objects.find((o) => o.id === targetId)
  if (!target) return doc

  const op = (target.stack ?? []).find((o) => o.id === opId)
  if (!op || op.kind !== 'boolean') return doc

  const toolsToRestore = new Set<string>()
  const booleanTools = (op.params as BooleanParams).tools

  let nextStack = target.stack ?? []
  if (toolId && booleanTools.length > 1) {
    // Just remove this tool from the boolean op
    const remainingTools = booleanTools.filter((t) => t !== toolId)
    nextStack = updateOp(nextStack, opId, { params: { tools: remainingTools } })
    toolsToRestore.add(toolId)
  } else {
    // Remove the entire boolean op
    for (const t of booleanTools) toolsToRestore.add(t)
    nextStack = removeOp(nextStack, opId)
  }

  const updatedObjects = doc.objects.map((obj) => {
    if (obj.id === targetId) {
      return { ...obj, stack: nextStack }
    }
    if (toolsToRestore.has(obj.id)) {
      return { ...obj, visible: true }
    }
    return obj
  })

  return {
    ...doc,
    objects: updatedObjects,
  }
}
