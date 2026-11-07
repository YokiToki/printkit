import { describe, it, expect } from 'vitest'
import {
  overhangColorRamp,
  thinWallColorRamp,
  computeOverhangMap,
  getSectionPlane,
} from './analysisOverlays'
import type { IndexedMesh } from '../stl-import'
import type { Mat4 } from '../../editor/scene'

describe('analysisOverlays', () => {
  describe('overhangColorRamp', () => {
    it('returns green-grey for overhang angles below threshold', () => {
      const color = overhangColorRamp(30, 45)
      expect(color).toEqual([0.4, 0.7, 0.5])
    })

    it('returns yellow for angle at threshold', () => {
      const color = overhangColorRamp(45, 45)
      expect(color[0]).toBeCloseTo(1.0)
      expect(color[1]).toBeCloseTo(0.85)
      expect(color[2]).toBeCloseTo(0.1)
    })

    it('returns red for 90 degree downward surface', () => {
      const color = overhangColorRamp(90, 45)
      expect(color[0]).toBeCloseTo(1.0)
      expect(color[1]).toBeCloseTo(0.15)
      expect(color[2]).toBeCloseTo(0.15)
    })
  })

  describe('thinWallColorRamp', () => {
    it('returns blue-grey for thickness at or above threshold', () => {
      const color = thinWallColorRamp(1.2, 0.8)
      expect(color).toEqual([0.45, 0.65, 0.85])
    })

    it('returns red for zero thickness', () => {
      const color = thinWallColorRamp(0, 0.8)
      expect(color[0]).toBeCloseTo(1.0)
      expect(color[1]).toBeCloseTo(0.1)
      expect(color[2]).toBeCloseTo(0.1)
    })

    it('returns yellow-orange near threshold', () => {
      const color = thinWallColorRamp(0.79, 0.8)
      expect(color[0]).toBeCloseTo(1.0)
      expect(color[1]).toBeGreaterThan(0.8)
      expect(color[2]).toBeCloseTo(0.1)
    })
  })

  describe('computeOverhangMap', () => {
    it('computes vertex colors identifying downward faces as overhang', () => {
      // Single triangle facing downward: normal [0, 0, -1]
      // Winding clockwise when viewed from +Z: [0,0,0], [0,1,0], [1,0,0]
      const mesh: IndexedMesh = {
        vertProperties: new Float32Array([
          0, 0, 0,
          0, 1, 0,
          1, 0, 0,
        ]),
        triVerts: new Uint32Array([0, 1, 2]),
      }
      const identityMat: Mat4 = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]

      const colors = computeOverhangMap(mesh, identityMat, 45)
      expect(colors.length).toBe(9) // 3 vertices * 3 rgb

      // All 3 vertices should be colored red (90° overhang)
      for (let v = 0; v < 3; v++) {
        expect(colors[v * 3]).toBeCloseTo(1.0)
        expect(colors[v * 3 + 1]).toBeCloseTo(0.15)
        expect(colors[v * 3 + 2]).toBeCloseTo(0.15)
      }
    })
  })

  describe('getSectionPlane', () => {
    it('creates clipping planes for x, y, and z axes', () => {
      const px = getSectionPlane('x', 15)
      expect(px.normal).toEqual([-1, 0, 0])
      expect(px.constant).toBe(15)

      const py = getSectionPlane('y', -5)
      expect(py.normal).toEqual([0, -1, 0])
      expect(py.constant).toBe(-5)

      const pz = getSectionPlane('z', 20)
      expect(pz.normal).toEqual([0, 0, -1])
      expect(pz.constant).toBe(20)
    })
  })
})
