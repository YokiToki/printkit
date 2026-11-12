import { describe, it, expect } from 'vitest'
import { getMmPerPx, computeGridLevels, gridLevelsFromCamera } from './gridLevels'

describe('gridLevels', () => {
  it('calculates mmPerPx in perspective and ortho', () => {
    // 600px height, 45deg fov, dist ~724.26 mm -> visible height ~600 mm -> ~1 mm/px
    const dist = 300 / Math.tan((45 * Math.PI) / 360)
    const mmPerPxPersp = getMmPerPx({ distance: dist, fov: 45, viewportHeight: 600 })
    expect(mmPerPxPersp).toBeCloseTo(1, 2)

    const mmPerPxOrtho = getMmPerPx({ isOrtho: true, orthoHeight: 300, viewportHeight: 600 })
    expect(mmPerPxOrtho).toBeCloseTo(0.5, 3)
  })

  it('generates 5x5 step sequence', () => {
    // When 1 mm is 1 pixel (mmPerPx = 1):
    // 12 <= minor/1 < 60 -> minor = 50, major = 250
    const l1 = computeGridLevels(1)
    expect(l1.minor).toBe(50)
    expect(l1.major).toBe(250)

    // When 1 mm is 2 pixels (mmPerPx = 0.5):
    // 12 <= minor/0.5 < 60 -> minor = 10, major = 50
    const l2 = computeGridLevels(0.5)
    expect(l2.minor).toBe(10)
    expect(l2.major).toBe(50)

    // When zooming in close (mmPerPx = 0.1):
    // 12 <= minor/0.1 < 60 -> minor = 2, major = 10
    const l3 = computeGridLevels(0.1)
    expect(l3.minor).toBe(2)
    expect(l3.major).toBe(10)

    // When zooming in further (mmPerPx = 0.02):
    // minor = 0.4, major = 2
    const l4 = computeGridLevels(0.02)
    expect(l4.minor).toBe(0.4)
    expect(l4.major).toBe(2)

    // Sub-millimeter (mmPerPx = 0.004):
    // minor = 0.08, major = 0.4
    const l5 = computeGridLevels(0.004)
    expect(l5.minor).toBe(0.08)
    expect(l5.major).toBe(0.4)

    // Macro scale (mmPerPx = 5):
    // minor = 250, major = 1250
    const l6 = computeGridLevels(5)
    expect(l6.minor).toBe(250)
    expect(l6.major).toBe(1250)
  })

  it('guarantees major is always 5x minor', () => {
    for (let mmPerPx = 0.001; mmPerPx <= 100; mmPerPx *= 1.3) {
      const { minor, major } = computeGridLevels(mmPerPx)
      expect(major).toBeCloseTo(minor * 5, 4)
    }
  })

  it('guarantees fade continuity in [0, 1]', () => {
    for (let mmPerPx = 0.005; mmPerPx <= 50; mmPerPx *= 1.05) {
      const { fade } = computeGridLevels(mmPerPx)
      expect(fade).toBeGreaterThanOrEqual(0)
      expect(fade).toBeLessThanOrEqual(1)
    }
  })

  it('computes grid levels directly from camera parameters', () => {
    const res = gridLevelsFromCamera({ distance: 400, fov: 45, viewportHeight: 800 })
    expect(res.minor).toBeGreaterThan(0)
    expect(res.major).toBe(res.minor * 5)
    expect(res.fade).toBeGreaterThanOrEqual(0)
    expect(res.fade).toBeLessThanOrEqual(1)
  })
})
