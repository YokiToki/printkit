import { defaultRackCase } from '../../geometry/rack/case'
import { defaultOpeningGroup, MAX_GROUPS, OPENING_KINDS, OPENING_ZONES, type OpeningGroup, type OpeningZone } from '../../geometry/rack/openings'

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const int = (v: unknown, d: number) => Math.round(num(v, d))
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d)

/** Одна сохранённая группа: каждое поле проверяется, лишнее отбрасывается. */
function group(raw: unknown): OpeningGroup {
  const g = obj(raw), d = defaultOpeningGroup
  return { kind: oneOf(g.kind, OPENING_KINDS, d.kind), count: int(g.count, d.count), perRow: int(g.perRow, d.perRow), zone: oneOf(g.zone, OPENING_ZONES, d.zone), diameter: num(g.diameter, d.diameter) }
}

/**
 * Группы проёмов. Старые записи с `keystones {count, side}` и `cable {count, diameter}` превращаются в равноценные группы: keystone —
 * в столбец сбоку или ряд снизу, кабельные отверстия — по одному на свободную сторону (сначала правая).
 */
function openings(raw: Record<string, unknown>): OpeningGroup[] {
  if (Array.isArray(raw.openings)) return raw.openings.slice(0, MAX_GROUPS).map(group)
  const k = obj(raw.keystones), c = obj(raw.cable), out: OpeningGroup[] = []
  const kCount = int(k.count, 0), side = oneOf(k.side, ['left', 'right', 'below'], 'right')
  if (kCount > 0) out.push({ kind: 'keystone', count: kCount, perRow: side === 'below' ? kCount : 1, zone: side as OpeningZone, diameter: defaultOpeningGroup.diameter })
  const cCount = int(c.count, 0), diameter = num(c.diameter, defaultOpeningGroup.diameter)
  const free = (['right', 'left'] as const).filter((z) => !(kCount > 0 && side === z))
  for (const zone of free.slice(0, Math.max(0, cCount))) out.push({ kind: 'hole', count: 1, perRow: 1, zone, diameter })
  return out
}

/** Нормализует сохранённые параметры корпуса: каждое число, флаг и вид проверяются, частичная запись не ломает режим. */
export function migrateRackCase(raw: Record<string, unknown>): Record<string, unknown> {
  const d = defaultRackCase, dev = obj(raw.device), u = obj(raw.units), e = obj(raw.ears), w = obj(raw.window), v = obj(raw.vents)
  return {
    device: { width: num(dev.width, d.device.width), depth: num(dev.depth, d.device.depth), height: num(dev.height, d.device.height) },
    gap: num(raw.gap, d.gap), wall: num(raw.wall, d.wall), plateThickness: num(raw.plateThickness, d.plateThickness),
    units: { auto: bool(u.auto, d.units.auto), value: Math.round(num(u.value, d.units.value)) },
    cornerRadius: num(raw.cornerRadius, d.cornerRadius), tolerance: bool(raw.tolerance, d.tolerance),
    ears: {
      positions: oneOf(e.positions === 'none' ? 'edges' : e.positions, ['all', 'outer', 'edges'], d.ears.positions),
      shape: oneOf(e.shape, ['round', 'slot'], d.ears.shape), size: num(e.size, d.ears.size), slotLength: num(e.slotLength, d.ears.slotLength),
    },
    window: { enabled: bool(w.enabled, d.window.enabled), lip: num(w.lip, d.window.lip) },
    openings: openings(raw),
    vents: { enabled: bool(v.enabled, d.vents.enabled), width: num(v.width, d.vents.width), wall: num(v.wall, d.vents.wall), margin: num(v.margin, d.vents.margin) },
  }
}
