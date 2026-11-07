/** Соединители между частями плиты: настройки, планирование положений и геометрия. */
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { Footprint, Point } from './footprint'
import type { Part } from './split'
import { CLEARANCE, SOCKET_HEIGHT, SOCKET_LAYERS } from './spec'
import { socketWindowWidth } from './profiles'


import {
  type ConnectorType,
  CONNECTOR_TYPES,
  type ConnectorConfig,
  type HolePreset,
  HOLE_PRESETS,
  CUSTOM,
  defaultConnector,
  withHolePreset,
  cutKey,
  connectorTypeAt,
} from './connectorSpec'

export {
  type ConnectorType,
  CONNECTOR_TYPES,
  type ConnectorConfig,
  type HolePreset,
  HOLE_PRESETS,
  CUSTOM,
  defaultConnector,
  withHolePreset,
  cutKey,
  connectorTypeAt,
}

// ---------------------------------------------------------------------------------------------
// Геометрия соединителей. Координаты торца («канонический» кадр): n — вдоль нормали разреза от части A к B,
// u — вдоль торца от его начала, z — вверх.
// ---------------------------------------------------------------------------------------------

/** Минимальная стенка между соединителем и гнездом или отверстием, мм. */
export const MIN_WALL = 0.4

export interface Face {
  axis: 'x' | 'y'
  /** Индекс ячейки, перед которой проходит разрез. */
  cut: number
  a: Part
  b: Part
  /** Координата разреза (x для axis 'x', y для 'y'). */
  pos: number
  /** Протяжённость торца в мировых координатах по другой оси. */
  from: number
  to: number
  /** Рёбра, упирающиеся в торец: положения (мм от начала торца) границ ячеек строго внутри торца. */
  ribs: number[]
}

export const faceLength = (f: Face) => f.to - f.from

/** Торцы между соседними частями. */
export function cutFaces(fp: Footprint, parts: Part[]): Face[] {
  const faces: Face[] = []
  const boundaryY = (j: number) => -fp.sizeY / 2 + fp.offsetY + j * fp.pitch
  const boundaryX = (i: number) => -fp.sizeX / 2 + fp.offsetX + i * fp.pitch
  for (const a of parts) {
    for (const b of parts) {
      if (a.col + 1 === b.col && a.row === b.row) {
        const ribs: number[] = []
        for (let j = a.j0 + 1; j < a.j1; j++) ribs.push(boundaryY(j) - a.y0)
        faces.push({ axis: 'x', cut: a.i1, a, b, pos: a.x1, from: a.y0, to: a.y1, ribs })
      }
      if (a.row + 1 === b.row && a.col === b.col) {
        const ribs: number[] = []
        for (let i = a.i0 + 1; i < a.i1; i++) ribs.push(a.x1 - boundaryX(i))
        ribs.sort((p, q) => p - q)
        faces.push({ axis: 'y', cut: a.j1, a, b, pos: a.y1, from: a.x0, to: a.x1, ribs })
      }
    }
  }
  return faces
}

/** Ширина материала между соседними гнёздами на высоте z′ над низом гнезда (z′ < 0 — окно под гнездом). */
export function ridgeWidthAt(pitch: number, zRel: number): number {
  const { low, wall, up } = SOCKET_LAYERS
  const top = pitch - 2 * CLEARANCE + 0.5
  const mid = top - 2 * up
  const bottom = mid - 2 * low
  if (zRel < 0) return pitch - socketWindowWidth(pitch)
  if (zRel <= low) return pitch - (bottom + (mid - bottom) * (zRel / low))
  if (zRel <= low + wall) return pitch - mid
  if (zRel <= SOCKET_HEIGHT) return pitch - (mid + (top - mid) * ((zRel - low - wall) / up))
  return 0
}

/** Высота центра соединителя: середина вертикального участка стенки, но не ниже, чем диаметр/2 + 0.2 мм от низа плиты. */
export const connectorZ = (pocketBottom: number, diameter: number) => Math.max(pocketBottom + SOCKET_LAYERS.low + SOCKET_LAYERS.wall / 2, diameter / 2 + 0.2)

/** Отверстие диаметра D на высоте zc помещается в стенку между гнёздами с запасом MIN_WALL. */
export function holeFitsRidge(pitch: number, pocketBottom: number, diameter: number, zc: number): boolean {
  const r = diameter / 2
  if (zc - r < 0) return false
  const steps = 24
  for (let k = 0; k <= steps; k++) {
    const dz = -r + (2 * r * k) / steps
    const chord = 2 * Math.sqrt(Math.max(r * r - dz * dz, 0))
    if (ridgeWidthAt(pitch, zc + dz - pocketBottom) - chord < 2 * MIN_WALL - 1e-9) return false
  }
  return true
}

