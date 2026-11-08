/**
 * Топологические ссылки: грани и рёбра хранятся геометрическими отпечатками
 * и пере-разрешаются против текущей формы. React-free.
 */
import { vDot, vLen, vNorm, vSub, type Vec3 } from './classify'
import type { FaceRegion } from './faces'
import { projectLoops, signedArea } from './faces'
import type { EdgeChain } from './edges'

/** Ссылка на грань: точка, нормаль и характерный размер. */
export interface FaceRef {
  kind: 'face'
  point: Vec3
  normal: Vec3
  /** Характерный размер грани, мм. */
  extent: number
}

/** Ссылка на ребро: прямая, окружность или произвольная ломаная. */
export interface EdgeRef {
  kind: 'edge'
  shape: 'line' | 'circle' | 'free'
  p0?: Vec3
  p1?: Vec3
  centre?: Vec3
  axis?: Vec3
  radius?: number
  length?: number
  /** Точки ломаной для shape === 'free'. */
  points?: Vec3[]
}

export type ResolveStatus = 'ok' | 'ambiguous' | 'missing'

export type Resolved<T> =
  | { status: 'ok'; value: T }
  | { status: 'ambiguous'; candidates: number[] }
  | { status: 'missing' }

/** Допуск сопоставления: от 0.02 мм и растёт с габаритом модели. */
export function resolveTolerance(diagonal: number): number {
  return Math.max(0.02, 1e-4 * diagonal)
}

/** Отпечаток грани. */
export function faceRef(region: FaceRegion): FaceRef {
  const normal = region.normal ?? vNorm(region.axis ?? [0, 0, 1])
  // Опорная точка — центр масс области: он лежит в плоскости и не «привязан»
  // к конкретному углу, поэтому переживает изменение размера грани.
  const point: Vec3 = region.centroid
  return {
    kind: 'face',
    point,
    normal,
    extent: Math.sqrt(Math.max(region.area, 1e-6)),
  }
}

/** Отпечаток ребра. */
export function edgeRef(chain: EdgeChain): EdgeRef {
  if (chain.kind === 'circle' && chain.centre && chain.axis) {
    return {
      kind: 'edge',
      shape: 'circle',
      centre: chain.centre,
      axis: chain.axis,
      radius: chain.radius,
      length: chain.length,
    }
  }
  if (chain.kind === 'free') {
    return {
      kind: 'edge',
      shape: 'free',
      points: chain.points.map((p) => [p[0], p[1], p[2]] as Vec3),
      length: chain.length,
    }
  }
  const p0 = chain.points[0] ?? [0, 0, 0]
  const p1 = chain.points[chain.points.length - 1] ?? p0
  return {
    kind: 'edge',
    shape: 'line',
    p0,
    p1,
    length: chain.length,
  }
}

/** Проекция точки на плоскость грани. */
function projectOnPlane(region: FaceRegion, p: Vec3): { point: Vec3; distance: number } {
  const n = region.normal ?? [0, 0, 1]
  const d = region.planeD ?? -vDot(n, region.centroid)
  const dist = vDot(n, p) + d
  return { point: vSub(p, [n[0] * dist, n[1] * dist, n[2] * dist]), distance: Math.abs(dist) }
}

/** Точка внутри области (чётно-нечётное правило по контурам). */
export function pointInRegion(region: FaceRegion, p: Vec3): boolean {
  if (region.kind !== 'planar' || !region.normal) return false
  const { contours } = projectLoops(region.loops, region.normal, region.centroid)
  if (contours.length === 0) return false
  const local = projectOnPlane(region, p).point
  const { basis } = projectLoops(region.loops, region.normal, region.centroid)
  const d = vSub(local, region.centroid)
  const x = vDot(d, basis.x)
  const y = vDot(d, basis.y)

  let inside = false
  for (const contour of contours) {
    if (pointInPolygon(contour, x, y)) inside = !inside
  }
  return inside
}

function pointInPolygon(poly: [number, number][], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]
    const pj = poly[j]
    const intersect =
      pi[1] > y !== pj[1] > y && x < ((pj[0] - pi[0]) * (y - pi[1])) / (pj[1] - pi[1]) + pi[0]
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Сопоставление ссылки на грань с областями текущей формы.
 * Ноль совпадений — missing, несколько — ambiguous.
 */
export function resolveFace(
  faces: FaceRegion[],
  ref: FaceRef,
  diagonal: number,
  tolerance?: number
): Resolved<FaceRegion> {
  const tol = tolerance ?? resolveTolerance(diagonal)
  // Допуск до плоскости растёт с размером грани: небольшое изменение габарита
  // не должно рвать ссылку.
  const planeTol = Math.max(tol, 0.05 * (ref.extent || 0))
  const candidates: FaceRegion[] = []

  for (const f of faces) {
    if (!f.normal) {
      // Криволинейная грань: ищем по близости к её центру.
      const d = vLen(vSub(f.centroid, ref.point))
      if (d > Math.max(planeTol, 0.05 * (ref.extent || 0))) continue
      candidates.push(f)
      continue
    }
    const normalMatch = vDot(f.normal, ref.normal) >= Math.cos((5 * Math.PI) / 180)
    if (!normalMatch) continue
    const { distance } = projectOnPlane(f, ref.point)
    if (distance > planeTol) continue
    candidates.push(f)
  }

  if (candidates.length === 0) return { status: 'missing' }
  if (candidates.length === 1) return { status: 'ok', value: candidates[0] }

  // При нескольких совпадениях предпочитаем грань, содержащую точку.
  const containing = candidates.filter((f) => pointInRegion(f, ref.point))
  if (containing.length === 1) return { status: 'ok', value: containing[0] }
  if (containing.length > 1) {
    // Берём ту, чья плоскость ближе всего к точке.
    let best = containing[0]
    let bestD = Infinity
    for (const f of containing) {
      const d = projectOnPlane(f, ref.point).distance
      if (d < bestD) {
        bestD = d
        best = f
      }
    }
    return { status: 'ok', value: best }
  }
  return { status: 'ambiguous', candidates: candidates.map((c) => c.id) }
}

