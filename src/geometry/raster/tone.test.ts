import { describe, expect, it } from 'vitest'
import { localContrast, normaliseDepth, quantise } from './tone'

const W = 40, H = 30
const mean = (a: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length }

describe('localContrast', () => {
  it('amount 0 даёт плоские 0.5, постоянная плоскость — без NaN и около 0.5', () => {
    const g = new Uint8Array(W * H).fill(120)
    expect(localContrast(g, W, H, 3, 0).every((v) => v === 0.5)).toBe(true)
    const c = localContrast(g, W, H, 3, 2)
    expect(c.every((v) => Number.isFinite(v))).toBe(true); expect(Math.max(...c) - Math.min(...c)).toBeLessThan(1e-3); expect(mean(c)).toBeCloseTo(0.5, 2)
  })

  it('небольшой бугор на градиенте остаётся заметным, а среднее около 0.5', () => {
    const g = new Uint8Array(W * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) g[j * W + i] = 60 + i * 3 + (Math.hypot(i - 20, j - 15) < 3 ? 25 : 0)
    const c = localContrast(g, W, H, 4, 2)
    expect(c[15 * W + 20]).toBeGreaterThan(c[15 * W + 30] + 0.1) // бугор светлее соседей на том же градиенте
    expect(mean(c)).toBeGreaterThan(0.4); expect(mean(c)).toBeLessThan(0.6)
  })

  it('больше amount — сильнее отклик', () => {
    const g = new Uint8Array(W * H).fill(100); for (let j = 10; j < 20; j++) for (let i = 10; i < 20; i++) g[j * W + i] = 160
    expect(localContrast(g, W, H, 3, 4)[15 * W + 15]).toBeGreaterThan(localContrast(g, W, H, 3, 1)[15 * W + 15])
  })
})

describe('quantise', () => {
  const ramp = Float32Array.from({ length: 101 }, (_, i) => i / 100)
  it('жёстко: ровно levels различных значений; 0 и 1 не квантуют', () => {
    for (const L of [2, 3, 4, 8]) expect(new Set(quantise(ramp, L, 0)).size).toBe(L)
    expect(Array.from(quantise(ramp, 0, 0))).toEqual(Array.from(ramp)); expect(Array.from(quantise(ramp, 1, 0.5))).toEqual(Array.from(ramp))
  })
  it('мягко: монотонно, значений больше, чем уровней; полностью мягко — линейные склоны', () => {
    const q = quantise(ramp, 4, 1)
    for (let i = 1; i < q.length; i++) expect(q[i]).toBeGreaterThanOrEqual(q[i - 1] - 1e-9)
    expect(new Set(q).size).toBeGreaterThan(4); expect(q[0]).toBe(0); expect(q[100]).toBeCloseTo(1, 6)
    const soft = quantise(ramp, 4, 1), hard = quantise(ramp, 4, 0)
    const maxStep = (a: Float32Array) => Math.max(...Array.from(a, (v, i) => (i ? Math.abs(v - a[i - 1]) : 0)))
    expect(maxStep(soft)).toBeLessThan(maxStep(hard)) // без отвесов
  })
})

describe('normaliseDepth', () => {
  it('использует только маску и игнорирует выбросы', () => {
    const plane = new Float32Array(W * H).fill(10), mask = new Uint8Array(W * H)
    for (let j = 5; j < 25; j++) for (let i = 5; i < 35; i++) { mask[j * W + i] = 1; plane[j * W + i] = 100 + i } // предмет: 105…134
    plane[0] = 5000; plane[1] = -3000 // выбросы вне маски
    plane[10 * W + 10] = 99999 // выброс внутри маски
    const out = normaliseDepth(plane, mask)
    expect(out[10 * W + 6]).toBeLessThan(0.1); expect(out[10 * W + 33]).toBeGreaterThan(0.9)
    expect(out[0]).toBe(1); expect(out[1]).toBe(0) // вне маски отображение обрезается
    expect(Math.min(...out)).toBeGreaterThanOrEqual(0); expect(Math.max(...out)).toBeLessThanOrEqual(1)
  })
  it('ровная глубина даёт плоский результат, пустая маска не падает', () => {
    expect(normaliseDepth(new Float32Array(W * H).fill(7), null).every((v) => v === 0.5)).toBe(true)
    const p = Float32Array.from({ length: W * H }, (_, i) => i)
    expect(Number.isFinite(normaliseDepth(p, new Uint8Array(W * H))[5])).toBe(true)
  })
})
