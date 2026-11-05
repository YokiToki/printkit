import { describe, it, expect } from 'vitest'
import { getWasm } from '../../wasm'
import { expectValidSolid } from '../../testing'
import { applyMirror } from './mirror'
import { applyLinearPattern, applyCircularPattern, MAX_PATTERN_TRIS } from './pattern'
import { applyBoolean } from './boolean'
import { identityMat4 } from '../../matrix'

describe('mirror.ts & pattern.ts (Task 3.2)', () => {
  it('half-to-full volume via mirror (merged and separate shells)', async () => {
    const w = await getWasm()

    // Half-bracket: box from x=0 to x=20, y=[-10, 10], z=[-5, 5]
    // Volume = 20 * 20 * 10 = 4000
    const half = w.Manifold.cube([20, 20, 10], false).translate([0, -10, -5])
    expect(half.volume()).toBeCloseTo(4000, 1)

    // Mirror about plane YZ at origin x=0, merge: true
    const mergedRes = applyMirror(w, half, { plane: 'YZ', origin: 'object', merge: true })
    expect(mergedRes.error).toBeUndefined()
    expectValidSolid(mergedRes.solid!)
    // Full volume should be exactly 2 * 4000 = 8000
    expect(mergedRes.solid!.volume()).toBeCloseTo(8000, 1)
    const bb = mergedRes.solid!.boundingBox()
    expect(bb.min[0]).toBeCloseTo(-20, 1)
    expect(bb.max[0]).toBeCloseTo(20, 1)
    mergedRes.solid!.delete()

    // Mirror with merge: false (separate shells): use half with offset from mirror plane so they are disjoint
    const separateHalf = w.Manifold.cube([20, 20, 10], false).translate([2, -10, -5])
    const disjointRes = applyMirror(w, separateHalf, { plane: 'YZ', origin: 'object', merge: false })
    expect(disjointRes.error).toBeUndefined()
    expect(disjointRes.solid!.status()).toBe('NoError')
    expect(disjointRes.solid!.volume()).toBeCloseTo(8000, 1)
    const shells = disjointRes.solid!.decompose()
    expect(shells.length).toBe(2)
    for (const s of shells) s.delete()
    disjointRes.solid!.delete()
    separateHalf.delete()

    half.delete()
  })

  it('linear pattern: 4x20 mm bbox and volume (spacing and total mode)', async () => {
    const w = await getWasm()

    // 10 mm cube, volume = 1000
    // Centered: x in [-5, 5]
    const cube = w.Manifold.cube([10, 10, 10], true)

    // Repeat 4 times with spacing 20 mm along X
    // Offsets: 0, 20, 40, 60.
    // X spans from -5 to 65 -> total length 70 mm
    const linRes = applyLinearPattern(w, cube, {
      axis: 'x',
      count: 4,
      mode: 'spacing',
      step: 20,
      symmetric: false,
      merge: true,
    })

    expect(linRes.error).toBeUndefined()
    expect(linRes.solid!.status()).toBe('NoError')
    expect(linRes.solid!.volume()).toBeCloseTo(4000, 1)
    const bb = linRes.solid!.boundingBox()
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(70, 1)
    linRes.solid!.delete()

    // Total mode: step = 60 mm total, 4 copies -> spacing = 20 mm
    const totalRes = applyLinearPattern(w, cube, {
      axis: 'x',
      count: 4,
      mode: 'total',
      step: 60,
      symmetric: false,
      merge: true,
    })
    expect(totalRes.error).toBeUndefined()
    expect(totalRes.solid!.volume()).toBeCloseTo(4000, 1)
    totalRes.solid!.delete()

    cube.delete()
  })

  it('circular pattern: 6 pegs 60 deg apart', async () => {
    const w = await getWasm()

    // Peg: cylinder r=2, h=10 translated along X by 15
    const peg = w.Manifold.cylinder(10, 2, 2, 32).translate([15, 0, 0])
    const singleVol = peg.volume()

    // Repeat 6 times over 360 deg about Z
    const circRes = applyCircularPattern(w, peg, {
      axis: 'z',
      count: 6,
      angle: 360,
      merge: false,
    })

    expect(circRes.error).toBeUndefined()
    expect(circRes.solid!.status()).toBe('NoError')
    expect(circRes.solid!.volume()).toBeCloseTo(singleVol * 6, 1)
    const shells = circRes.solid!.decompose()
    expect(shells.length).toBe(6)
    for (const s of shells) s.delete()

    circRes.solid!.delete()
    peg.delete()
  })

  it('hole array: patterned tool cylinder subtracted from a plate', async () => {
    const w = await getWasm()

    // Plate: 100 x 40 x 10 centered, volume = 40000
    const plate = w.Manifold.cube([100, 40, 10], true)

    // Cylinder: r=3, h=20 centered
    const tool = w.Manifold.cylinder(20, 3, 3, 32).translate([0, 0, -10])
    const singleHoleVol = tool.volume() * (10 / 20) // 10 mm depth inside plate

    // Linear pattern 3 holes along X with spacing 25 mm
    const patternedToolRes = applyLinearPattern(w, tool, {
      axis: 'x',
      count: 3,
      mode: 'spacing',
      step: 25,
      symmetric: true,
      merge: true,
    })
    expect(patternedToolRes.solid).toBeDefined()

    // Subtract patterned tool from plate
    const cutPlateRes = applyBoolean(plate, { mode: 'subtract', tools: ['tool-array'] }, [
      {
        id: 'tool-array',
        name: 'PatternedTool',
        solid: patternedToolRes.solid!,
        relativeMatrix: identityMat4(),
      },
    ])

    expect(cutPlateRes.error).toBeUndefined()
    expectValidSolid(cutPlateRes.solid!)
    expect(cutPlateRes.solid!.volume()).toBeCloseTo(40000 - 3 * singleHoleVol, 1)

    cutPlateRes.solid!.delete()
    patternedToolRes.solid!.delete()
    tool.delete()
    plate.delete()
  })

  it('triangle limit error', async () => {
    const w = await getWasm()
    // Sphere with ~45k triangles
    const highPoly = w.Manifold.sphere(20, 300)
    // 45k * 150 = 6.75M > 6M limit
    const res = applyLinearPattern(w, highPoly, {
      axis: 'x',
      count: 150,
      mode: 'spacing',
      step: 50,
      symmetric: false,
      merge: false,
    })

    expect(res.solid).toBeUndefined()
    expect(res.error).toBe('stack.error.tooMany')
    expect(res.errorParams).toBeDefined()

    highPoly.delete()
  })
})
