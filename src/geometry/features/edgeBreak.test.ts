import { describe, it, expect } from 'vitest'
import { createSketch, addCircle } from '../../editor/sketch/model'
import { rectangleMacro } from '../../editor/sketch/tools/rectangle'
import { slotMacro } from '../../editor/sketch/tools/slot'
import { buildExtrude } from './extrude'
import { expectValidSolid } from '../testing'

describe('3.3 Edge Break (Chamfer & Fillet)', () => {
  it('applies chamfer to 40 x 20 x 10 box with exact volume against analytic formula', async () => {
    let s = createSketch('BoxChamfer')
    const rect = rectangleMacro(s, { p1: { x: 0, y: 0 }, p2: { x: 40, y: 20 } })
    s = rect.sketch

    const res = await buildExtrude(s, {
      side: 'one',
      d1: 10,
      op: 'new',
      top: { kind: 'chamfer', size: 2 },
    })

    expect(res.warning).toBeUndefined()
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    // Analytic volume: ~7771
    expect(res.solid!.volume()).toBeCloseTo(7771, -1)
  })

  it('applies fillet to box and produces valid solid with volume between chamfer and full', async () => {
    let s = createSketch('BoxFillet')
    const rect = rectangleMacro(s, { p1: { x: 0, y: 0 }, p2: { x: 40, y: 20 } })
    s = rect.sketch

    const res = await buildExtrude(s, {
      side: 'one',
      d1: 10,
      op: 'new',
      top: { kind: 'fillet', size: 2 },
    })

    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    // Fillet volume should be strictly greater than chamfer (7771.47) and less than 8000
    const vol = res.solid!.volume()
    expect(vol).toBeGreaterThan(7771.47)
    expect(vol).toBeLessThan(8000)
  })

  it('chamfers plate with hole and slot following profile', async () => {
    let s = createSketch('PlateHoleSlot')
    const rect = rectangleMacro(s, { p1: { x: 0, y: 0 }, p2: { x: 60, y: 40 } })
    s = rect.sketch
    const hole = addCircle(s, { x: 15, y: 20 }, 5)
    s = hole.sketch
    const slot = slotMacro(s, { p1: { x: 35, y: 20 }, p2: { x: 45, y: 20 }, width: 6 })
    s = slot.sketch

    const res = await buildExtrude(s, {
      side: 'one',
      d1: 10,
      op: 'new',
      top: { kind: 'chamfer', size: 1 },
    })

    expect(res.warning).toBeUndefined()
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
  })

  it('warns and skips edge break when size is too large (collapse limit)', async () => {
    let s = createSketch('TooLarge')
    // 40 x 20 box: half-width is 10. Chamfer size 12 collapses!
    const rect = rectangleMacro(s, { p1: { x: 0, y: 0 }, p2: { x: 40, y: 20 } })
    s = rect.sketch

    const res = await buildExtrude(s, {
      side: 'one',
      d1: 10,
      op: 'new',
      top: { kind: 'chamfer', size: 12 },
    })

    expect(res.warning).toBe('sketch.warning.edgeBreakTooLarge')
    expect(res.solid).toBeDefined()
    expectValidSolid(res.solid!)
    // Since break was skipped, volume remains un-chamfered 8000
    expect(res.solid!.volume()).toBeCloseTo(8000, 1)
  })
})
