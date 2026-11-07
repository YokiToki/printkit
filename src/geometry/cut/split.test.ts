import { describe, expect, it } from 'vitest'
import { getWasm } from '../wasm'
import {
  autoCutsAxis,
  resolveGridCuts,
  splitSolidGrid,
  columnLetter,
  type BedDimensions,
} from './split'

describe('geometry/cut/split.ts (Task 2.2)', () => {
  it('generates column letters correctly', () => {
    expect(columnLetter(0)).toBe('A')
    expect(columnLetter(1)).toBe('B')
    expect(columnLetter(25)).toBe('Z')
    expect(columnLetter(26)).toBe('AA')
  })

  it('computes fewest parts and even spread for 500 mm and 600 mm spans on 256 bed', () => {
    // 500 mm / 256 = 1.95 -> 2 parts (fewest parts), 1 cut at 250 mm
    const cuts500 = autoCutsAxis(0, 500, 256)
    expect(cuts500.length).toBe(1)
    expect(cuts500[0]).toBeCloseTo(250, 2)

    // 600 mm / 256 = 2.34 -> 3 parts, 2 cuts (at 200 and 400 mm)
    const cuts600 = autoCutsAxis(0, 600, 256)
    expect(cuts600.length).toBe(2)
    expect(cuts600[0]).toBeCloseTo(200, 2)
    expect(cuts600[1]).toBeCloseTo(400, 2)

    // Span smaller than bed produces no cuts
    expect(autoCutsAxis(0, 100, 256)).toEqual([])
  })

  it('prefers small-section positions within +/- 10% search window', () => {
    // Model with nominal cut at 250 mm (step = 250 mm).
    // 10% of step (25 mm) allows searching between 225 and 275 mm.
    const sectionSampler = (pos: number) => {
      // Minimum at pos = 260
      return Math.abs(pos - 260) + 10
    }

    const cuts = autoCutsAxis(0, 500, 256, sectionSampler)
    expect(cuts.length).toBe(1)
    // Cut should be shifted towards 260
    expect(cuts[0]).toBeCloseTo(260, 1)
  })

  it('splits 500 x 100 block on a 256 bed into fewest parts (A1, B1)', async () => {
    const w = await getWasm()
    // 500 x 100 x 20 block centered at origin (-250..250, -50..50, -10..10)
    const solid = w.Manifold.cube([500, 100, 20], true)
    const bed: BedDimensions = { x: 256, y: 256, z: 256 }

    const cuts = resolveGridCuts(solid, { usableBed: bed })
    expect(cuts.x.length).toBe(1)
    expect(cuts.y.length).toBe(0)
    expect(cuts.z.length).toBe(0)

    const parts = splitSolidGrid(solid, cuts, bed)
    expect(parts.length).toBe(2)
    expect(parts.map((p) => p.label)).toEqual(['A1', 'B1'])

    // No part should be oversize
    for (const p of parts) {
      expect(p.oversize).toBe(false)
      expect(p.max[0] - p.min[0]).toBeLessThanOrEqual(256)
      expect(p.max[1] - p.min[1]).toBeLessThanOrEqual(256)
    }

    // Sum of volumes equals 500 * 100 * 20 = 1,000,000
    const sumVol = parts.reduce((acc, p) => acc + p.manifold.volume(), 0)
    expect(sumVol).toBeCloseTo(1_000_000, 3)
  })

  it('marks rotated block that exceeds bed as oversize', async () => {
    const w = await getWasm()
    // 300 x 50 x 20 block, rotated 45 degrees around Z
    const block = w.Manifold.cube([300, 50, 20], true)
    const rotated = block.rotate([0, 0, 45])

    const smallBed: BedDimensions = { x: 150, y: 150, z: 200 }
    // Single cut in X at 0
    const parts = splitSolidGrid(rotated, { x: [0], y: [], z: [] }, smallBed)

    expect(parts.length).toBe(2)
    // At least one diagonal half exceeds 150 in X or Y
    const hasOversize = parts.some((p) => p.oversize)
    expect(hasOversize).toBe(true)
  })

  it('keeps manual cuts when bed or printer changes', async () => {
    const w = await getWasm()
    const solid = w.Manifold.cube([400, 100, 20], true)

    const manualCuts = { x: [10, 50] }
    const bed1: BedDimensions = { x: 256, y: 256, z: 256 }
    const resolved1 = resolveGridCuts(solid, { usableBed: bed1, manualCuts })
    expect(resolved1.x).toEqual([10, 50])

    // Change printer to a larger bed (300 x 300)
    const bed2: BedDimensions = { x: 300, y: 300, z: 300 }
    const resolved2 = resolveGridCuts(solid, { usableBed: bed2, manualCuts })
    // Manual cuts are still preserved!
    expect(resolved2.x).toEqual([10, 50])
  })
})
