import { describe, expect, it } from 'vitest'
import { expectValidSolid } from '../testing'
import { buildRackShelf, defaultRackShelf, shelfLayout, validateRackShelf, type RackShelfParams } from './shelf'
import { plateBase } from './panel'
import { defaultPattern } from './patterns/types'
import { getWasm } from '../wasm'
import { HEIGHT_TOLERANCE, RACK_UNIT } from './spec'

const S = (o: Partial<RackShelfParams> = {}): RackShelfParams => ({ ...defaultRackShelf, ...o })
const withShelf = (o: Partial<RackShelfParams['shelf']>) => S({ shelf: { ...defaultRackShelf.shelf, ...o } })
const solidFloor = (o: Partial<RackShelfParams> = {}) => S({ floorPattern: { ...defaultPattern, kind: 'none' }, ...o })
const build = async (p: RackShelfParams) => { const r = await buildRackShelf(p); expect(r.error).toBeUndefined(); return r.solid! }
const area = (m: { slice(z: number): { area(): number; delete(): void } }, z: number) => { const s = m.slice(z); const a = s.area(); s.delete(); return a }

describe('полка: размеры и проверка', () => {
  it('ширина полки 221.75 по умолчанию и меняется на две величины зазора', () => {
    expect(shelfLayout(defaultRackShelf).width).toBeCloseTo(221.75, 9)
    expect(shelfLayout(withShelf({ clearance: 0.5 })).width).toBeCloseTo(221.25, 9)
    expect(shelfLayout(withShelf({ clearance: 0 })).width).toBeCloseTo(222.25, 9)
  })
  it.each([[1, 44.0], [2, 88.45], [10, 444.05]])('высота пластины для %i U с допуском', (u, h) => {
    expect(shelfLayout(S({ units: u })).plateH).toBeCloseTo(u * RACK_UNIT - HEIGHT_TOLERANCE, 9)
    expect(shelfLayout(S({ units: u })).plateH).toBeCloseTo(h, 2)
  })
  it('области узоров: пол между стенками с полем, пластина над полом', () => {
    const l = shelfLayout(defaultRackShelf) // стенка 3, поле пола 8, поле пластины 6
    expect(l.floorRegion).toEqual({ x0: -(110.875 - 3 - 8), x1: 110.875 - 3 - 8, y0: 8, y1: 92 })
    expect(l.plateRegion.y0).toBeCloseTo(3 + 6, 9); expect(l.plateRegion.y1).toBeCloseTo(44 - 6, 9)
    expect(l.plateRegion.x1).toBeCloseTo(110.875 - 3 - 6, 9)
    const bare = shelfLayout(S({ sides: { height: 0, wall: 3 } }))
    expect(bare.floorRegion.x1).toBeCloseTo(110.875 - 8, 9)
  })
  it('умолчания допустимы: 1 U, открытая пластина, пол со щелями, узор пластины выключен', () => {
    expect(validateRackShelf(defaultRackShelf).errors).toEqual([])
    expect(defaultRackShelf.units).toBe(1); expect(defaultRackShelf.closedFront).toBe(false)
    expect(defaultRackShelf.floorPattern.kind).toBe('pills'); expect(defaultRackShelf.platePattern.kind).toBe('none')
  })
  it('стенка выше пластины и ниже пола отвергаются, 0 — стенок нет', () => {
    expect(validateRackShelf(S({ sides: { height: 50, wall: 3 } })).errors).toEqual(['rack.error.sideHeight']) // 50 > 44
    expect(validateRackShelf(S({ sides: { height: 44, wall: 3 } })).errors).toEqual([])
    expect(validateRackShelf(S({ units: 2, sides: { height: 60, wall: 3 } })).errors).toEqual([])
    expect(validateRackShelf(S({ sides: { height: 3.5, wall: 3 } })).errors).toEqual(['rack.error.sideHeight'])
    expect(validateRackShelf(S({ sides: { height: 0, wall: 99 } })).errors).toEqual([])
  })
  it('значения вне диапазона отвергаются', () => {
    expect(validateRackShelf(S({ units: 0 })).errors).toContain('rack.error.units')
    expect(validateRackShelf(S({ units: 11 })).errors).toContain('rack.error.units')
    expect(validateRackShelf(S({ thickness: 20 })).errors).toContain('rack.error.thickness')
    expect(validateRackShelf(withShelf({ depth: 10 })).errors).toContain('rack.error.shelfDepth')
    expect(validateRackShelf(withShelf({ clearance: 3 })).errors).toContain('rack.error.clearance')
    expect(validateRackShelf(S({ sides: { height: 30, wall: 0.2 } })).errors).toContain('rack.error.sideWall')
    expect(validateRackShelf(S({ ears: { ...defaultRackShelf.ears, size: 20 } })).errors).toContain('rack.error.earSize')
  })
  it('поле узора так велико, что места нет: ошибка области пола и пластины', () => {
    expect(validateRackShelf(S({ floorPattern: { ...defaultRackShelf.floorPattern, margin: 30 }, shelf: { ...defaultRackShelf.shelf, depth: 50 } })).errors).toContain('rack.error.floorRegion')
    expect(validateRackShelf(S({ closedFront: true, sides: { height: 0, wall: 3 }, platePattern: { ...defaultPattern, kind: 'hex', margin: 25 } })).errors).toContain('rack.error.plateRegion')
    expect(validateRackShelf(S({ sides: { height: 0, wall: 3 }, platePattern: { ...defaultPattern, kind: 'hex', margin: 25 } })).errors).toEqual([]) // открытой пластине узор не нужен
  })
})

