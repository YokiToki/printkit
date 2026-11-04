import { describe, it, expect } from 'vitest'
import { createSketch, addLine, newId } from './model'
import { analyzeDof } from './dof'

describe('2.3 Degrees of Freedom (DoF)', () => {
  it('computes DoF and fullyDefined for rectangle with 0/1/2 dimensions', () => {
    let s = createSketch('Rect')
    // 4 corners, bottom-left at (0,0) fixed
    // p0: (0,0) fixed
    // p1: (40, 0), p2: (40, 20), p3: (0, 20)
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 40, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    const l2 = addLine(s, l1.p2Id, { x: 40, y: 20 })
    s = l2.sketch
    const l3 = addLine(s, l2.p2Id, { x: 0, y: 20 })
    s = l3.sketch
    const l4 = addLine(s, l3.p2Id, l1.p1Id)
    s = l4.sketch

    // Free variables: p1 (x,y), p2 (x,y), p3 (x,y) -> 6 variables
    // Add geometric constraints: horizontal l1, vertical l2, horizontal l3, vertical l4
    s.constraints.push(
      { id: 'h1', kind: 'horizontal', refs: [l1.curveId] },
      { id: 'v2', kind: 'vertical', refs: [l2.curveId] },
      { id: 'h3', kind: 'horizontal', refs: [l3.curveId] },
      { id: 'v4', kind: 'vertical', refs: [l4.curveId] },
    )

    // With 0 dimensions: DoF should be 2 (width and height free)
    let dof = analyzeDof(s)
    expect(dof.dof).toBe(2)
    expect(dof.fullyDefined).toBe(false)
    expect(dof.pointStatus[l1.p1Id]).toBe(true) // fixed
    expect(dof.pointStatus[l1.p2Id]).toBe(false) // free x

    // Add width dimension (40 mm) -> DoF should be 1
    s.constraints.push({ id: 'dim_w', kind: 'distance', refs: [l1.curveId], value: 40 })
    dof = analyzeDof(s)
    expect(dof.dof).toBe(1)
    expect(dof.fullyDefined).toBe(false)
    expect(dof.pointStatus[l1.p2Id]).toBe(true) // p1 is now fixed in both x and y!

    // Add height dimension (20 mm) -> DoF should be 0 (fully defined!)
    s.constraints.push({ id: 'dim_h', kind: 'distance', refs: [l2.curveId], value: 20 })
    dof = analyzeDof(s)
    expect(dof.dof).toBe(0)
    expect(dof.fullyDefined).toBe(true)
    for (const ptId of Object.keys(s.points)) {
      expect(dof.pointStatus[ptId]).toBe(true)
    }
  })

  it('detects two contradicting constraints', () => {
    let s = createSketch('Conflict')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    s.points[l1.p2Id].fixed = true

    // Two contradicting distance constraints: 10 and 20
    s.constraints.push(
      { id: 'con_d1', kind: 'distance', refs: [l1.p1Id, l1.p2Id], value: 10 },
      { id: 'con_d2', kind: 'distance', refs: [l1.p1Id, l1.p2Id], value: 20 },
    )

    const dof = analyzeDof(s)
    expect(dof.conflictingConstraints).toContain('con_d2')
  })

  it('detects redundant dimension and keeps sketch solved', () => {
    let s = createSketch('Redundant')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch
    s.points[l1.p1Id].fixed = true
    s.constraints.push(
      { id: 'con_h', kind: 'horizontal', refs: [l1.curveId] },
      { id: 'dim_1', kind: 'distance', refs: [l1.curveId], value: 10 },
      // Redundant repeated distance dimension
      { id: 'dim_redundant', kind: 'distance', refs: [l1.p1Id, l1.p2Id], value: 10 },
    )

    const dof = analyzeDof(s)
    expect(dof.dof).toBe(0)
    expect(dof.fullyDefined).toBe(true)
    expect(dof.redundantConstraints).toContain('dim_redundant')
  })
})
