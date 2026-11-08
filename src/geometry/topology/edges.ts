/**
 * Рёбра меша: feature-рёбра по двугранному углу, цепочки через вершины
 * степени 2, классификация (прямая / окружность / произвольная) и знак
 * выпуклости. React-free, без three.js и manifold.
 */
import { fitCircle, fitPlane, vAdd, vCross, vDot, vLen, vMul, vNorm, vSub, type Vec3 } from './classify'
import type { FaceRegion, MeshIndex } from './faces'
import { vertexPos } from './faces'

export interface EdgeOptions {
  /** Порог «резкости» ребра, градусы. Default 30 */
  edgeAngleDeg?: number
  /** Допуск классификации цепочки, мм. Default 0.02 */
  chainTolerance?: number
}

export const DEFAULT_EDGE_OPTIONS: Required<EdgeOptions> = {
  edgeAngleDeg: 30,
  chainTolerance: 0.02,
}

export type EdgeKind = 'line' | 'circle' | 'free'

export interface EdgeChain {
  id: number
  kind: EdgeKind
  /** true — выпуклое ребро (материал снаружи угла), false — вогнутое. */
  convex: boolean
  /** Точки цепочки по порядку. */
  points: Vec3[]
  /** Направление прямой для kind === 'line'. */
  direction?: Vec3
  p0?: Vec3
  p1?: Vec3
  /** Центр и ось окружности для kind === 'circle'. */
  centre?: Vec3
  axis?: Vec3
  radius?: number
  /** Длина цепочки, мм. */
  length: number
  /** Смежные области (идентификаторы граней). */
  faces: [number, number]
  /** Область треугольника tri0. */
  face0: number
  /** Область треугольника tri1. */
  face1: number
  /** Двугранный угол между смежными гранями, радианы. */
  dihedral: number
  /** Индексы рёбер сетки, входящих в цепочку. */
  edgeIndices: number[]
  /** Треугольники смежных граней (для определения выпуклости). */
  tri0: number
  tri1: number
}

/** Угол между нормалями треугольников, радианы. */
function angleBetweenNormals(index: MeshIndex, t0: number, t1: number): number {
  const n0: Vec3 = [index.triNormal[t0 * 3], index.triNormal[t0 * 3 + 1], index.triNormal[t0 * 3 + 2]]
  const n1: Vec3 = [index.triNormal[t1 * 3], index.triNormal[t1 * 3 + 1], index.triNormal[t1 * 3 + 2]]
  return Math.acos(Math.max(-1, Math.min(1, vDot(n0, n1))))
}

/**
 * Цепочки feature-рёбер. Рёбра соединяются через вершины, у которых
 * сходятся ровно два feature-ребра.
 */