describe('полка: сборка в положении печати', () => {
  it('одно тело: габарит 254 × высота пластины × (толщина + глубина), лицо на z = 0', async () => {
    const m = await build(defaultRackShelf), l = shelfLayout(defaultRackShelf)
    expectValidSolid(m, { min: [-127, 0, 0], max: [127, l.plateH, 103] })
    expect(m.decompose()).toHaveLength(1)
  })
  it('на столе только лицевая грань пластины: сечение у стола — пластина, выше неё пол и стенки', async () => {
    const w = await getWasm(), m = await build(solidFloor({ closedFront: true })), { base } = plateBase(w, 1, true, 3, defaultRackShelf.ears)
    expect(Math.abs(area(m, 0.5) - base.area())).toBeLessThan(2) // лицевой слой — только пластина (в сечении щели ушей те же)
    // за пластиной: пол 221.75 × 3 и две стенки по скосу
    const s = m.slice(20), polys = s.toPolygons(); s.delete()
    const ys = polys.flat().map((q) => q[1]); expect(Math.min(...ys)).toBeCloseTo(0, 6)
    // срез z = 20 лежит на 17 мм за задней гранью пластины: высота стенки по скосу 35 − (35 − 3) × 17 / 100
    expect(Math.max(...ys)).toBeCloseTo(35 - 32 * 17 / 100, 1)
  })
  it('пол вровень с нижней кромкой пластины и шириной 221.75 по центру', async () => {
    const m = await build(solidFloor(withShelf({}))), s = m.slice(60), b = s.bounds(); s.delete()
    expect(b.min[1]).toBeCloseTo(0, 6); expect(b.min[0]).toBeCloseTo(-110.875, 6); expect(b.max[0]).toBeCloseTo(110.875, 6)
    const m2 = await build(solidFloor(withShelf({ clearance: 1 }))), s2 = m2.slice(60), b2 = s2.bounds(); s2.delete()
    expect(b2.max[0] - b2.min[0]).toBeCloseTo(220.25, 6); expect((b2.max[0] + b2.min[0]) / 2).toBeCloseTo(0, 6)
  })
  it('боковые стенки: высота у пластины, прямой скос до пола сзади, толщина, без отверстий', async () => {
    const m = await build(solidFloor({ sides: { height: 40, wall: 4 } }))
    const hAt = (z: number) => { const s = m.slice(z), ys = s.toPolygons().flat().map((q) => q[1]); s.delete(); return Math.max(...ys) }
    expect(hAt(3.5)).toBeCloseTo(40, 0); expect(hAt(53)).toBeCloseTo(40 - 37 * 50 / 100, 1); expect(hAt(102.5)).toBeCloseTo(3 + 0.1, 0)
    // сечение на середине: пол 221.75 × 3 плюс две стенки 4 × (высота − 3)
    const h = 40 - 37 * 50 / 100
    expect(area(m, 53)).toBeCloseTo(221.75 * 3 + 2 * 4 * (h - 3), 0)
    expect(m.decompose()).toHaveLength(1)
  })
  it('стенок нет при высоте 0: остаётся пластина и пол', async () => {
    const m = await build(solidFloor({ sides: { height: 0, wall: 3 } }))
    expect(area(m, 50)).toBeCloseTo(221.75 * 3, 1)
  })
  it('пол по умолчанию в щелях, глухой при узоре «нет»; убрано ровно площадь узора × толщина пола, стенки не тронуты', async () => {
    const w = await getWasm(), l = shelfLayout(defaultRackShelf)
    const slotted = await build(defaultRackShelf), solid = await build(solidFloor())
    const cut = (await import('./patterns')).cutPattern(w, defaultRackShelf.floorPattern, l.floorRegion)!
    expect(cut.area()).toBeGreaterThan(500)
    expect((solid.volume() - slotted.volume()) / (cut.area() * 3)).toBeCloseTo(1, 2)
    // щели лежат внутри области пола, то есть между стенками: область не шире внутреннего просвета
    expect(l.floorRegion.x1).toBeLessThan(110.875 - 3)
    const b = cut.bounds(); expect(b.max[0]).toBeLessThanOrEqual(l.floorRegion.x1 + 1e-6); expect(b.min[1]).toBeGreaterThanOrEqual(l.floorRegion.y0 - 1e-6)
  })
  it('щели сквозные: на уровне пола сечение с щелями меньше глухого', async () => {
    const m = await build(defaultRackShelf), solid = await build(solidFloor())
    const at = (q: typeof m) => { const s = q.slice(60); const a = s.area(); s.delete(); return a }
    expect(at(m)).toBeLessThan(at(solid) - 100)
  })
  it('узор пластины работает только у глухой пластины и вырезает её над полом внутри реек', async () => {
    const ignored = await build(solidFloor({ platePattern: { ...defaultPattern, kind: 'hex', margin: 6 } })), open = await build(solidFloor())
    expect(ignored.volume()).toBeCloseTo(open.volume(), 6) // у открытой пластины узор не применяется
    const off = await build(solidFloor({ closedFront: true })), on = await build(solidFloor({ closedFront: true, platePattern: { ...defaultPattern, kind: 'hex', margin: 6 } }))
    expect(off.volume() - on.volume()).toBeGreaterThan(500)
    const s = on.slice(1.5), ys = s.toPolygons().flat().map((q) => q[1]); s.delete()
    expect(ys.length).toBeGreaterThan(0)
    expect(on.decompose()).toHaveLength(1)
  })
  it('объём: пластина + пол + стенки минус щели (±1 %), без узоров точно по формулам', async () => {
    const w = await getWasm(), p = solidFloor({ closedFront: true, sides: { height: 40, wall: 4 } }), m = await build(p), l = shelfLayout(p)
    const { base } = plateBase(w, 1, true, 3, p.ears)
    const wall = ((40 + 3) / 2) * 100 * 4 // трапеция: (h + пол) / 2 × глубина × толщина
    const expected = base.area() * 3 + l.width * 100 * 3 + 2 * (wall - 4 * 100 * 3)
    expect(Math.abs(m.volume() - expected) / expected).toBeLessThan(0.01)
  })
  it('отверстия ушей следуют настройкам: из «все» в «по краям» четыре отверстия вместо шести (1 U)', async () => {
    const all = await build(solidFloor()), edges = await build(solidFloor({ ears: { ...defaultRackShelf.ears, positions: 'edges' } }))
    const hole = (65 - (4 - Math.PI) * 3.25 * 3.25) * 3
    expect((edges.volume() - all.volume()) / hole).toBeCloseTo(2, 0)
  })
  it('узор, разрезающий деталь, отвергается', async () => {
    const r = await buildRackShelf(S({ sides: { height: 0, wall: 3 }, floorPattern: { ...defaultPattern, kind: 'lines', margin: 0, lines: { height: 3, wall: 2 } } }))
    expect(r.solid).toBeNull(); expect(r.error).toBe('rack.error.disconnected')
  })
  it('недопустимое состояние: тела нет, ключ ошибки', async () => {
    const r = await buildRackShelf(S({ sides: { height: 50, wall: 3 } }))
    expect(r.solid).toBeNull(); expect(r.error).toBe('rack.error.sideHeight')
  })

  it('открытая пластина по умолчанию: над полом между стенками пусто, остаются уши, полоса у пола и места крепления стенок', async () => {
    const m = await build(solidFloor()), closed = await build(solidFloor({ closedFront: true })), l = shelfLayout(defaultRackShelf)
    const at = (q: typeof m, y: number) => { const s = q.slice(1.5), polys = s.toPolygons(); s.delete(); return polys.flat().filter((v) => Math.abs(v[1] - y) < 1e-6).length }
    // на лицевом слое открытая пластина: контур разорван окном, а глухая цельная
    expect(closed.volume() - m.volume()).toBeGreaterThan(l.inner * 2 * (l.plateH - 3) * 3 * 0.9)
    const s = m.slice(1.5), b = s.bounds(); s.delete()
    expect(b.min[0]).toBeCloseTo(-127, 1) // уши остаются
    expect(m.decompose()).toHaveLength(1); void at
    // выше пола в центре на лицевом слое ничего нет: сечение z = 1.5 в области |x| < inner, y > 3.5 пусто
    const pts = m.slice(1.5).toPolygons().flat().filter((v) => Math.abs(v[0]) < l.inner - 0.1 && v[1] > 3.2 && v[1] < l.plateH - 0.1)
    expect(pts).toHaveLength(0)
  })
  it('открытая пластина без стенок: окно шириной в весь пол, деталь одним куском', async () => {
    const m = await build(solidFloor({ sides: { height: 0, wall: 3 } }))
    expect(m.decompose()).toHaveLength(1)
  })
})
