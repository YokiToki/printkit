import { describe, expect, it } from 'vitest'
import { keepLargest, smoothThreshold } from './matte'

const W = 60, H = 40
/** Мягкий прямоугольник: ядро 255, вокруг рампа шириной 6 пикселей до 0. */
function soft(): Uint8Array {
  const m = new Uint8Array(W * H)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const d = Math.max(Math.abs(i - 30) - 14, Math.abs(j - 20) - 8) // расстояние от прямоугольника 28 × 16
    m[j * W + i] = d <= 0 ? 255 : d >= 6 ? 0 : Math.round(255 * (1 - d / 6))
  }
  return m
}
const count = (a: Uint8Array) => a.reduce((n, v) => n + (v ? 1 : 0), 0)
const perimeter = (a: Uint8Array) => { let n = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = a[j * W + i] > 0; if (i + 1 < W && v !== a[j * W + i + 1] > 0) n++; if (j + 1 < H && v !== a[(j + 1) * W + i] > 0) n++ } return n }

describe('smoothThreshold', () => {
  it('порог монотонен: ниже никогда не сжимает, выше никогда не раздувает', () => {
    const m = soft()
    const sizes = [0.2, 0.4, 0.5, 0.6, 0.8].map((t) => count(smoothThreshold(m, W, H, 0, t)))
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1])
    expect(sizes[0]).toBeGreaterThan(sizes[4])
  })

  it('радиус 0 равен простому порогу', () => {
    const m = soft(), out = smoothThreshold(m, W, H, 0, 0.5)
    for (let k = 0; k < m.length; k++) expect(out[k]).toBe(m[k] >= 127.5 ? 255 : 0)
  })

  it('сглаживание не удлиняет контур зазубренной маски', () => {
    const m = new Uint8Array(W * H)
    for (let j = 10; j < 30; j++) for (let i = 10; i < 50; i++) m[j * W + i] = (i + j) % 7 === 0 ? 0 : 255 // «соль» по маске
    expect(perimeter(smoothThreshold(m, W, H, 2, 0.5))).toBeLessThan(perimeter(smoothThreshold(m, W, H, 0, 0.5)))
  })

  it('выход только 0 и 255; пустая матта даёт пустой результат', () => {
    expect(new Set(smoothThreshold(soft(), W, H, 1.5, 0.5))).toEqual(new Set([0, 255]))
    expect(count(smoothThreshold(new Uint8Array(W * H), W, H, 3, 0.5))).toBe(0)
  })
})

describe('keepLargest', () => {
  const blob = (m: Uint8Array, x0: number, y0: number, x1: number, y1: number) => { for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) m[j * W + i] = 1 }

  it('убирает пятно и оставляет крупнейшую область; внутренняя щель остаётся щелью', () => {
    const m = new Uint8Array(W * H)
    blob(m, 5, 5, 40, 30); blob(m, 50, 5, 54, 9) // большая и мелкая
    for (let j = 12; j < 18; j++) for (let i = 15; i < 22; i++) m[j * W + i] = 0 // щель внутри большой
    const out = keepLargest(m, W, H)
    expect(out[7 * W + 52]).toBe(0)
    expect(out[10 * W + 10]).toBe(1)
    expect(out[14 * W + 18]).toBe(0) // щель не залита
    expect(count(out)).toBe(count(m) - 16)
  })

  it('диагональное касание считается связным (8-связность)', () => {
    const m = new Uint8Array(W * H)
    blob(m, 5, 5, 15, 15); blob(m, 15, 15, 20, 20)
    expect(count(keepLargest(m, W, H))).toBe(count(m))
  })

  it('равные области: остаётся первая; пустая маска безопасна', () => {
    const m = new Uint8Array(W * H)
    blob(m, 2, 2, 8, 8); blob(m, 30, 20, 36, 26)
    const out = keepLargest(m, W, H)
    expect(out[3 * W + 3]).toBe(1); expect(out[22 * W + 32]).toBe(0)
    expect(count(keepLargest(new Uint8Array(W * H), W, H))).toBe(0)
  })
})
