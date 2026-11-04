import { describe, it, expect } from 'vitest'
import {
  planeFrame,
  createSketch,
  addLine,
  addCircle,
  addArc,
  mergePoints,
  removeCurve,
  newId,
  resetIdCounter,
} from './model'

describe('2.1 Sketch Model', () => {
  it('plane frames for XY, XZ, YZ with offset perform exact round trips', () => {
    const planes = [
      { base: 'XY' as const, offset: 25 },
      { base: 'XZ' as const, offset: -10 },
      { base: 'YZ' as const, offset: 15 },
    ]

    for (const def of planes) {
      const frame = planeFrame(def)
      // Test several 2D points on the plane
      const testPoints: [number, number][] = [
        [0, 0],
        [42, 18],
        [-15, 30],
        [100, -50],
      ]

      for (const p of testPoints) {
        const world = frame.toWorld(p)
        const back = frame.toPlane(world)
        expect(back[0]).toBeCloseTo(p[0], 5)
        expect(back[1]).toBeCloseTo(p[1], 5)
      }
    }
  })

  it('adds lines, circles, and arcs to sketch', () => {
    resetIdCounter(1)
    let sketch = createSketch('Test Sketch')

    const lineRes = addLine(sketch, { x: 0, y: 0 }, { x: 10, y: 0 })
    sketch = lineRes.sketch
    expect(sketch.curves[lineRes.curveId].kind).toBe('line')
    expect(Object.keys(sketch.points)).toHaveLength(2)

    const circleRes = addCircle(sketch, { x: 5, y: 5 }, 3)
    sketch = circleRes.sketch
    expect(sketch.curves[circleRes.curveId].kind).toBe('circle')
    expect(Object.keys(sketch.points)).toHaveLength(3)

    const arcRes = addArc(sketch, { x: 0, y: 5 }, { x: -2, y: 5 }, { x: 0, y: 7 })
    sketch = arcRes.sketch
    expect(sketch.curves[arcRes.curveId].kind).toBe('arc')
    expect(Object.keys(sketch.points)).toHaveLength(6)
  })

  it('merges points and updates curves and constraints', () => {
    let sketch = createSketch('Test Sketch')
    const l1 = addLine(sketch, { x: 0, y: 0 }, { x: 10, y: 0 })
    sketch = l1.sketch
    const l2 = addLine(sketch, { x: 10.01, y: 0 }, { x: 10, y: 10 })
    sketch = l2.sketch

    // Add constraint referencing l2.p1Id
    sketch.constraints.push({
      id: newId('con'),
      kind: 'horizontal',
      refs: [l1.p1Id, l2.p1Id],
    })

    expect(Object.keys(sketch.points)).toHaveLength(4)

    // Merge l2.p1Id into l1.p2Id
    sketch = mergePoints(sketch, l1.p2Id, l2.p1Id)
    expect(Object.keys(sketch.points)).toHaveLength(3)
    expect(sketch.points[l2.p1Id]).toBeUndefined()

    // l2 should now reference l1.p2Id as its start point
    const curve2 = sketch.curves[l2.curveId]
    if (curve2.kind === 'line') {
      expect(curve2.a).toBe(l1.p2Id)
    }

    // Constraint refs should be updated
    expect(sketch.constraints[0].refs).toEqual([l1.p1Id, l1.p2Id])
  })

  it('removeCurve cleans up orphaned points and dangling constraints', () => {
    let sketch = createSketch('Test Sketch')
    const l1 = addLine(sketch, { x: 0, y: 0 }, { x: 10, y: 0 })
    sketch = l1.sketch
    const l2 = addLine(sketch, l1.p2Id, { x: 10, y: 10 })
    sketch = l2.sketch

    // Add constraints
    const conLine = newId('con')
    const conPoint = newId('con')
    sketch.constraints.push(
      { id: conLine, kind: 'horizontal', refs: [l1.curveId] },
      { id: conPoint, kind: 'fixed', refs: [l1.p1Id] },
    )

    expect(Object.keys(sketch.points)).toHaveLength(3)
    expect(sketch.constraints).toHaveLength(2)

    // Remove l1: l1.p1Id was only used by l1, so it should be removed as orphaned.
    // l1.p2Id is still used by l2, so it should be kept.
    // conLine referenced l1.curveId, so it should be removed.
    // conPoint referenced l1.p1Id (which was removed), so it should be removed.
    sketch = removeCurve(sketch, l1.curveId)

    expect(sketch.curves[l1.curveId]).toBeUndefined()
    expect(sketch.curves[l2.curveId]).toBeDefined()

    expect(sketch.points[l1.p1Id]).toBeUndefined()
    expect(sketch.points[l1.p2Id]).toBeDefined()

    expect(sketch.constraints).toHaveLength(0)
  })
})
