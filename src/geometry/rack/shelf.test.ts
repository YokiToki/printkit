import { describe, expect, it } from 'vitest'
import { expectValidSolid } from '../testing'
import { buildRackShelf, defaultRackShelf, shelfLayout, validateRackShelf, type RackShelfParams } from './shelf'
import { plateBase } from './panel'
import { getWasm } from '../wasm'
import { HEIGHT_TOLERANCE, RACK_UNIT } from './spec'

const S = (o: Partial<RackShelfParams> = {}): RackShelfParams => ({ ...defaultRackShelf, ...o })
const withShelf = (o: Partial<RackShelfParams['shelf']>) => S({ shelf: { ...defaultRackShelf.shelf, ...o } })
const withLips = (height: number, wall = 2) => S({ lips: { height, wall } })
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
    expect(shelfLayout(S({ units: u, tolerance: false })).plateH).toBeCloseTo(u * RACK_UNIT, 9)
  })
  it('умолчания допустимы', () => expect(validateRackShelf(defaultRackShelf).errors).toEqual([]))
  it('бортик выше пластины отвергается', () => {
    expect(validateRackShelf(S({ units: 1, lips: { height: 42, wall: 2 } })).errors).toEqual(['rack.error.lipHeight']) // 3 + 42 > 44
    expect(validateRackShelf(S({ units: 1, lips: { height: 41, wall: 2 } })).errors).toEqual([])
    expect(validateRackShelf(S({ units: 1, shelf: { ...defaultRackShelf.shelf, thickness: 10 } })).errors).toEqual([]) // 10 мм ещё меньше высоты пластины 1 U минус 2
  })
  it('значения вне диапазона отвергаются', () => {
    expect(validateRackShelf(S({ units: 0 })).errors).toContain('rack.error.units')
    expect(validateRackShelf(S({ units: 11 })).errors).toContain('rack.error.units')
    expect(validateRackShelf(S({ thickness: 20 })).errors).toContain('rack.error.thickness')
    expect(validateRackShelf(withShelf({ depth: 10 })).errors).toContain('rack.error.shelfDepth')
    expect(validateRackShelf(withShelf({ clearance: 3 })).errors).toContain('rack.error.clearance')
    expect(validateRackShelf(S({ lips: { height: 5, wall: 0.2 } })).errors).toContain('rack.error.lipWall')
    expect(validateRackShelf(S({ ears: { ...defaultRackShelf.ears, size: 20 } })).errors).toContain('rack.error.earSize')
  })
})

describe('полка: сборка', () => {
  it('одно тело: габарит 254 × (толщина + глубина) × высота пластины, нижняя точка z = 0', async () => {
    const m = await build(defaultRackShelf), l = shelfLayout(defaultRackShelf)
    expectValidSolid(m, { min: [-127, 0, 0], max: [127, 103, l.plateH] })
    expect(m.decompose()).toHaveLength(1)
  })
  it('полка лежит на столе: сечение у стола — плита шириной 221.75 плюс низ пластины; выше полки только пластина', async () => {
    const m = await build(defaultRackShelf)
    const aBed = area(m, 2.9), aAbove = area(m, 12)
    expect(aBed - aAbove).toBeCloseTo(221.75 * 100, 0) // плита на глубину 100 (пластина в обоих сечениях одна)
    expect(aAbove).toBeGreaterThan(0)
    const s = m.slice(12), b = s.bounds(); s.delete()
    expect(b.min[1]).toBeCloseTo(0, 6); expect(b.max[1]).toBeCloseTo(3, 6) // над полкой — только пластина толщиной 3
  })
  it('полка по центру: симметрична по X и меняется с зазором', async () => {
    const m = await build(withShelf({ clearance: 1 }))
    const s = m.slice(2.9), b = s.bounds(); s.delete()
    expect(b.min[0]).toBeCloseTo(-127, 1) // пластина шире полки
    expect(area(m, 2.9) - area(m, 12)).toBeCloseTo((222.25 - 2) * 100, 0)
    // полка по центру: сечение над пластиной (y > 3) симметрично
    const top = m.slice(1.5).toPolygons().flat().filter((q) => q[1] > 10), xs = top.map((q) => q[0])
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 6); expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(220.25, 6)
  })
  it('бортики по трём сторонам: кольцо с открытой стороной у пластины, заданных высоты и стенки', async () => {
    const p = withLips(6, 2), m = await build(p), plain = await build(withLips(0))
    const l = shelfLayout(p), D = 100, w = 2
    const ring = l.width * D - (l.width - 2 * w) * (D - w)
    expect(area(m, 3 + 3) - area(plain, 3 + 3)).toBeCloseTo(ring, 0) // середина бортика по высоте
    expect(area(m, 3 + 5.9) - area(plain, 3 + 5.9)).toBeCloseTo(ring, 0)
    expect(area(m, 9.2) - area(plain, 9.2)).toBeCloseTo(0, 6) // выше бортика ничего
    const bb = m.boundingBox(); expect(bb.max[2]).toBeCloseTo(l.plateH, 6) // габарит по высоте задаёт пластина
    expect(m.decompose()).toHaveLength(1)
  })
  it('бортик с высотой 0 — просто плита: объём равен пластине плюс плита', async () => {
    const w = await getWasm(), m = await build(defaultRackShelf), l = shelfLayout(defaultRackShelf)
    const { base } = plateBase(w, 2, true, 3, defaultRackShelf.ears)
    const expected = base.area() * 3 + l.width * 100 * 3
    expect(Math.abs(m.volume() - expected) / expected).toBeLessThan(0.01)
  })
  it('объём с бортиками = пластина + плита + бортики (±1 %)', async () => {
    const w = await getWasm(), p = withLips(8, 2), m = await build(p), l = shelfLayout(p)
    const { base } = plateBase(w, 2, true, 3, p.ears)
    const ring = l.width * 100 - (l.width - 4) * 98
    const expected = base.area() * 3 + l.width * 100 * 3 + ring * 8
    expect(Math.abs(m.volume() - expected) / expected).toBeLessThan(0.01)
  })
  it('отверстия ушей следуют настройкам: из «все» в «по краям» четыре отверстия вместо двенадцати', async () => {
    const all = await build(defaultRackShelf), edges = await build(S({ ears: { ...defaultRackShelf.ears, positions: 'edges' } }))
    const hole = (65 - (4 - Math.PI) * 3.25 * 3.25) * 3
    expect((edges.volume() - all.volume()) / hole).toBeCloseTo(8, 0)
  })
  it('пластина с другим числом юнитов: высота и один кусок', async () => {
    const m = await build(S({ units: 4 })); expectValidSolid(m, { max: [127, 103, 4 * RACK_UNIT - 0.45] }); expect(m.decompose()).toHaveLength(1)
  })
  it('недопустимое состояние: тела нет, ключ ошибки', async () => {
    const r = await buildRackShelf(S({ units: 1, lips: { height: 60, wall: 2 } }))
    expect(r.solid).toBeNull(); expect(r.error).toBe('rack.error.lipHeight')
  })
})
