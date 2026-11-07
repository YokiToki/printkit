import { beforeAll, describe, expect, it } from 'vitest'
import type { ManifoldToplevel } from 'manifold-3d'
import { getWasm } from '../../wasm'
import { expectValidSolid } from '../../testing'
import { applyText, buildTextTool, type TextOpParams } from './text'

let w: ManifoldToplevel

beforeAll(async () => {
  w = await getWasm()
})

describe('text operation (Task 3.3)', () => {
  it('engraved volume ≈ glyph area × depth on flat block', () => {
    // 20 x 20 x 10 block centered in XY, z from 0 to 10
    const block = w.Manifold.cube([20, 20, 10], true).translate([0, 0, 5])
    const initialVol = block.volume()
    expect(initialVol).toBeCloseTo(4000, 1)

    const depth = 1.0
    const params: TextOpParams = {
      point: [0, 0, 10],
      normal: [0, 0, 1],
      text: 'A',
      size: 6,
      mode: 'engrave',
      depth,
      // explicit square polygon 4x4 mm = area 16 mm²
      polygons: [[[-2, -2], [2, -2], [2, 2], [-2, 2]]],
    }

    const { solid, area, warning, error } = applyText(w, block, params)
    expect(error).toBeUndefined()
    expect(warning).toBeUndefined()
    expect(area).toBeCloseTo(16, 2)
    expectValidSolid(solid!)

    const expectedCut = 16 * depth
    const actualCut = initialVol - solid!.volume()
    expect(actualCut).toBeCloseTo(expectedCut, 1)

    block.delete()
    solid!.delete()
  })

  it('embossed body stays one solid and volume increases by area × height', () => {
    const block = w.Manifold.cube([20, 20, 10], true).translate([0, 0, 5])
    const initialVol = block.volume()

    const height = 1.2
    const params: TextOpParams = {
      point: [0, 0, 10],
      normal: [0, 0, 1],
      text: 'OK',
      size: 5,
      mode: 'emboss',
      height,
      polygons: [
        [[-3, -2], [-1, -2], [-1, 2], [-3, 2]],
        [[1, -2], [3, -2], [3, 2], [1, 2]],
      ], // two 2x4 rectangles, total area = 16 mm²
    }

    const { solid, area, warning } = applyText(w, block, params)
    expect(warning).toBeUndefined()
    expect(area).toBeCloseTo(16, 2)
    expectValidSolid(solid!)

    const expectedGain = 16 * height
    const actualGain = solid!.volume() - initialVol
    expect(actualGain).toBeCloseTo(expectedGain, 1)

    // Bounding box extends to 10 + height
    const bbox = solid!.boundingBox()
    expect(bbox.max[2]).toBeCloseTo(10 + height, 2)

    block.delete()
    solid!.delete()
  })

  it('generates fallback polygons for text string when polygons omitted', () => {
    const block = w.Manifold.cube([30, 30, 10], true).translate([0, 0, 5])
    const params: TextOpParams = {
      point: [0, 0, 10],
      normal: [0, 0, 1],
      text: 'PRINT',
      size: 4,
      mode: 'emboss',
      height: 0.8,
    }

    const { solid, area } = applyText(w, block, params)
    expect(area).toBeGreaterThan(0)
    expectValidSolid(solid!)
    expect(solid!.volume()).toBeGreaterThan(block.volume())

    block.delete()
    solid!.delete()
  })

  it('reports warning text.warning.curved on a cylinder', () => {
    // Cylinder radius 10, height 20 along Z
    const cyl = w.Manifold.cylinder(20, 10, 10, 64, true)

    // Text on curved side at x=10, y=0, z=0 with normal [1, 0, 0]
    // Text width is 14 mm (from -7 to +7 along y)
    // On radius 10, at y=7 the cylinder surface is at x = sqrt(100 - 49) = 7.14 mm
    // The deviation from tangent plane x=10 is 10 - 7.14 = 2.86 mm > depth 0.5 mm
    const params: TextOpParams = {
      point: [10, 0, 0],
      normal: [1, 0, 0],
      text: 'LONG',
      size: 6,
      mode: 'engrave',
      depth: 0.5,
      polygons: [[[-7, -2], [7, -2], [7, 2], [-7, 2]]],
    }

    const { solid, warning } = applyText(w, cyl, params)
    expect(warning).toBe('text.warning.curved')
    expectValidSolid(solid!)

    cyl.delete()
    solid!.delete()
  })
})