export function edgeChains(
  index: MeshIndex,
  triToFace: Int32Array,
  options: EdgeOptions = {}
): EdgeChain[] {
  const opts = { ...DEFAULT_EDGE_OPTIONS, ...options }
  const threshold = (opts.edgeAngleDeg * Math.PI) / 180

  const feature: number[] = []
  for (let e = 0; e < index.numEdges; e++) {
    if (index.edgeTri1[e] < 0) continue
    if (index.edgeDihedral[e] > threshold) feature.push(e)
  }

  const incident = new Map<number, number[]>()
  for (const e of feature) {
    const a = index.edgeA[e]
    const b = index.edgeB[e]
    if (!incident.has(a)) incident.set(a, [])
    if (!incident.has(b)) incident.set(b, [])
    incident.get(a)!.push(e)
    incident.get(b)!.push(e)
  }

  const used = new Set<number>()
  const chains: EdgeChain[] = []

  for (const start of feature) {
    if (used.has(start)) continue

    // Ищем начало цепочки: идём назад, пока в вершине ровно два ребра.
    // Замкнутое кольцо обходится по кругу — следим за посещёнными рёбрами.
    let curEdge = start
    let curVert = index.edgeA[start]
    const backSeen = new Set<number>([start])
    for (;;) {
      const cand = (incident.get(curVert) ?? []).filter((x) => x !== curEdge)
      if (cand.length !== 1) break
      const prev = cand[0]
      if (backSeen.has(prev) || used.has(prev)) break
      backSeen.add(prev)
      curEdge = prev
      curVert = index.edgeA[curEdge] === curVert ? index.edgeB[curEdge] : index.edgeA[curEdge]
    }

    // Идём вперёд от найденного начала.
    const edgeList: number[] = []
    const verts: number[] = [curVert]
    let e = curEdge
    let v = curVert
    for (;;) {
      edgeList.push(e)
      used.add(e)
      const nextV = index.edgeA[e] === v ? index.edgeB[e] : index.edgeA[e]
      verts.push(nextV)
      const cand = (incident.get(nextV) ?? []).filter((x) => x !== e)
      if (cand.length !== 1) break
      const next = cand[0]
      if (used.has(next)) break
      e = next
      v = nextV
    }

    if (edgeList.length === 0) continue
    const points = verts.map((vid) => vertexPos(index, vid))
    // Цепочка может содержать и прямые участки, и дуги (скруглённый
    // прямоугольник) — разбиваем её на однородные части.
    for (const [from, to] of splitRuns(points, opts)) {
      chains.push(
        buildChain(
          index,
          triToFace,
          edgeList.slice(from, to + 1),
          points.slice(from, to + 2),
          chains.length,
          opts
        )
      )
    }
  }

  return chains
}

/** Допуск для проверки прямолинейности при разбиении цепочки. */
const SPLIT_LINE_TOL = 0.002
/** Минимальный угловой размах дуги, чтобы считать её окружностью. */
const MIN_ARC_SPAN = (15 * Math.PI) / 180
/**
 * Минимальное число точек для классификации как окружность: любые три точки
 * подгоняются под окружность идеально, поэтому тройка не даёт признаков дуги.
 */
const MIN_CIRCLE_POINTS = 4

/**
 * Разбиение ломаной на однородные участки: прямые и дуги.
 * Возвращает пары [from, to] — диапазон индексов рёбер.
 */
export function splitRuns(points: Vec3[], opts: Required<EdgeOptions>): [number, number][] {
  const n = points.length - 1
  if (n <= 1) return [[0, Math.max(n, 0)]]

  // Цепочка целиком: прямая или окружность.
  if (classifyPoints(points, opts).kind !== 'free') return [[0, n]]

  // Смешанная цепочка: жадно набираем прямые и дуги.
  const runs: [number, number][] = []
  let i = 0
  while (i < n) {
    const lineEnd = extendLine(points, i, n, SPLIT_LINE_TOL)
    const circle = extendCircle(points, i, n, opts.chainTolerance)
    const circleValid = circle.end > i && circle.span >= MIN_ARC_SPAN
    let end: number
    if (circleValid && circle.end - i > lineEnd - i) end = circle.end
    else end = lineEnd
    if (end < i) end = i
    runs.push([i, end])
    i = end + 1
  }

  // Если разбиение не дало ни одной осмысленной части (прямого отрезка или
  // дуги), цепочка остаётся целой и будет классифицирована как free.
  const meaningful = runs.some((r) => {
    const seg = points.slice(r[0], r[1] + 2)
    const kind = classifyPoints(seg, opts).kind
    // Одиночное ребро не считается осмысленным куском: иначе любой волнистый
    // контур распался бы на отдельные «прямые».
    return kind === 'circle' || (kind === 'line' && r[1] - r[0] >= 1)
  })
  if (!meaningful) return [[0, n]]

  // Хвост из одного ребра присоединяем к предыдущей дуге, если она его вмещает.
  if (runs.length >= 2) {
    const last = runs[runs.length - 1]
    const prev = runs[runs.length - 2]
    if (last[1] - last[0] === 1 && prev[1] - prev[0] >= 2) {
      const merged = points.slice(prev[0], last[1] + 1)
      if (classifyPoints(merged, opts).kind === 'circle') {
        prev[1] = last[1]
        runs.pop()
      }
    }
  }

  return runs
}

