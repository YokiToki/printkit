/**
 * Плоскости эскизов: базовая (XY/XZ/YZ) и привязанная к грани тела.
 * Для грани хранится ссылка на грань и закешированная система координат:
 * ссылка пере-разрешается против текущей формы, а при неудаче эскиз
 * остаётся на месте и помечается отсоединённым.
 * React-free.
 */
import type { FaceRef } from '../../geometry/topology/reference'
import { resolveFace } from '../../geometry/topology/reference'
import type { FaceRegion, MeshTopology } from '../../geometry/topology'
import type { EdgeChain } from '../../geometry/topology/edges'
import {
  vDot,
  vLen,
  vMul,
  vNorm,
  vSub,
  type Vec3,
} from '../../geometry/topology/classify'

export type BasePlane = 'XY' | 'XZ' | 'YZ'

export interface BasePlaneDefinition {
  base: BasePlane
  offset: number
}

/** Закешированная система координат плоскости грани. */
export interface FacePlaneFrame {
  origin: Vec3
  normal: Vec3
  xDir: Vec3
}

/** Плоскость эскиза, привязанная к грани тела. */
export interface FacePlaneDefinition {
  face: FaceRef
  frame: FacePlaneFrame
}

export type PlaneDefinition = BasePlaneDefinition | FacePlaneDefinition

export interface PlaneFrame {
  origin: [number, number, number]
  normal: [number, number, number]
  xDir: [number, number, number]
  yDir: [number, number, number]
  toWorld: (p: [number, number]) => [number, number, number]
  toPlane: (p: [number, number, number]) => [number, number]
}

/** Отличить привязанную к грани плоскость от базовой. */
export function isFacePlane(def: PlaneDefinition): def is FacePlaneDefinition {
  return !!def && typeof def === 'object' && 'face' in def && !!(def as FacePlaneDefinition).face
}

/** Ключ плоскости для кэшей и сравнений. */
export function planeKey(def: PlaneDefinition): string {
  if (isFacePlane(def)) {
    const f = def.frame
    return `face:${f.origin.map((v) => v.toFixed(3)).join(',')}|${f.normal
      .map((v) => v.toFixed(3))
      .join(',')}|${f.xDir.map((v) => v.toFixed(3)).join(',')}`
  }
  return `base:${def.base}:${def.offset}`
}

/** Базовая плоскость: XY, XZ или YZ со смещением. */
export function basePlaneFrame(def: BasePlaneDefinition): PlaneFrame {
  let origin: [number, number, number]
  let normal: [number, number, number]
  let xDir: [number, number, number]
  let yDir: [number, number, number]

  if (def.base === 'XY') {
    origin = [0, 0, def.offset]
    normal = [0, 0, 1]
    xDir = [1, 0, 0]
    yDir = [0, 1, 0]
  } else if (def.base === 'XZ') {
    origin = [0, def.offset, 0]
    normal = [0, -1, 0]
    xDir = [1, 0, 0]
    yDir = [0, 0, 1]
  } else {
    origin = [def.offset, 0, 0]
    normal = [1, 0, 0]
    xDir = [0, 1, 0]
    yDir = [0, 0, 1]
  }

  const toWorld = (p: [number, number]): [number, number, number] => [
    origin[0] + p[0] * xDir[0] + p[1] * yDir[0],
    origin[1] + p[0] * xDir[1] + p[1] * yDir[1],
    origin[2] + p[0] * xDir[2] + p[1] * yDir[2],
  ]

  const toPlane = (p: [number, number, number]): [number, number] => {
    const dx = p[0] - origin[0]
    const dy = p[1] - origin[1]
    const dz = p[2] - origin[2]
    return [
      dx * xDir[0] + dy * xDir[1] + dz * xDir[2],
      dx * yDir[0] + dy * yDir[1] + dz * yDir[2],
    ]
  }

  return { origin, normal, xDir, yDir, toWorld, toPlane }
}

/** Система координат по закешированному кадру грани. */
export function facePlaneFrame(frame: FacePlaneFrame): PlaneFrame {
  const origin: [number, number, number] = [frame.origin[0], frame.origin[1], frame.origin[2]]
  const normal: [number, number, number] = [frame.normal[0], frame.normal[1], frame.normal[2]]
  const xDir: [number, number, number] = [frame.xDir[0], frame.xDir[1], frame.xDir[2]]
  const yDir: [number, number, number] = [
    frame.normal[1] * frame.xDir[2] - frame.normal[2] * frame.xDir[1],
    frame.normal[2] * frame.xDir[0] - frame.normal[0] * frame.xDir[2],
    frame.normal[0] * frame.xDir[1] - frame.normal[1] * frame.xDir[0],
  ]

  const toWorld = (p: [number, number]): [number, number, number] => [
    origin[0] + p[0] * xDir[0] + p[1] * yDir[0],
    origin[1] + p[0] * xDir[1] + p[1] * yDir[1],
    origin[2] + p[0] * xDir[2] + p[1] * yDir[2],
  ]

  const toPlane = (p: [number, number, number]): [number, number] => {
    const dx = p[0] - origin[0]
    const dy = p[1] - origin[1]
    const dz = p[2] - origin[2]
    return [
      dx * xDir[0] + dy * xDir[1] + dz * xDir[2],
      dx * yDir[0] + dy * yDir[1] + dz * yDir[2],
    ]
  }

  return { origin, normal, xDir, yDir, toWorld, toPlane }
}

