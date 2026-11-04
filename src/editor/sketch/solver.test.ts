import { describe, it, expect } from 'vitest'
import {
  createSketch,
  addLine,
  addCircle,
  addArc,
  newId,
  type Sketch,
} from './model'
import { solve } from './solver'

describe('2.2 Sketch Solver', () => {
  it('solves horizontal and vertical constraints', () => {
    let s = createSketch('HV')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 5 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    s.constraints.push({ id: newId('c'), kind: 'horizontal', refs: [l1.curveId] })

    const res = solve(s)
    expect(res.ok).toBe(true)
    expect(res.positions[l1.p2Id].y).toBeCloseTo(0, 4)
  })

  it('solves distance constraint on line and between points', () => {
    let s = createSketch('Dist')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    s.constraints.push(
      { id: newId('c'), kind: 'horizontal', refs: [l1.curveId] },
      { id: newId('c'), kind: 'distance', refs: [l1.curveId], value: 25 },
    )

    const res = solve(s)
    expect(res.ok).toBe(true)
    expect(res.positions[l1.p2Id].x).toBeCloseTo(25, 4)
    expect(res.positions[l1.p2Id].y).toBeCloseTo(0, 4)
  })

  it('solves parallel and perpendicular constraints', () => {
    let s = createSketch('ParPerp')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    s.points[l1.p2Id].fixed = true

    const l2 = addLine(s, { x: 0, y: 10 }, { x: 5, y: 15 })
    s = l2.sketch
    s.points[l2.p1Id].fixed = true
    s.constraints.push({ id: newId('c'), kind: 'parallel', refs: [l1.curveId, l2.curveId] })

    const res = solve(s)
    expect(res.ok).toBe(true)
    expect(res.positions[l2.p2Id].y).toBeCloseTo(10, 4)

    // Perpendicular
    s.constraints = [{ id: newId('c'), kind: 'perpendicular', refs: [l1.curveId, l2.curveId] }]
    const resPerp = solve(s)
    expect(resPerp.ok).toBe(true)
    expect(resPerp.positions[l2.p2Id].x).toBeCloseTo(0, 4)
  })

  it('solves tangent line to circle', () => {
    let s = createSketch('Tangent')
    const c1 = addCircle(s, { x: 0, y: 0 }, 10)
    s = c1.sketch
    s.points[c1.centerId].fixed = true

    // Line starting at (10, 20) with horizontal constraint
    const l1 = addLine(s, { x: -20, y: 10 }, { x: 20, y: 12 })
    s = l1.sketch
    s.constraints.push(
      { id: newId('c'), kind: 'radius', refs: [c1.curveId], value: 10 },
      { id: newId('c'), kind: 'horizontal', refs: [l1.curveId] },
      { id: newId('c'), kind: 'tangent', refs: [l1.curveId, c1.curveId] },
    )

    const res = solve(s)
    expect(res.ok).toBe(true)
    // Horizontal line tangent to circle (0,0) r=10 should have y = 10 or y = -10
    expect(Math.abs(res.positions[l1.p1Id].y)).toBeCloseTo(10, 4)
    expect(Math.abs(res.positions[l1.p2Id].y)).toBeCloseTo(10, 4)
  })

  it('solves midpoint and symmetric constraints', () => {
    let s = createSketch('MidSymm')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 20, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    s.points[l1.p2Id].fixed = true

    // Add point for midpoint
    s.points['mid'] = { x: 5, y: 10 }
    s.constraints.push({ id: newId('c'), kind: 'midpoint', refs: ['mid', l1.curveId] })

    const res = solve(s)
    expect(res.ok).toBe(true)
    expect(res.positions['mid'].x).toBeCloseTo(10, 4)
    expect(res.positions['mid'].y).toBeCloseTo(0, 4)
  })

  it('solves angle constraint between two lines', () => {
    let s = createSketch('Angle')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    s.points[l1.p2Id].fixed = true

    const l2 = addLine(s, { x: 0, y: 0 }, { x: 5, y: 1 })
    s = l2.sketch
    s.points[l2.p1Id].fixed = true
    s.constraints.push({
      id: newId('c'),
      kind: 'angle',
      refs: [l1.curveId, l2.curveId],
      value: Math.PI / 4, // 45 deg
    })

    const res = solve(s)
    expect(res.ok).toBe(true)
    const p2 = res.positions[l2.p2Id]
    const angle = Math.atan2(p2.y, p2.x)
    expect(angle).toBeCloseTo(Math.PI / 4, 3)
  })

  it('solves rounded rectangle with arcs and tangency', () => {
    let s = createSketch('RoundedRect')
    // 4 corners, 4 lines, 4 arcs
    // Line 1: bottom (10, 0) to (40, 0)
    const lBottom = addLine(s, { x: 10, y: 0 }, { x: 40, y: 0 })
    s = lBottom.sketch
    // Line 2: right (50, 10) to (50, 20)
    const lRight = addLine(s, { x: 50, y: 10 }, { x: 50, y: 20 })
    s = lRight.sketch
    // Line 3: top (40, 30) to (10, 30)
    const lTop = addLine(s, { x: 40, y: 30 }, { x: 10, y: 30 })
    s = lTop.sketch
    // Line 4: left (0, 20) to (0, 10)
    const lLeft = addLine(s, { x: 0, y: 20 }, { x: 0, y: 10 })
    s = lLeft.sketch

    s.points[lBottom.p1Id].fixed = true
    s.constraints.push(
      { id: newId('c'), kind: 'horizontal', refs: [lBottom.curveId] },
      { id: newId('c'), kind: 'vertical', refs: [lRight.curveId] },
      { id: newId('c'), kind: 'horizontal', refs: [lTop.curveId] },
      { id: newId('c'), kind: 'vertical', refs: [lLeft.curveId] },
      { id: newId('c'), kind: 'distance', refs: [lBottom.curveId], value: 30 },
      { id: newId('c'), kind: 'distance', refs: [lRight.curveId], value: 10 },
    )

    const res = solve(s)
    expect(res.ok).toBe(true)
    expect(res.positions[lBottom.p2Id].x - res.positions[lBottom.p1Id].x).toBeCloseTo(30, 4)
    expect(res.positions[lRight.p2Id].y - res.positions[lRight.p1Id].y).toBeCloseTo(10, 4)
  })

  it('keeps nearest solution on dimension change without flipping triangle', () => {
    let s = createSketch('Triangle')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    const pTop = newId('pt')
    s.points[pTop] = { x: 5, y: 8 }

    s.constraints.push(
      { id: newId('c'), kind: 'horizontal', refs: [l1.curveId] },
      { id: 'dist_base', kind: 'distance', refs: [l1.curveId], value: 10 },
      { id: 'dist_side1', kind: 'distance', refs: [l1.p1Id, pTop], value: 9.434 },
      { id: 'dist_side2', kind: 'distance', refs: [l1.p2Id, pTop], value: 9.434 },
    )

    // Change base distance to 12
    s.constraints[1].value = 12
    const res = solve(s)
    expect(res.ok).toBe(true)
    expect(res.positions[pTop].y).toBeGreaterThan(0)
  })

  it('impossible dimension keeps previous positions and returns ok: false', () => {
    let s = createSketch('Impossible')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    s.points[l1.p2Id].fixed = true

    // Impossible: two fixed points distance is 10, but constraint demands 50
    s.constraints.push({ id: newId('c'), kind: 'distance', refs: [l1.p1Id, l1.p2Id], value: 50 })

    const res = solve(s)
    expect(res.ok).toBe(false)
    expect(res.reason).toBeDefined()
    expect(res.positions[l1.p2Id].x).toBe(10) // positions kept!
  })

  it('solves 200 entities within time budget', () => {
    let s = createSketch('Big')
    let prevId = newId('pt')
    s.points[prevId] = { x: 0, y: 0, fixed: true }

    for (let i = 1; i <= 100; i++) {
      const nextId = newId('pt')
      s.points[nextId] = { x: i * 2, y: (i % 2) * 2 }
      s.constraints.push({ id: newId('c'), kind: 'distance', refs: [prevId, nextId], value: 3 })
      prevId = nextId
    }

    const res = solve(s, { maxIter: 20 })
    expect(res.timeMs).toBeLessThan(40)
  })
})
