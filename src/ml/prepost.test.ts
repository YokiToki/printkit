import { describe, expect, it } from 'vitest'
import { fromOutput, toInput } from './prepost'

const spec = { size: 4, mean: [0.5, 0.5, 0.5] as [number, number, number], std: [0.5, 0.5, 0.5] as [number, number, number], sigmoid: false }

describe('подготовка входа и разбор выхода', () => {
  it('картинка 2 × 1 вписывается в 4 × 4 с полями среднего, нормировка (v/255 − mean) / std', () => {
    const rgb = Uint8Array.of(255, 0, 0, 0, 255, 0) // красный и зелёный пиксели
    const t = toInput(rgb, 2, 1, spec), n = 16
    // высота вписанной картинки 2 из 4: строки 0 и 3 — поля (после нормировки нули)
    for (let i = 0; i < 4; i++) { expect(t[0 * n + i]).toBeCloseTo(0); expect(t[0 * n + 12 + i]).toBeCloseTo(0) }
    // левая половина вписанной полосы — красный: R = +1, G = −1; правая — наоборот
    expect(t[0 * n + 1 * 4 + 0]).toBeCloseTo(1); expect(t[1 * n + 1 * 4 + 0]).toBeCloseTo(-1)
    expect(t[0 * n + 1 * 4 + 3]).toBeCloseTo(-1); expect(t[1 * n + 1 * 4 + 3]).toBeCloseTo(1)
  })

  it('выход: вероятности остаются, логиты проходят sigmoid, поля вписывания отбрасываются', () => {
    const half = new Float32Array(16).fill(0.25)
    const a = fromOutput(half, spec, 2, 1)
    expect(a).toHaveLength(2); for (const v of a) expect(v).toBeCloseTo(0.25, 5)
    const logits = new Float32Array(16).fill(0)
    for (const v of fromOutput(logits, { sigmoid: true }, 2, 1)) expect(v).toBeCloseTo(0.5, 5)
    const big = new Float32Array(16).fill(8) // вне 0…1: тоже логиты
    for (const v of fromOutput(big, spec, 2, 1)) expect(v).toBeGreaterThan(0.99)
  })
})
