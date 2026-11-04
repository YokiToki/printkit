import { describe, expect, it } from 'vitest'
import {
  distanceFromOrthoHeight,
  fitCameraToBounds,
  orthoHeightFromDistance,
  standardViewPosition,
  VIEW_DIRECTIONS,
} from './viewCommands'

describe('editor/viewCommands', () => {
  it('defines correct orthogonal view directions for all 6 faces', () => {
    expect(VIEW_DIRECTIONS.top).toEqual([0, 0, 1])
    expect(VIEW_DIRECTIONS.bottom).toEqual([0, 0, -1])
    expect(VIEW_DIRECTIONS.front).toEqual([0, -1, 0])
    expect(VIEW_DIRECTIONS.back).toEqual([0, 1, 0])
    expect(VIEW_DIRECTIONS.right).toEqual([1, 0, 0])
    expect(VIEW_DIRECTIONS.left).toEqual([-1, 0, 0])
  })

  it('converts between perspective distance and ortho height keeping framing', () => {
    const fov = 35
    const distance = 200

    const h = orthoHeightFromDistance(distance, fov)
    expect(h).toBeGreaterThan(0)

    const distBack = distanceFromOrthoHeight(h, fov)
    expect(distBack).toBeCloseTo(distance)
  })

  it('computes standard view camera position from target and distance', () => {
    const target: [number, number, number] = [10, 20, 30]
    const dist = 100

    const posFront = standardViewPosition('front', target, dist)
    expect(posFront[0]).toBeCloseTo(10)
    expect(posFront[1]).toBeCloseTo(20 - 100) // front is -Y
    expect(posFront[2]).toBeCloseTo(30)

    const posRight = standardViewPosition('right', target, dist)
    expect(posRight[0]).toBeCloseTo(10 + 100) // right is +X
    expect(posRight[1]).toBeCloseTo(20)
    expect(posRight[2]).toBeCloseTo(30)
  })

  it('computes framing target and distance with fitCameraToBounds', () => {
    const bounds = {
      min: [0, 0, 0] as [number, number, number],
      max: [40, 20, 10] as [number, number, number],
    }

    const fit = fitCameraToBounds(bounds, 35, 1)
    expect(fit.target).toEqual([20, 10, 5])
    expect(fit.distance).toBeGreaterThan(0)
    expect(fit.orthoHeight).toBeGreaterThan(0)
  })

  it('frames small objects (e.g. 1x2 mm cylinder) without clamping distance to large dimensions', () => {
    const smallBounds = {
      min: [-0.5, -0.5, 0] as [number, number, number],
      max: [0.5, 0.5, 2] as [number, number, number],
    }

    const fit = fitCameraToBounds(smallBounds, 35, 1)
    expect(fit.target).toEqual([0, 0, 1])
    // Radius is ~1.22 mm, dist should be around ~4.7 mm, not clamped to 10+ mm (which gave ~38 mm)
    expect(fit.distance).toBeLessThan(10)
    expect(fit.orthoHeight).toBeLessThan(5)
  })
})
