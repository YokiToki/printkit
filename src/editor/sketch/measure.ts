import { newId, type Constraint, type Sketch } from './model'

/** Тип и порядковый номер элемента эскиза («Отрезок 2»): нужен, чтобы человек мог назвать, о чём речь. */
export type EntityKind = 'point' | 'line' | 'circle' | 'arc'
export interface EntityRef {
  kind: EntityKind
  /** С единицы, по порядку создания среди элементов того же типа. */
  index: number
  id: string
}

export function entityRef(sketch: Sketch, id: string): EntityRef | null {
  if (sketch.points[id]) {
    return { kind: 'point', index: Object.keys(sketch.points).indexOf(id) + 1, id }
  }
  const curve = sketch.curves[id]
  if (!curve) return null
  let index = 0
  for (const [cid, c] of Object.entries(sketch.curves)) {
    if (c.kind === curve.kind) index++
    if (cid === id) break
  }
  return { kind: curve.kind, index, id }
}

export type Measure =
  | { kind: 'length'; length: number; angleDeg: number }
  | { kind: 'radius'; radius: number }
  | { kind: 'arc'; radius: number; sweepDeg: number }

/** Размер кривой так, как он выглядит сейчас (в мм и градусах), независимо от наложенных размеров. */
export function measureCurve(sketch: Sketch, curveId: string): Measure | null {
  const c = sketch.curves[curveId]
  if (!c) return null
  if (c.kind === 'line') {
    const a = sketch.points[c.a]
    const b = sketch.points[c.b]
    if (!a || !b) return null
    const dx = b.x - a.x
    const dy = b.y - a.y
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
    // угол без направления: 0…180
    if (angleDeg < 0) angleDeg += 180
    if (angleDeg >= 180 - 1e-9) angleDeg = 0
    return { kind: 'length', length: Math.hypot(dx, dy), angleDeg }
  }
  if (c.kind === 'circle') return { kind: 'radius', radius: c.r }
  const center = sketch.points[c.c]
  const a = sketch.points[c.a]
  const b = sketch.points[c.b]
  if (!center || !a || !b) return null
  const a1 = Math.atan2(a.y - center.y, a.x - center.x)
  const a2 = Math.atan2(b.y - center.y, b.x - center.x)
  let sweep = a2 - a1
  while (sweep <= 0) sweep += 2 * Math.PI
  return { kind: 'arc', radius: Math.hypot(a.x - center.x, a.y - center.y), sweepDeg: (sweep * 180) / Math.PI }
}

export interface SketchBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  width: number
  height: number
}

/** Габарит видимой (не вспомогательной) геометрии: то, что человек назовёт размером фигуры. */
export function sketchBounds(sketch: Sketch): SketchBounds | null {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  for (const c of Object.values(sketch.curves)) {
    if (c.construction) continue
    if (c.kind === 'line') {
      const a = sketch.points[c.a]
      const b = sketch.points[c.b]
      if (a && b) {
        add(a.x, a.y)
        add(b.x, b.y)
      }
    } else if (c.kind === 'circle') {
      const p = sketch.points[c.c]
      if (p) {
        add(p.x - c.r, p.y - c.r)
        add(p.x + c.r, p.y + c.r)
      }
    } else {
      const center = sketch.points[c.c]
      const a = sketch.points[c.a]
      const b = sketch.points[c.b]
      if (center && a && b) {
        const r = Math.hypot(a.x - center.x, a.y - center.y)
        const a1 = Math.atan2(a.y - center.y, a.x - center.x)
        let sweep = Math.atan2(b.y - center.y, b.x - center.x) - a1
        while (sweep <= 0) sweep += 2 * Math.PI
        const steps = 24
        for (let i = 0; i <= steps; i++) {
          const ang = a1 + (sweep * i) / steps
          add(center.x + r * Math.cos(ang), center.y + r * Math.sin(ang))
        }
      }
    }
  }
  if (!isFinite(minX)) return null
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

const DIMENSION_KINDS = new Set(['distance', 'radius', 'diameter', 'angle'])
export const isDimension = (c: Constraint) => DIMENSION_KINDS.has(c.kind)

/** Есть ли у кривой размер (в том числе заданный расстоянием между её концами). */
export function hasDimension(sketch: Sketch, curveId: string): boolean {
  const c = sketch.curves[curveId]
  if (!c) return false
  return sketch.constraints.some((k) => {
    if (k.kind !== 'distance' && k.kind !== 'radius' && k.kind !== 'diameter') return false
    if (k.refs.includes(curveId)) return true
    if (c.kind === 'line' && k.kind === 'distance' && k.refs.length === 2) {
      return k.refs.includes(c.a) && k.refs.includes(c.b)
    }
    return false
  })
}

/** Размер, фиксирующий кривую в её текущем значении: длина отрезка, радиус окружности или дуги. */
export function dimensionFor(sketch: Sketch, curveId: string): Constraint | null {
  if (hasDimension(sketch, curveId)) return null
  const m = measureCurve(sketch, curveId)
  if (!m) return null
  if (m.kind === 'length') return { id: newId('con'), kind: 'distance', refs: [curveId], value: m.length }
  return { id: newId('con'), kind: 'radius', refs: [curveId], value: m.radius }
}

/** Элементы, на которые ссылается ограничение: для подсветки на холсте. */
export function constraintEntities(sketch: Sketch, c: Constraint): { points: string[]; curves: string[] } {
  const points: string[] = []
  const curves: string[] = []
  for (const ref of c.refs) {
    if (sketch.points[ref]) points.push(ref)
    else if (sketch.curves[ref]) curves.push(ref)
  }
  return { points, curves }
}
