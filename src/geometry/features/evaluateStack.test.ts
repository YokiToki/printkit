import { describe, it, expect } from 'vitest'
import { getWasm } from '../wasm'
import { evaluateStack, PrefixCache } from './evaluate'
import type { Op, OffsetOp, MirrorOp } from '../../editor/stack'
import { matrixOf } from '../../editor/scene'
import { expectValidSolid } from '../testing'

describe('evaluateStack (Task 3.4)', () => {
  it('cache hits on repeated evaluation and edit of op k recomputes only k...n', async () => {
    const w = await getWasm()
    const cache = new PrefixCache(6_000_000)

    // Initial solid: 20mm cube
    const cube = w.Manifold.cube([20, 20, 20], true)

    // 4-op stack:
    // Op 0: offset +1 mm
    // Op 1: mirror YZ
    // Op 2: offset +0.5 mm
    // Op 3: mirror XZ
    const ops: Op[] = [
      { id: 'op-0', kind: 'offset', enabled: true, params: { distance: 1 } },
      { id: 'op-1', kind: 'mirror', enabled: true, params: { plane: 'YZ', origin: 'object', merge: true } },
      { id: 'op-2', kind: 'offset', enabled: true, params: { distance: 0.5 } },
      { id: 'op-3', kind: 'mirror', enabled: true, params: { plane: 'XZ', origin: 'object', merge: true } },
    ]

    const recomputed1: number[] = []
    const res1 = await evaluateStack(cube, ops, null, {
      w,
      targetId: 'box-1',
      cache,
      onRecomputeOp: (i) => recomputed1.push(i),
    })

    expect(res1.solid).toBeDefined()
    expect(res1.recomputedCount).toBe(4)
    expect(recomputed1).toEqual([0, 1, 2, 3])
    res1.solid!.delete()

    // Repeated evaluation with identical input -> 0 ops recomputed!
    const recomputed2: number[] = []
    const res2 = await evaluateStack(cube, ops, null, {
      w,
      targetId: 'box-1',
      cache,
      onRecomputeOp: (i) => recomputed2.push(i),
    })

    expect(res2.solid).toBeDefined()
    expect(res2.recomputedCount).toBe(0)
    expect(recomputed2).toEqual([])
    res2.solid!.delete()

    // Edit op 2 (change distance from 0.5 to 1.5):
    // ops 0 and 1 hit cache! Only ops 2 and 3 recomputed!
    const editedOps: Op[] = [
      ops[0],
      ops[1],
      { id: 'op-2', kind: 'offset', enabled: true, params: { distance: 1.5 } },
      ops[3],
    ]

    const recomputed3: number[] = []
    const res3 = await evaluateStack(cube, editedOps, null, {
      w,
      targetId: 'box-1',
      cache,
      onRecomputeOp: (i) => recomputed3.push(i),
    })

    expect(res3.solid).toBeDefined()
    expect(res3.recomputedCount).toBe(2)
    expect(recomputed3).toEqual([2, 3])
    res3.solid!.delete()

    cube.delete()
    cache.clear()
  })

  it('eviction frees manifolds and respects budget', async () => {
    const w = await getWasm()
    // Small budget of 200 triangles
    const cache = new PrefixCache(200)

    const cube1 = w.Manifold.cube([10, 10, 10], true) // 12 tris
    const sphere = w.Manifold.sphere(10, 16) // 128 tris

    cache.set('key-1', cube1)
    cache.set('key-2', sphere)
    expect(cache.size()).toBe(2)

    // Add another sphere (128 tris) -> exceeds 200 tris budget, key-1 will be evicted!
    const sphere2 = w.Manifold.sphere(12, 16)
    cache.set('key-3', sphere2)

    expect(cache.evictions).toBeGreaterThan(0)
    expect(cache.get('key-1')).toBeUndefined()
    expect(cache.get('key-3')).toBeDefined()

    cube1.delete()
    sphere.delete()
    sphere2.delete()
    cache.clear()
    expect(cache.size()).toBe(0)
  })

  it('failed op keeps previous solid and reports reason', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)

    // Op 0: offset +1 mm (valid)
    // Op 1: offset -50 mm (impossible on a 22mm cube -> empty offset error)
    const ops: Op[] = [
      { id: 'op-0', kind: 'offset', enabled: true, params: { distance: 1 } },
      { id: 'op-1', kind: 'offset', enabled: true, params: { distance: -50 } },
    ]

    const res = await evaluateStack(cube, ops, null, { w })
    expect(res.failedIndex).toBe(1)
    expect(res.failedOpId).toBe('op-1')
    expect(res.failedReason).toBe('stack.error.offsetEmpty')
    // Solid before op 1 is kept
    expect(res.solid).toBeDefined()
    expect(res.solid!.volume()).toBeGreaterThan(0)
    expectValidSolid(res.solid!)

    res.solid!.delete()
    cube.delete()
  })

  it('missing tool reports stack.error.toolMissing and keeps previous solid', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)

    const ops: Op[] = [
      {
        id: 'op-bool',
        kind: 'boolean',
        enabled: true,
        params: { mode: 'subtract', tools: ['deleted-tool-id'] },
      },
    ]

    const res = await evaluateStack(cube, ops, null, {
      w,
      toolObjects: new Map(), // empty, deleted-tool-id missing
    })

    expect(res.failedIndex).toBe(0)
    expect(res.failedReason).toBe('stack.error.toolMissing')
    expect(res.failedParams).toEqual({ id: 'deleted-tool-id' })
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)

    res.solid!.delete()
    cube.delete()
  })

  it('respects rollback index', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)

    const ops: Op[] = [
      { id: 'op-0', kind: 'offset', enabled: true, params: { distance: 1 } },
      { id: 'op-1', kind: 'offset', enabled: true, params: { distance: 2 } },
    ]

    // Rollback = 1: evaluate only op 0!
    const res = await evaluateStack(cube, ops, 1, { w })
    expect(res.solid).toBeDefined()
    // Cube 20 grown by 1 has bbox of size 22
    const bb = res.solid!.boundingBox()
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(22, 1)
    const expectedVol = 20 ** 3 + 6 * 20 ** 2 * 1 + 3 * Math.PI * 20 * 1 ** 2 + (4 / 3) * Math.PI * 1 ** 3
    expect(res.solid!.volume()).toBeCloseTo(expectedVol, -1)

    res.solid!.delete()
    cube.delete()
  })

  it('evaluates hole and text ops and handles empty target failure (Task 3.4)', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 10], true).translate([0, 0, 5])
    const initVol = cube.volume()

    const ops: Op[] = [
      {
        id: 'op-hole-1',
        kind: 'hole',
        enabled: true,
        params: {
          point: [0, 0, 10],
          normal: [0, 0, 1],
          kind: 'simple',
          diameter: 4,
          depth: 5,
        },
      },
      {
        id: 'op-text-1',
        kind: 'text',
        enabled: true,
        params: {
          point: [5, 5, 10],
          normal: [0, 0, 1],
          text: 'X',
          size: 4,
          mode: 'emboss',
          height: 1.0,
          polygons: [[[-1, -1], [1, -1], [1, 1], [-1, 1]]],
        },
      },
    ]

    const res = await evaluateStack(cube, ops, null, { w })
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    expect(res.failedIndex).toBeUndefined()

    // Hole subtracts volume, text adds volume
    const holeVol = Math.PI * 2 * 2 * 5 // ~62.8
    const textVol = 4 * 1.0 // 4
    expect(res.solid!.volume()).toBeCloseTo(initVol - holeVol + textVol, 0)
    res.solid!.delete()

    // Failing on empty target
    const resFail = await evaluateStack(null, ops, null, { w })
    expect(resFail.solid).toBeUndefined()
    expect(resFail.failedIndex).toBe(0)
    expect(resFail.failedReason).toBe('stack.error.targetEmpty')

    cube.delete()
  })
})
