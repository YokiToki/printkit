import { describe, expect, it } from 'vitest'
import { fitLoop, sampleCurves, offsetCurve, fitOutline, fittedVertexCount, defaultFitParams } from './outlineFit'
import { findCorners, resampleLoop } from './photo/outlineSmooth'
import type { Pt } from './photo/homography'

// ---------- helpers ----------

function circlePts(r: number, n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)])
}

function squarePts(side: number, nPerEdge = 60): Pt[] {
  const h = side / 2
  const edge = (a: Pt, b: Pt): Pt[] => Array.from({ length: nPerEdge }, (_, i) => [a[0] + (b[0] - a[0]) * (i / nPerEdge), a[1] + (b[1] - a[1]) * (i / nPerEdge)] as Pt)
  return [...edge([-h, -h], [h, -h]), ...edge([h, -h], [h, h]), ...edge([h, h], [-h, h]), ...edge([-h, h], [-h, -h])]
}

function noisyCircle(r: number, n: number, amp: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI
    const rr = r + amp * (Math.sin(i * 7.3) + Math.cos(i * 11.7)) * 0.5
    return [rr * Math.cos(a), rr * Math.sin(a)]
  })
}

/** Тонкое остриё: треугольник на конце прямоугольника, около 200 точек. */
function spikeShape(): Pt[] {
  const pts: Pt[] = []
  // основание
  for (let i = 0; i < 60; i++) pts.push([i * 0.2, 0])
  for (let i = 0; i < 40; i++) pts.push([12, -i * 0.2])
  for (let i = 0; i < 60; i++) pts.push([12 - i * 0.2, -8])
  // остриё: узкий треугольник вверх
  for (let i = 0; i < 40; i++) pts.push([i * 0.1, -8 - i * 0.4])
  for (let i = 0; i < 40; i++) pts.push([4 - i * 0.1, -24 + i * 0.4])
  return pts
}

/** Синтетический «трассированный» контур: низкая детализация с шумом, ~2000 точек. */
function tracedTool(): Pt[] {
  // screwdriver-like: handle + shaft + tip, с более частым шумом
  const pts: Pt[] = []
  for (let i = 0; i < 400; i++) {
    const t = i / 400, x = t * 60, y = 5 + Math.sin(i * 3.7) * 0.12 + Math.cos(i * 7.1) * 0.08
    pts.push([x, y])
  }
  for (let i = 0; i < 400; i++) {
    const t = i / 400, x = 60 + t * 40, y = -5 + Math.sin(i * 5.3) * 0.1 + Math.cos(i * 9.7) * 0.06
    pts.push([x, y])
  }
  for (let i = 0; i < 200; i++) {
    const t = i / 200, x = 100 + t * 15, y = -20 * t + Math.sin(i * 4.1) * 0.15
    pts.push([x, y])
  }
  for (let i = 0; i < 200; i++) {
    const t = i / 200, x = 115 - t * 15, y = -20 + Math.sin(i * 4.1) * 0.15
    pts.push([x, y])
  }
  for (let i = 0; i < 400; i++) {
    const t = i / 400, x = 100 - t * 40, y = 5 + Math.sin(i * 5.3) * 0.1 + Math.cos(i * 9.7) * 0.06
    pts.push([x, y])
  }
  for (let i = 0; i < 400; i++) {
    const t = i / 400, x = 60 - t * 60, y = 5 + Math.sin(i * 3.7) * 0.12 + Math.cos(i * 7.1) * 0.08
    pts.push([x, y])
  }
  return pts
}

/** Расстояние от точки до отрезка [a,b]. */
function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t))
}

/** Максимальное расстояние от точек fitted до ближайшего отрезка original. */
function maxDist(fitted: Pt[], original: Pt[]): number {
  let max = 0
  for (const fp of fitted) {
    let best = Infinity
    for (let i = 0; i < original.length; i++) best = Math.min(best, distToSeg(fp, original[i], original[(i + 1) % original.length]))
    max = Math.max(max, best)
  }
  return max
}

/** Средний радиус многоугольника от центра масс. */
function meanRadius(pts: Pt[]): number {
  let cx = 0, cy = 0
  for (const [x, y] of pts) { cx += x; cy += y }
  cx /= pts.length; cy /= pts.length
  return pts.reduce((s, [x, y]) => s + Math.hypot(x - cx, y - cy), 0) / pts.length
}

// ---------- fitLoop + sampleCurves (1.1) ----------

