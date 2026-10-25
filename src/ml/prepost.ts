// Подготовка входа и разбор выхода сети. Чистые функции, без DOM: работают в воркере и в тестах.
import { resampleOutput } from '../geometry/photo/aiResample'
import type { ModelSpec } from './models'

type Norm = Pick<ModelSpec, 'size' | 'mean' | 'std'>

function bilinear(rgb: Uint8Array, w: number, h: number, x: number, y: number, k: number): number {
  x = Math.min(w - 1, Math.max(0, x - 0.5)); y = Math.min(h - 1, Math.max(0, y - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = x - x0, ty = y - y0
  const p = (i: number, j: number) => rgb[(j * w + i) * 3 + k]
  return (p(x0, y0) * (1 - tx) + p(x1, y0) * tx) * (1 - ty) + (p(x0, y1) * (1 - tx) + p(x1, y1) * tx) * ty
}

/**
 * Вход NCHW float32: картинка w × h (RGB подряд) вписывается в size × size с сохранением пропорций, поля — среднее модели
 * (после нормировки это нули). При сильном уменьшении берётся среднее 2 × 2 выборок внутри пикселя входа.
 */
export function toInput(rgb: Uint8Array, w: number, h: number, spec: Norm): Float32Array {
  const s = spec.size, r = Math.min(s / w, s / h), dw = w * r, dh = h * r, ox = (s - dw) / 2, oy = (s - dh) / 2
  const out = new Float32Array(3 * s * s)
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) for (let k = 0; k < 3; k++) {
    let v = spec.mean[k] * 255
    if (i >= ox && i < ox + dw && j >= oy && j < oy + dh) {
      let acc = 0
      for (const dy of [0.25, 0.75]) for (const dx of [0.25, 0.75]) acc += bilinear(rgb, w, h, (i + dx - ox) / r, (j + dy - oy) / r, k)
      v = acc / 4
    }
    out[k * s * s + j * s + i] = (v / 255 - spec.mean[k]) / spec.std[k]
  }
  return out
}

/** Выход сети (квадрат s × s, логиты или вероятности) → альфа 0…1 размера w × h, бикубически, поля вписывания отброшены. */
export function fromOutput(raw: Float32Array, spec: Pick<ModelSpec, 'sigmoid'>, w: number, h: number): Float32Array {
  let lo = Infinity, hi = -Infinity
  for (const x of raw) { if (x < lo) lo = x; if (x > hi) hi = x }
  const o = spec.sigmoid || lo < -0.001 || hi > 1.001 ? raw.map((x) => 1 / (1 + Math.exp(-x))) : raw
  return resampleOutput(o, Math.round(Math.sqrt(o.length)), w, h, 'cubic')
}
