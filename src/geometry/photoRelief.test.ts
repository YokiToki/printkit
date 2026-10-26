import { describe, expect, it } from 'vitest'
import { detailTerm, photoHeights, type PhotoInput, type PhotoParams } from './photoRelief'

const N = 64
const base: PhotoParams = { mix: { contour: 100, depth: 0, detail: 0 }, boost: 0, boostRadius: 1.4, levels: 0, levelSoftness: 0.6, detailMode: 'engrave', darkThreshold: 0.25, snap: 0, maxSlope: 0, finalSmooth: 0, contrast: 1, gamma: 1, invert: false }
const disc = (r = 26) => { const m = new Uint8Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (Math.hypot(i - N / 2, j - N / 2) < r) m[j * N + i] = 1; return m }
const FLOOR = 0.06, HMAX = 2

/** Скос от кромки (как у источника «расстояние»): растёт на 0.25 мм за узел, потолок HMAX. */
function contourOf(mask: Uint8Array, cell = 0.25) {
  const out = new Float32Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (mask[j * N + i]) {
    let d = 99; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!mask[y * N + x]) d = Math.min(d, Math.hypot(i - x, j - y))
    out[j * N + i] = Math.max(FLOOR, Math.min(HMAX, (d * cell) / 4 * HMAX))
  }
  return out
}
function input(over: Omit<Partial<PhotoInput>, 'p'> & { p?: Partial<PhotoParams> } = {}): PhotoInput {
  const mask = over.mask ?? disc()
  const { p, ...rest } = over
  return { nx: N, ny: N, mask, fixed: null, cell: 0.25, gray: new Float32Array(N * N).fill(0.5), depth: null, contour: contourOf(mask), floor: FLOOR, hmax: HMAX, p: { ...base, ...p }, ...rest }
}
const at = (a: Float32Array, i: number, j: number) => a[j * N + i]
const dome = () => Float32Array.from({ length: N * N }, (_, k) => Math.max(0, 1 - Math.hypot((k % N) - N / 2, Math.floor(k / N) - N / 2) / 30))

