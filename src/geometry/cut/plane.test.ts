import { describe, expect, it } from 'vitest'
import { getWasm } from '../wasm'
import {
  cutSolid,
  normalizePlane,
  sliceSolidN,
  NotSolidError,
  type PlaneDefinition,
} from './plane'

describe('geometry/cut/plane.ts (Task 2.1)', () => {
  it('normalizes plane definitions across all 4 kinds', () => {
    // 1. Axis
    const pAxis = normalizePlane({ kind: 'axis', axis: 'z', position: 15 })
    expect(pAxis.normal).toEqual([0, 0, 1])
    expect(pAxis.originOffset).toBe(15)

    // 2. Normal + point
    const pNorm = normalizePlane({
      kind: 'normalPoint',
      normal: [0, 2, 0],
      point: [10, 5, 20],
    })
    expect(pNorm.normal).toEqual([0, 1, 0])
    expect(pNorm.originOffset).toBe(5)

    // 3. Face frame (origin + normal)
    const pFace = normalizePlane({
      kind: 'face',
      origin: [0, 0, 10],
      normal: [0, 0, 1],
    })
    expect(pFace.normal).toEqual([0, 0, 1])
    expect(pFace.originOffset).toBe(10)

    // 4. Three points: XY plane at Z = 5
    const pThree = normalizePlane({
      kind: 'threePoints',
      p1: [0, 0, 5],
      p2: [10, 0, 5],
      p3: [0, 10, 5],
    })
    expect(pThree.normal).toEqual([0, 0, 1])
    expect(pThree.originOffset).toBe(5)
  })

  it('cuts a solid into two closed halves whose volumes sum to original', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const initialVol = cube.volume()

    const parts = cutSolid(cube, { kind: 'axis', axis: 'z', position: 0 }, 'both')
    expect(parts.length).toBe(2)
    expect(parts[0].label).toBe('A')
    expect(parts[1].label).toBe('B')

    expect(parts[0].manifold.status()).toBe('NoError')
    expect(parts[1].manifold.status()).toBe('NoError')

    const vA = parts[0].manifold.volume()
    const vB = parts[1].manifold.volume()
    expect(vA + vB).toBeCloseTo(initialVol, 4)
    expect(vA).toBeCloseTo(initialVol / 2, 4)
    expect(vB).toBeCloseTo(initialVol / 2, 4)

    // Bounding boxes check
    const bbA = parts[0].manifold.boundingBox()
    const bbB = parts[1].manifold.boundingBox()
    expect(bbA.max[2]).toBeCloseTo(0, 4)
    expect(bbB.min[2]).toBeCloseTo(0, 4)
  })

  it('cuts with keepNegative and keepPositive modes', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const initialVol = cube.volume()

    const keptNeg = cutSolid(cube, { kind: 'axis', axis: 'z', position: 0 }, 'keepNegative')
    expect(keptNeg.length).toBe(1)
    expect(keptNeg[0].label).toBe('A')
    expect(keptNeg[0].manifold.volume()).toBeCloseTo(initialVol / 2, 4)

    const keptPos = cutSolid(cube, { kind: 'axis', axis: 'z', position: 0 }, 'keepPositive')
    expect(keptPos.length).toBe(1)
    expect(keptPos[0].label).toBe('B')
    expect(keptPos[0].manifold.volume()).toBeCloseTo(initialVol / 2, 4)
  })

  it('cuts with an arbitrary 30-degree inclined plane', async () => {
    const w = await getWasm()
    const cylinder = w.Manifold.cylinder(30, 10, 10, 32, true)
    const initialVol = cylinder.volume()

    // 30 degree tilt around Y: normal = [sin(30°), 0, cos(30°)] = [0.5, 0, 0.866025]
    const rad30 = (30 * Math.PI) / 180
    const normal: [number, number, number] = [Math.sin(rad30), 0, Math.cos(rad30)]

    const parts = cutSolid(
      cylinder,
      { kind: 'normalPoint', normal, point: [0, 0, 0] },
      'both'
    )

    expect(parts.length).toBe(2)
    expect(parts[0].manifold.status()).toBe('NoError')
    expect(parts[1].manifold.status()).toBe('NoError')

    const sumVol = parts[0].manifold.volume() + parts[1].manifold.volume()
    expect(sumVol).toBeCloseTo(initialVol, 3)
  })

  it('slices a solid into N equal parts along an axis', async () => {
    const w = await getWasm()
    const block = w.Manifold.cube([30, 20, 10], true)
    const initialVol = block.volume()

    const parts = sliceSolidN(block, 'x', 3)
    expect(parts.length).toBe(3)
    expect(parts.map((p) => p.label)).toEqual(['1', '2', '3'])

    let sumVol = 0
    for (const p of parts) {
      expect(p.manifold.status()).toBe('NoError')
      sumVol += p.manifold.volume()
    }
    expect(sumVol).toBeCloseTo(initialVol, 4)

    // Each slice should have equal volume
    for (const p of parts) {
      expect(p.manifold.volume()).toBeCloseTo(initialVol / 3, 3)
    }
  })

  it('refuses empty or non-solid manifolds', async () => {
    const w = await getWasm()
    const empty = w.Manifold.compose([])
    expect(() =>
      cutSolid(empty, { kind: 'axis', axis: 'z', position: 0 })
    ).toThrow(NotSolidError)
  })
})
