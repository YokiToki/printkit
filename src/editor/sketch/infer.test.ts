import { describe, it, expect } from 'vitest'
import { createSketch, addLine, addCircle } from './model'
import { inferSnap } from './infer'

describe('2.4 Inference while drawing', () => {
  it('snaps to existing endpoint (coincident)', () => {
    let s = createSketch('Infer')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch

    // Cursor near (10, 0.5) with tol 8px / 5px/mm = 1.6 mm
    const snap = inferSnap(s, { x: 10.2, y: 0.3 }, { pixelsPerMm: 5 })
    expect(snap.glyph).toBe('coincident')
    expect(snap.targetId).toBe(l1.p2Id)
    expect(snap.pos.x).toBe(10)
    expect(snap.pos.y).toBe(0)
    expect(snap.constraints).toEqual([{ kind: 'coincident', refs: [l1.p2Id] }])
  })

  it('snaps to midpoint', () => {
    let s = createSketch('Infer')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 20, y: 0 })
    s = l1.sketch

    // Midpoint is at (10, 0)
    const snap = inferSnap(s, { x: 10.1, y: 0.2 }, { pixelsPerMm: 5 })
    expect(snap.glyph).toBe('midpoint')
    expect(snap.pos.x).toBe(10)
    expect(snap.pos.y).toBe(0)
  })

  it('snaps to point on line', () => {
    let s = createSketch('Infer')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 20, y: 0 })
    s = l1.sketch

    // (5, 0.2) is near the line, far from midpoint or endpoints
    const snap = inferSnap(s, { x: 5, y: 0.2 }, { pixelsPerMm: 5 })
    expect(snap.glyph).toBe('pointOnCurve')
    expect(snap.pos.y).toBe(0)
  })

  it('snaps horizontal/vertical with previous point within 3 degrees', () => {
    const s = createSketch('Infer')
    // Cursor at (10, 0.2) from previousPoint (0, 0): angle atan2(0.2, 10) = 1.1 deg < 3 deg
    const snap = inferSnap(s, { x: 10, y: 0.2 }, { previousPoint: { x: 0, y: 0 } })
    expect(snap.glyph).toBe('horizontal')
    expect(snap.pos.y).toBe(0)

    // Vertical: cursor at (0.2, 10)
    const snapV = inferSnap(s, { x: 0.2, y: 10 }, { previousPoint: { x: 0, y: 0 } })
    expect(snapV.glyph).toBe('vertical')
    expect(snapV.pos.x).toBe(0)
  })

  it('respects priority: endpoint beats midpoint', () => {
    let s = createSketch('Infer')
    // Short line 1mm length from (0,0) to (1,0)
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 1, y: 0 })
    s = l1.sketch

    // Cursor at (0.9, 0.05) is close to both midpoint (0.5) and endpoint (1.0)
    const snap = inferSnap(s, { x: 0.9, y: 0.05 }, { pixelsPerMm: 5, thresholdPx: 10 })
    expect(snap.glyph).toBe('coincident')
  })

  it('Ctrl disables inference', () => {
    let s = createSketch('Infer')
    const l1 = addLine(s, { x: 0, y: 0 }, { x: 10, y: 0 })
    s = l1.sketch

    const snap = inferSnap(s, { x: 10.1, y: 0.1 }, { ctrlKey: true })
    expect(snap.glyph).toBeUndefined()
    expect(snap.pos).toEqual({ x: 10.1, y: 0.1 })
    expect(snap.constraints).toHaveLength(0)
  })

  it('Shift locks axis', () => {
    const s = createSketch('Infer')
    const snap = inferSnap(
      s,
      { x: 15, y: 4 },
      { previousPoint: { x: 0, y: 0 }, shiftKey: true },
    )
    // dx = 15 > dy = 4 -> locks horizontal
    expect(snap.glyph).toBe('horizontal')
    expect(snap.pos.y).toBe(0)
    expect(snap.pos.x).toBe(15)
  })
})
