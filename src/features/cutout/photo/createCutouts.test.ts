import { describe, expect, it } from 'vitest'
import { cutoutBounds, defaultCutout, rectCutout } from '../../../geometry/cutout'
import { paperSize } from '../../../geometry/photo/paper'
import { segment } from '../../../geometry/photo/segment'
import type { Rectified } from '../../../geometry/photo/homography'
import { tracedCutouts, withTraced } from './createCutouts'
import { loadFixture } from '../../../geometry/photo/fixtures/load'
import { rectify } from '../../../geometry/photo/homography'

const A4 = paperSize('a4', 'landscape')
const A4Portrait = paperSize('a4', 'portrait')
type Painter = (x: number, y: number) => number | null
function sheet(objects: Painter[]): Rectified {
  const scale = 4, w = Math.round(A4.width * scale), h = Math.round(A4.height * scale)
  const gray = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i + 0.5) / scale, y = (j + 0.5) / scale
    let v: number | null = null
    for (const o of objects) { v = o(x, y); if (v !== null) break }
    gray[j * w + i] = v ?? 235
  }
  return { image: { width: w, height: h, gray, alpha: null }, scale, paper: A4 }
}
const rect = (x: number, y: number, w: number, h: number): Painter => (px, py) => (px >= x && px <= x + w && py >= y && py <= y + h ? 40 : null)
const optsPolyline = { depth: 12, clearance: 0.8, name: (n: number) => `Tool ${n}`, fit: { usePolyline: true } as const }
const optsFit = { depth: 12, clearance: 0.8, name: (n: number) => `Tool ${n}` }

describe('создание вырезов из силуэтов (3.4)', () => {
  const seg = segment(sheet([rect(40, 60, 40, 20), rect(100, 60, 30, 30)])) // центры на листе: (60, 70) и (115, 75) мм, расстояние 55 по x
  const created = tracedCutouts(seg, [1, 2], A4, optsPolyline)

  it('по вырезу на выбранный силуэт, имена по порядку, глубина и зазор из диалога, источник — контур', () => {
    expect(created.map((c) => c.name)).toEqual(['Tool 1', 'Tool 2'])
    expect(created.every((c) => c.depth === 12 && c.clearance === 0.8 && c.visible && c.rotation === 0)).toBe(true)
    expect(created.every((c) => c.source.kind === 'outline')).toBe(true)
  })

  it('положение сохраняется как на бумаге: два предмета в 55 мм друг от друга дают вырезы в 55 мм', () => {
    expect(created[1].x - created[0].x).toBeCloseTo(55, 0)
    expect(created[1].y - created[0].y).toBeCloseTo(-5, 0) // второй ниже на листе (75 мм от верха против 70), ось y вверх
    expect(created[0].y).toBeGreaterThan(0) // ось y вверх: предмет выше центра листа (105 мм от верха)
  })

  it('выбор подмножества: исключённый силуэт вырез не получает; несуществующий номер пропускается', () => {
    expect(tracedCutouts(seg, [2], A4, optsPolyline)).toHaveLength(1)
    expect(tracedCutouts(seg, [1, 9], A4, optsPolyline)).toHaveLength(1)
    expect(tracedCutouts(seg, [], A4, optsPolyline)).toEqual([])
  })

  it('withTraced: цвета назначаются как всегда, корпус — наименьшие целые юниты, вырезы по центру и внутри', () => {
    const p = withTraced({ ...defaultCutout }, created)
    expect(p.cutouts.map((c) => c.color)).toEqual([0, 1])
    expect(p.x.mode).toBe('units')
    expect(p.y.mode).toBe('units')
    // два предмета занимают 90 × 30 мм (x от 40 до 130, y от 60 до 90), плюс зазор, отступ и стенка → 3 юнита по x, 1 по y
    expect(p.x.value).toBe(3)
    expect(p.y.value).toBe(1)
    const bx = p.cutouts.map(cutoutBounds)
    expect((Math.min(...bx.map((b) => b.minX)) + Math.max(...bx.map((b) => b.maxX))) / 2).toBeCloseTo(0, 6)
  })

  it('существующие вырезы остаются, цвета новых продолжают палитру, всё остаётся на своих местах друг относительно друга', () => {
    const existing = rectCutout({ id: 'old', x: 0, y: 0, color: 0, source: { width: 20, length: 10, radius: 0 } })
    const p = withTraced({ ...defaultCutout, cutouts: [existing] }, created)
    expect(p.cutouts.map((c) => c.id)[0]).toBe('old')
    expect(p.cutouts).toHaveLength(3)
    expect(p.cutouts.map((c) => c.color)).toEqual([0, 1, 2])
    const dx = p.cutouts[2].x - p.cutouts[1].x
    expect(dx).toBeCloseTo(created[1].x - created[0].x, 6)
  })

  it('пустой список вырезов не меняет параметры', () => {
    expect(withTraced(defaultCutout, [])).toEqual(defaultCutout)
  })

  it('большой набор: размер по юнитам растёт (две стороны листа — до 7 × 5 юнитов при шаге 42)', () => {
    const big = segment(sheet([rect(10, 10, 120, 60), rect(150, 100, 130, 90)]))
    const p = withTraced(defaultCutout, tracedCutouts(big, [1, 2], A4, optsPolyline))
    expect(p.x.value).toBeGreaterThanOrEqual(5)
    expect(p.y.value).toBeGreaterThanOrEqual(4)
  })
})

