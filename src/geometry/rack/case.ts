import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { roundedRectCS } from '../bin'
import { getWasm } from '../wasm'
import { defaultRackPanel, plateBase, type EarParams } from './panel'
import { hexCut } from './patterns/hex'
import { MIN_FEATURE, type Issue } from './patterns/types'
import { keystoneSocket } from './keystone'
import { layoutOpenings, MAX_GROUPS, validGroup, type OpeningGroup, type PlacedOpening } from './openings'
import { HEIGHT_TOLERANCE, MAX_UNITS, RACK_UNIT, RACK_WINDOW } from './spec'

export interface DeviceParams { width: number; depth: number; height: number }
export interface UnitsParams { /** true — минимальное число юнитов, иначе value (не меньше минимального). */ auto: boolean; value: number }
export interface WindowParams { enabled: boolean; /** Насколько пластина заходит на край устройства. */ lip: number }
export interface VentParams { enabled: boolean; /** Ширина шестиугольника между гранями. */ width: number; wall: number; /** Отступ узора от краёв стенки и от пластины. */ margin: number }

export interface RackCaseParams {
  device: DeviceParams
  /** Зазор между устройством и оболочкой. */
  gap: number
  wall: number
  plateThickness: number
  units: UnitsParams
  cornerRadius: number
  tolerance: boolean
  ears: EarParams
  window: WindowParams
  /** Группы проёмов передней пластины (keystone и круглые отверстия), не больше MAX_GROUPS. */
  openings: OpeningGroup[]
  vents: VentParams
}

export const defaultRackCase: RackCaseParams = {
  device: { width: 120, depth: 160, height: 40 },
  gap: 0.4, wall: 2, plateThickness: 3,
  units: { auto: true, value: 2 },
  cornerRadius: 3, tolerance: true,
  ears: defaultRackPanel.ears,
  window: { enabled: true, lip: 3 },
  openings: [],
  vents: { enabled: false, width: 8, wall: 1.6, margin: 6 },
}

export const CASE_LIMITS = { width: [10, 260], depth: [10, 400], height: [10, 500], gap: [0, 5], wall: [0.8, 10], plate: [1.5, 8], lip: [0, 50], vent: [3, 40], ventWall: [0.2, 10], ventMargin: [1, 40] } as const
const between = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi
/** Поле между свободной зоной пластины и рейками / краем корпуса. */
const EDGE = 3

/** Размеры корпуса, число юнитов и положение окна (Y от нижней кромки пластины, X от середины). */
export function caseLayout(p: RackCaseParams) {
  const d = p.device, t = p.gap + p.wall
  const outerW = d.width + 2 * t, outerH = d.height + 2 * t, shellLen = d.depth + p.gap
  const tol = p.tolerance ? HEIGHT_TOLERANCE : 0
  const autoUnits = Math.max(1, Math.ceil((outerH + tol) / RACK_UNIT - 1e-9))
  const raised = !p.units.auto && p.units.value < autoUnits
  const units = p.units.auto ? autoUnits : Math.max(Math.round(p.units.value), autoUnits)
  const plateH = units * RACK_UNIT - tol
  return {
    outerW, outerH, shellLen, autoUnits, units, raised, plateH, centreY: plateH / 2,
    cavityW: d.width + 2 * p.gap, cavityH: d.height + 2 * p.gap,
    window: { width: d.width - 2 * p.window.lip, height: d.height - 2 * p.window.lip },
    /** На сколько корпус шире окна между рейками (≤ 0 — помещается). */
    excess: outerW - RACK_WINDOW,
  }
}

/** Ошибки (rack.error.*, останавливают построение; excess — на сколько мм шире окна) и предупреждения (rack.warning.*). */
export function validateRackCase(p: RackCaseParams): { errors: string[]; warnings: Issue[]; excess: number } {
  const errors: string[] = []
  const d = p.device
  if (!between(d.width, CASE_LIMITS.width) || !between(d.depth, CASE_LIMITS.depth) || !between(d.height, CASE_LIMITS.height)) errors.push('rack.error.device')
  if (!between(p.gap, CASE_LIMITS.gap)) errors.push('rack.error.gap')
  if (!between(p.wall, CASE_LIMITS.wall)) errors.push('rack.error.wall')
  if (!between(p.plateThickness, CASE_LIMITS.plate)) errors.push('rack.error.thickness')
  if (!between(p.cornerRadius, [0, 10])) errors.push('rack.error.cornerRadius')
  if (!between(p.ears.size, [2, 12])) errors.push('rack.error.earSize')
  else if (p.ears.shape === 'slot' && p.ears.slotLength < p.ears.size) errors.push('rack.error.slotLength')
  if (p.window.enabled && (p.window.lip < 0 || p.window.lip > (Math.min(d.width, d.height) - 4) / 2)) errors.push('rack.error.lip')
  if (p.vents.enabled && (!between(p.vents.width, CASE_LIMITS.vent) || !between(p.vents.wall, CASE_LIMITS.ventWall) || !between(p.vents.margin, CASE_LIMITS.ventMargin))) errors.push('rack.error.vents')
  if (!Array.isArray(p.openings) || p.openings.length > MAX_GROUPS || !p.openings.every(validGroup)) errors.push('rack.error.openings')
  if (errors.length) return { errors, warnings: [], excess: 0 }
  const l = caseLayout(p)
  if (l.excess > 1e-9) errors.push('rack.error.tooWide')
  if (l.units > MAX_UNITS) errors.push('rack.error.tooTall')
  const warnings: Issue[] = []
  if (p.vents.enabled && p.vents.wall < MIN_FEATURE - 1e-9) warnings.push({ key: 'rack.warning.thin', setting: 'ventWall' })
  if (!errors.length) warnings.push(...layoutOpenings(p.openings, l).warnings)
  return { errors, warnings, excess: Math.max(0, l.excess) }
}

