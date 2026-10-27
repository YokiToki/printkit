import { findCorners, resampleLoop, smoothLoop } from './photo/outlineSmooth'
import type { Pt } from './photo/homography'

// ---------- вспомогательные векторные операции ----------

const vadd = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
const vsub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const vmul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s]
const vdot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1]
const vlen = (a: Pt) => Math.hypot(a[0], a[1])
const vnorm = (a: Pt): Pt => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l] }

// ---------- базовые функции кубической Безье ----------

const B0 = (u: number) => (1 - u) ** 3
const B1 = (u: number) => 3 * u * (1 - u) ** 2
const B2 = (u: number) => 3 * u * u * (1 - u)
const B3 = (u: number) => u ** 3

/** Точка на кубической Безье при параметре t. */
export const bezAt = (c: Bez, t: number): Pt => [B0(t) * c[0][0] + B1(t) * c[1][0] + B2(t) * c[2][0] + B3(t) * c[3][0], B0(t) * c[0][1] + B1(t) * c[1][1] + B2(t) * c[2][1] + B3(t) * c[3][1]]

/** Единичная касательная к кубической Безье в точке t. */
export const bezTan = (c: Bez, t: number): Pt => {
  const a = vmul(vsub(c[1], c[0]), 3 * (1 - t) ** 2), b = vmul(vsub(c[2], c[1]), 6 * (1 - t) * t), d = vmul(vsub(c[3], c[2]), 3 * t * t)
  const r = vadd(vadd(a, b), d)
  return vlen(r) < 1e-9 ? vnorm(vsub(c[3], c[0])) : vnorm(r)
}

const bezD2 = (c: Bez, t: number): Pt => {
  const a = vmul(vadd(vsub(c[2], vmul(c[1], 2)), c[0]), 6 * (1 - t)), b = vmul(vadd(vsub(c[3], vmul(c[2], 2)), c[1]), 6 * t)
  return vadd(a, b)
}

const bezD1 = (c: Bez, t: number): Pt => vadd(vadd(vmul(vsub(c[1], c[0]), 3 * (1 - t) ** 2), vmul(vsub(c[2], c[1]), 6 * (1 - t) * t)), vmul(vsub(c[3], c[2]), 3 * t * t))

// ---------- типы ----------

/** Кубическая кривая Безье: [P0, P1, P2, P3]. */
export type Bez = [Pt, Pt, Pt, Pt]

/** Результат подгонки: сегменты и флаги углов (начало каждого сегмента на углу). */
export interface FittedOutline { segs: Bez[]; cornerAt: boolean[] }

// ---------- подгонка одного сегмента (Schneider, Graphics Gems) ----------

function chordParam(d: Pt[], a: number, b: number): number[] {
  const u = [0]
  for (let i = a + 1; i <= b; i++) u.push(u[u.length - 1] + vlen(vsub(d[i], d[i - 1])))
  const L = u[u.length - 1] || 1
  return u.map((x) => x / L)
}

function genBezier(d: Pt[], a: number, b: number, u: number[], t1: Pt, t2: Pt): Bez {
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0
  for (let i = 0; i < u.length; i++) {
    const A0 = vmul(t1, B1(u[i])), A1 = vmul(t2, B2(u[i]))
    c00 += vdot(A0, A0); c01 += vdot(A0, A1); c11 += vdot(A1, A1)
    const tmp = vsub(d[a + i], vadd(vadd(vmul(d[a], B0(u[i]) + B1(u[i])), vmul(d[b], B2(u[i]) + B3(u[i]))), [0, 0]))
    x0 += vdot(A0, tmp); x1 += vdot(A1, tmp)
  }
  const det = c00 * c11 - c01 * c01, al = det === 0 ? 0 : (x0 * c11 - x1 * c01) / det, ar = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det
  const seg = vlen(vsub(d[b], d[a])), eps = 1e-6 * seg
  if (al < eps || ar < eps) { const k = seg / 3; return [d[a], vadd(d[a], vmul(t1, k)), vadd(d[b], vmul(t2, k)), d[b]] }
  return [d[a], vadd(d[a], vmul(t1, al)), vadd(d[b], vmul(t2, ar)), d[b]]
}

function maxErr(d: Pt[], a: number, b: number, c: Bez, u: number[]): { e: number; split: number } {
  let e = 0, split = Math.floor((a + b) / 2)
  for (let i = 1; i < u.length - 1; i++) {
    const p = bezAt(c, u[i]), dd = vsub(p, d[a + i]), s = vdot(dd, dd)
    if (s >= e) { e = s; split = a + i }
  }
  return { e, split }
}

function reparam(d: Pt[], a: number, c: Bez, u: number[]): number[] {
  return u.map((ui, i) => {
    const p = bezAt(c, ui), d1 = bezD1(c, ui), d2 = bezD2(c, ui), diff = vsub(p, d[a + i]), num = vdot(diff, d1), den = vdot(d1, d1) + vdot(diff, d2)
    return den === 0 ? ui : Math.min(1, Math.max(0, ui - num / den))
  })
}

