import { describe, it, expect } from 'vitest'
import { createSketch, addCircle, addLine } from '../../editor/sketch/model'
import { rectangleMacro } from '../../editor/sketch/tools/rectangle'
import { evaluateFeatures, type Feature } from './evaluate'
import { generate, featureMeshCache } from '../model'
import { expectValidSolid } from '../testing'

describe('3.4 Feature evaluation and caching', () => {
  it('plate + cut hole volume', async () => {
    let s1 = createSketch('Plate')
    s1 = rectangleMacro(s1, { p1: { x: 0, y: 0 }, p2: { x: 40, y: 20 } }).sketch

    let s2 = createSketch('Hole')
    s2 = addCircle(s2, { x: 20, y: 10 }, 5).sketch

    const features: Feature[] = [
      {
        kind: 'extrude',
        sketch: s1.id,
        side: 'one',
        d1: 10,
        op: 'new',
      },
      {
        kind: 'extrude',
        sketch: s2.id,
        side: 'one',
        d1: 10,
        op: 'cut',
      },
    ]

    const res = await evaluateFeatures(features, [s1, s2])
    expect(res.failedIndex).toBeUndefined()
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    expect(res.solid!.volume()).toBeCloseTo(7235, 0)
  })

  it('a failing second feature keeps the first result', async () => {
    let s1 = createSketch('Plate')
    s1 = rectangleMacro(s1, { p1: { x: 0, y: 0 }, p2: { x: 40, y: 20 } }).sketch

    let s2 = createSketch('OpenSketch')
    // Open line, not a closed profile
    s2 = addLine(s2, { x: 0, y: 0 }, { x: 10, y: 10 }).sketch

    const features: Feature[] = [
      {
        kind: 'extrude',
        sketch: s1.id,
        side: 'one',
        d1: 10,
        op: 'new',
      },
      {
        kind: 'extrude',
        sketch: s2.id,
        side: 'one',
        d1: 10,
        op: 'cut',
      },
    ]

    const res = await evaluateFeatures(features, [s1, s2])
    expect(res.failedIndex).toBe(1)
    expect(res.failedReason).toBe('sketch.error.openProfile')
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    expect(res.solid!.volume()).toBeCloseTo(8000, 1)
  })

  it('missing sketch is a failure not a crash', async () => {
    const features: Feature[] = [
      {
        kind: 'extrude',
        sketch: 'non-existent-id',
        side: 'one',
        d1: 10,
        op: 'new',
      },
    ]

    const res = await evaluateFeatures(features, [])
    expect(res.failedIndex).toBe(0)
    expect(res.failedReason).toBe('sketch.error.sketchNotFound')
    expect(res.solid).toBeUndefined()
  })

  it('cache hit on identical input', async () => {
    featureMeshCache.clear()

    let s = createSketch('Plate')
    s = rectangleMacro(s, { p1: { x: 0, y: 0 }, p2: { x: 30, y: 30 } }).sketch

    const features: Feature[] = [
      {
        kind: 'extrude',
        sketch: s.id,
        side: 'one',
        d1: 5,
        op: 'new',
      },
    ]

    const params = {
      objects: [
        {
          id: 'body-1',
          source: {
            kind: 'feature' as const,
            features,
          },
        },
      ],
      sketches: [s],
      quality: 'fine' as const,
    }

    const res1 = await generate('editor', params)
    expect(res1.parts.length).toBe(1)
    expect(featureMeshCache.size).toBe(1)

    const res2 = await generate('editor', params)
    expect(res2.parts.length).toBe(1)
    expect(featureMeshCache.size).toBe(1)
    expect(res2.parts[0].mesh.volume).toBeCloseTo(res1.parts[0].mesh.volume, 3)
  })

  it('quality changes the segment count only', async () => {
    let s = createSketch('CylinderSketch')
    s = addCircle(s, { x: 0, y: 0 }, 10).sketch

    const features: Feature[] = [
      {
        kind: 'extrude',
        sketch: s.id,
        side: 'one',
        d1: 10,
        op: 'new',
      },
    ]

    const coarseRes = await evaluateFeatures(features, [s], 'coarse')
    const fineRes = await evaluateFeatures(features, [s], 'fine')

    expect(coarseRes.solid).toBeDefined()
    expect(fineRes.solid).toBeDefined()

    const coarseMesh = coarseRes.solid!.getMesh()
    const fineMesh = fineRes.solid!.getMesh()

    // Fine should have more triangles than coarse
    expect(fineMesh.triVerts.length).toBeGreaterThan(coarseMesh.triVerts.length)
    // Volumes should be within 5% of ideal cylinder volume
    const idealVol = Math.PI * 100 * 10
    expect(coarseRes.solid!.volume()).toBeGreaterThan(idealVol * 0.95)
    expect(coarseRes.solid!.volume()).toBeLessThan(idealVol)
    expect(fineRes.solid!.volume()).toBeGreaterThan(coarseRes.solid!.volume())
    expect(fineRes.solid!.volume()).toBeLessThan(idealVol)
  })
})
