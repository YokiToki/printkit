import { describe, it, expect } from 'vitest'
import { createSketch, addLine, addCircle } from '../../editor/sketch/model'
import { rectangleMacro } from '../../editor/sketch/tools/rectangle'
import { buildExtrude } from './extrude'
import { buildRevolve } from './revolve'
import { expectValidSolid } from '../testing'

describe('3.2 Extrude and Revolve', () => {
  it('extrudes 40 x 20 x 10 with volume 8000 and exact bbox', async () => {
    let s = createSketch('BoxSketch', { base: 'XY', offset: 0 })
    const rect = rectangleMacro(s, {
      p1: { x: 0, y: 0 },
      p2: { x: 40, y: 20 },
    })
    s = rect.sketch

    const res = await buildExtrude(s, {
      side: 'one',
      d1: 10,
      op: 'new',
    })

    expect(res.error).toBeUndefined()
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    expect(res.solid!.volume()).toBeCloseTo(8000, 1)

    const bb = res.solid!.boundingBox()
    expect(bb.min[0]).toBeCloseTo(0, 3)
    expect(bb.min[1]).toBeCloseTo(0, 3)
    expect(bb.min[2]).toBeCloseTo(0, 3)
    expect(bb.max[0]).toBeCloseTo(40, 3)
    expect(bb.max[1]).toBeCloseTo(20, 3)
    expect(bb.max[2]).toBeCloseTo(10, 3)
  })

  it('symmetric extrude extends equally to both sides of sketch plane', async () => {
    let s = createSketch('Symm', { base: 'XY', offset: 0 })
    const rect = rectangleMacro(s, {
      p1: { x: -20, y: -10 },
      p2: { x: 20, y: 10 },
    })
    s = rect.sketch

    const res = await buildExtrude(s, {
      side: 'symmetric',
      d1: 10,
      op: 'new',
    })

    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    const bb = res.solid!.boundingBox()
    expect(bb.min[2]).toBeCloseTo(-5, 3)
    expect(bb.max[2]).toBeCloseTo(5, 3)
  })

  it('extrudes plate with hole with correct subtracted volume', async () => {
    let s = createSketch('PlateWithHole')
    const rect = rectangleMacro(s, {
      p1: { x: 0, y: 0 },
      p2: { x: 40, y: 40 },
    })
    s = rect.sketch
    // Hole r = 5 at (20, 20)
    const c1 = addCircle(s, { x: 20, y: 20 }, 5)
    s = c1.sketch

    const res = await buildExtrude(s, {
      side: 'one',
      d1: 10,
      op: 'new',
    })

    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    // Expected volume: (40*40 - pi*5^2) * 10 = (1600 - 78.5398) * 10 ≈ 15215
    expect(res.solid!.volume()).toBeCloseTo(15215, -1)
  })

  it('refuses zero or negative distance', async () => {
    let s = createSketch('ZeroDist')
    const rect = rectangleMacro(s, { p1: { x: 0, y: 0 }, p2: { x: 10, y: 10 } })
    s = rect.sketch

    const resZero = await buildExtrude(s, { side: 'one', d1: 0, op: 'new' })
    expect(resZero.error).toBe('sketch.error.invalidDistance')

    const resNeg = await buildExtrude(s, { side: 'one', d1: -5, op: 'new' })
    expect(resNeg.error).toBe('sketch.error.invalidDistance')
  })

  it('revolves ring with volume matching Pappus theorem within tolerance', async () => {
    let s = createSketch('RevolveRing')
    // Circle at center (15, 0), radius 3
    const c = addCircle(s, { x: 15, y: 0 }, 3)
    s = c.sketch

    // Revolve 360 deg around Y plane axis
    const res = await buildRevolve(s, {
      axis: { kind: 'planeAxis', axis: 'y' },
      angle: 360,
      op: 'new',
    }, { segments: 64 })

    expect(res.error).toBeUndefined()
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)

    // Pappus: V = 2 * pi * R_center * Area = 2 * pi * 15 * (pi * 3^2) ≈ 2664.8. Polygon approx: ~2649
    expect(res.solid!.volume()).toBeCloseTo(2650, -2)
  })

  it('refuses revolve when profile crosses the revolution axis', async () => {
    let s = createSketch('CrossingRevolve')
    // Circle centered at (1, 0) with radius 5 crosses the Y axis (x goes from -4 to 6)
    const c = addCircle(s, { x: 1, y: 0 }, 5)
    s = c.sketch

    const res = await buildRevolve(s, {
      axis: { kind: 'planeAxis', axis: 'y' },
      angle: 360,
      op: 'new',
    })

    expect(res.solid).toBeUndefined()
    expect(res.error).toBe('sketch.error.revolveCrossesAxis')
  })
})
