import { describe, expect, it } from 'vitest'
import { getWasm } from '../wasm'
import { getCutSection, insetSection } from './section'
import { placeConnectors, poleOfInaccessibility, signedDistToPolygon, type Polygon } from './place'

describe('geometry/cut/section.ts & place.ts (Task 2.4)', () => {
  it('extracts section at plane and supports coordinate round-tripping', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true) // -10..10

    const cut = getCutSection(cube, { kind: 'axis', axis: 'z', position: 0 })
    expect(cut.isEmpty).toBe(false)
    expect(cut.area).toBeCloseTo(400, 2)
    expect(cut.polygons.length).toBe(1)

    // Check round-tripping between world and plane frame
    const testPlanePt: [number, number] = [5, -3]
    const worldPt = cut.frame.toWorld(testPlanePt)
    const backToPlane = cut.frame.toPlane(worldPt)
    expect(backToPlane[0]).toBeCloseTo(testPlanePt[0], 4)
    expect(backToPlane[1]).toBeCloseTo(testPlanePt[1], 4)
  })

  it('insets cross section by margin', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const cut = getCutSection(cube, { kind: 'axis', axis: 'z', position: 0 })

    const inset = insetSection(cut.crossSection, 2)
    expect(inset.isEmpty).toBe(false)
    // 20x20 inset by 2 on each side is 16x16 = 256
    expect(inset.crossSection.area()).toBeCloseTo(256, 1)
  })

  it('places connectors on rectangle, L-shape, and ring sections', () => {
    // 1. Rectangle 40 x 20
    const rect: Polygon[] = [
      [[-20, -10], [20, -10], [20, 10], [-20, 10]],
    ]
    const pRect = placeConnectors(rect, { count: 2, margin: 2.0 })
    expect(pRect.length).toBe(2)
    expect(pRect[0].valid).toBe(true)
    expect(pRect[1].valid).toBe(true)
    expect(Math.abs(pRect[0].point[0] - pRect[1].point[0])).toBeGreaterThan(15)

    // 2. L-shape
    const lShape: Polygon[] = [
      [[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40]],
    ]
    const pL = placeConnectors(lShape, { count: 3, margin: 2.0 })
    expect(pL.length).toBe(3)
    for (const p of pL) {
      expect(p.valid).toBe(true)
      expect(p.distanceToEdge).toBeGreaterThanOrEqual(1.9)
    }

    // 3. Ring (annulus)
    const outer: Polygon = []
    const inner: Polygon = []
    const numPts = 32
    for (let i = 0; i < numPts; i++) {
      const a = (i * 2 * Math.PI) / numPts
      outer.push([20 * Math.cos(a), 20 * Math.sin(a)])
      const aRev = -((i * 2 * Math.PI) / numPts)
      inner.push([10 * Math.cos(aRev), 10 * Math.sin(aRev)])
    }
    const ring: Polygon[] = [outer, inner]
    const pRing = placeConnectors(ring, { count: 4, margin: 2.0 })
    expect(pRing.length).toBe(4)
    for (const p of pRing) {
      expect(p.valid).toBe(true)
      expect(p.distanceToEdge).toBeGreaterThanOrEqual(1.8)
    }
  })

  it('handles thin sections by reporting thin issue', () => {
    // Thin strip: 50 mm long but only 1.5 mm wide (max distance to edge = 0.75 mm)
    const thinStrip: Polygon[] = [
      [[0, 0], [50, 0], [50, 1.5], [0, 1.5]],
    ]
    // Margin requested is 2.0 mm, which exceeds half-width 0.75 mm
    const placed = placeConnectors(thinStrip, { count: 2, margin: 2.0 })
    expect(placed.length).toBe(1)
    expect(placed[0].valid).toBe(false)
    expect(placed[0].issue).toBe('thin')
  })

  it('validates manual connector positions and detects outside positions', () => {
    const rect: Polygon[] = [
      [[-20, -10], [20, -10], [20, 10], [-20, 10]],
    ]

    const manual = placeConnectors(rect, {
      margin: 2.0,
      manualPositions: [
        [0, 0], // safely inside (distance = 10)
        [19, 9], // inside but too close to edge (distance = 1 < margin 2)
        [30, 0], // completely outside
      ],
    })

    expect(manual.length).toBe(3)
    expect(manual[0].valid).toBe(true)
    expect(manual[0].issue).toBeUndefined()

    expect(manual[1].valid).toBe(false)
    expect(manual[1].issue).toBe('thin')

    expect(manual[2].valid).toBe(false)
    expect(manual[2].issue).toBe('outside')
  })

  it('slices indexed triangle mesh into 2D polygon loops without WASM', async () => {
    const { getMeshSectionPolygons } = await import('./section')
    // A 20x20x20 cube from -10 to 10
    // 8 vertices, 12 triangles
    const vertices = new Float32Array([
      -10, -10, -10, // 0
       10, -10, -10, // 1
       10,  10, -10, // 2
      -10,  10, -10, // 3
      -10, -10,  10, // 4
       10, -10,  10, // 5
       10,  10,  10, // 6
      -10,  10,  10, // 7
    ])
    const indices = new Uint32Array([
      // Bottom
      0, 2, 1, 0, 3, 2,
      // Top
      4, 5, 6, 4, 6, 7,
      // Front
      0, 1, 5, 0, 5, 4,
      // Back
      2, 3, 7, 2, 7, 6,
      // Left
      0, 4, 7, 0, 7, 3,
      // Right
      1, 2, 6, 1, 6, 5,
    ])

    const loops = getMeshSectionPolygons(vertices, indices, {
      kind: 'axis',
      axis: 'z',
      position: 0,
    })

    expect(loops.length).toBe(1)
    expect(loops[0].length).toBeGreaterThanOrEqual(4)

    // Check bounds of sliced loop
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const [u, v] of loops[0]) {
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
    expect(maxU - minU).toBeCloseTo(20, 1)
    expect(maxV - minV).toBeCloseTo(20, 1)
  })
})