function fitCubic(d: Pt[], a: number, b: number, t1: Pt, t2: Pt, err: number, out: Bez[]) {
  if (b - a === 1) { const k = vlen(vsub(d[b], d[a])) / 3; out.push([d[a], vadd(d[a], vmul(t1, k)), vadd(d[b], vmul(t2, k)), d[b]]); return }
  let u = chordParam(d, a, b), c = genBezier(d, a, b, u, t1, t2), { e, split } = maxErr(d, a, b, c, u)
  if (e < err * err) { out.push(c); return }
  if (e < err * err * 16) for (let k = 0; k < 6; k++) {
    u = reparam(d, a, c, u); c = genBezier(d, a, b, u, t1, t2); const r = maxErr(d, a, b, c, u); e = r.e; split = r.split
    if (e < err * err) { out.push(c); return }
  }
  const tc = vnorm(vsub(d[split - 1], d[split + 1]))
  fitCubic(d, a, split, t1, tc, err, out); fitCubic(d, split, b, vmul(tc, -1), t2, err, out)
}

// ---------- петля → кривые Безье ----------

/**
 * Замкнутый контур (точки в мм) → цепочка кубических Безье с допуском tol.
 * В острых углах (по `corner`) разрыв касательной; между ними G1-непрерывность.
 * Петля без углов режется пополам с центрально-разностными касательными.
 */
export function fitLoop(pts: Pt[], corner: boolean[], tol: number): FittedOutline {
  const n = pts.length, ids = corner.map((c, i) => (c ? i : -1)).filter((i) => i >= 0)
  const w = 3, tan = (i: number): Pt => vnorm(vsub(pts[(i + w) % n], pts[(i - w + n) % n]))
  const cuts = ids.length ? ids : [0, Math.floor(n / 2)]
  const segs: Bez[] = [], cornerAt: boolean[] = []
  for (let c = 0; c < cuts.length; c++) {
    const a = cuts[c], b = cuts[(c + 1) % cuts.length], run: Pt[] = []
    for (let i = a; ; i = (i + 1) % n) { run.push(pts[i]); if (i === b && run.length > 1) break; if (run.length > n + 1) break }
    if (run.length < 2) continue
    const m = run.length, k = Math.min(w, m - 1)
    const isCorner = ids.length > 0
    const t1 = isCorner ? vnorm(vsub(run[k], run[0])) : tan(a), t2 = isCorner ? vnorm(vsub(run[m - 1 - k], run[m - 1])) : vmul(tan(b), -1)
    const before = segs.length
    fitCubic(run, 0, m - 1, t1, t2, tol, segs)
    for (let s = before; s < segs.length; s++) cornerAt.push(s === before && isCorner)
  }
  return { segs, cornerAt }
}

// ---------- дискретизация кривых ----------

/** Допустимая стрела прогиба хорды при дискретизации, мм. */
const SAMPLE_CHORD_ERR = 0.03

/**
 * Выборка кривых Безье в многоугольник с шагом ≈ step мм.
 * Оценивает длину дуги 16-ю подинтервалами, затем делит равномерно по t.
 * Угол > 3° между сегментами отмечается как угол (для offset).
 */
export function sampleCurves(fitted: FittedOutline, step: number): Pt[] {
  const out: Pt[] = []
  const { segs } = fitted
  for (let si = 0; si < segs.length; si++) {
    const c = segs[si]
    let L = 0, prev = c[0]
    for (let i = 1; i <= 16; i++) { const q = bezAt(c, i / 16); L += vlen(vsub(q, prev)); prev = q }
    // где радиус мал, шаг мельче: хорда не отходит от дуги больше SAMPLE_CHORD_ERR (шаг ≤ √(8·R·err))
    let turn = 0, ta = bezTan(c, 0)
    for (let i = 1; i <= 16; i++) { const tb = bezTan(c, i / 16); turn += Math.abs(Math.atan2(ta[0] * tb[1] - ta[1] * tb[0], vdot(ta, tb))); ta = tb }
    const fine = turn > 1e-6 ? Math.sqrt(8 * (L / turn) * SAMPLE_CHORD_ERR) : Infinity
    const n = Math.max(2, Math.ceil(L / Math.min(step, Math.max(fine, 0.05))))
    for (let i = 0; i < n; i++) out.push(bezAt(c, i / n))
  }
  return out
}

/** Нормаль наружу (контур против часовой) в точке на кривой. */
const curveNormal = (c: Bez, t: number): Pt => { const tg = bezTan(c, t); return [tg[1], -tg[0]] }

// ---------- offset кривой ----------

