import { describe, it, expect } from 'vitest'
import { identityMat4, multiplyMat4, invertMat4, relativeMatrix } from './matrix'
import { matrixOf } from '../editor/scene'

describe('matrix.ts', () => {
  it('multiplies and inverts matrices', () => {
    const I = identityMat4()
    expect(multiplyMat4(I, I)).toEqual(I)
    expect(invertMat4(I)).toEqual(I)

    const t1 = matrixOf({
      position: [10, 20, 30],
      rotation: [0, 90, 0],
      scale: [1, 1, 1],
    })

    const inv = invertMat4(t1)
    const prod = multiplyMat4(t1, inv)
    for (let i = 0; i < 16; i++) {
      expect(prod[i]).toBeCloseTo(I[i], 5)
    }

    const t2 = matrixOf({
      position: [15, 20, 30],
      rotation: [0, 90, 0],
      scale: [1, 1, 1],
    })

    const rel = relativeMatrix(t1, t2)
    // Relative difference along local X after 90 deg rotation about Y:
    // delta in world is [5, 0, 0]. In local frame rotated 90 deg around Y:
    // world X is local -Z, world Z is local X.
    expect(rel[12]).toBeCloseTo(0, 5)
    expect(rel[13]).toBeCloseTo(0, 5)
    expect(rel[14]).toBeCloseTo(5, 5)
  })
})