function extendLine(points: Vec3[], from: number, n: number, tol: number): number {
  let end = from
  for (let j = from + 1; j < n; j++) {
    const line = fitLine(points.slice(from, j + 2))
    if (line.residual > tol) break
    end = j
  }
  return end
}

function extendCircle(
  points: Vec3[],
  from: number,
  n: number,
  tol: number
): { end: number; span: number } {
  let end = from
  let span = 0
  // Дуга — минимум четыре точки (три ребра): тройка подгоняется под окружность
  // всегда, признаком дуги служит ещё и согласованный знак поворотов.
  for (let j = from + 1; j < n; j++) {
    if (j - from + 2 < MIN_CIRCLE_POINTS) continue
    const seg = points.slice(from, j + 2)
    const circ = fitCircle(seg)
    if (!circ || circ.residual > tol) break
    if (!consistentArc(seg)) break
    end = j
    span = arcSpan(seg, circ.centre, circ.normal)
  }
  return { end, span }
}

/** Угловой размах дуги, радианы. */
export function arcSpan(points: Vec3[], centre: Vec3, axis: Vec3): number {
  if (points.length < 2) return 0
  const ref = vCross(axis, [0, 0, 1])
  const u = vLen(ref) > 1e-6 ? vNorm(ref) : vNorm(vCross(axis, [1, 0, 0]))
  const v = vCross(axis, u)
  const angles: number[] = []
  for (const p of points) {
    const d = vSub(p, centre)
    angles.push(Math.atan2(vDot(d, v), vDot(d, u)))
  }
  let span = 0
  for (let i = 1; i < angles.length; i++) {
    let d = angles[i] - angles[i - 1]
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    span += Math.abs(d)
  }
  return span
}

function buildChain(
  index: MeshIndex,
  triToFace: Int32Array,
  edgeList: number[],
  points: Vec3[],
  id: number,
  opts: Required<EdgeOptions>
): EdgeChain {
  const e0 = edgeList[0]
  const tri0 = index.edgeTri0[e0]
  const tri1 = index.edgeTri1[e0]

  // Длина.
  let length = 0
  for (let i = 0; i + 1 < points.length; i++) {
    length += vLen(vSub(points[i + 1], points[i]))
  }

  const cls = classifyPoints(points, opts)
  const kind: EdgeKind = cls.kind
  const direction = cls.direction
  const centre = cls.centre
  const axis = cls.axis
  const radius = cls.radius

  // Смежные области.
  const faceIds = new Set<number>()
  for (const e of edgeList) {
    for (const t of [index.edgeTri0[e], index.edgeTri1[e]]) {
      if (t < 0) continue
      const f = triToFace[t]
      if (f >= 0) faceIds.add(f)
    }
  }
  const faceList = [...faceIds]
  const fa = faceList[0] ?? -1
  const fb = faceList[1] ?? fa
  const face0 = triToFace[tri0] ?? fa
  const face1 = triToFace[tri1] ?? fb

  // Выпуклость: третий вершина первой грани лежит ли по материальной стороне
  // нормали второй грани.
  const convex = isConvex(index, e0, tri0, tri1)

  const dihedral = tri1 >= 0 ? angleBetweenNormals(index, tri0, tri1) : Math.PI

  const chain: EdgeChain = {
    id,
    kind,
    convex,
    points,
    length,
    faces: [fa, fb],
    face0,
    face1,
    dihedral,
    edgeIndices: edgeList,
    tri0,
    tri1,
  }
  if (direction) chain.direction = direction
  if (centre) chain.centre = centre
  if (axis) chain.axis = axis
  if (radius !== undefined) chain.radius = radius
  if (kind === 'line') {
    chain.p0 = points[0]
    chain.p1 = points[points.length - 1]
  }
  return chain
}

