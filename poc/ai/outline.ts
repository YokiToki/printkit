/** Векторный контур для PoC: трассировка, сглаживание вдоль кривой с сохранением острых углов, знаковое расстояние до полигонов. */
import { traceAlpha } from '../../src/geometry/textOutline'

export type Pt = [number, number]

const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Равномерная передискретизация замкнутой петли шагом h. */
export function resample(loop: Pt[], h: number): Pt[] {
  const n = loop.length, cum = [0]
  for (let i = 0; i < n; i++) cum.push(cum[i] + len(loop[i], loop[(i + 1) % n]))
  const L = cum[n], N = Math.max(8, Math.round(L / h)), out: Pt[] = []
  let k = 0
  for (let i = 0; i < N; i++) {
    const d = (i / N) * L
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
    turn[i] = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y)) * 180 / Math.PI
  }
  const corner = new Array<boolean>(n).fill(false)
  for (let i = 0; i < n; i++) {
    if (turn[i] < cornerDeg) continue
    let max = true
    for (let d = -win; d <= win; d++) if (turn[(i + d + n) % n] > turn[i] || (turn[(i + d + n) % n] === turn[i] && d < 0)) { max = false; break }
    corner[i] = max
  }
  return corner
}

const gaussKernel = (sigma: number) => { const r = Math.max(1, Math.ceil(3 * sigma)), k: number[] = []; let s = 0; for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); s += v } return { r, k: k.map((v) => v / s) } }

/** Сглаживание гауссом вдоль петли; между углами концы закреплены (нечётное отражение), без углов — по кольцу. */
export function smoothLoop(p: Pt[], sigma: number, corner: boolean[]): Pt[] {
  if (sigma < 0.3) return p
  const n = p.length, { r, k } = gaussKernel(sigma), ids = corner.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
  const out: Pt[] = p.map((q) => [q[0], q[1]])
  const smoothRun = (idx: number[], fixedEnds: boolean) => { // idx — индексы вершин участка по порядку
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
  if (!ids.length) { smoothRun(Array.from({ length: n }, (_, i) => i), false); return out }
  for (let c = 0; c < ids.length; c++) {
    const a = ids[c], b = ids[(c + 1) % ids.length], idx: number[] = []
    for (let i = a; ; i = (i + 1) % n) { idx.push(i); if (i === b && idx.length > 1) break; if (idx.length > n + 1) break }
    if (idx.length > 2) smoothRun(idx, true)
  }
  return out
}

/** Контуры мягкого поля (значения 0…255, уровень 128): внешние и внутренние петли, сглаженные с сохранением углов. Единицы — пиксели растра. */
export function vectorOutline(field255: Uint8Array, w: number, h: number, sigmaPx: number, cornerDeg: number, stepPx = 0.7): Pt[][] {
  const loops = traceAlpha(field255, w, h, 128)
  return loops.map((l) => {
    if (l.length < 4) return l as Pt[]
    const rs = resample(l as Pt[], stepPx), win = Math.max(2, Math.round(1.5 / stepPx))
    return smoothLoop(rs, sigmaPx / stepPx, findCorners(rs, win, cornerDeg))
  })
}

/** Расстояние от точки до набора петель и чётность пересечений (внутри ли). */
export function signedDistance(loops: Pt[][], x: number, y: number): number {
  let best = Infinity, cross = 0
  for (const l of loops) {
    const n = l.length
    for (let i = 0; i < n; i++) {
      const a = l[i], b = l[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      const d = Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)); if (d < best) best = d
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) / (b[1] - a[1])) * dx) cross++
    }
  }
  return cross & 1 ? best : -best
}
