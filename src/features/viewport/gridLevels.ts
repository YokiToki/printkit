/**
 * Расчёт адаптивных уровней сетки по стандарту САПР (FreeCAD / Fusion 360).
 * Шаг сетки рекурсивно делится 5×5: ..., 0.08, 0.4, 2, 10, 50, 250, 1250, ...
 */

export interface CameraViewParams {
  distance?: number
  fov?: number
  viewportHeight: number
  orthoHeight?: number
  isOrtho?: boolean
}

export interface GridLevels {
  minor: number
  major: number
  fade: number
  mmPerPx: number
}

const MIN_PIXEL_SPACING = 12
const MAX_PIXEL_SPACING = 60

/**
 * Вычисляет масштаб отображения (мм на экранный пиксель) в точке плоскости сетки.
 */
export function getMmPerPx(params: CameraViewParams): number {
  const vh = Math.max(1, params.viewportHeight)
  if (params.isOrtho && params.orthoHeight !== undefined) {
    return Math.max(1e-7, params.orthoHeight / vh)
  }
  const dist = Math.max(1e-3, params.distance ?? 200)
  const fov = params.fov ?? 45
  const visibleHeight = 2 * dist * Math.tan((fov * Math.PI) / 360)
  return Math.max(1e-7, visibleHeight / vh)
}

/**
 * Чистое округление шагов 5^k для предотвращения артефактов float: 0.08000000000000002 -> 0.08
 */
function cleanStep(val: number): number {
  return Number(val.toPrecision(8))
}

/**
 * Расчёт параметров сетки (minor, major, fade) по масштабу экрана.
 */
export function computeGridLevels(mmPerPx: number): GridLevels {
  const clampedMmPerPx = Math.max(1e-7, mmPerPx)
  // Ищем k такое, что 12 <= (10 * 5^k) / mmPerPx < 60
  const k = Math.ceil(Math.log((MIN_PIXEL_SPACING / 10) * clampedMmPerPx - 1e-9) / Math.log(5))
  const minor = cleanStep(10 * Math.pow(5, k))
  const major = cleanStep(minor * 5)

  const pixelSpacing = minor / clampedMmPerPx
  const t = Math.max(0, Math.min(1, (pixelSpacing - MIN_PIXEL_SPACING) / (MAX_PIXEL_SPACING - MIN_PIXEL_SPACING)))
  // Smoothstep s-curve
  const fade = t * t * (3 - 2 * t)

  return {
    minor,
    major,
    fade,
    mmPerPx: clampedMmPerPx,
  }
}

/**
 * Удобная обёртка, принимающая параметры камеры напрямую.
 */
export function gridLevelsFromCamera(params: CameraViewParams): GridLevels {
  const mmPerPx = getMmPerPx(params)
  return computeGridLevels(mmPerPx)
}
