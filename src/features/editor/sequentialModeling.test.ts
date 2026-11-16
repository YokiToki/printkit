import { describe, it, expect } from 'vitest'
import { getWasm } from '../../geometry/wasm'
import { topologyOfSolid } from '../../geometry/topology/solid'
import { frameForFace, type FacePlaneDefinition } from '../../editor/sketch/plane'
import { faceRef } from '../../geometry/topology/reference'
import { createSketch, type Sketch } from '../../editor/sketch/model'
import { initialToolState, sketchToolReducer } from './sketch/toolStateMachine'
import { evaluateStack } from '../../geometry/features/evaluate'
import { featureToOp } from '../../editor/stack'
import { expectValidSolid } from '../../geometry/testing'

/**
 * Сквозной сценарий последовательного моделирования (44c):
 * куб → окружность с вводом центра и диаметра на верхней грани →
 * выдавливание с объединением → окружность на торце цилиндра →
 * вырезание. Проверяются замкнутость и объёмы.
 */
describe('44c sequential modeling: sketch on face with typed HUD values', () => {
  it('box ➔ typed circle on top face ➔ join 10 ➔ typed circle ➔ cut 5', async () => {
    const w = await getWasm()

    // 1. База: куб 20×20×20.
    const box = w.Manifold.cube([20, 20, 20], true)
    const topology = topologyOfSolid(box)
    const top = topology.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    expect(top).toBeDefined()

    // 2. Эскиз на верхней грани: плоскость грани, тело-хозяин, окружность с
    //    вводом центра (0, 0) и диаметра 10 через HUD-редьюсер.
    const frame = frameForFace(top, topology)!
    const plane: FacePlaneDefinition = { face: faceRef(top), frame }
    let sketch: Sketch = createSketch('OnTop', plane)
    sketch.hostObjectId = 'box-1'

    let state = initialToolState('circle')
    let res = sketchToolReducer(sketch, state, { type: 'hud', stage: 0, values: { x: 0, y: 0 } })
    state = res.state
    sketch = res.sketch
    res = sketchToolReducer(sketch, state, {
      type: 'hud',
      stage: 1,
      values: { size: 10 },
      sizeMode: 'diameter',
    })
    sketch = res.sketch
    expect(res.command?.label).toBe('Add Circle')
    const circle = Object.values(sketch.curves).find((c) => c.kind === 'circle') as { r: number }
    expect(circle.r).toBe(5)
    expect(sketch.constraints.some((c) => c.kind === 'diameter' && c.value === 10)).toBe(true)

    // 3. Выдавливание наружу на 10 мм с объединением с телом-хозяином:
    //    куб + цилиндр Ø10, высота 10.
    const joinRes = await evaluateStack(
      box,
      [featureToOp({ kind: 'extrude', sketch: sketch.id, sketchId: sketch.id, op: 'join', side: 'one', d1: 10 })],
      null,
      { w, sketches: [sketch] },
    )
    expect(joinRes.failedIndex).toBeUndefined()
    const joined = joinRes.solid!
    expectValidSolid(joined)
    const pi = Math.PI
    // Окружность приближается вписанным многоугольником (хорда 0.1 мм):
    // объём цилиндра чуть меньше точного π·25·10, допуск 4 %.
    const cylMin = pi * 25 * 10 * 0.96
    const cylMax = pi * 25 * 10
    const added = joined.volume() - 8000
    expect(added).toBeGreaterThan(cylMin)
    expect(added).toBeLessThanOrEqual(cylMax)
    const bb = joined.boundingBox()
    expect(bb.min[2]).toBeCloseTo(-10, 3)
    expect(bb.max[2]).toBeCloseTo(20, 3)

    // 4. Новый эскиз на торце цилиндра (z = 20), окружность Ø10 с центром (0, 0).
    const joinedTopology = topologyOfSolid(joined)
    const cylinderTop = joinedTopology.faces.find(
      (f) => f.kind === 'planar' && f.normal?.[2] === 1 && Math.abs(f.centroid[2] - 20) < 1e-6,
    )!
    expect(cylinderTop).toBeDefined()
    const frame2 = frameForFace(cylinderTop, joinedTopology)!
    let sketch2: Sketch = createSketch('OnCylinder', { face: faceRef(cylinderTop), frame: frame2 })
    sketch2.hostObjectId = 'box-1'

    let state2 = initialToolState('circle')
    let res2 = sketchToolReducer(sketch2, state2, { type: 'hud', stage: 0, values: { x: 0, y: 0 } })
    state2 = res2.state
    sketch2 = res2.sketch
    res2 = sketchToolReducer(sketch2, state2, {
      type: 'hud',
      stage: 1,
      values: { size: 10 },
      sizeMode: 'diameter',
    })
    sketch2 = res2.sketch
    expect(res2.command?.label).toBe('Add Circle')

    // 5. Выдавливание внутрь тела на 5 мм: операция Cut, направление −1
    //    (то, что задаёт разворот направления в диалоге операции).
    const cutRes = await evaluateStack(
      joined,
      [featureToOp({ kind: 'extrude', sketch: sketch2.id, sketchId: sketch2.id, op: 'cut', side: 'one', d1: 5, direction: -1 })],
      null,
      { w, sketches: [sketch2] },
    )
    expect(cutRes.failedIndex).toBeUndefined()
    const cut = cutRes.solid!
    expectValidSolid(cut)
    // Вырезана половина цилиндра: тот же допуск на аппроксимацию.
    const removed = joined.volume() - cut.volume()
    expect(removed).toBeGreaterThan(added / 2 * 0.99)
    expect(removed).toBeLessThan(added / 2 * 1.01)
    const bb2 = cut.boundingBox()
    expect(bb2.min[2]).toBeCloseTo(-10, 3)
    expect(bb2.max[2]).toBeCloseTo(20, 3)
  })
})
