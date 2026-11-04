import { describe, it, expect } from 'vitest'
import { addArc, addCircle, addLine, createSketch } from './model'
import {
  constraintEntities,
  dimensionFor,
  entityRef,
  hasDimension,
  measureCurve,
  sketchBounds,
} from './measure'

describe('sketch measure', () => {
  it('measures a line, a circle and an arc', () => {
    let s = createSketch('M')
    const l = addLine(s, { x: 0, y: 0 }, { x: 30, y: 40 })
    s = l.sketch
    const c = addCircle(s, { x: 0, y: 0 }, 7)
    s = c.sketch
    const a = addArc(s, { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 })
    s = a.sketch

    const lm = measureCurve(s, l.curveId)
    expect(lm?.kind).toBe('length')
    if (lm?.kind === 'length') {
      expect(lm.length).toBeCloseTo(50)
      expect(lm.angleDeg).toBeCloseTo(53.13, 1)
    }
    expect(measureCurve(s, c.curveId)).toEqual({ kind: 'radius', radius: 7 })
    const am = measureCurve(s, a.curveId)
    expect(am?.kind).toBe('arc')
    if (am?.kind === 'arc') {
      expect(am.radius).toBeCloseTo(5)
      expect(am.sweepDeg).toBeCloseTo(90)
    }
  })

  it('numbers entities per kind', () => {
    let s = createSketch('N')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 1, y: 0 })
    s = l1.sketch
    const c = addCircle(s, { x: 5, y: 5 }, 1)
    s = c.sketch
    const l2 = addLine(s, { x: 0, y: 3 }, { x: 1, y: 3 })
    s = l2.sketch
    expect(entityRef(s, l1.curveId)).toMatchObject({ kind: 'line', index: 1 })
    expect(entityRef(s, l2.curveId)).toMatchObject({ kind: 'line', index: 2 })
    expect(entityRef(s, c.curveId)).toMatchObject({ kind: 'circle', index: 1 })
    expect(entityRef(s, 'nope')).toBeNull()
  })

  it('bounds cover the visible geometry only', () => {
    let s = createSketch('B')
    s = addLine(s, { x: 0, y: 0 }, { x: 40, y: 0 }).sketch
    s = addLine(s, { x: 40, y: 0 }, { x: 40, y: 20 }).sketch
    s = addLine(s, { x: -100, y: -100 }, { x: -90, y: -90 }, true).sketch
    const b = sketchBounds(s)
    expect(b?.width).toBeCloseTo(40)
    expect(b?.height).toBeCloseTo(20)
    expect(sketchBounds(createSketch('E'))).toBeNull()
  })

  it('dimensionFor locks the current size once', () => {
    let s = createSketch('D')
    const l = addLine(s, { x: 0, y: 0 }, { x: 12, y: 0 })
    s = l.sketch
    const dim = dimensionFor(s, l.curveId)
    expect(dim).toMatchObject({ kind: 'distance', refs: [l.curveId] })
    expect(dim?.value).toBeCloseTo(12)
    s = { ...s, constraints: [...s.constraints, dim!] }
    expect(hasDimension(s, l.curveId)).toBe(true)
    expect(dimensionFor(s, l.curveId)).toBeNull()
  })

  it('a distance between the line ends counts as its dimension', () => {
    let s = createSketch('D2')
    const l = addLine(s, { x: 0, y: 0 }, { x: 12, y: 0 })
    s = l.sketch
    s = { ...s, constraints: [{ id: 'k', kind: 'distance', refs: [l.p1Id, l.p2Id], value: 12 }] }
    expect(hasDimension(s, l.curveId)).toBe(true)
  })

  it('splits constraint refs into points and curves', () => {
    let s = createSketch('R')
    const l = addLine(s, { x: 0, y: 0 }, { x: 12, y: 0 })
    s = l.sketch
    expect(constraintEntities(s, { id: 'k', kind: 'coincident', refs: [l.p1Id, l.curveId] })).toEqual({
      points: [l.p1Id],
      curves: [l.curveId],
    })
  })
})
