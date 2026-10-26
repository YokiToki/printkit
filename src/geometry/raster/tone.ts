import { gaussianBlur } from './blur'

/** Нижняя граница локального разброса: на ровных местах шум не превращается в «детали». */
const SD_FLOOR = 0.08

/**
 * Локальный контраст яркости 0…255 → 0…1 со средним около 0.5: из значения вычитается его размытая копия, разность делится на
 * локальное стандартное отклонение (с нижней границей против шума), результат 0.5 + 0.5·tanh(amount·v). amount 0 — плоские 0.5
 * (детали выключены). Радиус в пикселях растра; вызывающий переводит мм детали в пиксели.
 */
export function localContrast(gray: Uint8Array | Float32Array, w: number, h: number, radiusPx: number, amount: number): Float32Array {
  const out = new Float32Array(w * h).fill(0.5)
  if (!(amount > 0)) return out
  const all = new Uint8Array(w * h).fill(1), sigma = Math.max(0.5, radiusPx)
  const v = new Float32Array(w * h)
  for (let k = 0; k < v.length; k++) v[k] = gray[k] / 255
  const mu = gaussianBlur(v, w, h, sigma, all)
  const dev = new Float32Array(w * h)
  for (let k = 0; k < dev.length; k++) { const d = v[k] - mu[k]; dev[k] = d * d }
  const varr = gaussianBlur(dev, w, h, sigma, all)
  for (let k = 0; k < out.length; k++) {
    const z = (v[k] - mu[k]) / (Math.sqrt(varr[k]) + SD_FLOOR)
    out[k] = 0.5 + 0.5 * Math.tanh(amount * z)
  }
  return out
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * Квантование значений 0…1 до `levels` уровней (0 и 1 — без квантования). softness 0 — жёсткие ступени, 1 — плавные склоны на
 * всю ширину ступени (печатаемые, без отвесов). Значения монотонны.
 */
export function quantise(values: Float32Array, levels: number, softness: number): Float32Array {
  const L = Math.round(levels)
  if (!(L >= 2)) return Float32Array.from(values)
  const s = Math.min(1, Math.max(0, softness)), half = 0.5 * s, out = new Float32Array(values.length)
  for (let i = 0; i < out.length; i++) {
    const p = Math.min(1, Math.max(0, values[i])) * (L - 1), k = Math.min(L - 2, Math.floor(p)), f = p - k
    const t = s === 0 ? (f >= 0.5 ? 1 : 0) : smooth(Math.min(1, Math.max(0, (f - (0.5 - half)) / (2 * half))))
    out[i] = (k + t) / (L - 1)
  }
  return out
}

/** Значение процентиля q (0…1) среди значений плоскости под маской (mask[i] ≠ 0); null — маска пуста. */
function percentiles(plane: Float32Array, mask: Uint8Array | null, qs: number[]): number[] | null {
  const vals: number[] = []
  for (let i = 0; i < plane.length; i++) if (!mask || mask[i]) vals.push(plane[i])
  if (!vals.length) return null
  vals.sort((a, b) => a - b)
  return qs.map((q) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(q * (vals.length - 1))))])
}

/**
 * Глубина → 0…1 по 2–98 % значений под маской (дальше 0, ближе 1): выбросы и далёкий фон не съедают диапазон. Значения вне маски
 * приводятся тем же отображением и обрезаются. Ровная глубина даёт плоские 0.5.
 */
export function normaliseDepth(plane: Float32Array, mask: Uint8Array | null): Float32Array {
  const out = new Float32Array(plane.length)
  const p = percentiles(plane, mask, [0.02, 0.98]) ?? percentiles(plane, null, [0.02, 0.98])
  if (!p || p[1] - p[0] < 1e-9) return out.fill(0.5)
  const [lo, hi] = p
  for (let i = 0; i < out.length; i++) out[i] = Math.min(1, Math.max(0, (plane[i] - lo) / (hi - lo)))
  return out
}