export interface BuiltRackCase { solid: Manifold | null; error?: string; excess?: number; warnings: Issue[] }

/** Вырез окна и круглых отверстий в плоскости пластины: X от середины, Y от нижней кромки. */
function frontCut(w: ManifoldToplevel, p: RackCaseParams, l: ReturnType<typeof caseLayout>, items: PlacedOpening[]): CrossSection | null {
  const { CrossSection } = w
  const parts: CrossSection[] = []
  if (p.window.enabled) parts.push(roundedRectCS(w, l.window.width, l.window.height, 2, 24).translate([0, l.centreY]))
  for (const o of items) if (o.kind === 'hole') parts.push(CrossSection.circle(o.diameter / 2, 48).translate([o.x, o.y]))
  return parts.length ? CrossSection.union(parts) : null
}

/**
 * Вырезы-соты в трёх стенках оболочки: верх и оба бока. Узор строится плоским в оси стенки и выдавливается только на толщину стенки
 * (внутренняя грань совпадает с полостью, наружу запас), так что полость не затрагивается.
 */
export function ventCutters(w: ManifoldToplevel, p: RackCaseParams, l: ReturnType<typeof caseLayout>): Manifold[] {
  const v = p.vents, m = v.margin, T = p.wall + 1, out: Manifold[] = []
  const zc = -l.shellLen / 2, top = l.centreY + l.outerH / 2, side = l.outerW / 2
  const topBox = { width: l.outerW - 2 * m, height: l.shellLen - 2 * m }, sideBox = { width: l.shellLen - 2 * m, height: l.outerH - 2 * m }
  const hex = { width: v.width, wall: v.wall }
  const topCs = topBox.width > v.width && topBox.height > v.width ? hexCut(w, topBox, hex) : null
  const sideCs = sideBox.width > v.width && sideBox.height > v.width ? hexCut(w, sideBox, hex) : null
  if (topCs) out.push(w.Manifold.extrude(topCs, T).rotate([90, 0, 0]).translate([0, top + 1, zc]))
  if (sideCs) {
    out.push(w.Manifold.extrude(sideCs, T).rotate([0, 90, 0]).translate([side - p.wall, l.centreY, zc]))
    out.push(w.Manifold.extrude(sideCs, T).rotate([0, -90, 0]).translate([-(side - p.wall), l.centreY, zc]))
  }
  return out
}

/**
 * Корпус: пластина с ушами и оболочка позади неё, открытая сзади. Строится с лицевой гранью сверху (пластина z от 0 до толщины, оболочка
 * z от −(глубина + зазор) до 0), затем зеркалится по z: лицевая грань лежит на z = 0 (на столе при печати), оболочка растёт вверх.
 * Оболочка по центру пластины по X и по высоте. Окно и отверстия режутся в пластине, соты — в стенках.
 */
export async function buildRackCase(p: RackCaseParams, wasmUrl?: string): Promise<BuiltRackCase> {
  const v = validateRackCase(p)
  if (v.errors.length) return { solid: null, error: v.errors[0], excess: v.excess, warnings: [] }
  const w = await getWasm(wasmUrl)
  const { Manifold } = w
  const l = caseLayout(p)
  const { base } = plateBase(w, l.units, p.tolerance, p.cornerRadius, p.ears)
  const items = layoutOpenings(p.openings, l).items
  const front = frontCut(w, p, l, items)
  const plate = Manifold.extrude(front ? base.subtract(front) : base, p.plateThickness)
  const outer = Manifold.extrude(roundedRectCS(w, l.outerW, l.outerH, 0, 4), l.shellLen).translate([0, l.centreY, -l.shellLen])
  const cavity = Manifold.extrude(roundedRectCS(w, l.cavityW, l.cavityH, 0, 4), l.shellLen + 1).translate([0, l.centreY, -l.shellLen - 1])
  let shell = outer.subtract(cavity)
  if (p.vents.enabled) for (const c of ventCutters(w, p, l)) { shell = shell.subtract(c) }
  // гнёзда keystone: обоймы срастаются с пластиной, потом вычитаются проёмы с рампой и защёлкой
  const sockets = items.filter((o) => o.kind === 'keystone').map((o) => ({ o, s: keystoneSocket(w, p.plateThickness) }))
  const collars = sockets.flatMap(({ o, s }) => (s.collar ? [s.collar.translate([o.x, o.y, 0])] : []))
  const pockets = sockets.map(({ o, s }) => s.pocket.translate([o.x, o.y, 0]))
  const body = collars.length ? Manifold.union([plate, shell, ...collars]) : plate.add(shell)
  const built = pockets.length ? body.subtract(Manifold.union(pockets)) : body
  if (built !== body) body.delete()
  sockets.forEach(({ s }) => { s.collar?.delete(); s.pocket.delete() })
  ;[...collars, ...pockets].forEach((m) => m.delete())
  const solid = built.mirror([0, 0, 1]).translate([0, 0, p.plateThickness])
  built.delete()
  const parts = solid.decompose(), pieces = parts.length
  parts.forEach((q) => q.delete())
  if (pieces > 1) { solid.delete(); return { solid: null, error: 'rack.error.disconnected', warnings: v.warnings } }
  return { solid, warnings: v.warnings }
}
