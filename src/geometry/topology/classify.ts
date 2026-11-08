/**
 * Классификация поверхностей: подгонка плоскости, цилиндра, конуса и сферы
 * по точкам области. React-free, без three.js и manifold.
 */

export type Vec3 = [number, number, number]

export const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z]
export const vAdd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const vSub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vMul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const vDot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const vCross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
export const vLen = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export function vNorm(a: Vec3): Vec3 {
  const l = vLen(a)
  return l < 1e-12 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l]
}
export function vPerp(a: Vec3, axis: Vec3): Vec3 {
  const d = vDot(a, axis)
  return vNorm(vSub(a, vMul(axis, d)))
}
export function vAngle(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, vDot(vNorm(a), vNorm(b)))))
}

export interface PlaneFit {
  normal: Vec3
  d: number
  /** Максимальное отклонение точек от плоскости, мм. */
  residual: number
  centroid: Vec3
}

export function fitPlane(points: Vec3[]): PlaneFit {
  const n = points.length
  const c: Vec3 = [0, 0, 0]
  for (const p of points) {
    c[0] += p[0]
    c[1] += p[1]
    c[2] += p[2]
  }
  c[0] /= n
  c[1] /= n
  c[2] /= n

  // Нормаль — наименьший собственный вектор ковариации (PCA).
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (const p of points) {
    const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]
    }
  }
  const { vectors } = jacobiEigen(cov)
  const normal = vNorm(vectors[0] as Vec3)

  let residual = 0
  for (const p of points) {
    const dist = Math.abs(vDot(normal, vSub(p, c)))
    if (dist > residual) residual = dist
  }

  const dPlane = -vDot(normal, c)
  return { normal, d: dPlane, residual, centroid: c }
}

export interface CylinderFit {
  axis: Vec3
  /** Радиус в точке t = 0 вдоль оси. */
  radius: number
  /** Наклон радиуса: dr/dt. 0 — цилиндр. */
  taper: number
  /** Остаток подгонки, мм. */
  residual: number
  /** Вершина конуса (только при taper ≠ 0). */
  apex?: Vec3
  /** Длина проекции вдоль оси. */
  extent: number
}

export function fitCylinder(points: Vec3[], normals?: Vec3[]): CylinderFit | null {
  if (points.length < 6) return null
  const n = points.length
  const c: Vec3 = [0, 0, 0]
  for (const p of points) {
    c[0] += p[0]
    c[1] += p[1]
    c[2] += p[2]
  }
  c[0] /= n
  c[1] /= n
  c[2] /= n

  // Ось цилиндра ищем по нормалям: они радиальные, поэтому наименьший
  // собственный вектор их ковариации — это ось. По точкам PCA не годится:
  // у цилиндра с двумя кольцами вершин разброс по высоте меньше радиального.
  let axis: Vec3
  if (normals && normals.length >= 6) {
    const ncov = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    for (const nn of normals) {
      const d = vNorm(nn)
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) ncov[i][j] += d[i] * d[j]
      }
    }
    const { vectors } = jacobiEigen(ncov)
    axis = vNorm(vectors[0] as Vec3)
  } else {
    const cov = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]
    for (const p of points) {
      const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]]
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]
      }
    }
    const { vectors } = jacobiEigen(cov)
    axis = vNorm(vectors[0] as Vec3)
  }

  // Линейная подгонка r(t) = a·t + b
  let st = 0
  let sr = 0
  let stt = 0
  let str = 0
  let tMin = Infinity
  let tMax = -Infinity
  const samples: { t: number; r: number }[] = []
  for (const p of points) {
    const d = vSub(p, c)
    const t = vDot(d, axis)
    const radial = vSub(d, vMul(axis, t))
    const r = vLen(radial)
    samples.push({ t, r })
    st += t
    sr += r
    stt += t * t
    str += t * r
    if (t < tMin) tMin = t
    if (t > tMax) tMax = t
  }
  const det = n * stt - st * st
  if (Math.abs(det) < 1e-9) return null
  const a = (n * str - st * sr) / det
  const b = (sr - a * st) / n

  let sq = 0
  for (const s of samples) {
    const e = s.r - (a * s.t + b)
    sq += e * e
  }
  const residual = Math.sqrt(sq / n)

  const fit: CylinderFit = {
    axis,
    radius: b,
    taper: a,
    residual,
    extent: tMax - tMin,
  }
  if (Math.abs(a) > 1e-6) {
    const tApex = -b / a
    fit.apex = vAdd(c, vMul(axis, tApex))
  }
  return fit
}

export interface SphereFit {
  centre: Vec3
  radius: number
  residual: number
}

export function fitSphere(points: Vec3[]): SphereFit | null {
  if (points.length < 6) return null
  // Алгебраическая подгонка: 2·p·c + d = |p|²
  const m = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  const b = [0, 0, 0, 0]
  for (const p of points) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1]
    const rhs = p[0] * p[0] + p[1] * p[1] + p[2] * p[2]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) m[i][j] += row[i] * row[j]
      b[i] += row[i] * rhs
    }
  }
  const sol = solveLinear4(m, b)
  if (!sol) return null
  const centre: Vec3 = [sol[0], sol[1], sol[2]]
  const d = sol[3]
  // |p − c|² = r²  ⇒  |p|² = 2·p·c + (r² − |c|²), значит r² = d + |c|².
  const rSq = d + centre[0] * centre[0] + centre[1] * centre[1] + centre[2] * centre[2]
  if (!(rSq > 0)) return null
  const radius = Math.sqrt(rSq)
  let sq = 0
  for (const p of points) {
    const e = vLen(vSub(p, centre)) - radius
    sq += e * e
  }
  return { centre, radius, residual: Math.sqrt(sq / points.length) }
}