/**
 * Сопоставление ссылки на ребро с цепочками текущей формы.
 */
export function resolveEdge(
  chains: EdgeChain[],
  ref: EdgeRef,
  diagonal: number,
  tolerance?: number
): Resolved<EdgeChain> {
  const tol = tolerance ?? resolveTolerance(diagonal)
  const candidates: EdgeChain[] = []

  for (const c of chains) {
    if (ref.shape === 'circle') {
      if (c.kind !== 'circle' || !c.centre || !c.axis || !ref.centre || !ref.axis) continue
      if (Math.abs((c.radius ?? 0) - (ref.radius ?? 0)) > tol) continue
      if (vLen(vSub(c.centre, ref.centre)) > tol) continue
      if (Math.abs(vDot(c.axis, ref.axis)) < Math.cos((5 * Math.PI) / 180)) continue
      candidates.push(c)
    } else if (ref.shape === 'free') {
      if (c.kind !== 'free' || !ref.points) continue
      if (c.points.length !== ref.points.length) continue
      let worst = 0
      for (let i = 0; i < c.points.length; i++) {
        const d = vLen(vSub(c.points[i], ref.points[i]))
        if (d > worst) worst = d
      }
      if (worst > tol) continue
      candidates.push(c)
    } else {
      if (c.kind !== 'line' || !c.p0 || !c.p1 || !ref.p0 || !ref.p1) continue
      const mid: Vec3 = [
        (ref.p0[0] + ref.p1[0]) / 2,
        (ref.p0[1] + ref.p1[1]) / 2,
        (ref.p0[2] + ref.p1[2]) / 2,
      ]
      const dir = vNorm(vSub(c.p1, c.p0))
      const refDir = vNorm(vSub(ref.p1, ref.p0))
      if (Math.abs(vDot(dir, refDir)) < Math.cos((5 * Math.PI) / 180)) continue
      // Расстояние от середины ссылки до прямой цепочки.
      const along = vSub(mid, c.p0)
      const dist = vLen(vSub(along, [dir[0] * vDot(along, dir), dir[1] * vDot(along, dir), dir[2] * vDot(along, dir)]))
      if (dist > tol) continue
      candidates.push(c)
    }
  }

  if (candidates.length === 0) return { status: 'missing' }
  if (candidates.length === 1) return { status: 'ok', value: candidates[0] }
  return { status: 'ambiguous', candidates: candidates.map((c) => c.id) }
}

export { signedArea }

/** Чтение вектора из трёх чисел; при ошибке — null. */
function readVec3(raw: unknown): Vec3 | null {
  if (!Array.isArray(raw) || raw.length < 3) return null
  const x = Number(raw[0])
  const y = Number(raw[1])
  const z = Number(raw[2])
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return [x, y, z]
}

function readNum(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

/**
 * Нормализация ссылки на грань: битые значения отбрасываются, ссылка
 * без корректной точки и нормали не восстанавливается.
 */
export function normalizeFaceRef(raw: unknown): FaceRef | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const point = readVec3(obj.point)
  const normal = readVec3(obj.normal)
  if (!point || !normal) return null
  const extent = readNum(obj.extent)
  return {
    kind: 'face',
    point,
    normal,
    extent: extent !== undefined ? extent : Math.hypot(point[0], point[1], point[2]),
  }
}

/**
 * Нормализация ссылки на ребро. Форма определяется полем `shape`; неизвестная
 * форма — ссылка не восстанавливается.
 */
export function normalizeEdgeRef(raw: unknown): EdgeRef | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const shape = obj.shape
  const length = readNum(obj.length)

  if (shape === 'circle') {
    const centre = readVec3(obj.centre)
    const axis = readVec3(obj.axis)
    const radius = readNum(obj.radius)
    if (!centre || !axis || radius === undefined) return null
    return { kind: 'edge', shape: 'circle', centre, axis, radius, length }
  }

  if (shape === 'free') {
    if (!Array.isArray(obj.points) || obj.points.length < 2) return null
    const points: Vec3[] = []
    for (const p of obj.points) {
      const v = readVec3(p)
      if (!v) return null
      points.push(v)
    }
    return { kind: 'edge', shape: 'free', points, length }
  }

  if (shape === 'line') {
    const p0 = readVec3(obj.p0)
    const p1 = readVec3(obj.p1)
    if (!p0 || !p1) return null
    return { kind: 'edge', shape: 'line', p0, p1, length }
  }

  return null
}
