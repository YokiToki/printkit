/**
 * Подсветка граней и рёбер во вьюпорте: цветовые раскладки и выбор по
 * расстоянию на экране. React-free, без three.js — только числа.
 */
import type { FaceRegion, MeshTopology } from '../../geometry/topology'
import type { EdgeChain } from '../../geometry/topology/edges'

/** Состояние подсветки элемента. */
export type HighlightState = 'normal' | 'hover' | 'selected'

/** Цвета подсветки граней по состоянию. */
export const FACE_COLORS: Record<HighlightState, number> = {
  normal: 0x7c9cff,
  hover: 0xe5b04b,
  selected: 0x4cc38a,
}

/** Цвета подсветки рёбер по состоянию. */
export const EDGE_COLORS: Record<HighlightState, number> = {
  normal: 0x7c9cff,
  hover: 0xe5b04b,
  selected: 0x4cc38a,
}

/** Прозрачность подложки грани по состоянию. */
export const FACE_OPACITY: Record<HighlightState, number> = {
  normal: 0.22,
  hover: 0.42,
  selected: 0.55,
}

/** Состояние элемента по идентификаторам. */
export function stateOf(
  id: number,
  hover: number | null | undefined,
  selection: number[] | undefined
): HighlightState {
  if (selection && selection.includes(id)) return 'selected'
  if (hover === id) return 'hover'
  return 'normal'
}

/**
 * Цвета треугольников для накладки: четыре компоненты (RGBA) на треугольник.
 * Треугольники, не принадлежащие ни одной грани, остаются прозрачными.
 */
export function faceOverlayColors(
  topology: MeshTopology,
  hover: number | null | undefined,
  selection: number[] | undefined
): Float32Array {
  const triCount = topology.triToFace.length
  const colors = new Float32Array(triCount * 4)
  const byId = new Map<number, FaceRegion>()
  for (const f of topology.faces) byId.set(f.id, f)

  for (let t = 0; t < triCount; t++) {
    const faceId = topology.triToFace[t]
    if (faceId < 0) continue
    const region = byId.get(faceId)
    if (!region) continue
    const state = stateOf(faceId, hover, selection)
    const hex = FACE_COLORS[state]
    colors[t * 4] = ((hex >> 16) & 0xff) / 255
    colors[t * 4 + 1] = ((hex >> 8) & 0xff) / 255
    colors[t * 4 + 2] = (hex & 0xff) / 255
    colors[t * 4 + 3] = FACE_OPACITY[state]
  }
  return colors
}

/** Идентификатор грани по номеру треугольника. */
export function faceByTriangle(topology: MeshTopology, triIndex: number): number | null {
  if (triIndex < 0 || triIndex >= topology.triToFace.length) return null
  const id = topology.triToFace[triIndex]
  return id >= 0 ? id : null
}

/** Точка на экране. */
export interface ScreenPoint {
  x: number
  y: number
}

/**
 * Проекция цепочки рёбер на экран: точки уже переведены в мировые координаты.
 * `project` возвращает координаты в пикселях или null, если точка за камерой.
 */
export type ProjectPoint = (p: [number, number, number]) => ScreenPoint | null

/** Проекция цепочки в экранные координаты. */
export function projectChain(chain: EdgeChain, project: ProjectPoint): ScreenPoint[] {
  const out: ScreenPoint[] = []
  for (const p of chain.points) {
    const s = project([p[0], p[1], p[2]])
    if (s) out.push(s)
  }
  return out
}

/** Расстояние от точки до отрезка, пиксели. */
export function distanceToSegment(
  p: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  if (t < 0) t = 0
  if (t > 1) t = 1
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Выбор ребра по расстоянию на экране: ближайшая цепочка в пределах
 * `maxDistance` пикселей от курсора.
 */
export function pickEdgeByScreenDistance(
  chains: EdgeChain[],
  screenChains: Map<number, ScreenPoint[]>,
  cursor: ScreenPoint,
  maxDistance: number
): number | null {
  let best: number | null = null
  let bestDist = maxDistance
  for (const chain of chains) {
    const pts = screenChains.get(chain.id)
    if (!pts || pts.length < 2) continue
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = distanceToSegment(cursor, pts[i], pts[i + 1])
      if (d < bestDist) {
        bestDist = d
        best = chain.id
      }
    }
  }
  return best
}

/** Сегменты цепочки для отрисовки. */
export function chainSegments(chain: EdgeChain): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < chain.points.length; i++) {
    out.push(...chain.points[i], ...chain.points[i + 1])
  }
  return out
}
