import { defaultRackShelf } from '../../geometry/rack/shelf'
import { normalizePattern } from './migrate'

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d)

/** Нормализует сохранённые параметры полки: каждое число, флаг и вид проверяются, частичная запись не ломает режим. */
export function migrateRackShelf(raw: Record<string, unknown>): Record<string, unknown> {
  const d = defaultRackShelf, e = obj(raw.ears), s = obj(raw.shelf), sd = obj(raw.sides)
  return {
    units: Math.round(num(raw.units, d.units)), thickness: num(raw.thickness, d.thickness), cornerRadius: num(raw.cornerRadius, d.cornerRadius), tolerance: bool(raw.tolerance, d.tolerance),
    ears: {
      positions: oneOf(e.positions === 'none' ? 'edges' : e.positions, ['all', 'outer', 'edges'], d.ears.positions),
      shape: oneOf(e.shape, ['round', 'slot'], d.ears.shape), size: num(e.size, d.ears.size), slotLength: num(e.slotLength, d.ears.slotLength),
    },
    shelf: { depth: num(s.depth, d.shelf.depth), thickness: num(s.thickness, d.shelf.thickness), clearance: num(s.clearance, d.shelf.clearance) },
    // бортики первого черновика (lips) не переносятся: у них другой смысл
    sides: { height: num(sd.height, d.sides.height), wall: num(sd.wall, d.sides.wall) },
    closedFront: bool(raw.closedFront, d.closedFront),
    floorPattern: normalizePattern(raw.floorPattern, d.floorPattern),
    platePattern: normalizePattern(raw.platePattern, d.platePattern),
  }
}
