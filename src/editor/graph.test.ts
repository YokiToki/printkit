import { describe, it, expect } from 'vitest'
import type { EditorObject } from './scene'
import { buildGraph, topologicalOrder, findDependants, findMissingTools } from './graph'

function makeObj(id: string, name: string, toolIds: string[] = []): EditorObject {
  return {
    id,
    name,
    visible: true,
    locked: false,
    color: 0,
    source: { kind: 'empty' },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    stack:
      toolIds.length > 0
        ? [
            {
              id: `bool-${id}`,
              kind: 'boolean',
              enabled: true,
              params: { mode: 'subtract', tools: toolIds },
            },
          ]
        : [],
  }
}

describe('graph.ts (Task 2.2)', () => {
  it('builds linear chains and returns topological order', () => {
    // Chain: C depends on B, B depends on A -> Order must be A, then B, then C
    const a = makeObj('a', 'A')
    const b = makeObj('b', 'B', ['a'])
    const c = makeObj('c', 'C', ['b'])

    const result = topologicalOrder([c, a, b])
    expect(result.cycle).toBeUndefined()
    const ids = result.order.map((o) => o.id)
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'))
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'))
  })

  it('handles diamond dependencies', () => {
    // Diamond: D depends on B and C; B depends on A; C depends on A
    const a = makeObj('a', 'A')
    const b = makeObj('b', 'B', ['a'])
    const c = makeObj('c', 'C', ['a'])
    const d = makeObj('d', 'D', ['b', 'c'])

    const result = topologicalOrder([d, c, b, a])
    expect(result.cycle).toBeUndefined()
    const ids = result.order.map((o) => o.id)
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'))
    expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('c'))
    expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('d'))
    expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('d'))
  })

  it('detects cycles and returns the cycle path', () => {
    // A depends on B, B depends on C, C depends on A
    const a = makeObj('a', 'A', ['b'])
    const b = makeObj('b', 'B', ['c'])
    const c = makeObj('c', 'C', ['a'])

    const result = topologicalOrder([a, b, c])
    expect(result.cycle).toBeDefined()
    expect(result.cycle!.length).toBeGreaterThanOrEqual(3)
  })

  it('finds dependants of an object', () => {
    const a = makeObj('a', 'A')
    const b = makeObj('b', 'B', ['a'])
    const c = makeObj('c', 'C', ['b'])
    const independent = makeObj('x', 'X')

    const depsA = findDependants([a, b, c, independent], 'a')
    expect(depsA).toContain('b')
    expect(depsA).toContain('c')
    expect(depsA).not.toContain('x')
  })

  it('detects missing / deleted tools', () => {
    const a = makeObj('a', 'A', ['missing-1', 'missing-2'])
    const missing = findMissingTools([a])
    expect(missing.length).toBe(1)
    expect(missing[0].missingTools).toEqual(['missing-1', 'missing-2'])
  })
})
