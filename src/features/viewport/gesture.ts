export type GestureAction = 'pan' | 'boxSelect' | 'drawDrag' | 'clickSelect'

export interface GestureEventInput {
  button: number
  shiftKey: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  moved: number
}

export interface GestureStateInput {
  tool?: string
}

export const DRAG_THRESHOLD_PX = 5

/**
 * Классифицирует жест указателя: отделяет панорамирование камеры (Shift + перетаскивание)
 * от выделения рамкой (обычное или Ctrl/Cmd + перетаскивание) и рисования.
 */
export function classifyGesture(
  event: GestureEventInput,
  stateOrTool: GestureStateInput | string = 'select',
): GestureAction {
  const tool = typeof stateOrTool === 'string' ? stateOrTool : (stateOrTool.tool ?? 'select')

  if (event.button !== 0) {
    return 'pan'
  }

  if (event.moved <= DRAG_THRESHOLD_PX) {
    return 'clickSelect'
  }

  if (event.shiftKey) {
    return 'pan'
  }

  if (tool === 'select') {
    return 'boxSelect'
  }

  return 'drawDrag'
}

/**
 * Вычисляет плавный коэффициент масштабирования колеса мыши / трекпада.
 * Кривая и нормализация deltaMode совпадают с OrbitControls (`_getZoomScale`
 * при zoomSpeed 1 и `_customWheelEvent`): один щелчок колеса (±100) меняет
 * дистанцию на ±5 %, как зум к центру в 3D.
 */
export function computeWheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const normalizedDeltaY = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 100 : deltaY
  const scale = Math.pow(0.95, Math.abs(normalizedDeltaY) * 0.01)
  return normalizedDeltaY < 0 ? scale : 1 / scale
}
