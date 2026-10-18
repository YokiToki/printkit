import { KEYSTONE, HOLE_GAP, OPENING_EDGE, RACK_WINDOW } from './spec'
import type { Issue } from './patterns/types'

export type OpeningKind = 'keystone' | 'hole'
export type OpeningZone = 'left' | 'right' | 'above' | 'below'
export const OPENING_KINDS: readonly OpeningKind[] = ['keystone', 'hole']
export const OPENING_ZONES: readonly OpeningZone[] = ['left', 'right', 'above', 'below']

/** Группа проёмов передней пластины: вид, число, сколько в ряд (1 — столбец, ≥ числа — ряд, между — сетка) и зона вокруг оболочки. */
export interface OpeningGroup { kind: OpeningKind; count: number; perRow: number; zone: OpeningZone; /** Диаметр круглого отверстия (для keystone не используется). */ diameter: number }

export const MAX_GROUPS = 6
export const OPENING_LIMITS = { count: [1, 24], perRow: [1, 24], diameter: [2, 30] } as const

export const defaultOpeningGroup: OpeningGroup = { kind: 'keystone', count: 1, perRow: 1, zone: 'right', diameter: 8 }

/** Рамка пластины, нужная раскладке: размеры оболочки и пластины (X от середины, Y от нижней кромки). */
export interface PlateFrame { outerW: number; outerH: number; plateH: number; centreY: number }

/** Размещённый проём: keystone — центр обоймы, hole — центр отверстия; group — номер группы с нуля. */
export interface PlacedOpening { kind: OpeningKind; x: number; y: number; diameter: number; group: number }

interface Rect { x0: number; x1: number; y0: number; y1: number }
const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9

/** Размер одного элемента группы и шаг сетки. */
function cell(g: OpeningGroup) {
  return g.kind === 'keystone'
    ? { w: KEYSTONE.collarW, h: KEYSTONE.collarH, px: KEYSTONE.collarW + KEYSTONE.gap, py: KEYSTONE.collarH + KEYSTONE.gap }
    : { w: g.diameter, h: g.diameter, px: g.diameter + HOLE_GAP, py: g.diameter + HOLE_GAP }
}

/** Допустимость числовых полей группы (для validate): целые числа в пределах и диаметр отверстия. */
export function validGroup(g: OpeningGroup): boolean {
  const ok = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi
  return OPENING_KINDS.includes(g.kind) && OPENING_ZONES.includes(g.zone) && ok(g.count, OPENING_LIMITS.count) && ok(g.perRow, OPENING_LIMITS.perRow)
    && (g.kind === 'keystone' || (g.diameter >= OPENING_LIMITS.diameter[0] && g.diameter <= OPENING_LIMITS.diameter[1]))
}

/**
 * Раскладка групп проёмов. Зоны — свободные места пластины: слева и справа между оболочкой и рейками, сверху и снизу над и под оболочкой
 * (только если пластина выше оболочки). Группы одной зоны идут одна за другой от оболочки наружу, блок группы по центру зоны, строки
 * заполняются сверху вниз и центрируются. Группа, которая не помещается или пересекает уже размещённое, целиком не режется, а
 * предупреждение называет её номер (setting: `group<N>`, с единицы).
 */
export function layoutOpenings(groups: OpeningGroup[], f: PlateFrame): { items: PlacedOpening[]; warnings: Issue[] } {
  const rail = RACK_WINDOW / 2 - OPENING_EDGE, E = OPENING_EDGE
  const shellX = f.outerW / 2 + E, shellTop = f.centreY + f.outerH / 2 + E, shellBottom = f.centreY - f.outerH / 2 - E
  const zones: Record<OpeningZone, Rect> = {
    right: { x0: shellX, x1: rail, y0: E, y1: f.plateH - E }, left: { x0: -rail, x1: -shellX, y0: E, y1: f.plateH - E },
    above: { x0: -rail, x1: rail, y0: shellTop, y1: f.plateH - E }, below: { x0: -rail, x1: rail, y0: E, y1: shellBottom },
  }
  const used: Record<OpeningZone, number> = { left: 0, right: 0, above: 0, below: 0 }
  const items: PlacedOpening[] = [], placed: Rect[] = [], warnings: Issue[] = []
  groups.slice(0, MAX_GROUPS).forEach((g, gi) => {
    const c = cell(g), cols = Math.min(g.perRow, g.count), rows = Math.ceil(g.count / cols)
    const bw = (cols - 1) * c.px + c.w, bh = (rows - 1) * c.py + c.h
    const z = zones[g.zone], off = used[g.zone]
    // блок: вдоль наружной оси от оболочки, поперёк — по центру зоны
    const cx = g.zone === 'right' ? z.x0 + off + bw / 2 : g.zone === 'left' ? z.x1 - off - bw / 2 : 0
    const cy = g.zone === 'above' ? z.y0 + off + bh / 2 : g.zone === 'below' ? z.y1 - off - bh / 2 : f.plateH / 2
    const block: Rect = { x0: cx - bw / 2, x1: cx + bw / 2, y0: cy - bh / 2, y1: cy + bh / 2 }
    const inside = block.x0 >= z.x0 - 1e-9 && block.x1 <= z.x1 + 1e-9 && block.y0 >= z.y0 - 1e-9 && block.y1 <= z.y1 + 1e-9
    const mine: PlacedOpening[] = [], rects: Rect[] = []
    for (let r = 0; r < rows; r++) {
      const inRow = r < rows - 1 ? cols : g.count - (rows - 1) * cols
      for (let k = 0; k < inRow; k++) {
        const x = cx + (k - (inRow - 1) / 2) * c.px, y = block.y1 - c.h / 2 - r * c.py
        mine.push({ kind: g.kind, x, y, diameter: g.diameter, group: gi })
        // зазор между соседями (половина с каждой стороны) не даёт пересечься элементам разных групп
        rects.push({ x0: x - c.w / 2 - 0.5, x1: x + c.w / 2 + 0.5, y0: y - c.h / 2 - 0.5, y1: y + c.h / 2 + 0.5 })
      }
    }
    if (!inside || rects.some((a) => placed.some((b) => overlap(a, b)))) { warnings.push({ key: 'rack.warning.fit', setting: `group${gi + 1}` }); return }
    items.push(...mine); placed.push(...rects)
    used[g.zone] = off + (g.zone === 'left' || g.zone === 'right' ? bw : bh) + (g.kind === 'keystone' ? KEYSTONE.gap : HOLE_GAP)
  })
  return { items, warnings }
}
