import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d'
import { getWasm } from './wasm'
import { axisMm, type AxisSize } from './baseplate'
import { binLayout, bottomFasteners, buildBinBody, FOOT_HEIGHT, lipOpening, roundedRectCS, type BinHeight, type BinLayout, type BinParams, type BinThickness } from './bin'
import { defaultFasteners } from './fasteners'
import { offsetCurve } from './outlineFit'
import type { LipStyle } from './profiles'
import { DEFAULT_PITCH } from './spec'
import { cachedProfile, profileOfSlices } from './cutout-profile'
import { meshOf, type MeshData } from './mesh'
import { defaultOrientation, fillHoles, orientVertices, toManifold, type IndexedMesh, type Orientation } from './stl-import'

export interface RectSource { kind: 'rect'; width: number; length: number; radius: number }
/** Круглый карман: диаметр детали (без зазора). Поворот на форму не влияет. */
export interface CircleSource { kind: 'circle'; diameter: number }
export type CutMode = 'projected' | '3d'
export interface MeshSource {
  kind: 'mesh'
  meshId: string
  filename: string
  unit: 'mm' | 'in'
  orientation: Orientation
  mode: CutMode
  /** Размер детали после ориентации и выпуклая оболочка силуэта (центр габарита в 0): для превью, выравнивания и предупреждений. */
  size: [number, number, number]
  hull: [number, number][]
}
/**
 * Контур, снятый с фотографии: замкнутый многоугольник без дырок в мм, ось y вверх, против часовой стрелки, относительно центра
 * своего габарита (центр габарита совпадает с x, y выреза). size — габарит контура.
 */
export interface OutlineSource { kind: 'outline'; points: [number, number][]; size: { w: number; l: number } }
export type CutoutSource = RectSource | CircleSource | OutlineSource | MeshSource

export interface Cutout {
  id: string
  name: string
  source: CutoutSource
  /** Центр габарита силуэта относительно центра коробки, мм. */
  x: number
  y: number
  /** Поворот вокруг Z, градусы против часовой. */
  rotation: number
  depth: number
  clearance: number
  visible: boolean
  /** Цвет в палитре (0…CUTOUT_COLORS−1): назначается при добавлении и не меняется; нужен только для превью. */
  color?: number
}

export interface CutoutParams extends BinParams { cutouts: Cutout[] }

export const defaultCutoutThickness: BinThickness = { outerWall: 0.95, innerWall: 1.2, floor: 0.7 }

export const defaultCutout: CutoutParams = {
  pitch: DEFAULT_PITCH,
  x: { mode: 'units', value: 2, align: 'center' },
  y: { mode: 'units', value: 2, align: 'center' },
  height: { mode: 'units', value: 3 },
  thickness: defaultCutoutThickness,
  lip: 'default',
  fasteners: defaultFasteners,
  cutouts: [],
}

export type { AxisSize, BinHeight, LipStyle }

// ---------- модель списка вырезов (чистые функции) ----------