/** Ласточкин хвост лежит на столе (z от 0): глубина вместе с зазором должна уместиться в половину стенки на всей его высоте. */
export function dovetailFits(pitch: number, pocketBottom: number, c: ConnectorConfig): boolean {
  const top = c.dovetailHeight + c.clearance
  let minRidge = Infinity
  for (let k = 0; k <= 12; k++) minRidge = Math.min(minRidge, ridgeWidthAt(pitch, (top * k) / 12 - pocketBottom))
  return c.dovetailDepth + c.clearance <= minRidge / 2 - MIN_WALL + 1e-9 && c.tip >= c.neck && c.dovetailHeight > 0
}

export interface FastenerHole { x: number; y: number; r: number }

export interface ConnectorIssue {
  /** Ключ перевода connector.* */
  key: string
  /** Разрез: `x:4` / `y:1`. */
  cut: string
  /** Часть(и), на стыке которых проблема. */
  parts: string
}

export interface FacePlan {
  face: Face
  type: ConnectorType
  /** Положения соединителей вдоль торца, мм от его начала. */
  positions: number[]
  zc: number
  /** Глубина отверстия в частях A и B с учётом длины части (для отверстий). */
  depthA: number
  depthB: number
  issues: ConnectorIssue[]
}

export interface PlanContext {
  pitch: number
  pocketBottom: number
  holes: FastenerHole[]
}

/** Круг пересекает прямоугольник [n0,n1]×[u0,u1]. */
function circleHitsRect(cn: number, cu: number, r: number, n0: number, n1: number, u0: number, u1: number) {
  const dn = Math.max(n0 - cn, 0, cn - n1)
  const du = Math.max(u0 - cu, 0, cu - u1)
  return Math.hypot(dn, du) < r
}

const toCanonical = (f: Face, p: Point) => (f.axis === 'x' ? { n: p.x - f.pos, u: p.y - f.from } : { n: p.y - f.pos, u: f.to - p.x })

/** Номинальные положения: count штук между отступами с обоих концов, симметрично; один — по центру. */
export function nominalPositions(length: number, count: number, inset: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [length / 2]
  const span = length - 2 * inset
  if (span < 0) return []
  return Array.from({ length: count }, (_, k) => inset + (span * k) / (count - 1))
}

/** Длина части вдоль нормали разреза. */
const extentAlong = (face: Face, part: Part) => (face.axis === 'x' ? part.sizeX : part.sizeY)
/** Сколько материала оставляем у дальнего края части за дном отверстия, мм. */
export const END_WALL = 2

/** Планирует соединители одного торца: отверстия — в торцы рёбер, замок — вдоль торца; сдвигает от крепежа, сообщает о нарушениях. */
export function planFace(face: Face, c: ConnectorConfig, ctx: PlanContext): FacePlan {
  const type = c.overrides[cutKey(face.axis, face.cut)] ?? c.type
  const cutId = cutKey(face.axis, face.cut)
  const parts = `${face.a.label}–${face.b.label}`
  const issues: ConnectorIssue[] = []
  const plan: FacePlan = { face, type, positions: [], zc: 0, depthA: 0, depthB: 0, issues }
  if (type === 'none') return plan

  const L = faceLength(face)
  const isHole = type === 'holes'
  const holes = ctx.holes.map((h) => ({ ...toCanonical(face, h), r: h.r }))

  if (isHole) {
    plan.zc = connectorZ(ctx.pocketBottom, c.diameter)
    plan.depthA = Math.max(0, Math.min(c.depth, extentAlong(face, face.a) - END_WALL))
    plan.depthB = Math.max(0, Math.min(c.depth, extentAlong(face, face.b) - END_WALL))
    if (!holeFitsRidge(ctx.pitch, ctx.pocketBottom, c.diameter, plan.zc)) { issues.push({ key: 'connector.tooBigForRidge', cut: cutId, parts }); return plan }
    if (face.ribs.length === 0) { issues.push({ key: 'connector.noRib', cut: cutId, parts }); return plan }
    const halfU = c.diameter / 2
    const free = (u: number) => !holes.some((h) => circleHitsRect(h.n, h.u, h.r + MIN_WALL, -plan.depthA, plan.depthB, u - halfU, u + halfU))
    const candidates = face.ribs.filter(free)
    const wanted = Math.min(c.count, face.ribs.length)
    const nominal = nominalPositions(L, c.count, c.inset)
    const chosen: number[] = []
    for (const u0 of nominal.length ? nominal : [L / 2]) {
      const best = candidates.filter((u) => !chosen.includes(u)).sort((a, b) => Math.abs(a - u0) - Math.abs(b - u0))[0]
      if (best !== undefined) chosen.push(best)
    }
    // номинальных положений меньше, чем рёбер, а надо count: добираем свободными рёбрами по близости к центру
    for (const u of candidates.filter((u) => !chosen.includes(u)).sort((a, b) => Math.abs(a - L / 2) - Math.abs(b - L / 2))) {
      if (chosen.length >= wanted) break
      chosen.push(u)
    }
    plan.positions = chosen.slice(0, wanted).sort((a, b) => a - b)
    if (plan.positions.length < wanted) issues.push({ key: 'connector.collision', cut: cutId, parts })
    return plan
  }

  // ласточкин хвост: лежит на столе, размещается вдоль торца
  const halfU = (c.tip + 2 * c.clearance) / 2
  const depth = c.dovetailDepth + c.clearance
  plan.zc = c.dovetailHeight / 2
  if (!dovetailFits(ctx.pitch, ctx.pocketBottom, c)) { issues.push({ key: 'connector.dovetailTooDeep', cut: cutId, parts }); return plan }
  const nominal = nominalPositions(L, c.count, c.inset)
  if (nominal.length === 0) { issues.push({ key: 'connector.noRoom', cut: cutId, parts }); return plan }
  const free = (u: number) =>
    u - halfU >= MIN_WALL && u + halfU <= L - MIN_WALL &&
    !holes.some((h) => circleHitsRect(h.n, h.u, h.r + MIN_WALL, -depth, depth, u - halfU, u + halfU))
  const spacing = nominal.length > 1 ? nominal[1] - nominal[0] : L
  const maxShift = Math.min(10, spacing / 2)
  for (const u0 of nominal) {
    let placed: number | null = null
    for (let s = 0; s <= maxShift + 1e-9 && placed === null; s += 0.5) {
      for (const u of s === 0 ? [u0] : [u0 + s, u0 - s]) if (free(u) && !plan.positions.some((q) => Math.abs(q - u) < 2 * halfU)) { placed = u; break }
    }
    if (placed === null) issues.push({ key: 'connector.collision', cut: cutId, parts })
    else plan.positions.push(placed)
  }
  plan.positions.sort((a, b) => a - b)
  return plan
}

