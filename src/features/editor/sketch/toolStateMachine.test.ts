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