let counter = 0
export const newCutoutId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`

export function rectCutout(over: Omit<Partial<Cutout>, 'source'> & { source?: Partial<RectSource> } = {}): Cutout {
  const { source, ...rest } = over
  return { id: newCutoutId(), name: 'Rectangle', x: 0, y: 0, rotation: 0, depth: 10, clearance: 0.5, visible: true, ...rest, source: { kind: 'rect', width: 40, length: 20, radius: 3, ...source } }
}

export const DEFAULT_CIRCLE_DIAMETER = 20
/** Сегментов окружности: отклонение от настоящей окружности диаметром 21 мм не больше сотых долей мм. */
export const CIRCLE_SEGMENTS = 96

export function circleCutout(over: Omit<Partial<Cutout>, 'source'> & { source?: Partial<CircleSource> } = {}): Cutout {
  const { source, ...rest } = over
  return { id: newCutoutId(), name: 'Circle', x: 0, y: 0, rotation: 0, depth: 10, clearance: 0.5, visible: true, ...rest, source: { kind: 'circle', diameter: DEFAULT_CIRCLE_DIAMETER, ...source } }
}

/** Число цветов палитры вырезов (токены `--color-cutout-0…6` в theme.css). */
export const CUTOUT_COLORS = 7
const validColor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < CUTOUT_COLORS

/** Первый цвет палитры, не занятый вырезами списка; если заняты все — по кругу по числу вырезов. */
export function nextCutoutColor(list: readonly Cutout[]): number {
  const used = new Set(list.map((c) => c.color).filter(validColor))
  for (let i = 0; i < CUTOUT_COLORS; i++) if (!used.has(i)) return i
  return list.length % CUTOUT_COLORS
}

/** Донаполняет недостающие или битые цвета по порядку списка (старые сессии); корректные цвета не трогает. */
export function fillCutoutColors(list: Cutout[]): Cutout[] {
  const out = list.map((c) => ({ ...c }))
  out.forEach((c, i) => { if (!validColor(c.color)) c.color = nextCutoutColor(out.filter((o, j) => j !== i && (validColor(o.color) || j < i))) })
  return out
}

/** Площадь многоугольника, мм² (по модулю). */
export const polygonArea = (p: readonly [number, number][]) => Math.abs(p.reduce((a, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return a + (x * y2 - x2 * y) / 2 }, 0))
/** Наименьшая допустимая площадь контура, мм². */
export const MIN_OUTLINE_AREA = 1
/** Контур пригоден: не меньше трёх конечных точек и площадь не меньше минимума. */
export const validOutline = (p: unknown): p is [number, number][] =>
  Array.isArray(p) && p.length >= 3 && p.every((q) => Array.isArray(q) && q.length === 2 && Number.isFinite(q[0]) && Number.isFinite(q[1])) && polygonArea(p as [number, number][]) >= MIN_OUTLINE_AREA

export function outlineCutout(over: Omit<Partial<Cutout>, 'source'> & { source: OutlineSource }): Cutout {
  const { source, ...rest } = over
  return { id: newCutoutId(), name: 'Traced', x: 0, y: 0, rotation: 0, depth: 10, clearance: 0.5, visible: true, ...rest, source }
}

export const addCutout = (list: Cutout[], c: Cutout): Cutout[] => [...list, { ...c, color: validColor(c.color) ? c.color : nextCutoutColor(list) }]

/** Копия справа сверху от оригинала (чтобы не слилась с ним), вставляется следом. */
export function duplicateCutout(list: Cutout[], id: string, offset = 6): Cutout[] {
  const i = list.findIndex((c) => c.id === id)
  if (i < 0) return list
  const src = list[i]
  const copy: Cutout = { ...src, id: newCutoutId(), color: nextCutoutColor(list), name: `${src.name} copy`, x: src.x + offset, y: src.y + offset, source: { ...src.source } as CutoutSource }
  return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]
}

export function moveCutout(list: Cutout[], id: string, delta: -1 | 1): Cutout[] {
  const i = list.findIndex((c) => c.id === id), j = i + delta
  if (i < 0 || j < 0 || j >= list.length) return list
  const out = [...list]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

export const removeCutout = (list: Cutout[], id: string) => list.filter((c) => c.id !== id)
export const renameCutout = (list: Cutout[], id: string, name: string) => list.map((c) => (c.id === id ? { ...c, name } : c))
export const toggleCutout = (list: Cutout[], id: string) => list.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
export const updateCutout = (list: Cutout[], id: string, patch: Partial<Cutout>) => list.map((c) => (c.id === id ? { ...c, ...patch } : c))

// ---------- геометрия контура ----------

export type Pt = [number, number]

/** Контур силуэта (до поворота и сдвига): прямоугольник — четыре угла, деталь — выпуклая оболочка. */
export function baseOutline(c: Cutout): Pt[] {
  if (c.source.kind === 'rect') {
    const hw = c.source.width / 2, hl = c.source.length / 2
    return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]]
  }
  if (c.source.kind === 'outline') return c.source.points
  if (c.source.kind === 'circle') {
    const r = c.source.diameter / 2
    return Array.from({ length: CIRCLE_SEGMENTS }, (_, i) => { const a = (2 * Math.PI * i) / CIRCLE_SEGMENTS; return [r * Math.cos(a), r * Math.sin(a)] as Pt })
  }
  return c.source.hull
}

export interface Box { minX: number; maxX: number; minY: number; maxY: number }

/** Габарит выреза в координатах коробки: поворот, сдвиг и зазор (карман шире детали на clearance со всех сторон). */
export function cutoutBounds(c: Cutout): Box {
  if (c.source.kind === 'circle') {
    // окружность не зависит от поворота: габарит точный, а не по вершинам многоугольника
    const r = c.source.diameter / 2 + c.clearance
    return { minX: c.x - r, maxX: c.x + r, minY: c.y - r, maxY: c.y + r }
  }
  const a = (c.rotation * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a)
  const box: Box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  for (const [px, py] of baseOutline(c)) {
    const x = px * cs - py * sn + c.x, y = px * sn + py * cs + c.y
    box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x); box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y)
  }
  return { minX: box.minX - c.clearance, maxX: box.maxX + c.clearance, minY: box.minY - c.clearance, maxY: box.maxY + c.clearance }
}

export const MIN_MARGIN = 0.8 // минимальная стенка до края или соседнего выреза, мм

export interface CutoutLayout extends BinLayout {
  /** Нижняя допустимая отметка дна кармана: над ногой и минимальным полом. */
  pocketFloorMin: number
  /** Наибольшая глубина кармана. */
  maxDepth: number
}

export function cutoutLayout(p: CutoutParams): CutoutLayout {
  const l = binLayout(p)
  return { ...l, pocketFloorMin: l.cavityBottom, maxDepth: l.wallTop - l.cavityBottom }
}

export const effectiveDepth = (c: Cutout, l: CutoutLayout) => Math.max(0, Math.min(c.depth, l.maxDepth))

export interface CutoutIssue { id: string; key: string; other?: string }

/** Предупреждения (не ошибки): глубина ограничена, мало стенки до края, вырезы слишком близко. */
export function cutoutNotices(p: CutoutParams): CutoutIssue[] {
  const l = cutoutLayout(p)
  const out: CutoutIssue[] = []
  const vis = p.cutouts.filter((c) => c.visible)
  for (const c of vis) if (c.depth > l.maxDepth + 1e-9) out.push({ id: c.id, key: 'cutout.notice.depthClamped' })
  for (const c of vis) {
    const b = cutoutBounds(c)
    if (b.minX < -l.cavityX / 2 + MIN_MARGIN - 1e-9 || b.maxX > l.cavityX / 2 - MIN_MARGIN + 1e-9 || b.minY < -l.cavityY / 2 + MIN_MARGIN - 1e-9 || b.maxY > l.cavityY / 2 - MIN_MARGIN + 1e-9) out.push({ id: c.id, key: 'cutout.warn.edge' })
  }
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = cutoutBounds(vis[i]), b = cutoutBounds(vis[j])
    const gx = Math.max(a.minX - b.maxX, b.minX - a.maxX), gy = Math.max(a.minY - b.maxY, b.minY - a.maxY)
    if (Math.max(gx, gy) < MIN_MARGIN) out.push({ id: vis[i].id, key: 'cutout.warn.overlap', other: vis[j].id })
  }
  return out
}

export interface CutoutError { field: string; key: string }
export const MAX_CUTOUTS = 30

export function validateCutout(p: CutoutParams): { ok: boolean; errors: CutoutError[] } {
  const errors: CutoutError[] = []
  const bad = (field: string, key: string) => errors.push({ field, key })
  const sx = axisMm(p.x, p.pitch), sy = axisMm(p.y, p.pitch)
  for (const [f, v] of [['x', sx], ['y', sy]] as const) if (!Number.isFinite(v) || v < p.pitch - 1e-9) bad(f, 'box.error.sizeMin')
  const h = p.height.mode === 'units' ? p.height.value * 7 : p.height.value
  if (!Number.isFinite(h) || h <= 0) bad('height', 'box.error.height')
  for (const f of ['outerWall', 'floor'] as const) if (!Number.isFinite(p.thickness[f]) || p.thickness[f] < 0 || (f === 'outerWall' && p.thickness[f] === 0)) bad(`thickness.${f}`, 'baseplate.error.negative')
  if (errors.length) return { ok: false, errors }
  const l = cutoutLayout(p)
  if (l.cavityX < 1 || l.cavityY < 1) bad('thickness.outerWall', 'box.error.noCavity')
  else if (l.maxDepth < 1) bad('thickness.floor', 'box.error.noCavity')
  if (p.cutouts.length > MAX_CUTOUTS) bad('cutouts', 'cutout.error.tooMany')
  for (const c of p.cutouts) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.rotation)) bad(`cutout.${c.id}`, 'cutout.error.invalid')
    if (!(c.depth > 0)) bad(`cutout.${c.id}.depth`, 'cutout.error.depth')
    if (!(c.clearance >= 0)) bad(`cutout.${c.id}.clearance`, 'baseplate.error.negative')
    if (c.source.kind === 'rect' && !(c.source.width > 0 && c.source.length > 0 && c.source.radius >= 0)) bad(`cutout.${c.id}.size`, 'cutout.error.size')
    if (c.source.kind === 'circle' && !(c.source.diameter > 0)) bad(`cutout.${c.id}.size`, 'cutout.error.size')
    if (c.source.kind === 'outline' && !validOutline(c.source.points)) bad(`cutout.${c.id}.size`, 'cutout.error.size')
  }
  return { ok: errors.length === 0, errors }
}

// ---------- построение ----------

/** Сетки, доступные воркеру по id. */
export type MeshRegistry = Map<string, IndexedMesh>

const oriented = new Map<string, Manifold>()
function orientedManifold(w: ManifoldToplevel, s: MeshSource, mesh: IndexedMesh): Manifold {
  const key = `${s.meshId}|${s.unit}|${JSON.stringify(s.orientation)}`
  let m = oriented.get(key)
  if (!m) {
    if (oriented.size > 24) { for (const v of oriented.values()) v.delete(); oriented.clear() }
    const verts = orientVertices(mesh.vertProperties, s.unit, s.orientation)
    try {
      m = toManifold(w, { vertProperties: verts, triVerts: mesh.triVerts })
    } catch (e) {
      // сетка с дырами: закрыть их и повторить; без границы — сетка негодна (самопересечения), остаются срезы
      const healed = fillHoles(mesh)
      if (healed.triVerts.length === mesh.triVerts.length) throw e
      m = toManifold(w, { vertProperties: orientVertices(healed.vertProperties, s.unit, s.orientation), triVerts: healed.triVerts })
    }
    oriented.set(key, m)
  }
  return m
}

const placeCS = (cs: CrossSection, c: Cutout) => cs.rotate(c.rotation).translate([c.x, c.y])
const circleCS = (w: ManifoldToplevel, diameter: number) => w.CrossSection.circle(diameter / 2, CIRCLE_SEGMENTS)
const grow = (cs: CrossSection, clearance: number) => (clearance > 0 ? cs.offset(clearance, 'Round', 2, 24) : cs)

/** Тело кармана одного выреза (то, что вычитается из блока), или null, если деталь недоступна. */
export function pocketSolid(w: ManifoldToplevel, c: Cutout, l: CutoutLayout, registry: MeshRegistry): Manifold | null {
  const depth = effectiveDepth(c, l)
  if (depth < 1e-6) return null
  const floorZ = l.wallTop - depth
  const { Manifold } = w
  const extrude = (cs: CrossSection) => Manifold.extrude(cs, depth + 1).translate([0, 0, floorZ])
  if (c.source.kind === 'rect') {
    const cs = roundedRectCS(w, c.source.width, c.source.length, c.source.radius)
    return extrude(placeCS(grow(cs, c.clearance), c))
  }
  if (c.source.kind === 'circle') return extrude(placeCS(grow(circleCS(w, c.source.diameter), c.clearance), c))
  if (c.source.kind === 'outline') {
    // зазор по кривой (скругление выпуклых углов, митра вогнутых); при самопересечении — смещение ядра
    const grown = c.clearance > 0 ? offsetCurve(c.source.points, c.clearance) : null
    return extrude(placeCS(grown ? w.CrossSection.ofPolygons([grown]) : grow(w.CrossSection.ofPolygons([c.source.points]), c.clearance), c))
  }
  const mesh = registry.get(c.source.meshId)
  if (!mesh) return null
  const src = c.source
  const hullPocket = () => (src.hull.length < 3 ? null : extrude(placeCS(grow(w.CrossSection.ofPolygons([src.hull]), c.clearance), c)))
  let solid: Manifold | null = null
  try { solid = orientedManifold(w, src, mesh) } catch { solid = null }
  const limit = l.wallTop + 1
  if (solid) {
    if (src.mode === 'projected') return extrude(placeCS(grow(solid.project(), c.clearance), c))
    // настоящее 3D: сама деталь как есть, стоящая на дне кармана; зазор — смещение поверхности (сумма Минковского с малой сферой),
    // над деталью проём открыт вверх по её контуру
    let shape = solid
    if (c.clearance > 0 && mesh.triVerts.length / 3 <= MAX_OFFSET_TRIS) {
      const ball = w.Manifold.sphere(c.clearance, 12)
      const grown = solid.minkowskiSum(ball)
      shape = grown.trimByPlane([0, 0, 1], 0) // зазор не уходит ниже дна кармана
      grown.delete(); ball.delete()
    } else if (c.clearance > 0) {
      const bb = solid.boundingBox(), sx = bb.max[0] - bb.min[0], sy = bb.max[1] - bb.min[1], sz = bb.max[2]
      shape = solid.scale([(sx + 2 * c.clearance) / sx, (sy + 2 * c.clearance) / sy, (sz + c.clearance) / sz])
    }
    const topZ = floorZ + shape.boundingBox().max[2]
    const placed = shape.rotate([0, 0, c.rotation]).translate([c.x, c.y, floorZ])
    if (topZ >= limit) return placed
    const opening = Manifold.extrude(placeCS(shape.project(), c), limit - topZ + 0.001).translate([0, 0, topZ - 0.001])
    return Manifold.union([placed, opening])
  }
  // сетка без тела: сечения замкнуты срезами (ступенчатый карман), иначе остаётся выпуклая оболочка
  const key = `${src.meshId}|${src.unit}|${JSON.stringify(src.orientation)}`
  const verts = orientVertices(mesh.vertProperties, src.unit, src.orientation)
  let height = 0
  for (let i = 2; i < verts.length; i += 3) height = Math.max(height, verts[i])
  const profile = cachedProfile(key, () => profileOfSlices(w, { vertProperties: verts, triVerts: mesh.triVerts }, height))
  if (!profile) return hullPocket()
  const top = profile.sections.length - 1
  if (src.mode === 'projected') return extrude(placeCS(grow(profile.sections[top], c.clearance), c))
  const slabs: Manifold[] = []
  let prev = 0
  profile.tops.forEach((t, k) => {
    const z0 = floorZ + prev, z1 = Math.min(floorZ + t, limit)
    if (z1 > z0 + 1e-6) slabs.push(Manifold.extrude(placeCS(grow(profile.sections[k], c.clearance), c), z1 - z0 + 0.001).translate([0, 0, z0 - (k ? 0.001 : 0)]))
    prev = t
  })
  const topZ = floorZ + profile.height
  if (topZ < limit) slabs.push(Manifold.extrude(placeCS(grow(profile.sections[top], c.clearance), c), limit - topZ + 0.001).translate([0, 0, topZ - 0.001]))
  return slabs.length ? Manifold.union(slabs) : null
}

const MAX_OFFSET_TRIS = 40000 // выше — зазор масштабированием: сумма Минковского слишком долгая

/** Деталь для превью как есть: исходные треугольники после ориентации, поворота и сдвига (работает и для сеток без тела). */
function meshTool(c: Cutout, s: MeshSource, mesh: IndexedMesh, floorZ: number): MeshData {
  const v = orientVertices(mesh.vertProperties, s.unit, s.orientation)
  const a = (c.rotation * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a)
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i] * cs - v[i + 1] * sn + c.x, y = v[i] * sn + v[i + 1] * cs + c.y, z = v[i + 2] + floorZ
    v[i] = x; v[i + 1] = y; v[i + 2] = z
    min[0] = Math.min(min[0], x); max[0] = Math.max(max[0], x); min[1] = Math.min(min[1], y); max[1] = Math.max(max[1], y); min[2] = Math.min(min[2], z); max[2] = Math.max(max[2], z)
  }
  let vol = 0
  const t = mesh.triVerts
  for (let i = 0; i < t.length; i += 3) {
    const p = t[i] * 3, q = t[i + 1] * 3, r = t[i + 2] * 3
    vol += (v[p] * (v[q + 1] * v[r + 2] - v[q + 2] * v[r + 1]) - v[p + 1] * (v[q] * v[r + 2] - v[q + 2] * v[r]) + v[p + 2] * (v[q] * v[r + 1] - v[q + 1] * v[r])) / 6
  }
  return { vertProperties: v, triVerts: mesh.triVerts, numProp: 3, min, max, volume: Math.abs(vol) }
}

/** Вырезающий инструмент для превью: сама фигура без зазора, стоящая на дне кармана (деталь — исходной сеткой). */
export function buildCutoutTools(w: ManifoldToplevel, p: CutoutParams, registry: MeshRegistry = new Map()): { id: string; name: string; color: number; mesh: MeshData }[] {
  const l = cutoutLayout(p)
  const out: { id: string; name: string; color: number; mesh: MeshData }[] = []
  for (const c of p.cutouts) {
    if (!c.visible) continue
    const depth = effectiveDepth(c, l)
    if (depth < 1e-6) continue
    const floorZ = l.wallTop - depth
    if (c.source.kind === 'rect') {
      const solid = w.Manifold.extrude(placeCS(roundedRectCS(w, c.source.width, c.source.length, c.source.radius), c), depth).translate([0, 0, floorZ])
      try { out.push({ id: c.id, name: c.name, color: c.color ?? 0, mesh: meshOf(solid) }) } finally { solid.delete() }
      continue
    }
    if (c.source.kind === 'circle') {
      const solid = w.Manifold.extrude(placeCS(circleCS(w, c.source.diameter), c), depth).translate([0, 0, floorZ])
      try { out.push({ id: c.id, name: c.name, color: c.color ?? 0, mesh: meshOf(solid) }) } finally { solid.delete() }
      continue
    }
    if (c.source.kind === 'outline') {
      const solid = w.Manifold.extrude(placeCS(w.CrossSection.ofPolygons([c.source.points]), c), depth).translate([0, 0, floorZ])
      try { out.push({ id: c.id, name: c.name, color: c.color ?? 0, mesh: meshOf(solid) }) } finally { solid.delete() }
      continue
    }
    const mesh = registry.get(c.source.meshId)
    if (mesh) out.push({ id: c.id, name: c.name, color: c.color ?? 0, mesh: meshTool(c, c.source, mesh, floorZ) })
  }
  return out
}

/** Сплошной блок коробки с карманами; губа вырезана над верхней гранью. */
export function buildCutoutSolid(w: ManifoldToplevel, p: CutoutParams, registry: MeshRegistry = new Map()): Manifold {
  const l = cutoutLayout(p)
  const cuts: Manifold[] = []
  const lip = lipOpening(w, p.lip, l)
  if (lip) cuts.push(lip)
  cuts.push(...bottomFasteners(w, p, l))
  for (const c of p.cutouts) if (c.visible) { const s = pocketSolid(w, c, l, registry); if (s) cuts.push(s) }
  const body = buildBinBody(w, p, l)
  return cuts.length ? body.subtract(w.Manifold.union(cuts)) : body
}

export async function buildCutout(p: CutoutParams, registry: MeshRegistry = new Map(), wasmUrl?: string): Promise<Manifold> {
  return buildCutoutSolid(await getWasm(wasmUrl), p, registry)
}

export { defaultOrientation, FOOT_HEIGHT }