export interface PartExtras { add: Manifold[]; sub: Manifold[] }

const place = (m: Manifold, f: Face) => (f.axis === 'x' ? m.translate([f.pos, f.from, 0]) : m.rotate([0, 0, 90]).translate([f.to, f.pos, 0]))

/** Трапеция ласточкина хвоста в плоскости (n, u): шейка у торца, головка на глубине. grow — расширение (зазор); тело занимает z от zFrom до zTo. */
function dovetail(w: ManifoldToplevel, u: number, c: ConnectorConfig, grow: number, zFrom: number, zTo: number): Manifold {
  const { CrossSection, Manifold } = w
  const x0 = -0.3 // заходит в свою часть, чтобы ключ срастался с торцом
  const pts: [number, number][] = [[x0, u - c.neck / 2], [c.dovetailDepth, u - c.tip / 2], [c.dovetailDepth, u + c.tip / 2], [x0, u + c.neck / 2]]
  let cs = CrossSection.ofPolygons([pts])
  if (grow > 0) cs = cs.offset(grow, 'Miter', 2, 8)
  return Manifold.extrude(cs, zTo - zFrom).translate([0, 0, zFrom])
}

/** Что нужно добавить и вычесть из каждой части (по метке) для всех торцов. */
export function connectorExtras(w: ManifoldToplevel, plans: FacePlan[], c: ConnectorConfig): Map<string, PartExtras> {
  const out = new Map<string, PartExtras>()
  const of = (label: string) => { let e = out.get(label); if (!e) { e = { add: [], sub: [] }; out.set(label, e) } return e }
  const { Manifold } = w
  for (const p of plans) {
    if (p.type === 'none') continue
    for (const u of p.positions) {
      const f = p.face
      if (p.type === 'holes') {
        const r = c.diameter / 2
        // отверстие идёт вдоль ребра от торца в каждую часть и глухое
        const cyl = (depth: number) => Manifold.cylinder(depth + 0.05, r, r, 24).rotate([0, 90, 0])
        if (p.depthA > 0) of(f.a.label).sub.push(place(cyl(p.depthA).translate([-p.depthA - 0.05, u, p.zc]), f))
        if (p.depthB > 0) of(f.b.label).sub.push(place(cyl(p.depthB).translate([0, u, p.zc]), f))
      } else {
        // ключ лежит на столе (z от 0), гнездо открыто снизу и закрыто сверху с зазором
        of(f.a.label).add.push(place(dovetail(w, u, c, 0, 0, c.dovetailHeight), f))
        of(f.b.label).sub.push(place(dovetail(w, u, c, c.clearance, -1, c.dovetailHeight + c.clearance), f))
      }
    }
  }
  return out
}