/** Выпуклость ребра: true — внешний угол твёрдого тела. */
export function isConvex(index: MeshIndex, edge: number, tri0: number, tri1: number): boolean {
  if (tri1 < 0) return true
  const a = index.edgeA[edge]
  const b = index.edgeB[edge]
  const c0 = thirdVertex(index, tri0, a, b)
  const c1 = thirdVertex(index, tri1, a, b)
  if (!c0 || !c1) return true
  const n1: Vec3 = [index.triNormal[tri1 * 3], index.triNormal[tri1 * 3 + 1], index.triNormal[tri1 * 3 + 2]]
  const p = vertexPos(index, a)
  return vDot(vSub(c0, p), n1) < 0
}

function thirdVertex(index: MeshIndex, tri: number, a: number, b: number): Vec3 | null {
  for (let k = 0; k < 3; k++) {
    const v = index.triVertex[tri * 3 + k]
    if (v !== a && v !== b) return vertexPos(index, v)
  }
  return null
}

export interface PointClassification {
  kind: EdgeKind
  direction?: Vec3
  centre?: Vec3
  axis?: Vec3
  radius?: number
}

/**
 * Классификация ломаной: прямая (отклонение ≤ допуска и нет поворотов) или
 * окружность (остаток подгонки ≤ допуска и размах дуги ≥ 15°).
 */
export function classifyPoints(points: Vec3[], opts: Required<EdgeOptions>): PointClassification {
  if (points.length >= 2) {
    const line = fitLine(points)
    const straight = maxTurn(points) <= 0.5 * (Math.PI / 180)
    if (line.residual <= opts.chainTolerance && straight) {
      return { kind: 'line', direction: line.direction }
    }
  }
  if (points.length >= MIN_CIRCLE_POINTS) {
    const circ = fitCircle(points)
    if (
      circ &&
      circ.residual <= opts.chainTolerance &&
      circ.radius > opts.chainTolerance &&
      arcSpan(points, circ.centre, circ.normal) >= MIN_ARC_SPAN &&
      consistentArc(points)
    ) {
      return { kind: 'circle', centre: circ.centre, axis: circ.normal, radius: circ.radius }
    }
  }
  return { kind: 'free' }
}

/**
 * Согласованность поворотов ломаной: у дуги все повороты одного знака, у
 * волнистого контура они чередуются. Два поворота — минимум, иначе признак
 * не отличить от случайного изгиба.
 */
function consistentArc(points: Vec3[]): boolean {
  const signs = turnSigns(points)
  if (signs.length < 2) return false
  for (const s of signs) if (s !== signs[0]) return false
  return true
}

/** Знаки поворотов ломаной относительно нормали её плоскости. */
export function turnSigns(points: Vec3[]): number[] {
  if (points.length < 3) return []
  const normal = fitPlane(points).normal
  const signs: number[] = []
  for (let i = 1; i + 1 < points.length; i++) {
    const d1 = vNorm(vSub(points[i], points[i - 1]))
    const d2 = vNorm(vSub(points[i + 1], points[i]))
    const c = vCross(d1, d2)
    if (vLen(c) < 1e-9) continue
    signs.push(vDot(c, normal) >= 0 ? 1 : -1)
  }
  return signs
}

/** Максимальный угол поворота между соседними рёбрами ломаной, радианы. */
export function maxTurn(points: Vec3[]): number {
  let max = 0
  for (let i = 1; i + 1 < points.length; i++) {
    const a = vNorm(vSub(points[i], points[i - 1]))
    const b = vNorm(vSub(points[i + 1], points[i]))
    const cos = Math.max(-1, Math.min(1, vDot(a, b)))
    max = Math.max(max, Math.acos(cos))
  }
  return max
}

