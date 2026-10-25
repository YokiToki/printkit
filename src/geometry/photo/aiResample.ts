// Перенос выхода сети (квадрат s × s, лист вписан с полями) на растр выпрямленного листа и обратно.
// Бикубика (Катмулл–Ром) вместо билинейной: у билинейной при растяжении (≈ 0,6 мм на пиксель сети → 0,25 мм на пиксель листа)
// остаётся волна с периодом пикселя сети, и контур выходит ребристым.

const weights = (t: number) => [(-t * t * t + 2 * t * t - t) / 2, (3 * t * t * t - 5 * t * t + 2) / 2, (-3 * t * t * t + 4 * t * t + t) / 2, (t * t * t - t * t) / 2]

/** Бикубическое значение плоскости w × h в точке (x, y), координаты в пикселях, центр пикселя (i + 0,5, j + 0,5). */
export function cubicSample(v: Float32Array, w: number, h: number, x: number, y: number): number {
  x -= 0.5; y -= 0.5
  const x0 = Math.floor(x), y0 = Math.floor(y), wx = weights(x - x0), wy = weights(y - y0)
  let acc = 0
  for (let j = 0; j < 4; j++) {
    const yy = Math.min(h - 1, Math.max(0, y0 - 1 + j))
    let row = 0
    for (let i = 0; i < 4; i++) row += wx[i] * v[yy * w + Math.min(w - 1, Math.max(0, x0 - 1 + i))]
    acc += wy[j] * row
  }
  return acc
}

/** Билинейное значение (для сравнения в тестах и там, где бикубика не нужна). */
export function linearSample(v: Float32Array, w: number, h: number, x: number, y: number): number {
  x = Math.min(w - 1, Math.max(0, x - 0.5)); y = Math.min(h - 1, Math.max(0, y - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = x - x0, ty = y - y0
  return (v[y0 * w + x0] * (1 - tx) + v[y0 * w + x1] * tx) * (1 - ty) + (v[y1 * w + x0] * (1 - tx) + v[y1 * w + x1] * tx) * ty
}

/** Геометрия вписывания w × h в квадрат s × s с сохранением пропорций: масштаб r (пикселей сети на пиксель листа) и поля. */
const fit = (s: number, w: number, h: number) => { const r = Math.min(s / w, s / h); return { r, ox: (s - w * r) / 2, oy: (s - h * r) / 2 } }

/** Выход сети s × s (значения 0…1) → плоскость w × h; поля вписывания отброшены. */
export function resampleOutput(v: Float32Array, s: number, w: number, h: number, mode: 'cubic' | 'linear' = 'cubic'): Float32Array {
  const out = new Float32Array(w * h), { r, ox, oy } = fit(s, w, h), sample = mode === 'cubic' ? cubicSample : linearSample
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = Math.min(1, Math.max(0, sample(v, s, s, (i + 0.5) * r + ox, (j + 0.5) * r + oy)))
  return out
}

/** Плоскость w × h → квадрат s × s с полями нулями (усреднение по блокам): то, что отдаёт сеть, до растяжения обратно. */
export function fitToSquare(v: Float32Array, w: number, h: number, s: number): Float32Array {
  const out = new Float32Array(s * s), { r, ox, oy } = fit(s, w, h)
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const x0 = (i - ox) / r, x1 = (i + 1 - ox) / r, y0 = (j - oy) / r, y1 = (j + 1 - oy) / r
    if (x1 <= 0 || y1 <= 0 || x0 >= w || y0 >= h) continue
    const a = Math.max(0, Math.floor(x0)), b = Math.min(w - 1, Math.ceil(x1) - 1), c = Math.max(0, Math.floor(y0)), d = Math.min(h - 1, Math.ceil(y1) - 1)
    let sum = 0, n = 0
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) { sum += v[y * w + x]; n++ }
    out[j * s + i] = n ? sum / n : 0
  }
  return out
}