describe('photoHeights (34, 2.2)', () => {
  it('только контур совпадает с источником «расстояние»', () => {
    const inp = input(), out = photoHeights(inp).height
    for (let k = 0; k < out.length; k++) if (inp.mask[k]) expect(out[k]).toBeCloseTo(inp.contour[k], 5)
  })

  it('доли — пропорции: удвоение всех долей ничего не меняет; сумма ноль — только контур', () => {
    const d = dome(), a = photoHeights(input({ depth: d, p: { mix: { contour: 10, depth: 20, detail: 0 } } })).height, b = photoHeights(input({ depth: d, p: { mix: { contour: 20, depth: 40, detail: 0 } } })).height
    for (let k = 0; k < a.length; k++) expect(b[k]).toBeCloseTo(a[k], 6)
    const zero = photoHeights(input({ p: { mix: { contour: 0, depth: 0, detail: 0 } } })).height, c = photoHeights(input()).height
    for (let k = 0; k < zero.length; k++) expect(zero[k]).toBeCloseTo(c[k], 6)
  })

  it('глубина-купол даёт купол внутри маски; у кромки рельеф всё равно спускается (в смеси есть контур)', () => {
    const out = photoHeights(input({ depth: dome(), p: { mix: { contour: 30, depth: 70, detail: 0 } } })).height
    expect(at(out, 32, 32)).toBeGreaterThan(at(out, 32, 12) + 0.3)
    expect(at(out, 32, 12)).toBeGreaterThan(at(out, 32, 7)) // к кромке (радиус 26 → край у 6)
    expect(at(out, 32, 32)).toBeLessThanOrEqual(HMAX + 1e-6)
  })

  it('далёкий фон не съедает диапазон: неглубокий предмет на огромной глубине фона всё равно использует высоту', () => {
    const d = new Float32Array(N * N).fill(0); const m = disc(20)
    for (let k = 0; k < d.length; k++) d[k] = m[k] ? 0.6 + 0.2 * Math.hypot((k % N) - 32, Math.floor(k / N) - 32) / 20 : 5 // фон «очень далеко»
    const out = photoHeights(input({ mask: m, depth: d, p: { mix: { contour: 0, depth: 100, detail: 0 } } })).height
    const vals = Array.from(out).filter((_, k) => m[k])
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(1.5)
  })

  it('деталь не поднимает деталь в среднем: средняя высота при долях детали близка к средней при её отсутствии', () => {
    const g = Float32Array.from({ length: N * N }, (_, k) => 0.5 + 0.3 * Math.sin((k % N) / 2) * Math.cos(Math.floor(k / N) / 3))
    const p = { boost: 2, detailMode: 'relief' as const }
    const plain = photoHeights(input({ gray: g, p: { mix: { contour: 100, depth: 0, detail: 0 } } })).height
    const withDetail = photoHeights(input({ gray: g, p: { ...p, mix: { contour: 50, depth: 0, detail: 50 } } })).height
    const mean = (a: Float32Array, m: Uint8Array) => { let s = 0, c = 0; for (let k = 0; k < a.length; k++) if (m[k]) { s += a[k]; c++ } return s / c }
    const m = disc(14) // внутри, вдали от кромки
    expect(Math.abs(mean(withDetail, m) - (mean(plain, m) * 0.5 + 0.5 * (FLOOR + 0.5 * (HMAX - FLOOR))))).toBeLessThan(0.15)
  })

  it('одинаковый радиус в мм даёт одинаковый масштаб деталей при двух разрешениях сетки', () => {
    const make = (cell: number) => {
      const n = Math.round(N * 0.25 / cell), mask = new Uint8Array(n * n).fill(1)
      const g = Float32Array.from({ length: n * n }, (_, k) => (Math.floor(((k % n) * cell) / 1.2) % 2 ? 0.8 : 0.3)) // полосы шириной 1.2 мм
      const out = photoHeights({ nx: n, ny: n, mask, fixed: null, cell, gray: g, depth: null, contour: new Float32Array(n * n).fill(HMAX), floor: FLOOR, hmax: HMAX, p: { ...base, mix: { contour: 0, depth: 0, detail: 100 }, boost: 3, detailMode: 'relief', boostRadius: 1.5 } }).height
      // доля узлов «светлее среднего» вдоль полосы: должна совпадать
      let hi = 0; for (let i = 0; i < n; i++) if (out[Math.floor(n / 2) * n + i] > FLOOR + 0.5 * (HMAX - FLOOR)) hi++
      return hi / n
    }
    expect(Math.abs(make(0.25) - make(0.125))).toBeLessThan(0.12)
  })

  it('глубины нет: доля считается нулём, сообщается depthMissing и остальные доли работают', () => {
    const r = photoHeights(input({ depth: null, p: { mix: { contour: 50, depth: 50, detail: 0 } } }))
    expect(r.depthMissing).toBe(true)
    const only = photoHeights(input()).height
    for (let k = 0; k < only.length; k++) expect(r.height[k]).toBeCloseTo(only[k], 6)
    expect(photoHeights(input({ depth: null })).depthMissing).toBe(false)
  })

  it('контраст, гамма и инверсия применяются к смеси; предел крутизны и итоговое сглаживание работают', () => {
    const lo = photoHeights(input({ p: { gamma: 2 } })).height, hi = photoHeights(input()).height
    expect(at(lo, 32, 20)).toBeLessThan(at(hi, 32, 20))
    const spike = Float32Array.from({ length: N * N }, (_, k) => (Math.abs((k % N) - 32) <= 4 && Math.abs(Math.floor(k / N) - 32) <= 4 ? 1 : 0.2)) // выступ 9 × 9 (глубина: 2 % выбросов отбрасывается)
    const raw = photoHeights(input({ depth: spike, p: { mix: { contour: 0, depth: 100, detail: 0 } } })).height
    const lim = photoHeights(input({ depth: spike, p: { mix: { contour: 0, depth: 100, detail: 0 }, maxSlope: 40 } })).height
    expect(at(lim, 32, 32)).toBeLessThanOrEqual(at(raw, 32, 32))
    const sm = photoHeights(input({ depth: spike, p: { mix: { contour: 0, depth: 100, detail: 0 }, finalSmooth: 0.6 } })).height
    expect(at(sm, 32, 32)).toBeLessThan(at(raw, 32, 32))
  })
})

describe('detailTerm (34, 2.3b)', () => {
  const ramp = Float32Array.from({ length: 101 }, (_, i) => i / 100)

  it('гравировка: середина и свет остаются на одном уровне, вдавливается только то, что темнее порога', () => {
    const e = detailTerm(ramp, 'engrave', 0.3)
    for (let i = 50; i <= 100; i++) expect(e[i]).toBe(1) // тон ≥ 0.5 — гладко
    expect(e[0]).toBeLessThan(0.05)
    expect(e[40]).toBe(1) // 2·(0.5−0.4)=0.2 < порога 0.3: не вдавливается
    expect(e[10]).toBeLessThan(1)
  })

  it('меньший порог гравирует надмножество', () => {
    const a = detailTerm(ramp, 'engrave', 0.4), b = detailTerm(ramp, 'engrave', 0.1)
    for (let i = 0; i < ramp.length; i++) { expect(b[i]).toBeLessThanOrEqual(a[i] + 1e-9); if (a[i] < 1) expect(b[i]).toBeLessThan(1) }
  })

  it('«рельеф» — прежнее отображение: тон как высота; «оба» — между ними', () => {
    expect(Array.from(detailTerm(ramp, 'relief', 0.3))).toEqual(Array.from(ramp))
    const e = detailTerm(ramp, 'engrave', 0.3), b = detailTerm(ramp, 'both', 0.3)
    for (let i = 0; i < ramp.length; i++) expect(b[i]).toBeCloseTo(0.5 * (ramp[i] + e[i]), 6)
  })
})
