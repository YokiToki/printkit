// Векторное сглаживание контура с сохранением острых углов и метрика шероховатости. Работает в мм, не зависит от растра.
import type { Pt } from './homography'

const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Равномерная передискретизация замкнутой петли шагом h. */
export function resampleLoop(loop: Pt[], h: number): Pt[] {
  const n = loop.length, cum = [0]
  for (let i = 0; i < n; i++) cum.push(cum[i] + dist(loop[i], loop[(i + 1) % n]))
  const total = cum[n], count = Math.max(8, Math.round(total / h)), out: Pt[] = []
  let k = 0
  for (let i = 0; i < count; i++) {
    const d = (i / count) * total
    while (cum[k + 1] < d) k++
    const t = (d - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]), a = loop[k % n], b = loop[(k + 1) % n]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return out
}

/** Углы: вершины, где направление кривой поворачивается больше cornerDeg на окне ±win (локальный максимум поворота). */
export function findCorners(p: Pt[], win: number, cornerDeg: number): boolean[] {
  const n = p.length, turn = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = p[(i - win + n) % n], b = p[i], c = p[(i + win) % n]
    const v1x = b[0] - a[0], v1y = b[1] - a[1], v2x = c[0] - b[0], v2y = c[1] - b[1]
    turn[i] = (Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y)) * 180) / Math.PI
  }
  const corner = new Array<boolean>(n).fill(false)
  for (let i = 0; i < n; i++) {
    if (turn[i] < cornerDeg) continue
    let max = true
    for (let d = -win; d <= win; d++) {
      const t = turn[(i + d + n) % n]
      if (t > turn[i] || (t === turn[i] && d < 0)) { max = false; break }
    }
    corner[i] = max
  }
  return corner
}

const gauss = (sigma: number) => {
  const r = Math.max(1, Math.ceil(3 * sigma)), k: number[] = []
  let sum = 0
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v }
  return { r, k: k.map((v) => v / sum) }
}

/** Гаусс вдоль петли (σ в вершинах). Между углами концы закреплены (нечётное отражение), без углов — по кольцу. */
export function smoothLoop(p: Pt[], sigma: number, corner: boolean[]): Pt[] {
  if (sigma < 0.3) return p
  const n = p.length, { r, k } = gauss(sigma), ids = corner.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
  const out: Pt[] = p.map((q) => [q[0], q[1]])
  const run = (idx: number[], fixedEnds: boolean) => {
    const m = idx.length
    const at = (t: number, axis: 0 | 1): number => {
      if (!fixedEnds) return p[idx[((t % m) + m) % m]][axis]
      if (t < 0) return 2 * p[idx[0]][axis] - p[idx[Math.min(m - 1, -t)]][axis]
      if (t > m - 1) return 2 * p[idx[m - 1]][axis] - p[idx[Math.max(0, 2 * (m - 1) - t)]][axis]
      return p[idx[t]][axis]
    }
    for (let t = fixedEnds ? 1 : 0; t < (fixedEnds ? m - 1 : m); t++) {
      let x = 0, y = 0
      for (let d = -r; d <= r; d++) { x += k[d + r] * at(t + d, 0); y += k[d + r] * at(t + d, 1) }
      out[idx[t]] = [x, y]
    }
  }
  if (!ids.length) { run(Array.from({ length: n }, (_, i) => i), false); return out }
  for (let c = 0; c < ids.length; c++) {
    const a = ids[c], b = ids[(c + 1) % ids.length], idx: number[] = []
    for (let i = a; ; i = (i + 1) % n) { idx.push(i); if ((i === b && idx.length > 1) || idx.length > n + 1) break }
    if (idx.length > 2) run(idx, true)
  }
  return out
}

/** Шаг передискретизации, мм, и порог угла по умолчанию (градусы поворота на окне 1,5 мм). */
export const OUTLINE_STEP = 0.175
export const CORNER_DEG = 50

/** Сглаживание контура в мм вдоль кривой с сохранением острых углов (острия остаются острыми). sigmaMm = 0 возвращает контур как есть. */
export function smoothOutline(points: Pt[], sigmaMm: number, cornerDeg = CORNER_DEG, step = OUTLINE_STEP): Pt[] {
  if (points.length < 4 || !(sigmaMm > 0)) return points
  const rs = resampleLoop(points, step), win = Math.max(2, Math.round(1.5 / step))
  return smoothLoop(rs, sigmaMm / step, findCorners(rs, win, cornerDeg))
}

/**
 * Шероховатость контура, мм: среднее отклонение точек (после равномерной передискретизации, чтобы число и распределение вершин
 * не влияли) от того же контура, сглаженного гауссом σ = 1,5 мм. Чем меньше, тем плавнее линия.
 */
export function roughness(points: Pt[], sigmaMm = 1.5, step = OUTLINE_STEP): number {
  if (points.length < 4) return 0
  const l = resampleLoop(points, step), n = l.length, { r, k } = gauss(sigmaMm / step)
  let sum = 0
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0
    for (let d = -r; d <= r; d++) { const q = l[(((i + d) % n) + n) % n]; x += k[d + r] * q[0]; y += k[d + r] * q[1] }
    sum += Math.hypot(l[i][0] - x, l[i][1] - y)
  }
  return sum / n
}
