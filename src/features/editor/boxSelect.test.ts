import { describe, expect, it } from 'vitest'
import { intersectsRect, isObjectInBoxSelect, projectBounds } from './boxSelect'

describe('editor/boxSelect', () => {
  it('intersectsRect checks overlap of 2D screen rectangles', () => {
    const a = { x0: 10, y0: 10, x1: 50, y1: 50 }
    const b = { x0: 40, y0: 40, x1: 80, y1: 80 }
    const c = { x0: 60, y0: 60, x1: 100, y1: 100 }

    expect(intersectsRect(a, b)).toBe(true)
    expect(intersectsRect(b, c)).toBe(true)
    expect(intersectsRect(a, c)).toBe(false)
  })

  it('projectBounds maps 3D AABB corners to 2D enclosing rect', () => {
    const bounds = {
      min: [-10, -10, 0] as [number, number, number],
      max: [10, 10, 20] as [number, number, number],
    }

    // Mock orthographic projection where screen x = 100 + 2*X, screen y = 100 - 2*Y
    const project = (p: [number, number, number]): [number, number] => [
      100 + p[0] * 2,
      100 - p[1] * 2,
    ]

    const rect = projectBounds(bounds, project)
    expect(rect.x0).toBe(80)
    expect(rect.x1).toBe(120)
    expect(rect.y0).toBe(80)
    expect(rect.y1).toBe(120)
  })

  it('isObjectInBoxSelect returns true when selection box overlaps object bounds', () => {
    const bounds = {
      min: [-10, -10, 0] as [number, number, number],
      max: [10, 10, 20] as [number, number, number],
    }
    const project = (p: [number, number, number]): [number, number] => [
      100 + p[0] * 2,
      100 - p[1] * 2,
    ]

    // Overlapping box
    expect(
      isObjectInBoxSelect({ x0: 50, y0: 50, x1: 90, y1: 90 }, bounds, project)
    ).toBe(true)

    // Non-overlapping box
    expect(
      isObjectInBoxSelect({ x0: 10, y0: 10, x1: 40, y1: 40 }, bounds, project)
    ).toBe(false)
  })
})