describe('fitLoop: подгонка кубических Безье', () => {
  it('круг: мало сегментов, в пределах допуска', () => {
    const pts = circlePts(20, 400)
    const corners = findCorners(resampleLoop(pts, 0.175), 2, 50)
    const fitted = fitLoop(resampleLoop(pts, 0.175), corners, 0.25)
    expect(fitted.segs.length).toBeLessThan(10)
    const sampled = sampleCurves(fitted, 1)
    expect(maxDist(sampled, pts)).toBeLessThan(0.25)
  })

  it('квадрат: сохраняет четыре угла', () => {
    const pts = squarePts(20, 60)
    const rs = resampleLoop(pts, 0.175)
    const corners = findCorners(rs, 2, 50)
    // четыре угла
    expect(corners.filter(Boolean).length).toBe(4)
    const fitted = fitLoop(rs, corners, 0.25)
    // углы — это начала сегментов
    expect(fitted.cornerAt.filter(Boolean).length).toBe(4)
    const sampled = sampleCurves(fitted, 1)
    // угловые точки должны быть близки к углам квадрата
    const cornerPoints = fitted.segs.filter((_, i) => fitted.cornerAt[i]).map((c) => c[0])
    for (const cp of cornerPoints) {
      const dists = [[-10, -10], [10, -10], [10, 10], [-10, 10]].map(([x, y]) => Math.hypot(cp[0] - x, cp[1] - y))
      expect(Math.min(...dists)).toBeLessThan(0.3)
    }
  })

  it('зашумлённый круг: шум поглощается в пределах допуска', () => {
    const original = circlePts(20, 400)
    const noisy = noisyCircle(20, 400, 0.15)
    const corners = findCorners(resampleLoop(noisy, 0.175), 2, 50)
    const fitted = fitLoop(resampleLoop(noisy, 0.175), corners, 0.25)
    const sampled = sampleCurves(fitted, 1)
    expect(maxDist(sampled, original)).toBeLessThan(0.25)
  })

  it('тонкое остриё: кончик сохраняется в пределах допуска', () => {
    const pts = spikeShape()
    const rs = resampleLoop(pts, 0.175)
    const corners = findCorners(rs, 2, 50)
    const fitted = fitLoop(rs, corners, 0.25)
    const sampled = sampleCurves(fitted, 1)
    // исходный кончик — минимальный y
    const originalTip = pts.reduce((b, p) => (p[1] < b[1] ? p : b))
    const fittedTip = sampled.reduce((b, p) => (p[1] < b[1] ? p : b))
    expect(Math.hypot(fittedTip[0] - originalTip[0], fittedTip[1] - originalTip[1])).toBeLessThan(0.25)
  })

  it('петля без углов: замкнута с непрерывным направлением', () => {
    const pts = circlePts(20, 100)
    const rs = resampleLoop(pts, 0.175)
    const corners = findCorners(rs, 2, 50)
    expect(corners.filter(Boolean).length).toBe(0)
    const fitted = fitLoop(rs, corners, 0.25)
    // замкнута: последняя точка последнего сегмента = первая точка первого сегмента
    const lastSeg = fitted.segs[fitted.segs.length - 1]
    const firstSeg = fitted.segs[0]
    expect(lastSeg[3][0]).toBeCloseTo(firstSeg[0][0], 6)
    expect(lastSeg[3][1]).toBeCloseTo(firstSeg[0][1], 6)
    // G1 на стыке (направление совпадает)
    const tLast = [lastSeg[3][0] - lastSeg[2][0], lastSeg[3][1] - lastSeg[2][1]]
    const tFirst = [firstSeg[1][0] - firstSeg[0][0], firstSeg[1][1] - firstSeg[0][1]]
    const dot = (tLast[0] * tFirst[0] + tLast[1] * tFirst[1]) / (Math.hypot(...tLast) * Math.hypot(...tFirst) || 1)
    expect(dot).toBeGreaterThan(0.99)
  })

  it('число вершин падает ≥ 5× на синтетическом трассированном контуре', () => {
    const pts = tracedTool()
    const originalCount = pts.length
    const fitted = fitOutline(pts, defaultFitParams)
    expect(fitted.length).toBeLessThanOrEqual(originalCount / 5)
    expect(maxDist(fitted, pts)).toBeLessThan(defaultFitParams.fitTolerance)
  })
})

describe('fittedVertexCount: счётчик вершин', () => {
  it('usePolyline возвращает длину исходного контура', () => {
    const pts = circlePts(20, 100)
    expect(fittedVertexCount(pts, { usePolyline: true })).toBe(100)
  })

  it('подгонка уменьшает число вершин', () => {
    const pts = tracedTool()
    const original = pts.length
    const fitted = fittedVertexCount(pts, defaultFitParams)
    expect(fitted).toBeLessThan(original / 5)
  })
})

// ---------- offsetCurve (1.2) ----------

describe('offsetCurve: смещение контура', () => {
  it('смещение круга — круг большего радиуса', () => {
    const r = 20, d = 2
    const pts = circlePts(r, 200)
    const off = offsetCurve(pts, d)
    expect(off).not.toBeNull()
    const newR = meanRadius(off!)
    expect(Math.abs(newR - (r + d))).toBeLessThan(0.3)
  })

  it('выпуклый угол скругляется радиусом смещения', () => {
    // треугольник (выпуклый): смещение наружу даёт дуги на углах
    const pts: Pt[] = [[0, 0], [10, 0], [5, 8.66]]
    const off = offsetCurve(pts, 1)
    expect(off).not.toBeNull()
    // число точек выросло из-за дуг
    expect(off!.length).toBeGreaterThan(pts.length)
  })

  it('исходный контур лежит внутри offset (на подогнанном круге)', () => {
    const pts = fitOutline(circlePts(20, 400), defaultFitParams)
    const off = offsetCurve(pts, 0.8)
    expect(off).not.toBeNull()
    // каждая точка оригинала внутри offset (расстояние до ближайшего ребра off ≤ d)
    for (const p of pts) {
      let best = Infinity
      for (let i = 0; i < off!.length; i++) best = Math.min(best, distToSeg(p, off![i], off![(i + 1) % off!.length]))
      expect(best).toBeLessThanOrEqual(0.8 + 0.15)
    }
  })

  it('тесный вогнутый вырез: возвращает null (fallback)', () => {
    // бабочка — самопересекающийся многоугольник; offset такого контура
    // также самопересекается, и selfIntersects на выходе ловит это
    const pts: Pt[] = [[0, 0], [5, 5], [0, 5], [5, 0]]
    const off = offsetCurve(pts, 1)
    expect(off).toBeNull()
  })
})