export interface CircleFit {
  centre: Vec3
  /** Единичная нормаль плоскости окружности. */
  normal: Vec3
  radius: number
  /** Максимальное отклонение точки от окружности, мм. */
  residual: number
}

/** Подгонка окружности (или дуги) по точкам в пространстве. */
export function fitCircle(points: Vec3[]): CircleFit | null {
  if (points.length < 3) return null
  const plane = fitPlane(points)
  const normal = plane.normal
  // Базис в плоскости.
  const u = vNorm(vPerp(Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], normal))
  const v = vCross(normal, u)

  const c: Vec3 = [0, 0, 0]
  for (const p of points) {
    c[0] += p[0]
    c[1] += p[1]
    c[2] += p[2]
  }
  c[0] /= points.length
  c[1] /= points.length
  c[2] /= points.length

  // Проекция в 2D.
  const px: number[] = []
  const py: number[] = []
  for (const p of points) {
    const d = vSub(p, c)
    px.push(vDot(d, u))
    py.push(vDot(d, v))
  }
  // Алгебраическая подгонка окружности: x² + y² = A·x + B·y + C
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  const rhs = [0, 0, 0]
  for (let i = 0; i < px.length; i++) {
    const row = [px[i], py[i], 1]
    const val = px[i] * px[i] + py[i] * py[i]
    for (let a = 0; a < 3; a++) {
      for (let b2 = 0; b2 < 3; b2++) m[a][b2] += row[a] * row[b2]
      rhs[a] += row[a] * val
    }
  }
  const sol = solveLinear3(m, rhs)
  if (!sol) return null
  const cx = sol[0] / 2
  const cy = sol[1] / 2
  const radius = Math.sqrt(sol[2] + cx * cx + cy * cy)
  if (!Number.isFinite(radius) || radius <= 0) return null

  const centre = vAdd(c, vAdd(vMul(u, cx), vMul(v, cy)))
  let residual = 0
  for (let i = 0; i < px.length; i++) {
    const e = Math.abs(Math.hypot(px[i] - cx, py[i] - cy) - radius)
    if (e > residual) residual = e
  }
  return { centre, normal, radius, residual }
}

/** Собственные векторы симметричной матрицы 3×3 (итерации Якоби). */
export function jacobiEigen(m: number[][]): { values: number[]; vectors: number[][] } {
  const a = [
    [m[0][0], m[0][1], m[0][2]],
    [m[1][0], m[1][1], m[1][2]],
    [m[2][0], m[2][1], m[2][2]],
  ]
  let v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let sweep = 0; sweep < 32; sweep++) {
    let off = 0
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) off += a[i][j] * a[i][j]
    }
    if (off < 1e-18) break
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-20) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p]
          const vkq = v[k][q]
          v[k][p] = c * vkp - s * vkq
          v[k][q] = s * vkp + c * vkq
        }
      }
    }
  }
  const values = [a[0][0], a[1][1], a[2][2]]
  // Сортировка по возрастанию собственных значений.
  const order = [0, 1, 2].sort((i, j) => values[i] - values[j])
  return {
    values: order.map((i) => values[i]),
    vectors: order.map((i) => [v[0][i], v[1][i], v[2][i]]),
  }
}

function solveLinear3(m: number[][], b: number[]): number[] | null {
  const a = [
    [m[0][0], m[0][1], m[0][2], b[0]],
    [m[1][0], m[1][1], m[1][2], b[1]],
    [m[2][0], m[2][1], m[2][2], b[2]],
  ]
  for (let col = 0; col < 3; col++) {
    let piv = col
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r
    }
    if (Math.abs(a[piv][col]) < 1e-12) return null
    ;[a[col], a[piv]] = [a[piv], a[col]]
    for (let r = 0; r < 3; r++) {
      if (r === col) continue
      const f = a[r][col] / a[col][col]
      for (let k = col; k < 4; k++) a[r][k] -= f * a[col][k]
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]]
}

function solveLinear4(m: number[][], b: number[]): number[] | null {
  const a: number[][] = []
  for (let i = 0; i < 4; i++) a.push([m[i][0], m[i][1], m[i][2], m[i][3], b[i]])
  for (let col = 0; col < 4; col++) {
    let piv = col
    for (let r = col + 1; r < 4; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r
    }
    if (Math.abs(a[piv][col]) < 1e-12) return null
    ;[a[col], a[piv]] = [a[piv], a[col]]
    for (let r = 0; r < 4; r++) {
      if (r === col) continue
      const f = a[r][col] / a[col][col]
      for (let k = col; k < 5; k++) a[r][k] -= f * a[col][k]
    }
  }
  return [a[0][4] / a[0][0], a[1][4] / a[1][1], a[2][4] / a[2][2], a[3][4] / a[3][3]]
}