export interface LineFit {
  direction: Vec3
  /** Точка на прямой. */
  point: Vec3
  residual: number
}

/** Подгонка прямой по точкам (главные компоненты). */
export function fitLine(points: Vec3[]): LineFit {
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

  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (const p of points) {
    const d = vSub(p, c)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]
    }
  }
  // Наибольший собственный вектор — направление прямой.
  const { values, vectors } = eigenLargest(cov)
  const direction = vNorm(vectors[0] as Vec3)
  let residual = 0
  for (const p of points) {
    const d = vSub(p, c)
    const proj = vMul(direction, vDot(d, direction))
    const dist = vLen(vSub(d, proj))
    if (dist > residual) residual = dist
  }
  void values
  return { direction, point: c, residual }
}

/** Наибольший собственный вектор симметричной 3×3 (Jacobi). */
function eigenLargest(m: number[][]): { values: number[]; vectors: number[][] } {
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
    if (off < 1e-20) break
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
  const order = [0, 1, 2].sort((i, j) => values[j] - values[i])
  return {
    values: order.map((i) => values[i]),
    vectors: order.map((i) => [v[0][i], v[1][i], v[2][i]]),
  }
}

/**
 * Направления вдоль смежных граней, уходящие от ребра.
 *
 * Для плоской грани направление — от ребра к центру грани (перпендикулярно
 * ребру в плоскости грани). Для цилиндрической или конической — вдоль оси.
 * Третья вершина треугольника для знака не годится: у граней с веерной
 * триангуляцией она может лежать с любой стороны.
 */
export function faceDirections(
  index: MeshIndex,
  chain: EdgeChain,
  faces: FaceRegion[]
): { v0: Vec3; v1: Vec3; n0: Vec3; n1: Vec3; p: Vec3; e: Vec3 } | null {
  const e0 = chain.edgeIndices[0]
  if (e0 === undefined) return null
  const a = index.edgeA[e0]
  const b = index.edgeB[e0]
  const pa = vertexPos(index, a)
  const pb = vertexPos(index, b)
  const e = vNorm(vSub(pb, pa))
  const p: Vec3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]

  const n0: Vec3 = [
    index.triNormal[chain.tri0 * 3],
    index.triNormal[chain.tri0 * 3 + 1],
    index.triNormal[chain.tri0 * 3 + 2],
  ]
  const n1: Vec3 = [
    index.triNormal[chain.tri1 * 3],
    index.triNormal[chain.tri1 * 3 + 1],
    index.triNormal[chain.tri1 * 3 + 2],
  ]

  const v0 = alongFace(chain.face0, faces, e, p)
  const v1 = alongFace(chain.face1, faces, e, p)
  if (!v0 || !v1) return null
  return { v0, v1, n0, n1, p, e }
}

/** Направление вдоль грани от ребра. */
function alongFace(
  faceId: number,
  faces: FaceRegion[],
  e: Vec3,
  p: Vec3
): Vec3 | null {
  const region = faces[faceId]
  if (!region) return null
  const d = vSub(region.centroid, p)

  if (region.kind === 'cylinder' || region.kind === 'cone') {
    const axis = region.axis
    if (!axis) return null
    const along = vDot(d, axis)
    const dir = vNorm(axis)
    return along >= 0 ? dir : vMul(dir, -1)
  }

  const perp = vSub(d, vMul(e, vDot(d, e)))
  if (vLen(perp) < 1e-9) return null
  return vNorm(perp)
}

/** Точка на цепочке, ближайшая к заданной. */
export function closestPointOnChain(chain: EdgeChain, p: Vec3): Vec3 {
  let best = chain.points[0] ?? p
  let bestD = Infinity
  for (const q of chain.points) {
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best
}

export { vAdd, vSub, vMul, vDot, vLen, vNorm, vCross, fitPlane }
