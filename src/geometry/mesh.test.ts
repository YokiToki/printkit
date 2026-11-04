import { describe, expect, it } from 'vitest'
import { matrixOf } from '../editor/scene'
import { applyMatrix, meshBounds, type MeshData } from './mesh'

describe('geometry/mesh', () => {
  // A box mesh: 10 x 20 x 30
  // 8 vertices, 12 triangles
  const createBoxMesh = (): MeshData => {
    const v = [
      0, 0, 0,
      10, 0, 0,
      10, 20, 0,
      0, 20, 0,
      0, 0, 30,
      10, 0, 30,
      10, 20, 30,
      0, 20, 30,
    ]
    const f = [
      0, 2, 1,  0, 3, 2,
      4, 5, 6,  4, 6, 7,
      0, 1, 5,  0, 5, 4,
      1, 2, 6,  1, 6, 5,
      2, 3, 7,  2, 7, 6,
      3, 0, 4,  3, 4, 7,
    ]
    return {
      vertProperties: Float32Array.from(v),
      triVerts: Uint32Array.from(f),
      numProp: 3,
      min: [0, 0, 0],
      max: [10, 20, 30],
      volume: 10 * 20 * 30, // 6000
    }
  }

  it('meshBounds computes accurate AABB', () => {
    const box = createBoxMesh()
    const b = meshBounds(box)
    expect(b.min).toEqual([0, 0, 0])
    expect(b.max).toEqual([10, 20, 30])
  })

  it('applyMatrix handles translation and preserves volume', () => {
    const box = createBoxMesh()
    const m = matrixOf({
      position: [5, -10, 20],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })

    const transformed = applyMatrix(box, m)
    expect(transformed.min).toEqual([5, -10, 20])
    expect(transformed.max).toEqual([15, 10, 50])
    expect(transformed.volume).toBeCloseTo(6000)
  })

  it('applyMatrix handles 90° rotation and preserves volume', () => {
    const box = createBoxMesh()
    // Rotate 90° around Z:
    // (x, y, z) -> (-y, x, z)
    // [0..10, 0..20, 0..30] -> [-20..0, 0..10, 0..30]
    const m = matrixOf({
      position: [0, 0, 0],
      rotation: [0, 0, 90],
      scale: [1, 1, 1],
    })

    const transformed = applyMatrix(box, m)
    expect(transformed.min[0]).toBeCloseTo(-20)
    expect(transformed.max[0]).toBeCloseTo(0)
    expect(transformed.min[1]).toBeCloseTo(0)
    expect(transformed.max[1]).toBeCloseTo(10)
    expect(transformed.min[2]).toBeCloseTo(0)
    expect(transformed.max[2]).toBeCloseTo(30)
    expect(transformed.volume).toBeCloseTo(6000)
  })

  it('applyMatrix reverses triangle winding for reflection/mirror', () => {
    const box = createBoxMesh()
    // Mirror along X: scale = [-1, 1, 1]
    const m = matrixOf({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [-1, 1, 1],
    })

    const transformed = applyMatrix(box, m)
    // Check that vertices 1 and 2 in each triangle were swapped:
    // Original triangle 0 was [0, 2, 1] -> transformed should be [0, 1, 2]
    expect(transformed.triVerts[0]).toBe(box.triVerts[0])
    expect(transformed.triVerts[1]).toBe(box.triVerts[2])
    expect(transformed.triVerts[2]).toBe(box.triVerts[1])

    expect(transformed.min[0]).toBeCloseTo(-10)
    expect(transformed.max[0]).toBeCloseTo(0)
    expect(transformed.volume).toBeCloseTo(6000)
  })

  it('rigid transforms preserve bbox dimensions and volume', () => {
    const box = createBoxMesh()
    const m = matrixOf({
      position: [123, -456, 789],
      rotation: [30, 45, 60],
      scale: [1, 1, 1],
    })

    const transformed = applyMatrix(box, m)
    expect(transformed.volume).toBeCloseTo(6000)
  })
})
