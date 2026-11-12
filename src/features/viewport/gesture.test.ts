import { describe, expect, it } from 'vitest'
import { classifyGesture, computeWheelZoomFactor } from './gesture'

describe('classifyGesture', () => {
  it('classifies Shift + drag (> 5px) as camera pan and suppresses box selection', () => {
    expect(classifyGesture({ button: 0, shiftKey: true, moved: 12 }, { tool: 'select' })).toBe('pan')
    expect(classifyGesture({ button: 0, shiftKey: true, moved: 12 }, { tool: 'line' })).toBe('pan')
  })

  it('classifies plain drag (> 5px) in select tool as boxSelect', () => {
    expect(classifyGesture({ button: 0, shiftKey: false, moved: 10 }, { tool: 'select' })).toBe('boxSelect')
    expect(classifyGesture({ button: 0, shiftKey: false, ctrlKey: true, moved: 10 }, { tool: 'select' })).toBe('boxSelect')
  })

  it('classifies plain drag (> 5px) with a drawing tool as drawDrag', () => {
    expect(classifyGesture({ button: 0, shiftKey: false, moved: 8 }, { tool: 'line' })).toBe('drawDrag')
    expect(classifyGesture({ button: 0, shiftKey: false, moved: 8 }, 'rect')).toBe('drawDrag')
  })

  it('classifies small movement (<= 5px) as clickSelect even with Shift held', () => {
    expect(classifyGesture({ button: 0, shiftKey: false, moved: 0 }, { tool: 'select' })).toBe('clickSelect')
    expect(classifyGesture({ button: 0, shiftKey: true, moved: 4 }, { tool: 'select' })).toBe('clickSelect')
  })
})

describe('computeWheelZoomFactor', () => {
  it('computes continuous zoom factor for pixel deltaMode (mouse wheel and trackpad pinch)', () => {
    // Zoom in (negative deltaY -> factor < 1)
    const zoomIn = computeWheelZoomFactor(-100, 0)
    expect(zoomIn).toBeCloseTo(Math.pow(0.95, 0.2), 6)
    expect(zoomIn).toBeLessThan(1)
    expect(zoomIn).toBeGreaterThan(0.98)

    // Zoom out (positive deltaY -> factor > 1)
    const zoomOut = computeWheelZoomFactor(100, 0)
    expect(zoomOut).toBeCloseTo(Math.pow(0.95, -0.2), 6)
    expect(zoomOut).toBeGreaterThan(1)

    // Fine trackpad pinch step (small deltaY = -4)
    const finePinch = computeWheelZoomFactor(-4, 0)
    expect(finePinch).toBeCloseTo(Math.pow(0.95, 0.008), 6)
    expect(finePinch).toBeGreaterThan(0.999)
    expect(finePinch).toBeLessThan(1)
  })

  it('normalizes line (deltaMode=1) and page (deltaMode=2) wheel events', () => {
    // 3 lines in deltaMode=1 equals 60 pixels in deltaMode=0
    expect(computeWheelZoomFactor(3, 1)).toBeCloseTo(computeWheelZoomFactor(60, 0), 8)
    // 1 page in deltaMode=2 equals 100 pixels in deltaMode=0
    expect(computeWheelZoomFactor(1, 2)).toBeCloseTo(computeWheelZoomFactor(100, 0), 8)
  })
})
