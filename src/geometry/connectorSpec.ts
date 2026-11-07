/**
 * Общие спецификации соединителей для разрезов деталей (базовая плита, свободные тела).
 */

export type ConnectorType = 'none' | 'holes' | 'dovetail'
export const CONNECTOR_TYPES: ConnectorType[] = ['none', 'holes', 'dovetail']

export interface ConnectorConfig {
  type: ConnectorType
  /** Пресет отверстий: filament | pin2 | pin3 | magnet3x2 | magnet2_8x0_75 | custom. */
  preset: string
  /** Диаметр отверстия, мм. */
  diameter: number
  /** Глубина отверстия в каждую часть, мм. */
  depth: number
  /** Сколько соединителей на торец. */
  count: number
  /** Отступ от концов торца, мм. */
  inset: number
  /** Зазор печатного замка на сторону, мм. */
  clearance: number
  /** Ширина шейки и головки ласточкина хвоста вдоль торца, мм; глубина — `dovetailDepth`. */
  neck: number
  tip: number
  dovetailDepth: number
  /** Высота ключа от низа детали (ключ лежит на столе), мм. */
  dovetailHeight: number
  /** Тип отдельных разрезов: ключ `x:3` / `y:1` (номер ячейки, перед которой разрез). */
  overrides: Record<string, ConnectorType>
}

export interface HolePreset {
  id: string
  diameter: number
  depth: number
}

/** Размеры уже с зазором под посадку. Глубина — на каждую часть; для магнитов толщина + 0.1 мм. */
export const HOLE_PRESETS: HolePreset[] = [
  { id: 'filament', diameter: 1.9, depth: 6 },
  { id: 'pin2', diameter: 2.1, depth: 6 },
  { id: 'pin3', diameter: 3.1, depth: 6 },
  { id: 'magnet3x2', diameter: 3.1, depth: 2.1 },
  { id: 'magnet2_8x0_75', diameter: 2.95, depth: 0.85 },
]

export const CUSTOM = 'custom'

export const defaultConnector: ConnectorConfig = {
  type: 'none',
  preset: 'filament',
  diameter: 1.9,
  depth: 6,
  count: 2,
  inset: 10,
  clearance: 0.2,
  neck: 4,
  tip: 6,
  dovetailDepth: 1.2,
  dovetailHeight: 2,
  overrides: {},
}

export function withHolePreset(c: ConnectorConfig, id: string): ConnectorConfig {
  const p = HOLE_PRESETS.find((x) => x.id === id)
  return p ? { ...c, preset: id, diameter: p.diameter, depth: p.depth } : { ...c, preset: CUSTOM }
}

export const cutKey = (axis: 'x' | 'y', index: number) => `${axis}:${index}`

/** Тип соединителя на конкретном разрезе: переопределение или общий. */
export const connectorTypeAt = (
  c: ConnectorConfig,
  axis: 'x' | 'y',
  index: number
): ConnectorType => c.overrides[cutKey(axis, index)] ?? c.type
