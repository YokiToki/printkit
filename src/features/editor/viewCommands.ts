import type { Bounds3 } from '../../editor/transform'

export type ViewFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

export interface CameraState {
  position: [number, number, number]
  target: [number, number, number]
  projection: 'persp' | 'ortho'
  distance: number
  fov: number
  aspect: number
}

/**
 * Направления взгляда (единичные векторы от target к camera) для стандартных видов.
 * Z — вверх, Y — назад (от пользователя), X — вправо.
 */
export const VIEW_DIRECTIONS: Record<ViewFace, [number, number, number]> = {
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  front: [0, -1, 0],
  back: [0, 1, 0],
  right: [1, 0, 0],
  left: [-1, 0, 0],
}

/**
 * Вычисляет вертикальный размер видимой области (высоту) ортогональной камеры
 * из расстояния и вертикального угла обзора перспективной камеры, чтобы масштаб совпадал.
 */
export function orthoHeightFromDistance(distance: number, fovDeg: number): number {
  const rad = (fovDeg * Math.PI) / 180
  return 2 * distance * Math.tan(rad / 2)
}

/**
 * Вычисляет расстояние перспективной камеры из вертикального размера ортогональной камеры.
 */
export function distanceFromOrthoHeight(orthoHeight: number, fovDeg: number): number {
  const rad = (fovDeg * Math.PI) / 180
  return orthoHeight / (2 * Math.tan(rad / 2))
}

/**
 * Вычисляет новую позицию камеры для стандартного вида с сохранением точки прицела и дистанции.
 */
export function standardViewPosition(
  face: ViewFace,
  target: [number, number, number],
  distance: number
): [number, number, number] {
  const dir = [...VIEW_DIRECTIONS[face]]
  // Небольшое смещение для чистых вертикальных видов, чтобы не вырождался вектор up
  if (Math.abs(dir[2]) === 1) {
    dir[1] -= 1e-4
  }
  const len = Math.hypot(dir[0], dir[1], dir[2])
  return [
    target[0] + (dir[0] / len) * distance,
    target[1] + (dir[1] / len) * distance,
    target[2] + (dir[2] / len) * distance,
  ]
}

/**
 * Вычисляет параметры кадрирования (Fit all / Fit selection) по габаритам.
 */
export function fitCameraToBounds(
  bounds: Bounds3,
  fovDeg: number,
  aspect: number
): {
  target: [number, number, number]
  distance: number
  orthoHeight: number
} {
  const target: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ]

  const dx = bounds.max[0] - bounds.min[0]
  const dy = bounds.max[1] - bounds.min[1]
  const dz = bounds.max[2] - bounds.min[2]
  const radius = 0.5 * Math.hypot(dx, dy, dz)

  const radFov = (fovDeg * Math.PI) / 180
  const dist = (Math.max(radius, 0.5) / Math.sin(radFov / 2)) * 1.15
  const orthoH = Math.max(radius, 0.5) * 2 * 1.15

  return {
    target,
    distance: dist,
    orthoHeight: orthoH,
  }
}