describe('подгонка контура в tracedCutouts (35)', () => {
  const seg = segment(sheet([rect(40, 60, 40, 20), rect(100, 60, 30, 30)]))

  it('usePolyline: контур совпадает с исходным (без подгонки)', () => {
    const poly = tracedCutouts(seg, [1], A4, optsPolyline)
    const fit = tracedCutouts(seg, [1], A4, { ...optsPolyline, fit: { usePolyline: true } })
    expect(poly[0].source.kind).toBe('outline')
    expect((poly[0].source as { points: [number, number][] }).points.length)
      .toBe((fit[0].source as { points: [number, number][] }).points.length)
  })

  it('подгонка контура: на реальном снимке контур в пределах допуска', () => {
    const f = loadFixture('flash')
    const seg = segment(rectify(f.gray, f.corners, A4Portrait, f.color.rgb)!)
    const poly = tracedCutouts(seg, [1], A4Portrait, { ...optsPolyline, depth: 10, clearance: 0.8 })
    const fit = tracedCutouts(seg, [1], A4Portrait, { ...optsFit, depth: 10, clearance: 0.8 })
    const original = (poly[0].source as { points: [number, number][] }).points
    const fitted = (fit[0].source as { points: [number, number][] }).points
    let max = 0
    for (const [fx, fy] of fitted) {
      let best = Infinity
      for (let i = 0; i < original.length; i++) {
        const [ax, ay] = original[i], [bx, by] = original[(i + 1) % original.length]
        const dx = bx - ax, dy = by - ay
        const t = Math.max(0, Math.min(1, ((fx - ax) * dx + (fy - ay) * dy) / (dx * dx + dy * dy || 1)))
        const px = ax + dx * t, py = ay + dy * t
        best = Math.min(best, Math.hypot(fx - px, fy - py))
      }
      max = Math.max(max, best)
    }
    expect(max).toBeLessThan(0.3)
    // подогнанный контур отличается от полилинии (подгонка применена)
    expect(fitted.length).not.toEqual(original.length)
  })

  it('подогнанный контур в пределах допуска от исходного (синтетика)', () => {
    const poly = tracedCutouts(seg, [1], A4, optsPolyline)
    const fit = tracedCutouts(seg, [1], A4, optsFit)
    const original = (poly[0].source as { points: [number, number][] }).points
    const fitted = (fit[0].source as { points: [number, number][] }).points
    // максимальное расстояние от точки fitted до ближайшей точки/отрезка original
    let max = 0
    for (const [fx, fy] of fitted) {
      let best = Infinity
      for (let i = 0; i < original.length; i++) {
        const [ax, ay] = original[i], [bx, by] = original[(i + 1) % original.length]
        const dx = bx - ax, dy = by - ay
        const t = Math.max(0, Math.min(1, ((fx - ax) * dx + (fy - ay) * dy) / (dx * dx + dy * dy || 1)))
        const px = ax + dx * t, py = ay + dy * t
        best = Math.min(best, Math.hypot(fx - px, fy - py))
      }
      max = Math.max(max, best)
    }
    expect(max).toBeLessThan(0.3)
  })
})
