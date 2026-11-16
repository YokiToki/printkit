import { describe, it, expect } from 'vitest'
import { createSketch } from '../../../editor/sketch/model'
import {
  initialToolState,
  sketchToolReducer,
} from './toolStateMachine'

describe('5.2 Sketch tool state machines', () => {
  it('line tool chains lines on repeated clicks, cancels on Escape', () => {
    let sketch = createSketch('LineTest')
    let state = initialToolState('line')

    // Click 1: start at (0, 0)
    let res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 0, y: 0 } })
    state = res.state
    sketch = res.sketch
    expect(state.stage).toBe(1)
    expect(state.startPt).toBeDefined()

    // Move to (10, 0): preview active
    res = sketchToolReducer(sketch, state, { type: 'move', pos: { x: 10, y: 0 } })
    state = res.state
    expect(state.preview).toBeDefined()
    expect(state.preview?.curves?.preview_line).toBeDefined()

    // Click 2: finish line at (10, 0)
    res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 10, y: 0 } })
    state = res.state
    sketch = res.sketch
    expect(Object.keys(sketch.curves).length).toBe(1)
    expect(res.command?.label).toBe('Add Line')
    // Line tool chains!
    expect(state.stage).toBe(1)
    expect(state.startPt?.x).toBe(10)

    // Press Escape to finish chaining
    res = sketchToolReducer(sketch, state, { type: 'key', key: 'Escape' })
    state = res.state
    expect(state.stage).toBe(0)
    expect(state.preview).toBeUndefined()
  })

  it('rect-2pt tool creates 4 lines with horizontal & vertical constraints', () => {
    let sketch = createSketch('RectTest')
    let state = initialToolState('rect-2pt')

    // Click 1: (0, 0)
    let res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 0, y: 0 } })
    state = res.state
    sketch = res.sketch
    expect(state.stage).toBe(1)

    // Click 2: (40, 20)
    res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 40, y: 20 } })
    state = res.state
    sketch = res.sketch
    expect(state.stage).toBe(0)
    expect(Object.keys(sketch.curves).length).toBe(4)
    expect(sketch.constraints.length).toBeGreaterThanOrEqual(4)
    expect(res.command?.label).toBe('Add Rectangle')
  })

  it('circle tool creates circle entity from center and radius click', () => {
    let sketch = createSketch('CircTest')
    let state = initialToolState('circle')

    // Click 1: center at (15, 15)
    let res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 15, y: 15 } })
    state = res.state
    sketch = res.sketch
    expect(state.stage).toBe(1)

    // Click 2: perimeter at (25, 15) -> radius 10
    res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 25, y: 15 } })
    state = res.state
    sketch = res.sketch
    expect(state.stage).toBe(0)
    expect(Object.keys(sketch.curves).length).toBe(1)
    const curve = Object.values(sketch.curves)[0]
    expect(curve.kind).toBe('circle')
    if (curve.kind === 'circle') {
      expect(curve.r).toBeCloseTo(10)
    }
  })

  it('slot tool runs 3-step sequence: center1, center2, radius', () => {
    let sketch = createSketch('SlotTest')
    let state = initialToolState('slot')

    // 1. First center (10, 10)
    let res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 10, y: 10 } })
    state = res.state
    expect(state.stage).toBe(1)

    // 2. Second center (30, 10)
    res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 30, y: 10 } })
    state = res.state
    expect(state.stage).toBe(2)

    // 3. Width point (30, 15) -> radius 5, width 10
    res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 30, y: 15 } })
    state = res.state
    sketch = res.sketch
    expect(state.stage).toBe(0)
    expect(Object.keys(sketch.curves).length).toBe(4) // 2 lines + 2 arcs
    expect(res.command?.label).toBe('Add Slot')
  })
})

