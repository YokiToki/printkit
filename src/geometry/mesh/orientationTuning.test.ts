import { describe, it, expect } from 'vitest'
import { getWasm } from '../wasm'
import { bestOrientations } from './orientation'
import type { IndexedMesh } from '../stl-import'

describe('4.3 Tune best-orientation weights on 3 reference models', () => {
  it('evaluates L-bracket, stepped pin, and hollow cup, confirming optimal orientations', async () => {
    const w = await getWasm()

    // Model 1: L-shaped bracket
    // Base 40x20x10, Upright 10x20x30
    const lBase = w.Manifold.cube([40, 20, 10])
    const lUpright = w.Manifold.cube([10, 20, 30])
    const lBracket = lBase.add(lUpright)
    const m1 = lBracket.getMesh()
    const lMesh: IndexedMesh = { vertProperties: m1.vertProperties, triVerts: m1.triVerts }

    // Model 2: Stepped pin / bolt
    // Head diameter 20, height 5; Shaft diameter 10, height 25
    const head = w.Manifold.cylinder(5, 10, 10, 32)
    const shaft = w.Manifold.cylinder(25, 5, 5, 32).translate([0, 0, 5])
    const pin = head.add(shaft)
    const m2 = pin.getMesh()
    const pinMesh: IndexedMesh = { vertProperties: m2.vertProperties, triVerts: m2.triVerts }

    // Model 3: Hollow cup
    // Outer box 30x30x20, cavity 26x26x18
    const cupOuter = w.Manifold.cube([30, 30, 20])
    const cupInner = w.Manifold.cube([26, 26, 18]).translate([2, 2, 2])
    const cup = cupOuter.subtract(cupInner)
    const m3 = cup.getMesh()
    const cupMesh: IndexedMesh = { vertProperties: m3.vertProperties, triVerts: m3.triVerts }

    // Test tuned weights:
    // a = 1.0 (overhang penalty per mm²)
    // b = 2.0 (height penalty per mm: print time factor)
    // c = 0.5 (contact area reward per mm²: bed adhesion)
    const weights = { a: 1.0, b: 2.0, c: 0.5 }

    const lSug = bestOrientations(lMesh, weights)
    const pinSug = bestOrientations(pinMesh, weights)
    const cupSug = bestOrientations(cupMesh, weights)

    console.log('L-Bracket top suggestion:', lSug[0])
    console.log('Pin top suggestion:', pinSug[0])
    console.log('Cup top suggestion:', cupSug[0])

    // For L-bracket, top suggestion has low overhang area and height <= 30
    expect(lSug[0].overhangArea).toBeLessThanOrEqual(lSug[lSug.length - 1].overhangArea)

    // For pin, head down ([0, 0, 0]) has contactArea ~ 314 mm² and 0 overhangs
    expect(pinSug[0].overhangArea).toBe(0)
    expect(pinSug[0].contactArea).toBeGreaterThan(200)

    // For cup, base on bed ([0, 0, 0]) has 0 overhangs and contactArea = 900 mm²
    expect(cupSug[0].overhangArea).toBe(0)
    expect(cupSug[0].contactArea).toBeCloseTo(900, 0)
  })
})
