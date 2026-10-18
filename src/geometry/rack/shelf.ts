import type { CrossSection, Manifold } from 'manifold-3d'
import { getWasm } from '../wasm'
import { defaultRackPanel, plateBase, PANEL_LIMITS, type EarParams } from './panel'
import { cutPattern, patternIssues } from './patterns'
import { defaultPattern, type Issue, type PatternParams } from './patterns/types'
import { HEIGHT_TOLERANCE, MAX_UNITS, MIN_UNITS, RACK_WINDOW, rackLayout, type RackRegion } from './spec'

export interface ShelfBody { /** Глубина полки от задней грани пластины. */ depth: number; /** Толщина пола. */ thickness: number; /** Зазор до реек с каждой стороны. */ clearance: number }
/** Боковые стенки: высота у пластины (0 — стенок нет) и толщина. Скос прямой, до пола на задней кромке. */
export interface ShelfSides { height: number; wall: number }

export interface RackShelfParams {
  units: number
  /** Толщина передней пластины. */
  thickness: number
  cornerRadius: number
  tolerance: boolean
  ears: EarParams
  shelf: ShelfBody
  sides: ShelfSides
  /** Сквозной узор пола (вид «нет» — глухой пол). */
  floorPattern: PatternParams
  /** Передняя пластина глухая (по умолчанию открытая: между ушами и боковыми стенками над полом пусто). */
  closedFront: boolean
  /** Сквозной узор в глухой пластине над полом (по умолчанию нет). */
  platePattern: PatternParams
}

export const defaultRackShelf: RackShelfParams = {
  units: 1, thickness: 3, cornerRadius: 3, tolerance: true,
  ears: defaultRackPanel.ears,
  shelf: { depth: 100, thickness: 3, clearance: 0.25 },
  sides: { height: 35, wall: 3 },
  // щели вдоль глубины, ряды со сдвигом, как на образце
  floorPattern: { ...defaultPattern, kind: 'pills', margin: 8, rotate: true, pills: { width: 8, length: 34, wall: 4, edgePills: true } },
  closedFront: false,
  platePattern: { ...defaultPattern, kind: 'none', margin: 6 },
}

export const SHELF_LIMITS = { thickness: PANEL_LIMITS.thickness, cornerRadius: PANEL_LIMITS.cornerRadius, depth: [20, 400], floor: [1.5, 10], clearance: [0, 2], sideHeight: [0, 444], sideWall: [0.8, 10], margin: PANEL_LIMITS.margin } as const
const between = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi
/** Слой, на который детали заходят друг в друга, чтобы грани не совпадали. */
const OVERLAP = 0.01

/**
 * Размеры и области узоров. Пол: X от середины, второй размер — расстояние от задней грани пластины назад. Пластина: X от середины,
 * Y от нижней кромки, над полом. Стенки (если есть) исключаются из области пола и пластины.
 */
export function shelfLayout(p: RackShelfParams) {
  const plateH = rackLayout(p.units, p.tolerance ? HEIGHT_TOLERANCE : 0).height
  const width = RACK_WINDOW - 2 * p.shelf.clearance
  const inner = width / 2 - (p.sides.height > 0 ? p.sides.wall : 0)
  const fm = p.floorPattern.margin, pm = p.platePattern.margin
  const floorRegion: RackRegion = { x0: -inner + fm, x1: inner - fm, y0: fm, y1: p.shelf.depth - fm }
  const plateRegion: RackRegion = { x0: -inner + pm, x1: inner - pm, y0: p.shelf.thickness + pm, y1: plateH - pm }
  return { plateH, width, inner, totalDepth: p.thickness + p.shelf.depth, floorRegion, plateRegion }
}

const empty = (r: RackRegion) => r.x1 - r.x0 <= 0 || r.y1 - r.y0 <= 0

