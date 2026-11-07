import { describe, expect, it } from 'vitest'
import { getWasm } from '../../wasm'
import { applyHole, buildHoleTool, type HoleParams } from './hole'

describe('geometry/features/ops/hole.ts (Task 3.2)', () => {
  it('builds a simple blind hole tool and subtracts correct volume', async () => {
    const w = await getWasm()
    // 30 x 30 x 30 block from -15 to +15. Top face is at z = +15 with normal [0, 0, 1].
    const block = w.Manifold.cube([30, 30, 30], true)
    const initialVol = block.volume()

    const params: HoleParams = {
      point: [0, 0, 15],
      normal: [0, 0, 1],
      kind: 'simple',
      diameter: 6, // radius = 3
      depth: 10,
    }

    const res = applyHole(w, block, params)
    expect(res.error).toBeUndefined()
    expect(res.solid).toBeDefined()
    expect(res.solid!.status()).toBe('NoError')

    // Subtracted volume inside block should be approximately pi * r^2 * depth
    // with 32 segments: area of 32-gon of radius 3 is 32/2 * 9 * sin(2*pi/32) = 27.87
    // volume ≈ 278.7
    const expectedSubVol = 32 * 0.5 * 9 * Math.sin((2 * Math.PI) / 32) * 10
    const actualSubVol = initialVol - res.solid!.volume()
    expect(actualSubVol).toBeCloseTo(expectedSubVol, 1)

    // Bounding box of hole bottom: z = 15 - 10 = 5
    // Top face is still at 15
    const innerProbe = res.solid!.boundingBox()
    expect(innerProbe.max[2]).toBeCloseTo(15, 2)
  })

  it('builds a counterbore hole tool with head pocket', async () => {
    const w = await getWasm()
    const block = w.Manifold.cube([30, 30, 30], true)
    const initialVol = block.volume()

    const params: HoleParams = {
      point: [0, 0, 15],
      normal: [0, 0, 1],
      kind: 'counterbore',
      diameter: 3.4, // M3 clearance shank
      depth: 12,
      cbDiameter: 6.2, // DIN 912 M3 head pocket
      cbDepth: 3.4,
    }

    const res = applyHole(w, block, params)
    expect(res.error).toBeUndefined()
    expect(res.solid!.status()).toBe('NoError')

    // Vol should be greater than simple 3.4 mm hole alone
    const diffVol = initialVol - res.solid!.volume()
    const rShank = 3.4 / 2
    const rCb = 6.2 / 2
    const approxVol =
      Math.PI * rCb * rCb * 3.4 + Math.PI * rShank * rShank * (12 - 3.4)
    expect(diffVol).toBeGreaterThan(170)
    expect(Math.abs(diffVol - approxVol)).toBeLessThan(2)
  })

  it('builds a countersink 90-degree hole tool', async () => {
    const w = await getWasm()
    const block = w.Manifold.cube([30, 30, 30], true)

    const params: HoleParams = {
      point: [0, 0, 15],
      normal: [0, 0, 1],
      kind: 'countersink',
      diameter: 3.4,
      depth: 10,
      csDiameter: 6.5,
      csAngle: 90,
    }

    const res = applyHole(w, block, params)
    expect(res.error).toBeUndefined()
    expect(res.solid!.status()).toBe('NoError')
    expect(res.solid!.volume()).toBeLessThan(block.volume())
  })

  it('cuts completely through solid when through = true', async () => {
    const w = await getWasm()
    // 20 x 20 x 20 cube centered at origin (z from -10 to +10)
    const block = w.Manifold.cube([20, 20, 20], true)

    const params: HoleParams = {
      point: [0, 0, 10], // top face
      normal: [0, 0, 1],
      kind: 'simple',
      diameter: 4,
      through: true,
    }

    const res = applyHole(w, block, params)
    expect(res.error).toBeUndefined()
    expect(res.solid!.status()).toBe('NoError')

    // Slice at z = -10 (bottom face): hole must have exited through bottom!
    // Slicing at z = -9.9 should show a hole (area < 400)
    const bottomSlice = res.solid!.slice(-9.9)
    expect(bottomSlice.area()).toBeLessThan(390)
    // Slicing at middle z = 0 should show hole
    const midSlice = res.solid!.slice(0)
    expect(midSlice.area()).toBeLessThan(390)
  })

  it('supports holes with inclined normal axis', async () => {
    const w = await getWasm()
    const block = w.Manifold.cube([40, 40, 40], true)

    // 45 degree angle between X and Z
    const rad45 = Math.PI / 4
    const normal: [number, number, number] = [Math.sin(rad45), 0, Math.cos(rad45)]

    const params: HoleParams = {
      point: [10, 0, 20],
      normal,
      kind: 'simple',
      diameter: 5,
      depth: 15,
    }

    const res = applyHole(w, block, params)
    expect(res.error).toBeUndefined()
    expect(res.solid!.status()).toBe('NoError')
    expect(res.solid!.volume()).toBeLessThan(block.volume())
  })
})
