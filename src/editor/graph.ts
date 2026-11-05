import type { EditorObject } from './scene'
import type { BooleanOp } from './stack'

export interface DependencyGraph {
  objects: Map<string, EditorObject>
  // objectId -> array of tool object IDs it depends on
  dependencies: Map<string, string[]>
  // objectId -> array of object IDs that depend on it
  dependents: Map<string, string[]>
}

export function buildGraph(objects: EditorObject[]): DependencyGraph {
  const objMap = new Map<string, EditorObject>()
  const dependencies = new Map<string, string[]>()
  const dependents = new Map<string, string[]>()

  for (const obj of objects) {
    objMap.set(obj.id, obj)
    dependencies.set(obj.id, [])
    dependents.set(obj.id, [])
  }

  for (const obj of objects) {
    const stack = obj.stack ?? []
    const deps = new Set<string>()

    for (const op of stack) {
      if (op.kind === 'boolean') {
        const bOp = op as BooleanOp
        for (const toolId of bOp.params.tools) {
          if (toolId !== obj.id) {
            deps.add(toolId)
          }
        }
      }
    }

    dependencies.set(obj.id, Array.from(deps))
    for (const toolId of deps) {
      const depList = dependents.get(toolId)
      if (depList) {
        depList.push(obj.id)
      } else {
        dependents.set(toolId, [obj.id])
      }
    }
  }

  return {
    objects: objMap,
    dependencies,
    dependents,
  }
}

export interface TopologicalResult {
  order: EditorObject[]
  cycle?: string[]
}

/**
 * Returns topological order where dependencies come before the objects that depend on them.
 * If a cycle is detected, returns cycle path of object IDs.
 */
export function topologicalOrder(objects: EditorObject[]): TopologicalResult {
  const graph = buildGraph(objects)
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>() // dependency -> dependents

  for (const obj of objects) {
    inDegree.set(obj.id, 0)
    adj.set(obj.id, [])
  }

  // If A depends on B, edge is B -> A (B must be evaluated before A)
  for (const [objId, deps] of graph.dependencies.entries()) {
    // Only count dependencies that actually exist in the scene
    let validDepCount = 0
    for (const depId of deps) {
      if (graph.objects.has(depId)) {
        adj.get(depId)?.push(objId)
        validDepCount++
      }
    }
    inDegree.set(objId, validDepCount)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id)
    }
  }

  const orderIds: string[] = []
  while (queue.length > 0) {
    const curr = queue.shift()!
    orderIds.push(curr)

    for (const next of adj.get(curr) ?? []) {
      const newDeg = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, newDeg)
      if (newDeg === 0) {
        queue.push(next)
      }
    }
  }

  if (orderIds.length === objects.length) {
    return {
      order: orderIds.map((id) => graph.objects.get(id)!),
    }
  }

  // Cycle detected! Find the cycle path using DFS among remaining nodes
  const cycle = findCycle(graph, inDegree)
  return {
    order: orderIds.map((id) => graph.objects.get(id)!),
    cycle,
  }
}

function findCycle(graph: DependencyGraph, inDegree: Map<string, number>): string[] {
  // Candidate nodes in cycle have inDegree > 0
  const candidateIds = new Set<string>()
  for (const [id, deg] of inDegree.entries()) {
    if (deg > 0) candidateIds.add(id)
  }

  const visited = new Set<string>()
  const recStack: string[] = []

  function dfs(curr: string): string[] | null {
    visited.add(curr)
    recStack.push(curr)

    const deps = graph.dependencies.get(curr) ?? []
    for (const dep of deps) {
      if (!candidateIds.has(dep)) continue
      const idx = recStack.indexOf(dep)
      if (idx !== -1) {
        // Cycle found
        return [...recStack.slice(idx), dep]
      }
      if (!visited.has(dep)) {
        const res = dfs(dep)
        if (res) return res
      }
    }

    recStack.pop()
    return null
  }

  for (const id of candidateIds) {
    if (!visited.has(id)) {
      const cycle = dfs(id)
      if (cycle) return cycle
    }
  }

  return Array.from(candidateIds)
}

/**
 * Returns all object IDs that depend on objectId directly or transitively.
 */
export function findDependants(objects: EditorObject[], objectId: string): string[] {
  const graph = buildGraph(objects)
  const result = new Set<string>()
  const queue = [...(graph.dependents.get(objectId) ?? [])]

  while (queue.length > 0) {
    const curr = queue.shift()!
    if (!result.has(curr)) {
      result.add(curr)
      for (const next of graph.dependents.get(curr) ?? []) {
        queue.push(next)
      }
    }
  }

  return Array.from(result)
}

/**
 * Returns missing tool IDs per object and op.
 */
export function findMissingTools(
  objects: EditorObject[]
): { objectId: string; opId: string; missingTools: string[] }[] {
  const objIds = new Set(objects.map((o) => o.id))
  const missing: { objectId: string; opId: string; missingTools: string[] }[] = []

  for (const obj of objects) {
    for (const op of obj.stack ?? []) {
      if (op.kind === 'boolean') {
        const bOp = op as BooleanOp
        const missingForOp = bOp.params.tools.filter((t) => !objIds.has(t))
        if (missingForOp.length > 0) {
          missing.push({
            objectId: obj.id,
            opId: op.id,
            missingTools: missingForOp,
          })
        }
      }
    }
  }

  return missing
}
