/** Среднее по квадрату радиуса r (края — по доступным пикселям) через интегральное изображение: за линейное время. */
function boxMean(v: Float32Array | Float64Array, w: number, h: number, r: number): Float64Array {
  const I = new Float64Array((w + 1) * (h + 1))
  for (let j = 0; j < h; j++) { let row = 0; for (let i = 0; i < w; i++) { row += v[j * w + i]; I[(j + 1) * (w + 1) + i + 1] = I[j * (w + 1) + i + 1] + row } }
  const out = new Float64Array(w * h)
  for (let j = 0; j < h; j++) {
    const y0 = Math.max(0, j - r), y1 = Math.min(h - 1, j + r)
    for (let i = 0; i < w; i++) {
      const x0 = Math.max(0, i - r), x1 = Math.min(w - 1, i + r)
      out[j * w + i] = (I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0 + 1) * (y1 - y0 + 1))
    }
  }
  return out
}

/** Сила привязки 0…100 → регуляризация фильтра: 0 — выключено (входное значение), 100 — сильно следует краям направляющего. */
export const snapEps = (strength: number) => 0.1 * 10 ** (-3 * Math.min(100, Math.max(0, strength)) / 100)

/**
 * Направляющий фильтр (He, Sun, Tang): глубина `input` (0…1) подгоняется под края направляющего изображения `guide` (0…1):
 * где на изображении край — ступень глубины сохраняется, где ровно — сглаживается. radiusPx — радиус окна, eps — регуляризация
 * (меньше — крепче держится за края). Постоянная плоскость остаётся постоянной.
 */
export function guidedFilter(input: Float32Array, guide: Float32Array, w: number, h: number, radiusPx: number, eps: number): Float32Array {
  const r = Math.max(1, Math.round(radiusPx)), n = w * h
  const mI = boxMean(guide, w, h, r), mP = boxMean(input, w, h, r)
  const ii = new Float64Array(n), ip = new Float64Array(n)
  for (let k = 0; k < n; k++) { ii[k] = guide[k] * guide[k]; ip[k] = guide[k] * input[k] }
  const cII = boxMean(ii, w, h, r), cIP = boxMean(ip, w, h, r)
  const a = new Float64Array(n), b = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const varI = cII[k] - mI[k] * mI[k], covIP = cIP[k] - mI[k] * mP[k]
    a[k] = covIP / (varI + eps); b[k] = mP[k] - a[k] * mI[k]
  }
  const mA = boxMean(a, w, h, r), mB = boxMean(b, w, h, r), out = new Float32Array(n)
  for (let k = 0; k < n; k++) out[k] = mA[k] * guide[k] + mB[k]
  return out
}

/**
 * Предел крутизны: соседние узлы силуэта (mask ≠ 0) отличаются не больше чем на tan(maxSlopeDeg)·cell. Пики срезаются проходами
 * вперёд и назад (липшицев зажим), высота только понижается и не уходит ниже floor; узлы fixed не меняются и ничего не
 * ограничивают. Угол 0 или меньше — без изменений. Возвращает новый массив.
 */
export function limitSlope(height: Float32Array, w: number, h: number, cell: number, maxSlopeDeg: number, mask: Uint8Array, fixed: Uint8Array | null, floor: number): Float32Array {
  const out = Float32Array.from(height)
  if (!(maxSlopeDeg > 0) || maxSlopeDeg >= 90) return out
  const step = Math.tan((maxSlopeDeg * Math.PI) / 180) * cell, diag = step * Math.SQRT2
  const live = (k: number) => mask[k] && !(fixed && fixed[k])
  const relax = (k: number, nb: number, d: number) => { if (live(k) && mask[nb] && !(fixed && fixed[nb])) { const lim = out[nb] + d; if (out[k] > lim) out[k] = Math.max(lim, floor) } }
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i
      if (i > 0) relax(k, k - 1, step); if (j > 0) relax(k, k - w, step)
      if (i > 0 && j > 0) relax(k, k - w - 1, diag); if (i < w - 1 && j > 0) relax(k, k - w + 1, diag)
    }
    for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i
      if (i < w - 1) relax(k, k + 1, step); if (j < h - 1) relax(k, k + w, step)
      if (i < w - 1 && j < h - 1) relax(k, k + w + 1, diag); if (i > 0 && j < h - 1) relax(k, k + w - 1, diag)
    }
  }
  return out
}
