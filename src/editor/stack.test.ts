import { describe, it, expect } from 'vitest'
import {
  addOp,
  removeOp,
  updateOp,
  moveOp,
  toggleOp,
  clampRollback,
  normalizeOp,
  emptyStack,
  opSummary,
  type BooleanOp,
  type OffsetOp,
  type MirrorOp,
  type LinearPatternOp,
  type CircularPatternOp,
  type HollowOp,
} from './stack'

describe('stack.ts (Task 2.1)', () => {
  it('creates empty stack', () => {
    expect(emptyStack()).toEqual([])
  })

  it('normalizes corrupt and partial params', () => {
    // Completely invalid
    const invalid = normalizeOp(null)
    expect(invalid.kind).toBe('unknown')
    expect(invalid.enabled).toBe(false)

    // Boolean with bad tools and mode
    const badBool = normalizeOp({
      kind: 'boolean',
      params: { mode: 'invalid', tools: [123, 'tool-1', null] },
    }) as BooleanOp
    expect(badBool.kind).toBe('boolean')
    expect(badBool.params.mode).toBe('union')
    expect(badBool.params.tools).toEqual(['tool-1'])

    // Mirror with bad plane and origin
    const badMirror = normalizeOp({
      kind: 'mirror',
      params: { plane: 'FOO', origin: 'bad' },
    }) as MirrorOp
    expect(badMirror.params.plane).toBe('YZ')
    expect(badMirror.params.origin).toBe('object')
    expect(badMirror.params.merge).toBe(true)

    // Linear pattern bounds
    const badLinear = normalizeOp({
      kind: 'linearPattern',
      params: { count: 9999, axis: 'invalid', step: 'bad' },
    }) as LinearPatternOp
    expect(badLinear.params.count).toBe(200)
    expect(badLinear.params.axis).toBe('x')
    expect(badLinear.params.step).toBe(20)

    // Circular pattern
    const badCircular = normalizeOp({
      kind: 'circularPattern',
      params: { count: -5, angle: 'bad' },
    }) as CircularPatternOp
    expect(badCircular.params.count).toBe(2)
    expect(badCircular.params.angle).toBe(360)

    // Offset distance
    const badOffset = normalizeOp({
      kind: 'offset',
      params: { distance: NaN },
    }) as OffsetOp
    expect(badOffset.params.distance).toBe(0.2)

    // Hollow wall and drains
    const badHollow = normalizeOp({
      kind: 'hollow',
      params: { wall: -2, drains: [{ point: [1, 2], diameter: 'five' }] },
    }) as HollowOp
    expect(badHollow.params.wall).toBe(0.1)
    expect(badHollow.params.drains?.[0].point).toEqual([0, 0, 0])
    expect(badHollow.params.drains?.[0].diameter).toBe(3)
  })

  it('adds, removes, updates, moves and toggles ops', () => {
    let stack = emptyStack()
    const op1: OffsetOp = {
      id: 'op-1',
      kind: 'offset',
      enabled: true,
      params: { distance: 0.5 },
    }
    const op2: MirrorOp = {
      id: 'op-2',
      kind: 'mirror',
      enabled: true,
      params: { plane: 'XY', origin: 'object', merge: true },
    }

    stack = addOp(stack, op1)
    stack = addOp(stack, op2)
    expect(stack.length).toBe(2)
    expect(stack[0].id).toBe('op-1')
    expect(stack[1].id).toBe('op-2')

    // Move
    stack = moveOp(stack, 0, 1)
    expect(stack[0].id).toBe('op-2')
    expect(stack[1].id).toBe('op-1')

    // Toggle
    stack = toggleOp(stack, 'op-1')
    expect(stack[1].enabled).toBe(false)
    stack = toggleOp(stack, 'op-1', true)
    expect(stack[1].enabled).toBe(true)

    // Update
    stack = updateOp(stack, 'op-1', { params: { distance: 1.0 } })
    expect((stack[1] as OffsetOp).params.distance).toBe(1.0)

    // Remove
    stack = removeOp(stack, 'op-2')
    expect(stack.length).toBe(1)
    expect(stack[0].id).toBe('op-1')
  })

  it('clamps rollback bounds', () => {
    expect(clampRollback(3, null)).toBeNull()
    expect(clampRollback(3, undefined)).toBeNull()
    expect(clampRollback(3, -1)).toBe(0)
    expect(clampRollback(3, 0)).toBe(0)
    expect(clampRollback(3, 2)).toBe(2)
    expect(clampRollback(3, 3)).toBeNull()
    expect(clampRollback(3, 10)).toBeNull()
  })

  it('provides localized op summaries', () => {
    const off: OffsetOp = { id: '1', kind: 'offset', enabled: true, params: { distance: 0.2 } }
    expect(opSummary(off)).toEqual({
      key: 'stack.summary.offset',
      params: { distance: '+0.2 mm' },
    })

    const bool: BooleanOp = { id: '2', kind: 'boolean', enabled: true, params: { mode: 'subtract', tools: ['t1', 't2'] } }
    expect(opSummary(bool)).toEqual({
      key: 'stack.summary.boolean.subtract',
      params: { count: 2 },
    })

    const lin: LinearPatternOp = {
      id: '3',
      kind: 'linearPattern',
      enabled: true,
      params: { axis: 'y', count: 5, mode: 'spacing', step: 10, symmetric: false, merge: true },
    }
    expect(opSummary(lin)).toEqual({
      key: 'stack.summary.linearPattern',
      params: { count: 5, axis: 'Y' },
    })
  })
})
