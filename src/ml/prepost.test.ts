import { describe, expect, it } from 'vitest'
import { fromDepth, fromOutput, toInput } from './prepost'

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

  it('высокая картинка 1 × 2 вписывается по высоте: поля слева и справа, середина — картинка', () => {
    const rgb = Uint8Array.of(255, 255, 255, 0, 0, 0) // сверху белый, снизу чёрный пиксель
    const t = toInput(rgb, 1, 2, spec), n = 16
    for (let j = 0; j < 4; j++) { expect(t[j * 4 + 0]).toBeCloseTo(0); expect(t[j * 4 + 3]).toBeCloseTo(0) } // поля слева и справа
    expect(t[0 * 4 + 1]).toBeCloseTo(1); expect(t[3 * 4 + 1]).toBeCloseTo(-1) // белый сверху, чёрный снизу
    expect(t[n + 0]).toBeCloseTo(0)
  })

  it('выход высокой картинки возвращается без искажений: полоса вписывания обрезается, поля отбрасываются', () => {
    const out = new Float32Array(16)
    for (let j = 0; j < 4; j++) { out[j * 4 + 1] = 0.2 * (j + 1); out[j * 4 + 2] = 0.2 * (j + 1) } // содержимое в двух средних столбцах
    const a = fromOutput(out, spec, 1, 2)
    expect(a).toHaveLength(2); expect(a[0]).toBeLessThan(a[1]) // градиент по вертикали сохранился
  })

  it('глубина: значения приводятся к 0…1 по минимуму и максимуму, поля вписывания отбрасываются', () => {
    const raw = Float32Array.from({ length: 16 }, (_, k) => 100 + 50 * (k % 4)) // 100…250 по столбцам
    const d = fromDepth(raw, 4, 4)
    expect(d).toHaveLength(16); expect(Math.min(...d)).toBeGreaterThanOrEqual(0); expect(Math.max(...d)).toBeLessThanOrEqual(1)
    expect(d[3]).toBeGreaterThan(d[0]) // градиент слева направо сохранён
    expect(Array.from(fromDepth(new Float32Array(16).fill(7), 2, 2)).every((v) => v === 0)).toBe(true) // ровная глубина — ноль, не NaN
  })
})