/** Кадр плоскости по любому определению. */
export function planeFrame(def: PlaneDefinition): PlaneFrame {
  if (isFacePlane(def)) return facePlaneFrame(def.frame)
  return basePlaneFrame(def)
}

/** Проекция точки на плоскость, заданную нормалью и точкой. */
function projectOnPlane(p: Vec3, normal: Vec3, pointOnPlane: Vec3): Vec3 {
  const d = vDot(vSub(p, pointOnPlane), normal)
  return vSub(p, vMul(normal, d))
}

/** Самая длинная прямая цепочка на границе грани. */
function longestStraightChain(region: FaceRegion, topology: MeshTopology): EdgeChain | null {
  let best: EdgeChain | null = null
  for (const chain of topology.edges) {
    if (chain.faces[0] !== region.id && chain.faces[1] !== region.id) continue
    if (chain.kind !== 'line' || !chain.direction) continue
    if (!best || chain.length > best.length) best = chain
  }
  return best
}

/**
 * Кадр плоскости для грани: начало в точке выбора (или в центре грани),
 * z — нормаль грани, x — направление самой длинной прямой цепочки границы
 * (запасной вариант — проекция мировой оси X, затем Y).
 */
export function frameForFace(
  region: FaceRegion,
  topology: MeshTopology,
  picked?: Vec3
): FacePlaneFrame | null {
  if (region.kind !== 'planar' || !region.normal) return null
  const normal = vNorm(region.normal)

  // Центр грани лежит в её плоскости — на него проецируем точку выбора.
  const origin = picked ? projectOnPlane(picked, normal, region.centroid) : region.centroid

  let xDir: Vec3 | null = null
  const chain = longestStraightChain(region, topology)
  const chainDir = chain?.direction
  if (chainDir) xDir = vNorm(chainDir)
  if (!xDir) {
    const worldX: Vec3 = [1, 0, 0]
    const proj = vSub(worldX, vMul(normal, vDot(worldX, normal)))
    if (vLen(proj) > 1e-6) xDir = vNorm(proj)
  }
  if (!xDir) {
    const worldY: Vec3 = [0, 1, 0]
    const proj = vSub(worldY, vMul(normal, vDot(worldY, normal)))
    if (vLen(proj) > 1e-6) xDir = vNorm(proj)
  }
  if (!xDir) return null

  return { origin, normal, xDir }
}

/** Результат пере-разрешения привязки к грани. */
export interface FacePlaneResolution {
  definition: FacePlaneDefinition
  /** true — грань больше не найдена, эскиз остался на закешированном кадре. */
  detached: boolean
}

/**
 * Пере-разрешение привязки: если грань нашлась и её плоскость не уехала,
 * кадр сохраняется (эскиз не «прыгает»); если плоскость сместилась, кадр
 * пересчитывается, чтобы эскик остался на грани.
 */
export function resolveFacePlane(
  def: FacePlaneDefinition,
  topology: MeshTopology
): FacePlaneResolution {
  const res = resolveFace(topology.faces, def.face, topology.diagonal)
  if (res.status !== 'ok' || res.value.kind !== 'planar' || !res.value.normal) {
    return { definition: def, detached: true }
  }

  const region = res.value
  const regionNormal = region.normal
  if (!regionNormal) return { definition: def, detached: true }
  const normal = vNorm(regionNormal)
  const cachedNormal = vNorm(def.frame.normal)
  const samePlane = vDot(normal, cachedNormal) > Math.cos((5 * Math.PI) / 180)
  const offset = Math.abs(
    vDot(vSub(region.centroid, def.frame.origin), normal)
  )
  if (samePlane && offset < 0.5) {
    return { definition: def, detached: false }
  }

  const frame = frameForFace(region, topology, def.frame.origin)
  if (!frame) return { definition: def, detached: true }
  return { definition: { face: def.face, frame }, detached: false }
}

/** Точка и нормаль для отсчёта проекции. */
export interface ProjectedPoint {
  x: number
  y: number
}

export type ProjectedCurve =
  | { kind: 'line'; a: number; b: number }
  | { kind: 'circle'; c: number; r: number }
  | { kind: 'arc'; c: number; a: number; b: number }

export interface ProjectedGeometry {
  points: ProjectedPoint[]
  curves: ProjectedCurve[]
}