describe('44c Universal HUD: typed values create geometry with driving constraints', () => {
  it('circle: typed centre then diameter 15 creates a circle with a diameter constraint', () => {
    let sketch = createSketch('HudCircle')
    let state = initialToolState('circle')

    // Stage 0: X=10, Tab, Y=20, Enter
    let res = sketchToolReducer(sketch, state, { type: 'hud', stage: 0, values: { x: 10, y: 20 } })
    state = res.state
    sketch = res.sketch
    expect(state.stage).toBe(1)
    expect(state.startPt).toMatchObject({ x: 10, y: 20 })

    // Stage 1: diameter 15, Enter
    res = sketchToolReducer(sketch, state, {
      type: 'hud',
      stage: 1,
      values: { size: 15 },
      sizeMode: 'diameter',
    })
    state = res.state
    sketch = res.sketch
    expect(state.tool).toBe('select')
    expect(res.command?.label).toBe('Add Circle')

    const circles = Object.values(sketch.curves).filter((c) => c.kind === 'circle')
    expect(circles.length).toBe(1)
    const circle = circles[0] as { kind: 'circle'; c: string; r: number }
    expect(circle.r).toBeCloseTo(7.5)
    const center = sketch.points[circle.c]
    expect(center).toMatchObject({ x: 10, y: 20 })
    const dia = sketch.constraints.find((c) => c.kind === 'diameter')
    expect(dia).toBeDefined()
    expect(dia!.value).toBe(15)
  })

  it('circle: radius mode adds a radius dimension of the typed value', () => {
    let sketch = createSketch('HudCircleR')
    let state = initialToolState('circle')
    const res0 = sketchToolReducer(sketch, state, { type: 'hud', stage: 0, values: { x: 0, y: 0 } })
    state = res0.state
    sketch = res0.sketch
    const res = sketchToolReducer(sketch, state, {
      type: 'hud',
      stage: 1,
      values: { size: 12 },
      sizeMode: 'radius',
    })
    sketch = res.sketch
    const circle = Object.values(sketch.curves).find((c) => c.kind === 'circle') as { r: number }
    expect(circle.r).toBe(12)
    const rad = sketch.constraints.find((c) => c.kind === 'radius')
    expect(rad?.value).toBe(12)
  })

  it('point: typed coordinates place a point and return to select', () => {
    const sketch0 = createSketch('HudPoint')
    const res = sketchToolReducer(
      sketch0,
      initialToolState('point'),
      { type: 'hud', stage: 0, values: { x: 5, y: -3 } },
    )
    const sketch = res.sketch
    expect(res.state.tool).toBe('select')
    expect(res.command?.label).toBe('Add Point')
    const pts = Object.values(sketch.points)
    expect(pts.length).toBe(1)
    expect(pts[0]).toMatchObject({ x: 5, y: -3 })
  })

  it('arc-center: clicks go centre -> start -> end with a driving radius', () => {
    let sketch = createSketch('HudArc')
    let state = initialToolState('arc-center')

    let res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 0, y: 0 } })
    state = res.state
    expect(state.stage).toBe(1)

    // Start point fixes radius 10 and start angle 0
    res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 10, y: 0 } })
    state = res.state
    expect(state.stage).toBe(2)
    expect(state.hud).toMatchObject({ size: 10, a1: 0 })

    // End point at 90 degrees
    res = sketchToolReducer(sketch, state, { type: 'down', pos: { x: 0, y: 10 } })
    state = res.state
    sketch = res.sketch
    expect(state.tool).toBe('select')
    expect(res.command?.label).toBe('Add Center Arc')
    const arc = Object.values(sketch.curves).find((c) => c.kind === 'arc') as {
      c: string
      a: string
      b: string
    }
    expect(arc).toBeDefined()
    expect(sketch.points[arc.a]).toMatchObject({ x: 10, y: 0 })
    expect(sketch.points[arc.b].x).toBeCloseTo(0, 6)
    expect(sketch.points[arc.b].y).toBeCloseTo(10, 6)
    expect(sketch.constraints.some((c) => c.kind === 'radius' && c.value === 10)).toBe(true)
  })

  it('arc-center: typed centre, radius and angles build the same arc', () => {
    let sketch = createSketch('HudArcTyped')
    let state = initialToolState('arc-center')

    let res = sketchToolReducer(sketch, state, { type: 'hud', stage: 0, values: { x: 0, y: 0 } })
    state = res.state
    res = sketchToolReducer(sketch, state, { type: 'hud', stage: 1, values: { size: 8 } })
    state = res.state
    expect(state.stage).toBe(2)
    res = sketchToolReducer(sketch, state, {
      type: 'hud',
      stage: 2,
      values: { a1: 0, a2: 90 },
    })
    sketch = res.sketch
    expect(res.command?.label).toBe('Add Center Arc')
    const arc = Object.values(sketch.curves).find((c) => c.kind === 'arc') as {
      a: string
      b: string
    }
    expect(sketch.points[arc.a]).toMatchObject({ x: 8, y: 0 })
    expect(sketch.points[arc.b].x).toBeCloseTo(0, 5)
    expect(sketch.points[arc.b].y).toBeCloseTo(8, 5)
  })

  it('polygon: typed centre, circumradius and side count with a driving radius', () => {
    let sketch = createSketch('HudPolygon')
    let state = initialToolState('polygon')

    let res = sketchToolReducer(sketch, state, { type: 'hud', stage: 0, values: { x: 1, y: 2 } })
    state = res.state
    res = sketchToolReducer(sketch, state, {
      type: 'hud',
      stage: 1,
      values: { size: 10, n: 5 },
    })
    sketch = res.sketch
    expect(res.command?.label).toBe('Add Polygon')
    const lines = Object.values(sketch.curves).filter((c) => c.kind === 'line')
    expect(lines.length).toBe(5)
    const radius = sketch.constraints.find((c) => c.kind === 'radius')
    expect(radius?.value).toBe(10)
  })

  it('rect-2pt: typed width and height with cursor on the right extends the rectangle that way', () => {
    let sketch = createSketch('HudRect')
    let state = initialToolState('rect-2pt')

    let res = sketchToolReducer(sketch, state, { type: 'hud', stage: 0, values: { x: 0, y: 0 } })
    state = res.state
    res = sketchToolReducer(sketch, state, {
      type: 'hud',
      stage: 1,
      values: { w: 40, h: 20 },
      pos: { x: 10, y: 5 },
    })
    sketch = res.sketch
    expect(res.command?.label).toBe('Add Rectangle')
    expect(Object.keys(sketch.curves).length).toBe(4)
    // Width dimension exists and equals 40
    const width = sketch.constraints.find((c) => c.kind === 'distance' && c.value === 40)
    expect(width).toBeDefined()
  })
})
