import { describe, expect, it } from 'vitest'
import { guidedFilter, limitSlope, snapEps } from './guided'

const W = 40, H = 24
const rnd = (() => { let s = 5; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 - 0.5 } })()

describe('guidedFilter', () => {
  it('ступень, совпадающая с краем направляющего, сохраняется; шум на ровном направляющем сглаживается', () => {
    const guide = new Float32Array(W * H), input = new Float32Array(W * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { guide[j * W + i] = i < 20 ? 0.2 : 0.8; input[j * W + i] = (i < 20 ? 0.2 : 0.8) + rnd() * 0.1 }
    const out = guidedFilter(input, guide, W, H, 3, snapEps(60))
    const gap = out[12 * W + 24] - out[12 * W + 15]
    expect(gap).toBeGreaterThan(0.45) // ступень на месте
    let before = 0, after = 0; for (let i = 3; i < 15; i++) { before += Math.abs(input[12 * W + i] - 0.2); after += Math.abs(out[12 * W + i] - 0.2) }
    expect(after).toBeLessThan(before * 0.6) // шум на ровной части убран
  })

  it('постоянная плоскость остаётся постоянной; eps огромный размывает ступень, а сила 0 даёт большой eps', () => {
    const flat = new Float32Array(W * H).fill(0.4), g = Float32Array.from({ length: W * H }, (_, k) => (k % W) / W)
    for (const v of guidedFilter(flat, g, W, H, 4, snapEps(50))) expect(v).toBeCloseTo(0.4, 5)
    expect(snapEps(0)).toBeGreaterThan(snapEps(60)); expect(snapEps(60)).toBeGreaterThan(snapEps(100))
  })
})

describe('limitSlope', () => {
  const all = new Uint8Array(W * H).fill(1)
  const maxDiff = (a: Float32Array) => { let m = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (i + 1 < W) m = Math.max(m, Math.abs(a[j * W + i] - a[j * W + i + 1])); if (j + 1 < H) m = Math.max(m, Math.abs(a[j * W + i] - a[(j + 1) * W + i])) } return m }

  it('шип и обрыв укладываются в предел, высота только понижается и не уходит ниже пола', () => {
    const h = new Float32Array(W * H).fill(0.1); h[12 * W + 20] = 5 // шип
    for (let j = 0; j < H; j++) for (let i = 30; i < W; i++) h[j * W + i] = 2 // обрыв
    const out = limitSlope(h, W, H, 0.25, 50, all, null, 0.06), bound = Math.tan((50 * Math.PI) / 180) * 0.25
    expect(maxDiff(out)).toBeLessThanOrEqual(bound + 1e-5)
    for (let k = 0; k < h.length; k++) { expect(out[k]).toBeLessThanOrEqual(h[k] + 1e-6); expect(out[k]).toBeGreaterThanOrEqual(0.06 - 1e-6) }
  })

  it('угол 0 — тождество; fixed не меняется и не ограничивает; вне маски ничего не трогается', () => {
    const h = Float32Array.from({ length: W * H }, (_, k) => (k % 7) * 0.3)
    expect(Array.from(limitSlope(h, W, H, 0.25, 0, all, null, 0))).toEqual(Array.from(h))
    const fixed = new Uint8Array(W * H); fixed[5 * W + 5] = 1
    const hh = new Float32Array(W * H).fill(0.1); hh[5 * W + 5] = 9
    expect(limitSlope(hh, W, H, 0.25, 40, all, fixed, 0)[5 * W + 5]).toBe(9)
    const mask = new Uint8Array(W * H); for (let i = 0; i < 10; i++) mask[i] = 1
    const o = limitSlope(Float32Array.from({ length: W * H }, () => 3), W, H, 0.25, 30, mask, null, 0)
    expect(o[W + 5]).toBe(3) // вне маски без изменений
  })

  it('пологий склон не меняется', () => {
    const h = Float32Array.from({ length: W * H }, (_, k) => 0.01 * (k % W))
    expect(Array.from(limitSlope(h, W, H, 0.25, 50, all, null, 0))).toEqual(Array.from(h))
  })
})
