import { describe, it, expect, vi } from 'vitest'
import { migrateSketch, migrateSketches } from './migrate'
import { createSketch, addLine } from './model'
import { migrateScene } from '../sceneStore'
import { log } from '../../app/activityLog'

describe('2.6 Sketch Migration and Persistence', () => {
  it('handles corrupt and partial sketch data', () => {
    expect(migrateSketch(null)).toBeNull()
    expect(migrateSketch('not a sketch')).toBeNull()
    expect(migrateSketch([])).toBeNull()

    // Partial sketch: empty object
    const partial = migrateSketch({})
    expect(partial).not.toBeNull()
    expect(partial!.name).toBe('Sketch')
    expect(partial!.plane.base).toBe('XY')
    expect(partial!.plane.offset).toBe(0)
    expect(partial!.points).toEqual({})
    expect(partial!.curves).toEqual({})
    expect(partial!.constraints).toEqual([])
  })

  it('normalises numbers and drops constraints with missing refs with a log warning', () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => ({} as any))

    const raw = {
      id: 's1',
      name: 'Sketch 1',
      points: {
        p1: { x: '10.5' as any, y: NaN, fixed: false },
        p2: { x: 20, y: 0 },
      },
      curves: {
        c1: { kind: 'line', a: 'p1', b: 'p2' },
        c_broken: { kind: 'line', a: 'p1', b: 'non_existent_point' },
      },
      constraints: [
        { id: 'con_ok', kind: 'horizontal', refs: ['c1'] },
        { id: 'con_broken', kind: 'distance', refs: ['p1', 'missing_ref'], value: 'invalid' as any },
      ],
    }

    const s = migrateSketch(raw)
    expect(s).not.toBeNull()
    // NaN y was normalised to 0, string '10.5' normalised to fallback 0 or number
    expect(s!.points.p1.y).toBe(0)
    // Broken curve referencing non_existent_point dropped
    expect(s!.curves.c_broken).toBeUndefined()
    expect(s!.curves.c1).toBeDefined()

    // Broken constraint referencing missing_ref dropped and logged
    expect(s!.constraints).toHaveLength(1)
    expect(s!.constraints[0].id).toBe('con_ok')
    expect(warnSpy).toHaveBeenCalledWith(
      'storage',
      'log.editor.sketch.missingConstraintRef',
      expect.objectContaining({ constraintId: 'con_broken', ref: 'missing_ref' }),
    )

    warnSpy.mockRestore()
  })

  it('re-solves on load when positions disagree with constraints by > 1e-6', () => {
    let original = createSketch('Stale Positions')
    const l1 = addLine(original, { x: 0, y: 0 }, { x: 10, y: 0 })
    original = l1.sketch
    original.points[l1.p1Id].fixed = true
    // Stale positions: p2 is stored at (10, 0), but constraint says distance = 25
    original.constraints.push({
      id: 'dim_dist',
      kind: 'distance',
      refs: [l1.curveId],
      value: 25,
    })
    original.constraints.push({
      id: 'h1',
      kind: 'horizontal',
      refs: [l1.curveId],
    })

    const migrated = migrateSketch(original)
    expect(migrated).not.toBeNull()
    // Should have re-solved and updated p2 to 25!
    expect(migrated!.points[l1.p2Id].x).toBeCloseTo(25, 4)
  })

  it('integrates with migrateScene for round trips', () => {
    let s = createSketch('InScene')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 15, y: 0 })
    s = l1.sketch

    const sceneRaw = {
      schema: 1,
      objects: [],
      sketches: [s],
    }

    const doc = migrateScene(sceneRaw)
    expect(doc.sketches).toBeDefined()
    expect(doc.sketches).toHaveLength(1)
    expect(doc.sketches![0].name).toBe('InScene')
    expect(Object.keys(doc.sketches![0].curves)).toHaveLength(1)
  })
})