/** Две точки считаются совпадающими при расхождении меньше допуска, мм. */
const COINCIDENT_TOL = 0.001

class PointBag {
  points: ProjectedPoint[] = []
  /** Индексы совпадающих точек. */
  private index = new Map<string, number>()

  add(p: ProjectedPoint): number {
    for (let i = 0; i < this.points.length; i++) {
      const q = this.points[i]
      if (Math.abs(q.x - p.x) < COINCIDENT_TOL && Math.abs(q.y - p.y) < COINCIDENT_TOL) {
        return i
      }
    }
    this.points.push(p)
    return this.points.length - 1
  }

  get size(): number {
    return this.points.length
  }
}

/**
 * Проекция цепочек рёбер в плоскость эскиза: прямые — отрезками, окружности —
 * окружностью (если ось параллельна нормали плоскости) или ломаной,
 * произвольные контуры — ломаной. Совпадающие концы получают одну точку.
 */
export function projectChains(chains: EdgeChain[], frame: PlaneFrame): ProjectedGeometry {
  const bag = new PointBag()
  const curves: ProjectedCurve[] = []

  for (const chain of chains) {
    if (chain.points.length < 2) continue
  const flat = chain.points.map((p) => {
    const [x, y] = frame.toPlane([p[0], p[1], p[2]])
    return { x, y }
  })

    if (chain.kind === 'line') {
      const a = bag.add(flat[0])
      const b = bag.add(flat[flat.length - 1])
      if (a !== b) curves.push({ kind: 'line', a, b })
      continue
    }

    if (chain.kind === 'circle' && chain.centre && chain.axis && chain.radius) {
      const axis = vNorm(chain.axis)
      const normal = vNorm([frame.normal[0], frame.normal[1], frame.normal[2]])
      const parallel = Math.abs(vDot(axis, normal)) > Math.cos((5 * Math.PI) / 180)
      if (parallel) {
        const [cx, cy] = frame.toPlane([chain.centre[0], chain.centre[1], chain.centre[2]])
        const c = bag.add({ x: cx, y: cy })
        const a = bag.add(flat[0])
        const b = bag.add(flat[flat.length - 1])
        const full = isFullCircle(chain, frame)
        if (full) curves.push({ kind: 'circle', c, r: chain.radius })
        else if (a !== b) curves.push({ kind: 'arc', c, a, b })
        continue
      }
    }

    // Произвольный контур или окружность, сплющенная в плоскость: ломаная.
    const ids: number[] = []
    for (const p of flat) {
      const id = bag.add(p)
      if (ids.length === 0 || ids[ids.length - 1] !== id) ids.push(id)
    }
    for (let i = 0; i + 1 < ids.length; i++) {
      if (ids[i] !== ids[i + 1]) curves.push({ kind: 'line', a: ids[i], b: ids[i + 1] })
    }
  }

  return { points: bag.points, curves }
}

/** Полная окружность (размах 360°) в плоскости эскиза. */
function isFullCircle(chain: EdgeChain, frame: PlaneFrame): boolean {
  if (chain.points.length < 8) return false
  const flat = chain.points.map((p) => frame.toPlane([p[0], p[1], p[2]]))
  // Углы точек относительно центра в плоскости.
  const centre = chain.centre
  if (!centre) return false
  const [cx, cy] = frame.toPlane([centre[0], centre[1], centre[2]])
  let span = 0
  let prev: number | null = null
  for (const p of flat) {
    const a = Math.atan2(p[1] - cy, p[0] - cx)
    if (prev !== null) {
      let d = a - prev
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      span += Math.abs(d)
    }
    prev = a
  }
  return span >= (2 * Math.PI) * 0.95
}

/** Чтение вектора из трёх чисел; при ошибке — null. */
function readVec3(raw: unknown): Vec3 | null {
  if (!Array.isArray(raw) || raw.length < 3) return null
  const x = Number(raw[0])
  const y = Number(raw[1])
  const z = Number(raw[2])
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
  return [x, y, z]
}

/**
 * Нормализация закешированного кадра плоскости грани: битые значения
 * отбрасываются, нулевые векторы — не восстанавливаются.
 */
export function normalizeFaceFrame(raw: unknown): FacePlaneFrame | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const origin = readVec3(obj.origin)
  const normal = readVec3(obj.normal)
  const xDir = readVec3(obj.xDir)
  if (!origin || !normal || !xDir) return null
  if (vLen(normal) < 1e-9 || vLen(xDir) < 1e-9) return null
  return { origin, normal: vNorm(normal), xDir: vNorm(xDir) }
}

/** Направление «внутрь» грани от точки контура — для правила выбора оси X. */
export function inwardDirection(region: FaceRegion, from: Vec3): Vec3 {
  const d = vSub(region.centroid, from)
  if (vLen(d) < 1e-9) return [0, 0, 0]
  return vNorm(d)
}
