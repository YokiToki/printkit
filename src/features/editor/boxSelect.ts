import type { Bounds3 } from '../../editor/transform'

export interface Rect2D {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Проверяет пересечение двух прямоугольников на плоскости (в экранных пикселях).
 */
export function intersectsRect(a: Rect2D, b: Rect2D): boolean {
  const ax0 = Math.min(a.x0, a.x1),
    ax1 = Math.max(a.x0, a.x1)
  const ay0 = Math.min(a.y0, a.y1),
    ay1 = Math.max(a.y0, a.y1)
  const bx0 = Math.min(b.x0, b.x1),
    bx1 = Math.max(b.x0, b.x1)
  const by0 = Math.min(b.y0, b.y1),
    by1 = Math.max(b.y0, b.y1)

  return !(ax1 < bx0 || ax0 > bx1 || ay1 < by0 || ay0 > by1)
}

/**
 * Проецирует 8 вершин 3D-габарита (AABB) в 2D-прямоугольник на экране.
 */
export function projectBounds(
  bounds: Bounds3,
  projectPoint: (point: [number, number, number]) => [number, number]
): Rect2D {
  const corners: [number, number, number][] = [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]],
  ]

  let minX = Infinity,
    minY = Infinity
  let maxX = -Infinity,
    maxY = -Infinity

  for (const c of corners) {
    const [x, y] = projectPoint(c)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  return { x0: minX, y0: minY, x1: maxX, y1: maxY }
}

/**
 * Проверяет, попадает ли объект с габаритами `worldBounds` в экранную рамку выделения `box`.
 */
export function isObjectInBoxSelect(
  box: Rect2D,
  worldBounds: Bounds3,
  projectPoint: (point: [number, number, number]) => [number, number]
): boolean {
  const projected = projectBounds(worldBounds, projectPoint)
  return intersectsRect(box, projected)
}