/** Единичная нормаль к отрезку [a,b] наружу (CCW). */
function segNormal(a: Pt, b: Pt): Pt { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l] }

/** Угол поворота от a к b: положительный — левый (выпуклый для CCW). */
function turnAngle(a: Pt, b: Pt): number { return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]) }

/**
 * Offset замкнутого контура на расстояние d наружу.
 * Выпуклые углы — скругление дугой (round join, шаг 15°).
 * Вогнутые — митра с ограничением масштаба 2 (fall-back на простой offset при самопересечении).
 * Возвращает `null` если обнаружено самопересечение (тогда caller использует kernel offset).
 */
export function offsetCurve(pts: Pt[], d: number): Pt[] | null {
  if (d <= 0) return pts
  const n = pts.length; if (n < 3) return pts
  // нормали рассчитаны на обход против часовой; по часовой смещение ушло бы внутрь — отдаём ядру
  let area2 = 0
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area2 += a[0] * b[1] - b[0] * a[1] }
  if (area2 <= 0) return null
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n]
    const n1 = segNormal(prev, cur), n2 = segNormal(cur, next)
    // смещённые точки на продолжении сторон
    const off1: Pt = [cur[0] + n1[0] * d, cur[1] + n1[1] * d]
    const off2: Pt = [cur[0] + n2[0] * d, cur[1] + n2[1] * d]
    const a = turnAngle(n1, n2)
    if (Math.abs(a) < 0.05) { out.push(off1); continue } // почти прямой: любая точка подходит
    if (a > 0) {
      // выпуклый угол (левый поворот CCW) → round join
      const a0 = Math.atan2(n1[1], n1[0]); const steps = Math.max(1, Math.ceil(a / (Math.PI / 12)))
      for (let k = 0; k <= steps; k++) {
        const ang = a0 + (a * k) / steps
        out.push([cur[0] + Math.cos(ang) * d, cur[1] + Math.sin(ang) * d])
      }
    } else {
      // вогнутый угол → mitre
      const bx = n1[0] + n2[0], by = n1[1] + n2[1], bl = Math.hypot(bx, by) || 1
      const k = d / Math.max(0.4, bl / 2) // ограничение масштаба митры
      out.push([cur[0] + (bx / bl) * k, cur[1] + (by / bl) * k])
    }
  }
  // проверка самопересечений: если есть, caller переключится на kernel offset
  if (selfIntersects(out)) return null
  return out
}

/** Проверка самопересечения многоугольника (не соседние рёбра). */
function selfIntersects(p: Pt[]): boolean {
  const n = p.length; if (n < 6) return false
  for (let i = 0; i < n; i++) {
    const a1 = p[i], a2 = p[(i + 1) % n]
    for (let j = i + 2; j < n; j++) {
      if (j === (i - 1 + n) % n) continue
      const b1 = p[j], b2 = p[(j + 1) % n]
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const ccw = (A: Pt, B: Pt, C: Pt) => (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])
  return ccw(a1, b1, b2) !== ccw(a2, b1, b2) && ccw(a1, a2, b1) !== ccw(a1, a2, b2)
}

// ---------- высокоуровневая обёртка ----------

export interface FitParams {
  /** Гладкость контура, мм: размытие перед подгонкой. */
  smooth: number
  /** Допуск подгонки кривыми Безье, мм. */
  fitTolerance: number
  /** Угол угла, градусы. */
  cornerDeg: number
  /** Шаг дискретизации, мм. */
  step: number
  /** Использовать исходную полилинию вместо подгонки. */
  usePolyline: boolean
}

export const defaultFitParams: FitParams = { smooth: 0.25, fitTolerance: 0.25, cornerDeg: 50, step: 1, usePolyline: false }

/** Подогнанные кривые контура (общая часть fitOutline и счётчика вершин); null — подгонка выключена или контур слишком короткий. */
function fitCurves(pts: Pt[], p: FitParams): FittedOutline | null {
  if (p.usePolyline || pts.length < 4) return null
  const rs = resampleLoop(pts, 0.175)
  const win = Math.max(2, Math.round(1.5 / 0.175))
  const corners = findCorners(rs, win, p.cornerDeg)
  return fitLoop(smoothLoop(rs, p.smooth / 0.175, corners), corners, p.fitTolerance)
}

/**
 * Полный pipeline: полилиния → сглаживание → подгонка кривыми → дискретизация.
 * При `usePolyline` возвращает исходную полилинию без изменений.
 */
export function fitOutline(pts: Pt[], params: Partial<FitParams> = {}): Pt[] {
  const p = { ...defaultFitParams, ...params }
  const fitted = fitCurves(pts, p)
  return fitted ? sampleCurves(fitted, p.step) : pts
}

/** Число вершин после подгонки (для показа в UI). */
export const fittedVertexCount = (pts: Pt[], params: Partial<FitParams> = {}): number => fitOutline(pts, params).length
