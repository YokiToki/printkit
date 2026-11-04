import { describe, it, expect } from 'vitest'
import { createSketch, addLine, addCircle } from '../model'
import {
  rectangleMacro,
  slotMacro,
  polygonMacro,
  filletMacro,
  chamferMacro,
  trimMacro,
  mirrorMacro,
} from './index'
import { solve } from '../solver'
import { analyzeDof } from '../dof'

describe('2.5 Sketch Macros', () => {
  it('rectangle with corner radius creates lines, arcs and equal constraints', () => {
    let s = createSketch('Rect')
    const res = rectangleMacro(s, {
      p1: { x: 0, y: 0 },
      p2: { x: 40, y: 20 },
      cornerRadius: 5,
    })
    s = res.sketch
    expect(res.createdCurves).toHaveLength(8) // 4 lines + 4 arcs

    const initSolve = solve(s)
    expect(initSolve.ok).toBe(true)

    // Changing the radius dimension updates all four arcs via solver
    const radCon = s.constraints.find(c => c.kind === 'radius')
    expect(radCon).toBeDefined()
    if (radCon) {
      radCon.value = 6
      const solveRes = solve(s)
      expect(solveRes.ok).toBe(true)
    }
  })

  it('slot creates 2 lines, 2 arcs and tangencies', () => {
    let s = createSketch('Slot')
    const res = slotMacro(s, {
      p1: { x: 0, y: 0 },
      p2: { x: 30, y: 0 },
      width: 10,
    })
    expect(res.createdCurves).toHaveLength(4) // 2 lines + 2 arcs
    const solveRes = solve(res.sketch)
    expect(solveRes.ok).toBe(true)
  })

  it('polygon creates N edges and construction circle', () => {
    let s = createSketch('Poly')
    const res = polygonMacro(s, {
      center: { x: 0, y: 0 },
      radius: 20,
      sides: 6,
    })
    expect(res.createdCurves).toHaveLength(7) // 1 construction circle + 6 lines
    expect(res.sketch.curves[res.createdCurves[0]].construction).toBe(true)
  })

  it('fillet rejects too-large radius with error and max allowed radius', () => {
    let s = createSketch('Fillet')
    // Corner at (0, 0), line1 to (10, 0), line2 to (0, 10)
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    const l2 = addLine(s, l1.p1Id, { x: 0, y: 10 })
    s = l2.sketch

    // Try fillet with radius 15 mm on 10 mm lines -> should fail!
    const resFail = filletMacro(s, {
      line1Id: l1.curveId,
      line2Id: l2.curveId,
      cornerPtId: l1.p1Id,
      radius: 15,
    })
    expect(resFail.error).toBe('sketch.error.filletTooLarge')
    expect(resFail.maxRadius).toBeLessThanOrEqual(10)

    // Valid fillet with radius 3 mm
    const resOk = filletMacro(s, {
      line1Id: l1.curveId,
      line2Id: l2.curveId,
      cornerPtId: l1.p1Id,
      radius: 3,
    })
    expect(resOk.error).toBeUndefined()
    expect(resOk.arcId).toBeDefined()
    expect(resOk.sketch.curves[resOk.arcId!].kind).toBe('arc')
  })

  it('chamfer trims corner and creates a chamfer line', () => {
    let s = createSketch('Chamfer')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    const l2 = addLine(s, l1.p1Id, { x: 0, y: 10 })
    s = l2.sketch

    const res = chamferMacro(s, {
      line1Id: l1.curveId,
      line2Id: l2.curveId,
      cornerPtId: l1.p1Id,
      distance: 2,
    })
    expect(res.error).toBeUndefined()
    expect(res.chamferLineId).toBeDefined()
  })

  it('trim cuts line at line and circle intersections', () => {
    let s = createSketch('Trim')
    // Horizontal line from (0, 0) to (30, 0)
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 30, y: 0 })
    s = l1.sketch
    // Vertical line crossing at x = 10 from (10, -5) to (10, 5)
    const lCross1 = addLine(s, { x: 10, y: -5 }, { x: 10, y: 5 })
    s = lCross1.sketch
    // Circle intersecting at x = 20, center (20, 0), radius 4
    const cCross = addCircle(s, { x: 20, y: 0 }, 4)
    s = cCross.sketch

    // Click on l1 between x = 0 and x = 10, e.g. at (5, 0)
    const res = trimMacro(s, {
      curveId: l1.curveId,
      clickPt: { x: 5, y: 0 },
    })
    expect(res.trimmed).toBe(true)
    // l1 was removed and replaced with remaining segments beyond x = 10
    expect(res.sketch.curves[l1.curveId]).toBeUndefined()
  })

  it('mirror reflects curves about an axis line and adds symmetric constraints', () => {
    let s = createSketch('Mirror')
    // Axis line along Y axis from (0, 0) to (0, 20)
    const axis = addLine(s, { x: 0, y: 0 }, { x: 0, y: 20 })
    s = axis.sketch

    // Circle on the right side at (10, 10), radius 3
    const c1 = addCircle(s, { x: 10, y: 10 }, 3)
    s = c1.sketch

    const res = mirrorMacro(s, {
      curveIds: [c1.curveId],
      axisLineId: axis.curveId,
    })

    expect(res.mirroredCurves).toHaveLength(1)
    const mirCurve = res.sketch.curves[res.mirroredCurves[0]]
    expect(mirCurve.kind).toBe('circle')
    if (mirCurve.kind === 'circle') {
      const center = res.sketch.points[mirCurve.c]
      expect(center.x).toBeCloseTo(-10, 4)
      expect(center.y).toBeCloseTo(10, 4)
    }

    const symCon = res.sketch.constraints.find(c => c.kind === 'symmetric')
    expect(symCon).toBeDefined()
  })
})
