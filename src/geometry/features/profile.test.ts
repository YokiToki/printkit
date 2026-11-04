import { describe, it, expect } from 'vitest'
import { createSketch, addLine, addCircle, addArc } from '../../editor/sketch/model'
import { extractProfiles, polygonArea } from './profile'

describe('3.1 Profile Extraction', () => {
  it('extracts square as single region with CCW winding', () => {
    let s = createSketch('Square')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 20, y: 0 })
    s = l1.sketch
    const l2 = addLine(s, l1.p2Id, { x: 20, y: 20 })
    s = l2.sketch
    const l3 = addLine(s, l2.p2Id, { x: 0, y: 20 })
    s = l3.sketch
    const l4 = addLine(s, l3.p2Id, l1.p1Id)
    s = l4.sketch

    const res = extractProfiles(s)
    expect(res.errors).toBeUndefined()
    expect(res.regions).toHaveLength(1)
    expect(res.regions[0].holes).toHaveLength(0)
    expect(polygonArea(res.regions[0].outerLoop)).toBeGreaterThan(0) // CCW
  })

  it('extracts square with hole as single region with 1 CW hole', () => {
    let s = createSketch('SquareWithHole')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 40, y: 0 })
    s = l1.sketch
    const l2 = addLine(s, l1.p2Id, { x: 40, y: 40 })
    s = l2.sketch
    const l3 = addLine(s, l2.p2Id, { x: 0, y: 40 })
    s = l3.sketch
    const l4 = addLine(s, l3.p2Id, l1.p1Id)
    s = l4.sketch

    // Circular hole inside
    const c1 = addCircle(s, { x: 20, y: 20 }, 5)
    s = c1.sketch

    const res = extractProfiles(s)
    expect(res.errors).toBeUndefined()
    expect(res.regions).toHaveLength(1)
    expect(res.regions[0].holes).toHaveLength(1)
    expect(polygonArea(res.regions[0].outerLoop)).toBeGreaterThan(0) // CCW
    expect(polygonArea(res.regions[0].holes[0])).toBeLessThan(0) // CW
  })

  it('extracts two separate squares as two regions', () => {
    let s = createSketch('TwoSquares')
    // Square 1 at (0,0) to (10,10)
    const s1_1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = s1_1.sketch
    const s1_2 = addLine(s, s1_1.p2Id, { x: 10, y: 10 })
    s = s1_2.sketch
    const s1_3 = addLine(s, s1_2.p2Id, { x: 0, y: 10 })
    s = s1_3.sketch
    const s1_4 = addLine(s, s1_3.p2Id, s1_1.p1Id)
    s = s1_4.sketch

    // Square 2 at (30,0) to (40,10)
    const s2_1 = addLine(s, { x: 30, y: 0 }, { x: 40, y: 0 })
    s = s2_1.sketch
    const s2_2 = addLine(s, s2_1.p2Id, { x: 40, y: 10 })
    s = s2_2.sketch
    const s2_3 = addLine(s, s2_2.p2Id, { x: 30, y: 10 })
    s = s2_3.sketch
    const s2_4 = addLine(s, s2_3.p2Id, s2_1.p1Id)
    s = s2_4.sketch

    const res = extractProfiles(s)
    expect(res.errors).toBeUndefined()
    expect(res.regions).toHaveLength(2)
  })

  it('handles 3 nested levels (outer box, hole, inner island)', () => {
    let s = createSketch('Nested3')
    // Outer: 60x60
    const o1 = addLine(s, { x: 0, y: 0 }, { x: 60, y: 0 })
    s = o1.sketch
    const o2 = addLine(s, o1.p2Id, { x: 60, y: 60 })
    s = o2.sketch
    const o3 = addLine(s, o2.p2Id, { x: 0, y: 60 })
    s = o3.sketch
    const o4 = addLine(s, o3.p2Id, o1.p1Id)
    s = o4.sketch

    // Middle hole: 40x40
    const m1 = addLine(s, { x: 10, y: 10 }, { x: 50, y: 10 })
    s = m1.sketch
    const m2 = addLine(s, m1.p2Id, { x: 50, y: 50 })
    s = m2.sketch
    const m3 = addLine(s, m2.p2Id, { x: 10, y: 50 })
    s = m3.sketch
    const m4 = addLine(s, m3.p2Id, m1.p1Id)
    s = m4.sketch

    // Inner island: 20x20
    const i1 = addLine(s, { x: 20, y: 20 }, { x: 40, y: 20 })
    s = i1.sketch
    const i2 = addLine(s, i1.p2Id, { x: 40, y: 40 })
    s = i2.sketch
    const i3 = addLine(s, i2.p2Id, { x: 20, y: 40 })
    s = i3.sketch
    const i4 = addLine(s, i3.p2Id, i1.p1Id)
    s = i4.sketch

    const res = extractProfiles(s)
    expect(res.errors).toBeUndefined()
    // Should produce 2 regions: outer with 1 hole, and inner island
    expect(res.regions).toHaveLength(2)
    const outerReg = res.regions.find(r => r.holes.length === 1)
    const islandReg = res.regions.find(r => r.holes.length === 0)
    expect(outerReg).toBeDefined()
    expect(islandReg).toBeDefined()
  })

  it('reports open gap with its position', () => {
    let s = createSketch('OpenGap')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 20, y: 0 })
    s = l1.sketch
    const l2 = addLine(s, l1.p2Id, { x: 20, y: 20 })
    s = l2.sketch
    // Missing closing line: endpoint at (20, 20) is open!
    const res = extractProfiles(s)
    expect(res.regions).toHaveLength(0)
    expect(res.errors).toBeDefined()
    expect(res.errors![0].code).toBe('sketch.error.openProfile')
    expect(res.errors![0].point).toBeDefined()
  })

  it('reports crossing loops with crossing position', () => {
    let s = createSketch('Crossing')
    // Square 1: (0, 0) to (20, 20)
    const s1_1 = addLine(s, { x: 0, y: 0 }, { x: 20, y: 0 })
    s = s1_1.sketch
    const s1_2 = addLine(s, s1_1.p2Id, { x: 20, y: 20 })
    s = s1_2.sketch
    const s1_3 = addLine(s, s1_2.p2Id, { x: 0, y: 20 })
    s = s1_3.sketch
    const s1_4 = addLine(s, s1_3.p2Id, s1_1.p1Id)
    s = s1_4.sketch

    // Square 2 overlapping and intersecting edge s1_2: from (10, 5) to (30, 15)
    const s2_1 = addLine(s, { x: 10, y: 5 }, { x: 30, y: 5 })
    s = s2_1.sketch
    const s2_2 = addLine(s, s2_1.p2Id, { x: 30, y: 15 })
    s = s2_2.sketch
    const s2_3 = addLine(s, s2_2.p2Id, { x: 10, y: 15 })
    s = s2_3.sketch
    const s2_4 = addLine(s, s2_3.p2Id, s2_1.p1Id)
    s = s2_4.sketch

    const res = extractProfiles(s)
    expect(res.regions).toHaveLength(0)
    expect(res.errors).toBeDefined()
    expect(res.errors![0].code).toBe('sketch.error.selfIntersect')
    expect(res.errors![0].point).toBeDefined()
  })

  it('handles arcs sweep direction in closed profile', () => {
    let s = createSketch('ArcProfile')
    // Semicircle arc top + bottom line
    // Arc center (10, 0), from (20, 0) to (0, 0)
    const arc = addArc(s, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 0 })
    s = arc.sketch
    // Bottom line from (0, 0) to (20, 0)
    const l = addLine(s, arc.endId, arc.startId)
    s = l.sketch

    const res = extractProfiles(s)
    expect(res.errors).toBeUndefined()
    expect(res.regions).toHaveLength(1)
    expect(polygonArea(res.regions[0].outerLoop)).toBeGreaterThan(0) // CCW
  })
})
