/**
 * Спецификация и справочные таблицы размеров отверстий для крепежа,
 * головок винтов, конусных зенковок, латунных втулок (heat-set inserts) и магнитов.
 *
 * Ссылки на стандарты:
 * - DIN 912 / ISO 4762: Винты с цилиндрической головкой и внутренним шестигранником (Socket Head Cap).
 * - ISO 7380: Винты с полукруглой головкой (Button Head).
 * - DIN 7991 / ISO 10642: Винты с потайной головкой 90° (Countersunk).
 * - Ruthex / CNC Kitchen / Voron spec: латунные резьбовые втулки под термовплавление.
 */

export type MetricThread = 'M2' | 'M2.5' | 'M3' | 'M4' | 'M5'
export const METRIC_THREADS: MetricThread[] = ['M2', 'M2.5', 'M3', 'M4', 'M5']

export type ClearanceFit = 'close' | 'normal' | 'loose'

export interface ScrewClearance {
  nominal: number
  close: number
  normal: number
  loose: number
}

export const SCREW_CLEARANCE: Record<MetricThread, ScrewClearance> = {
  M2: { nominal: 2.0, close: 2.2, normal: 2.4, loose: 2.6 },
  'M2.5': { nominal: 2.5, close: 2.7, normal: 2.9, loose: 3.1 },
  M3: { nominal: 3.0, close: 3.2, normal: 3.4, loose: 3.6 },
  M4: { nominal: 4.0, close: 4.3, normal: 4.5, loose: 4.8 },
  M5: { nominal: 5.0, close: 5.3, normal: 5.5, loose: 5.8 },
}

export interface HeadDimensions {
  headDiameter: number
  headDepth: number
  /** Рекомендуемый диаметр цековки с зазором под 3D-печать, мм. */
  cbDiameter: number
  /** Рекомендуемая глубина цековки с зазором под 3D-печать, мм. */
  cbDepth: number
}

/** Размеры головки DIN 912 (Socket Head Cap Screw). */
export const DIN912_HEADS: Record<MetricThread, HeadDimensions> = {
  M2: { headDiameter: 3.8, headDepth: 2.0, cbDiameter: 4.4, cbDepth: 2.3 },
  'M2.5': { headDiameter: 4.5, headDepth: 2.5, cbDiameter: 5.2, cbDepth: 2.8 },
  M3: { headDiameter: 5.5, headDepth: 3.0, cbDiameter: 6.2, cbDepth: 3.4 },
  M4: { headDiameter: 7.0, headDepth: 4.0, cbDiameter: 7.8, cbDepth: 4.5 },
  M5: { headDiameter: 8.5, headDepth: 5.0, cbDiameter: 9.5, cbDepth: 5.5 },
}

/** Размеры головки ISO 7380 (Button Head Screw). */
export const ISO7380_HEADS: Record<MetricThread, HeadDimensions> = {
  M2: { headDiameter: 3.5, headDepth: 1.3, cbDiameter: 4.0, cbDepth: 1.6 },
  'M2.5': { headDiameter: 4.5, headDepth: 1.5, cbDiameter: 5.1, cbDepth: 1.8 },
  M3: { headDiameter: 5.7, headDepth: 1.65, cbDiameter: 6.3, cbDepth: 2.0 },
  M4: { headDiameter: 7.6, headDepth: 2.2, cbDiameter: 8.3, cbDepth: 2.6 },
  M5: { headDiameter: 9.5, headDepth: 2.75, cbDiameter: 10.3, cbDepth: 3.2 },
}

export interface CountersinkDimensions {
  csDiameter: number
  angleDegrees: number // typically 90° for metric
}

/** Размеры потайной головки DIN 7991 (Countersunk 90°). */
export const COUNTERSINK_90: Record<MetricThread, CountersinkDimensions> = {
  M2: { csDiameter: 4.4, angleDegrees: 90 },
  'M2.5': { csDiameter: 5.5, angleDegrees: 90 },
  M3: { csDiameter: 6.5, angleDegrees: 90 },
  M4: { csDiameter: 8.6, angleDegrees: 90 },
  M5: { csDiameter: 10.6, angleDegrees: 90 },
}

export interface HeatInsertDimensions {
  holeDiameter: number
  holeDepth: number
}

/**
 * Размеры отверстий под вплавляемые латунные резьбовые втулки (Ruthex / Voron standard).
 * Диаметр учитывает посадку с натягом под расплавленный пластик.
 */
export const HEAT_INSERTS: Record<MetricThread, HeatInsertDimensions> = {
  M2: { holeDiameter: 3.2, holeDepth: 4.2 },
  'M2.5': { holeDiameter: 4.0, holeDepth: 6.0 },
  M3: { holeDiameter: 4.6, holeDepth: 6.0 },
  M4: { holeDiameter: 6.3, holeDepth: 8.5 },
  M5: { holeDiameter: 7.1, holeDepth: 10.0 },
}

export interface MagnetPreset {
  id: string
  name: string
  diameter: number
  height: number
  /** Диаметр кармана с зазором под печать (+0.2 мм). */
  pocketDiameter: number
  /** Глубина кармана с зазором (+0.1 мм). */
  pocketDepth: number
}

export const MAGNET_PRESETS: MagnetPreset[] = [
  { id: '6x2', name: '6 × 2 mm', diameter: 6.0, height: 2.0, pocketDiameter: 6.2, pocketDepth: 2.1 },
  { id: '6x3', name: '6 × 3 mm', diameter: 6.0, height: 3.0, pocketDiameter: 6.2, pocketDepth: 3.1 },
  { id: '8x3', name: '8 × 3 mm', diameter: 8.0, height: 3.0, pocketDiameter: 8.2, pocketDepth: 3.1 },
  { id: '10x2', name: '10 × 2 mm', diameter: 10.0, height: 2.0, pocketDiameter: 10.2, pocketDepth: 2.1 },
  { id: '3x2', name: '3 × 2 mm (Gridfinity)', diameter: 3.0, height: 2.0, pocketDiameter: 3.1, pocketDepth: 2.1 },
  { id: '2.8x0.75', name: '2.8 × 0.75 mm', diameter: 2.8, height: 0.75, pocketDiameter: 2.95, pocketDepth: 0.85 },
]
