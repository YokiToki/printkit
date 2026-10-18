/** Размеры 10-дюймовой стойки (мм). Из чертежа стандарта; проверяются тестом, внутри построителей не читаются как «шаг». */
export const RACK_UNIT = 44.45
export const RACK_WIDTH = 254
/** Расстояние между центрами отверстий левого и правого уха. */
export const EAR_HOLE_SPACING = 236.525
/** Окно между направляющими, где можно резать узор. */
export const RACK_WINDOW = 222.25
/** Положения отверстий внутри одного юнита от его нижней кромки. */
export const HOLE_OFFSETS = [6.35, 22.225, 38.1] as const
/** Допуск по высоте, чтобы соседние панели не упирались друг в друга. */
export const HEIGHT_TOLERANCE = 0.45
export const MIN_UNITS = 1
export const MAX_UNITS = 10

export interface EarHole { /** Центр относительно середины панели по X. */ x: number; /** От нижней кромки панели. */ y: number; /** Позиция в юните: 0 и 2 внешние, 1 средняя. */ slot: 0 | 1 | 2 }
export interface RackRegion { x0: number; x1: number; y0: number; y1: number }

/**
 * Раскладка панели: высота, центры отверстий каждого уха (на юнит три) и область узора. Начало: X от середины панели, Y от её нижней кромки.
 * Допуск съедается сверху, поэтому отверстия остаются на стандартных местах от нижней кромки юнита.
 */
export function rackLayout(units: number, tolerance: number, margin = 0) {
  const height = units * RACK_UNIT - tolerance
  const holes: EarHole[] = []
  for (let k = 0; k < units; k++) HOLE_OFFSETS.forEach((o, i) => holes.push({ x: EAR_HOLE_SPACING / 2, y: k * RACK_UNIT + o, slot: i as 0 | 1 | 2 }))
  const region: RackRegion = { x0: -(RACK_WINDOW / 2 - margin), x1: RACK_WINDOW / 2 - margin, y0: margin, y1: height - margin }
  return { width: RACK_WIDTH, height, holes, region, window: RACK_WINDOW }
}

/**
 * Keystone-гнездо (мм), размеры сняты с образца владельца `obj_1_EthOutlet1X.stl` (рамка розетки под один модуль, ссылки на модели —
 * в README) нарезкой по глубине и сверены с чертежом модуля (тело ≈ 14.25 × 16, защёлка до 17.3). Геометрия образца не копируется.
 * Плоскость лица — z = 0, глубина растёт назад; «верх» — сторона с рампой.
 */
export const KEYSTONE = {
  /** Проём на лице: ширина и высота. */
  openingW: 14.8, openingH: 16.6,
  /** Обойма за пластиной: тело розетки (фланец 22.75 × 31.44 на первых 2.4 мм — это сама пластина); глубина от лица. */
  collarW: 19.8, collarH: 27.85, depth: 10.4,
  /** Сдвиг центра обоймы вверх относительно центра проёма (рампа уходит вверх, снизу стенка тоньше). */
  collarOffsetY: 2.025,
  /** Рампа на верхней кромке: начинается на rampStart, растёт на rampRise к rampEnd, держится до rampHold, дальше уступ до rampTail. */
  rampStart: 0.5, rampEnd: 7.2, rampHold: 8.1, rampRise: 5.3, rampTail: 3.3,
  /** Выемка защёлки на нижней кромке: глубина и диапазон по глубине. */
  notchDepth: 1.6, notchFrom: 5.85, notchTo: 8.45,
  /** Зазор между обоймами соседних гнёзд и посадочный зазор проёма (суммарно по ширине и высоте). */
  gap: 1.2, clearance: 0.2,
} as const
/** Зазор между соседними круглыми отверстиями сверх диаметра. */
export const HOLE_GAP = 2
/** Поле между группой отверстий и рейками / краем корпуса. */
export const OPENING_EDGE = 3
