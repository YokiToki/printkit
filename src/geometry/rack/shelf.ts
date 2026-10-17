import type { Manifold } from 'manifold-3d'
import { getWasm } from '../wasm'
import { defaultRackPanel, plateBase, PANEL_LIMITS, type EarParams } from './panel'
import { HEIGHT_TOLERANCE, MAX_UNITS, MIN_UNITS, RACK_WINDOW, rackLayout } from './spec'

export interface ShelfBody { /** Глубина полки от задней грани пластины. */ depth: number; thickness: number; /** Зазор до реек с каждой стороны. */ clearance: number }
export interface ShelfLips { /** 0 — бортиков нет. */ height: number; wall: number }

export interface RackShelfParams {
  units: number
  /** Толщина передней пластины. */
  thickness: number
  cornerRadius: number
  tolerance: boolean
  ears: EarParams
  shelf: ShelfBody
  lips: ShelfLips
}

export const defaultRackShelf: RackShelfParams = {
  units: 2, thickness: 3, cornerRadius: 3, tolerance: true,
  ears: defaultRackPanel.ears,
  shelf: { depth: 100, thickness: 3, clearance: 0.25 },
  lips: { height: 0, wall: 2 },
}

export const SHELF_LIMITS = { thickness: PANEL_LIMITS.thickness, cornerRadius: PANEL_LIMITS.cornerRadius, depth: [20, 400], shelfThickness: [1.5, 10], clearance: [0, 2], lipHeight: [0, 60], lipWall: [0.8, 6] } as const
const between = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi
/** Слой, на который полка заходит в пластину и бортики в полку, чтобы грани не совпадали. */
const OVERLAP = 0.01

/** Размеры: высота пластины и ширина полки (окно между рейками минус зазор с каждой стороны). */
export function shelfLayout(p: RackShelfParams) {
  const plateH = rackLayout(p.units, p.tolerance ? HEIGHT_TOLERANCE : 0).height
  return { plateH, width: RACK_WINDOW - 2 * p.shelf.clearance, totalDepth: p.thickness + p.shelf.depth }
}

/** Ошибки (rack.error.*) останавливают построение. */
export function validateRackShelf(p: RackShelfParams): { errors: string[] } {
  const errors: string[] = []
  if (!Number.isInteger(p.units) || p.units < MIN_UNITS || p.units > MAX_UNITS) errors.push('rack.error.units')
  if (!between(p.thickness, SHELF_LIMITS.thickness)) errors.push('rack.error.thickness')
  if (!between(p.cornerRadius, SHELF_LIMITS.cornerRadius)) errors.push('rack.error.cornerRadius')
  if (!between(p.ears.size, PANEL_LIMITS.earSize)) errors.push('rack.error.earSize')
  else if (p.ears.shape === 'slot' && p.ears.slotLength < p.ears.size) errors.push('rack.error.slotLength')
  if (!between(p.shelf.depth, SHELF_LIMITS.depth)) errors.push('rack.error.shelfDepth')
  if (!between(p.shelf.clearance, SHELF_LIMITS.clearance)) errors.push('rack.error.clearance')
  if (!between(p.shelf.thickness, SHELF_LIMITS.shelfThickness)) errors.push('rack.error.shelfThickness')
  if (!between(p.lips.height, SHELF_LIMITS.lipHeight)) errors.push('rack.error.lipHeight')
  else if (p.lips.height > 0 && !between(p.lips.wall, SHELF_LIMITS.lipWall)) errors.push('rack.error.lipWall')
  if (errors.length) return { errors }
  const l = shelfLayout(p)
  if (p.shelf.thickness > l.plateH - 2) errors.push('rack.error.shelfThickness')
  else if (p.lips.height > 0 && p.shelf.thickness + p.lips.height > l.plateH) errors.push('rack.error.lipHeight')
  if (p.lips.height > 0 && p.lips.wall * 2 >= l.width) errors.push('rack.error.lipWall')
  return { errors }
}

export interface BuiltRackShelf { solid: Manifold | null; error?: string }

/**
 * Полка в положении печати: z = 0 — стол, пластина стоит нижней кромкой на столе (X от середины, Z вверх вдоль высоты), лицевая грань
 * при y = 0, задняя при y = толщина. Полка — плита шириной «окно − 2 зазора» от задней грани пластины на глубину, нижней гранью на столе.
 * Бортики (слева, справа, сзади) стоят на верхней грани полки, сторона у пластины открыта.
 */
export async function buildRackShelf(p: RackShelfParams, wasmUrl?: string): Promise<BuiltRackShelf> {
  const v = validateRackShelf(p)
  if (v.errors.length) return { solid: null, error: v.errors[0] }
  const w = await getWasm(wasmUrl)
  const { Manifold, CrossSection } = w
  const t = p.thickness, s = p.shelf, l = shelfLayout(p)
  const { base } = plateBase(w, p.units, p.tolerance, p.cornerRadius, p.ears)
  // выдавливание по z → поворот вокруг X ставит пластину на ребро: (x, y, z) → (x, −z, y), затем сдвиг на толщину
  const plate = Manifold.extrude(base, t).rotate([90, 0, 0]).translate([0, t, 0])
  const slab = Manifold.cube([l.width, s.depth + OVERLAP, s.thickness], false).translate([-l.width / 2, t - OVERLAP, 0])
  const parts: Manifold[] = [plate, slab]
  if (p.lips.height > 0) {
    const wall = p.lips.wall
    // кольцо по трём сторонам: внешний прямоугольник полки минус внутренний, продлённый к пластине (передняя сторона открыта)
    const outer = CrossSection.square([l.width, s.depth + OVERLAP], false).translate([-l.width / 2, t - OVERLAP])
    const inner = CrossSection.square([l.width - 2 * wall, s.depth - wall + 2 * OVERLAP], false).translate([-l.width / 2 + wall, t - 2 * OVERLAP])
    const ring = outer.subtract(inner)
    parts.push(Manifold.extrude(ring, p.lips.height + OVERLAP).translate([0, 0, s.thickness - OVERLAP]))
  }
  const solid = Manifold.union(parts)
  parts.forEach((m) => m.delete())
  const pieces = solid.decompose()
  const n = pieces.length
  pieces.forEach((q) => q.delete())
  if (n > 1) { solid.delete(); return { solid: null, error: 'rack.error.disconnected' } }
  return { solid }
}
