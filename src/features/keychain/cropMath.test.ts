import { describe, expect, it } from 'vitest'
import { MIN_CROP, type Crop } from '../../geometry/keychain'
import { ASPECT_RATIO, boxOfPlane, dragCrop, fitSubject, HANDLES, nudgeCrop, type Handle } from './cropMath'

const inside = (c: Crop) => { expect(c.x).toBeGreaterThanOrEqual(-1e-9); expect(c.y).toBeGreaterThanOrEqual(-1e-9); expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9); expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9); expect(c.w).toBeGreaterThanOrEqual(MIN_CROP - 1e-9); expect(c.h).toBeGreaterThanOrEqual(MIN_CROP - 1e-9) }
const start: Crop = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 }

describe('dragCrop (34, 4.1)', () => {
  it('перенос не выводит окно за изображение', () => {
    expect(dragCrop(start, 'move', 0.1, -0.1)).toEqual({ x: 0.4, y: expect.closeTo(0.2, 9), w: 0.4, h: 0.4 })
    inside(dragCrop(start, 'move', 5, 5)); expect(dragCrop(start, 'move', -5, -5)).toMatchObject({ x: 0, y: 0 })
  })

  it('каждая ручка меняет свои стороны и держит остальные; результат всегда внутри и не меньше 5 %', () => {
    const r = dragCrop(start, 'se', 0.1, 0.05); expect(r).toMatchObject({ x: 0.3, y: 0.3 }); expect(r.w).toBeCloseTo(0.5, 9); expect(r.h).toBeCloseTo(0.45, 9)
    const e = dragCrop(start, 'e', 0.1, 0.5); expect(e.y).toBe(0.3); expect(e.h).toBeCloseTo(0.4, 9)
    const w = dragCrop(start, 'w', -0.1, 0); expect(w.x).toBeCloseTo(0.2, 9); expect(w.x + w.w).toBeCloseTo(0.7, 9)
    for (const h of HANDLES) for (const d of [-3, -0.2, 0, 0.2, 3]) for (const e2 of [-3, 0, 3]) inside(dragCrop(start, h as Handle, d, e2))
    const tiny = dragCrop(start, 'e', -5, 0); expect(tiny.w).toBeCloseTo(MIN_CROP, 9)
  })

  it('фиксация пропорций: в пикселях сохраняется 1 : 1, 4 : 3, 3 : 4; противоположный угол стоит на месте', () => {
    const imageAspect = 1.5 // 3 : 2
    for (const [name, ratio] of Object.entries(ASPECT_RATIO)) {
      if (ratio === null) continue
      const s0: Crop = { x: 0.2, y: 0.2, w: 0.3 / imageAspect * ratio, h: 0.3 }
      for (const h of HANDLES) for (const [dx, dy] of [[0.05, 0.02], [-0.04, 0.06], [0.1, -0.1]]) {
        const r = dragCrop(s0, h, dx, dy, ratio, imageAspect)
        inside(r); expect((r.w * imageAspect) / r.h, `${name} ${h}`).toBeCloseTo(ratio, 6)
      }
      const r = dragCrop(s0, 'se', 0.05, 0.05, ratio, imageAspect)
      expect(r.x).toBeCloseTo(s0.x, 9); expect(r.y).toBeCloseTo(s0.y, 9) // якорь nw
      const rn = dragCrop(s0, 'nw', -0.03, -0.03, ratio, imageAspect)
      expect(rn.x + rn.w).toBeCloseTo(s0.x + s0.w, 9); expect(rn.y + rn.h).toBeCloseTo(s0.y + s0.h, 9) // якорь se
    }
  })

  it('стрелки: 1 % и 5 % с Shift; перенос и изменение стороны', () => {
    expect(nudgeCrop(start, 'move', 'ArrowRight', false).x).toBeCloseTo(0.31, 9)
    expect(nudgeCrop(start, 'move', 'ArrowDown', true).y).toBeCloseTo(0.35, 9)
    expect(nudgeCrop(start, 'e', 'ArrowLeft', false).w).toBeCloseTo(0.39, 9)
    expect(nudgeCrop({ x: 0, y: 0, w: 1, h: 1 }, 'move', 'ArrowLeft', true)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('fitSubject и boxOfPlane', () => {
  it('окно по габариту предмета с полем; с фиксацией пропорций оно расширяется и остаётся внутри', () => {
    const c = fitSubject({ x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.5 }, 0.1)
    expect(c.w).toBeCloseTo(0.48, 9); expect(c.h).toBeCloseTo(0.24, 9); inside(c)
    const sq = fitSubject({ x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.5 }, 0.1, 1, 1)
    expect(sq.w / sq.h).toBeCloseTo(1, 9); inside(sq)
    const edge = fitSubject({ x0: 0.9, y0: 0.9, x1: 1, y1: 1 }, 0.5, 1, 1); inside(edge)
    expect(fitSubject({ x0: 0.5, y0: 0.5, x1: 0.5, y1: 0.5 })).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
  it('габарит альфы в долях; пустая плоскость — null', () => {
    const m = new Uint8Array(10 * 5); for (let j = 1; j < 4; j++) for (let i = 2; i < 6; i++) m[j * 10 + i] = 255
    expect(boxOfPlane(m, 10, 5)).toEqual({ x0: 0.2, y0: 0.2, x1: 0.6, y1: 0.8 })
    expect(boxOfPlane(new Uint8Array(50), 10, 5)).toBeNull()
  })
})
