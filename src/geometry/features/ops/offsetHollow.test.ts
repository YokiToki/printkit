import { describe, it, expect } from 'vitest'
import { getWasm } from '../../wasm'
import { expectValidSolid } from '../../testing'
import { applyOffset } from './offset'
import { applyHollow } from './hollow'

describe('offset.ts & hollow.ts (Task 3.3)', () => {
  it('grows cube bbox with circumscribed guarantee', async () => {
    const w = await getWasm()

    // 20 mm cube centered: [-10, 10] on all axes
    const cube = w.Manifold.cube([20, 20, 20], true)

    // Offset +0.2 mm
    const res = applyOffset(w, cube, { distance: 0.2 }, 16)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!)

    const bb = res.solid!.boundingBox()
    expect(bb.min[0]).toBeCloseTo(-10.2, 2)
    expect(bb.max[0]).toBeCloseTo(10.2, 2)
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(20.4, 2)

    res.solid!.delete()
    cube.delete()
  })

  it('shrinks cube and handles shrink to empty error', async () => {
    const w = await getWasm()

    // 20 mm cube centered
    const cube = w.Manifold.cube([20, 20, 20], true)

    // Shrink by -2 mm -> each side in [-8, 8], width = 16 mm
    const shrunk = applyOffset(w, cube, { distance: -2 }, 16)
    expect(shrunk.error).toBeUndefined()
    expectValidSolid(shrunk.solid!)

    const bb = shrunk.solid!.boundingBox()
    expect(bb.min[0]).toBeCloseTo(-8, 1)
    expect(bb.max[0]).toBeCloseTo(8, 1)
    expect(shrunk.solid!.volume()).toBeCloseTo(16 * 16 * 16, 1)
    shrunk.solid!.delete()

    // Shrink by -15 mm on a 20 mm cube -> completely removes volume
    const emptyRes = applyOffset(w, cube, { distance: -15 }, 16)
    expect(emptyRes.solid).toBeUndefined()
    expect(emptyRes.error).toBe('stack.error.offsetEmpty')

    cube.delete()
  })

  it('hollows cube volume and verifies drain connectivity (genus)', async () => {
    const w = await getWasm()

    // 30 mm cube centered: volume = 27000
    const cube = w.Manifold.cube([30, 30, 30], true)

    // Hollow with wall = 2 mm
    // Cavity is a 26 mm cube: volume = 26^3 = 17576
    // Hollow volume = 27000 - 17576 = 9424
    const hollowRes = applyHollow(w, cube, { wall: 2 }, 16)
    expect(hollowRes.error).toBeUndefined()
    expect(hollowRes.solid!.status()).toBe('NoError')
    expect(hollowRes.solid!.volume()).toBeCloseTo(27000 - 17576, 0)
    // A closed hollow shell with an internal cavity has two boundary surfaces (outer and inner),
    // giving Euler characteristic chi = 4 and genus = 1 - 4/2 = -1 in Manifold.
    expect(hollowRes.solid!.genus()).toBe(-1)
    hollowRes.solid!.delete()

    // Now hollow with a drain hole on the bottom face:
    // point: [0, 0, -15], normal: [0, 0, -1], diameter: 4
    const drainRes = applyHollow(
      w,
      cube,
      {
        wall: 2,
        drains: [
          {
            point: [0, 0, -15],
            normal: [0, 0, -1],
            diameter: 4,
          },
        ],
      },
      16,
    )

    expect(drainRes.error).toBeUndefined()
    expectValidSolid(drainRes.solid!)
    // With a drain through the wall, the cavity connects to the outside!
    // Topologically, the hollow void is now connected to outside through 1 hole, so genus is 1 (like a torus/mug)!
    expect(drainRes.solid!.genus()).toBe(1)
    drainRes.solid!.delete()

    // Wall too thick error check:
    // On a 30 mm cube, wall of 20 mm is impossible (half width is 15 mm)
    const thickRes = applyHollow(w, cube, { wall: 20 }, 16)
    expect(thickRes.solid).toBeUndefined()
    expect(thickRes.error).toBe('stack.error.wallTooThick')
    expect(thickRes.errorParams).toEqual({ wall: 20 })

    cube.delete()
  })
})
