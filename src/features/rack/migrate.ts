import { defaultRackPanel } from '../../geometry/rack/panel'
import { PATTERN_KINDS, type PatternParams } from '../../geometry/rack/patterns/types'

const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d)

/** Нормализует один узор (общий для панели и полки): вид, поля и настройки каждого узора. */
export function normalizePattern(raw: unknown, dp: PatternParams = defaultRackPanel.pattern): PatternParams {
  const pt = obj(raw)
  const hk = obj(pt.hicks), as = obj(pt.asanoha), sk = obj(pt.skadis), hx = obj(pt.hex), pl = obj(pt.pills), ln = obj(pt.lines), pa = obj(pt.passthrough)
  return {
    kind: oneOf(pt.kind, PATTERN_KINDS, dp.kind), margin: num(pt.margin, dp.margin), rotate: bool(pt.rotate, dp.rotate),
    skadis: { slotWidth: num(sk.slotWidth, dp.skadis.slotWidth), slotLength: num(sk.slotLength, dp.skadis.slotLength), pitch: num(sk.pitch, dp.skadis.pitch), rowStep: num(sk.rowStep, dp.skadis.rowStep), shift: num(sk.shift, dp.skadis.shift) },
    hex: { width: num(hx.width, dp.hex.width), wall: num(hx.wall, dp.hex.wall) },
    pills: { width: num(pl.width, dp.pills.width), length: num(pl.length, num(pl.height, dp.pills.length)), wall: num(pl.wall, dp.pills.wall), edgePills: bool(pl.edgePills, dp.pills.edgePills) },
    lines: { height: num(ln.height, dp.lines.height), wall: num(ln.wall, dp.lines.wall) },
    hicks: { width: num(hk.width, dp.hicks.width), stroke: num(hk.stroke, dp.hicks.stroke), gap: num(hk.gap, dp.hicks.gap), edgeCells: bool(hk.edgeCells, dp.hicks.edgeCells) },
    asanoha: { width: num(as.width, dp.asanoha.width), mainWidth: num(as.mainWidth, dp.asanoha.mainWidth), detailWidth: num(as.detailWidth, dp.asanoha.detailWidth) },
    passthrough: { borderX: num(pa.borderX, dp.passthrough.borderX), borderY: num(pa.borderY, dp.passthrough.borderY), radius: num(pa.radius, dp.passthrough.radius) },
  }
}

/** Нормализует сохранённые параметры панели: каждое число, флаг и вид проверяются, частичная запись не ломает режим. */
export function migrateRackPanel(raw: Record<string, unknown>): Record<string, unknown> {
  const d = defaultRackPanel, e = obj(raw.ears), b = obj(raw.back)
  return {
    units: Math.round(num(raw.units, d.units)),
    thickness: num(raw.thickness, d.thickness),
    cornerRadius: num(raw.cornerRadius, d.cornerRadius),
    tolerance: bool(raw.tolerance, d.tolerance),
    ears: {
      positions: oneOf(e.positions === 'none' ? 'edges' : e.positions, ['all', 'outer', 'edges'], d.ears.positions),
      shape: oneOf(e.shape, ['round', 'slot'], d.ears.shape),
      size: num(e.size, d.ears.size), slotLength: num(e.slotLength, d.ears.slotLength),
    },
    pattern: normalizePattern(raw.pattern),
    back: { enabled: bool(b.enabled, d.back.enabled), thickness: num(b.thickness, d.back.thickness) },
  }
}