/** Ошибки (rack.error.*) останавливают построение; предупреждения о тонких стенках узоров идут отдельно для пола и пластины. */
export function validateRackShelf(p: RackShelfParams): { errors: string[]; floorWarnings: Issue[]; plateWarnings: Issue[] } {
  const errors: string[] = []
  if (!Number.isInteger(p.units) || p.units < MIN_UNITS || p.units > MAX_UNITS) errors.push('rack.error.units')
  if (!between(p.thickness, SHELF_LIMITS.thickness)) errors.push('rack.error.thickness')
  if (!between(p.cornerRadius, SHELF_LIMITS.cornerRadius)) errors.push('rack.error.cornerRadius')
  if (!between(p.ears.size, PANEL_LIMITS.earSize)) errors.push('rack.error.earSize')
  else if (p.ears.shape === 'slot' && p.ears.slotLength < p.ears.size) errors.push('rack.error.slotLength')
  if (!between(p.shelf.depth, SHELF_LIMITS.depth)) errors.push('rack.error.shelfDepth')
  if (!between(p.shelf.clearance, SHELF_LIMITS.clearance)) errors.push('rack.error.clearance')
  if (!between(p.shelf.thickness, SHELF_LIMITS.floor)) errors.push('rack.error.shelfThickness')
  if (!between(p.sides.height, SHELF_LIMITS.sideHeight)) errors.push('rack.error.sideHeight')
  else if (p.sides.height > 0 && !between(p.sides.wall, SHELF_LIMITS.sideWall)) errors.push('rack.error.sideWall')
  if (!between(p.floorPattern.margin, SHELF_LIMITS.margin) || !between(p.platePattern.margin, SHELF_LIMITS.margin)) errors.push('rack.error.margin')
  if (errors.length) return { errors, floorWarnings: [], plateWarnings: [] }
  const l = shelfLayout(p)
  if (p.shelf.thickness > l.plateH - 2) errors.push('rack.error.shelfThickness')
  if (p.sides.height > 0 && p.sides.height > l.plateH) errors.push('rack.error.sideHeight')
  else if (p.sides.height > 0 && p.sides.height < p.shelf.thickness + 1) errors.push('rack.error.sideHeight')
  if (p.sides.height > 0 && p.sides.wall * 2 >= l.width - 4) errors.push('rack.error.sideWall')
  const floorWarnings: Issue[] = [], plateWarnings: Issue[] = []
  if (p.floorPattern.kind !== 'none') { if (empty(l.floorRegion)) errors.push('rack.error.floorRegion'); else floorWarnings.push(...patternIssues(p.floorPattern, l.floorRegion)) }
  if (p.closedFront && p.platePattern.kind !== 'none') { if (empty(l.plateRegion)) errors.push('rack.error.plateRegion'); else plateWarnings.push(...patternIssues(p.platePattern, l.plateRegion)) }
  return { errors, floorWarnings, plateWarnings }
}

export interface BuiltRackShelf { solid: Manifold | null; error?: string; warnings: Issue[] }

/**
 * Полка в положении печати (как корпус): лицевая грань пластины на z = 0, задняя при z = толщина; X от середины, Y от нижней кромки.
 * Пол — плита у нижней кромки (y от 0 до толщины пола) от задней грани пластины назад на глубину; боковые стенки стоят на краях пола,
 * высотой sides.height у пластины с прямым скосом до пола сзади. Узор пола режется сквозь пол между стенками, у глухой пластины узор режется сквозь неё над полом, у открытой (по умолчанию) над полом вырез между стенками.
 */
export async function buildRackShelf(p: RackShelfParams, wasmUrl?: string): Promise<BuiltRackShelf> {
  const v = validateRackShelf(p)
  if (v.errors.length) return { solid: null, error: v.errors[0], warnings: [] }
  const warnings = [...v.floorWarnings, ...(p.closedFront ? v.plateWarnings : [])]
  const w = await getWasm(wasmUrl)
  const { Manifold, CrossSection } = w
  const t = p.thickness, s = p.shelf, l = shelfLayout(p)
  const { base } = plateBase(w, p.units, p.tolerance, p.cornerRadius, p.ears)
  // открытая пластина: между боковыми стенками над полом пусто (остаются уши и полоса у пола); глухая может нести узор
  const front = p.closedFront ? cutPattern(w, p.platePattern, l.plateRegion) : CrossSection.square([2 * l.inner, l.plateH + 1 - s.thickness], false).translate([-l.inner, s.thickness])
  const plate = Manifold.extrude(front ? base.subtract(front) : base, t)
  // пол: плита width × толщина, z от пластины на глубину; узор пола — сквозь пол (вырез из осей x–глубина переводится в x–z)
  let floor = Manifold.cube([l.width, s.thickness, s.depth + OVERLAP], false).translate([-l.width / 2, 0, t - OVERLAP])
  const floorCut = cutPattern(w, p.floorPattern, l.floorRegion)
  if (floorCut) {
    // выдавливание по толщине пола, поворот на 90° вокруг X: (x, depth, thickness) → (x, −thickness, depth), затем сдвиги
    const cutter = Manifold.extrude(floorCut, s.thickness + 2).translate([0, 0, -1]).rotate([90, 0, 0]).translate([0, s.thickness, t])
    floor = floor.subtract(cutter); cutter.delete()
  }
  const parts: Manifold[] = [plate, floor]
  if (p.sides.height > 0) {
    const h = p.sides.height, z0 = t - OVERLAP, z1 = t + s.depth, wall = p.sides.wall
    // профиль в осях (z, y): от пластины до заднего края, сверху прямой скос от h до толщины пола
    const prof: CrossSection = CrossSection.ofPolygons([[[z0, 0], [z1, 0], [z1, s.thickness], [z0, h]]])
    const wallBody = Manifold.extrude(prof, wall).rotate([0, -90, 0]) // x' = −(толщина), z' = z
    parts.push(wallBody.translate([l.width / 2, 0, 0]), wallBody.translate([-l.width / 2 + wall, 0, 0]))
    wallBody.delete(); prof.delete()
  }
  const solid = Manifold.union(parts)
  parts.forEach((m) => m.delete())
  const pieces = solid.decompose(), n = pieces.length
  pieces.forEach((q) => q.delete())
  if (n > 1) { solid.delete(); return { solid: null, error: 'rack.error.disconnected', warnings } }
  return { solid, warnings }
}
