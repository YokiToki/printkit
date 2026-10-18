import { describe, expect, it } from 'vitest'
import { caseLayout, defaultRackCase, validateRackCase, type RackCaseParams } from './case'
import { RACK_UNIT, RACK_WINDOW } from './spec'

const C = (o: Partial<RackCaseParams> = {}): RackCaseParams => ({ ...defaultRackCase, ...o })
const dev = (width: number, depth: number, height: number) => ({ width, depth, height })

describe('корпус: юниты и размеры', () => {
  it('устройство 120 мм высотой даёт 3 U: оболочка 124.8, пластина 3 × 44.45 − 0.45', () => {
    const l = caseLayout(C({ device: dev(100, 100, 120) }))
    expect(l.outerH).toBeCloseTo(124.8, 9); expect(l.autoUnits).toBe(3); expect(l.units).toBe(3)
    expect(l.plateH).toBeCloseTo(3 * RACK_UNIT - 0.45, 9)
    expect(l.outerW).toBeCloseTo(104.8, 9); expect(l.shellLen).toBeCloseTo(100.4, 9)
  })
  it.each([[40, 2], [38, 1], [41.6, 2], [83, 2], [84, 3], [170, 4]])('высота %i мм → %i U с допуском', (h, u) => {
    // 1 U вмещает оболочку до 44.45 − 0.45 = 44.0: устройство до 39.2
    expect(caseLayout(C({ device: dev(100, 100, h) })).autoUnits).toBe(u)
  })
  it('без допуска запас 0.45 мм не нужен', () => {
    expect(caseLayout(C({ device: dev(100, 100, 39.65), tolerance: false })).autoUnits).toBe(1)
    expect(caseLayout(C({ device: dev(100, 100, 39.65), tolerance: true })).autoUnits).toBe(2)
  })
  it('заданное число юнитов больше нужного принимается, меньше — поднимается до нужного с пометкой', () => {
    const base = C({ device: dev(100, 100, 40) })
    expect(caseLayout({ ...base, units: { auto: false, value: 4 } })).toMatchObject({ units: 4, raised: false })
    expect(caseLayout({ ...base, units: { auto: false, value: 1 } })).toMatchObject({ units: 2, raised: true })
    expect(caseLayout({ ...base, units: { auto: true, value: 5 } })).toMatchObject({ units: 2, raised: false })
  })
  it('оболочка стоит по центру пластины', () => {
    const l = caseLayout(C({ device: dev(100, 100, 40), units: { auto: false, value: 4 } }))
    expect(l.centreY).toBeCloseTo(l.plateH / 2, 9)
  })
})

describe('корпус: проверка', () => {
  it('умолчания допустимы', () => expect(validateRackCase(defaultRackCase).errors).toEqual([]))
  it('слишком широкое устройство: ошибка несёт превышение в мм', () => {
    const v = validateRackCase(C({ device: dev(220, 100, 40) }))
    expect(v.errors).toEqual(['rack.error.tooWide'])
    expect(v.excess).toBeCloseTo(220 + 4.8 - RACK_WINDOW, 9)
    expect(validateRackCase(C({ device: dev(217.45, 100, 40) })).errors).toEqual([])
  })
  it('слишком высокое: больше 10 U', () => expect(validateRackCase(C({ device: dev(100, 100, 440) })).errors).toEqual(['rack.error.tooTall']))
  it('окно равно устройству минус удвоенная кайма', () => {
    expect(caseLayout(C({ device: dev(120, 100, 40), window: { enabled: true, lip: 3 } })).window).toEqual({ width: 114, height: 34 })
  })
  it('кайма больше половины размера недопустима', () => {
    expect(validateRackCase(C({ device: dev(120, 100, 40), window: { enabled: true, lip: 18.1 } })).errors).toEqual(['rack.error.lip'])
    expect(validateRackCase(C({ device: dev(120, 100, 40), window: { enabled: true, lip: 18 } })).errors).toEqual([])
    expect(validateRackCase(C({ device: dev(120, 100, 40), window: { enabled: false, lip: 99 } })).errors).toEqual([])
  })
  it('значения вне диапазона отвергаются', () => {
    expect(validateRackCase(C({ device: dev(5, 100, 40) })).errors).toContain('rack.error.device')
    expect(validateRackCase(C({ wall: 0.2 })).errors).toContain('rack.error.wall')
    expect(validateRackCase(C({ plateThickness: 20 })).errors).toContain('rack.error.thickness')
    expect(validateRackCase(C({ gap: 9 })).errors).toContain('rack.error.gap')
  })
})

import { buildRackCase } from './case'
import { expectValidSolid } from '../testing'

const area = (m: { slice(z: number): { area(): number; delete(): void } }, z: number) => { const s = m.slice(z); const a = s.area(); s.delete(); return a }
const build = async (p: RackCaseParams) => { const r = await buildRackCase(p); expect(r.error).toBeUndefined(); return r.solid! }

describe('корпус: пластина, оболочка, окно', () => {
  const p = C({ device: dev(100, 80, 120), window: { enabled: true, lip: 3 } })
  it('габарит: 254 в ширину, высота пластины, глубина = толщина + глубина устройства + зазор', async () => {
    const m = await build(p), l = caseLayout(p)
    expectValidSolid(m, { size: [254, l.plateH, 3 + 80 + 0.4], min: [-127, 0, 0], max: [127, l.plateH, 83.4] })
  })
  it('оболочка открыта сзади: сечение у задней кромки — кольцо стенок, равное внешнему минус полость', async () => {
    const m = await build(p), l = caseLayout(p)
    const ring = l.outerW * l.outerH - l.cavityW * l.cavityH
    expect(area(m, 3 + l.shellLen - 0.01)).toBeCloseTo(ring, 2) // у открытой кромки оболочки
    expect(area(m, 3 + l.shellLen / 2)).toBeCloseTo(ring, 2)
  })
  it('полость ровно по устройству плюс зазор с каждой стороны', async () => {
    const m = await build(p), s = m.slice(13), polys = s.toPolygons(); s.delete()
    const inner = polys.map((q) => ({ w: Math.max(...q.map((v) => v[0])) - Math.min(...q.map((v) => v[0])), h: Math.max(...q.map((v) => v[1])) - Math.min(...q.map((v) => v[1])) })).sort((a, b) => a.w - b.w)[0]
    expect(inner.w).toBeCloseTo(100.8, 3); expect(inner.h).toBeCloseTo(120.8, 3)
  })
  it('оболочка по центру пластины по X и по высоте', async () => {
    const m = await build(C({ ...p, units: { auto: false, value: 5 } })), l = caseLayout({ ...p, units: { auto: false, value: 5 } })
    const s = m.slice(13), polys = s.toPolygons(); s.delete()
    const ys = polys.flatMap((q) => q.map((v) => v[1])), xs = polys.flatMap((q) => q.map((v) => v[0]))
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(l.plateH / 2, 6); expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 6)
  })
  it('окно: в лицевой пластине свободно на (устройство − 2 × кайма), с каймой 0 — на всё устройство', async () => {
    const withWin = await build(p), closed = await build(C({ ...p, window: { enabled: false, lip: 3 } })), l = caseLayout(p)
    expect(area(closed, 1.5) - area(withWin, 1.5)).toBeCloseTo(94 * 114 - (4 - Math.PI) * 4 * 1, 0) // окно с радиусом 2: минус четыре угла
    const lip0 = await build(C({ ...p, window: { enabled: true, lip: 0 } }))
    expect(area(closed, 1.5) - area(lip0, 1.5)).toBeCloseTo(100 * 120 - (4 - Math.PI) * 4, 0)
    void l
  })
  it('объём = пластина минус окно и отверстия плюс стенки оболочки (±1 %)', async () => {
    const m = await build(p), l = caseLayout(p)
    const plate = area(m, 1.5) * 3, walls = (l.outerW * l.outerH - l.cavityW * l.cavityH) * l.shellLen
    expect(Math.abs(m.volume() - (plate + walls)) / (plate + walls)).toBeLessThan(0.01)
  })
  it('одна компонента; закрытая пластина и принудительные юниты тоже валидны', async () => {
    for (const q of [p, C({ ...p, window: { enabled: false, lip: 0 } }), C({ ...p, units: { auto: false, value: 6 } })]) {
      const m = await build(q); expect(m.decompose()).toHaveLength(1)
    }
  })
  it('слишком широкое устройство: модели нет, ошибка и превышение', async () => {
    const r = await buildRackCase(C({ device: dev(230, 100, 40) }))
    expect(r.solid).toBeNull(); expect(r.error).toBe('rack.error.tooWide'); expect(r.excess).toBeCloseTo(234.8 - RACK_WINDOW, 6)
  })
})

import { KEYSTONE } from './spec'
import type { OpeningGroup } from './openings'

const G = (o: Partial<OpeningGroup> = {}): OpeningGroup => ({ kind: 'keystone', count: 1, perRow: 1, zone: 'right', diameter: 8, ...o })

describe('корпус: окно по умолчанию и группы проёмов', () => {
  const base = C({ device: dev(100, 80, 40), window: { enabled: true, lip: 3 } })

  it('по умолчанию: окно включено, групп нет', () => {
    expect(defaultRackCase.window.enabled).toBe(true); expect(defaultRackCase.openings).toEqual([])
    expect(validateRackCase(defaultRackCase).warnings).toEqual([])
  })

  it('проверка групп: больше шести и неверные значения — ошибка, не помещающаяся группа — предупреждение', () => {
    expect(validateRackCase(C({ ...base, openings: Array.from({ length: 7 }, () => G()) })).errors).toEqual(['rack.error.openings'])
    expect(validateRackCase(C({ ...base, openings: [G({ count: 0 })] })).errors).toEqual(['rack.error.openings'])
    expect(validateRackCase(C({ ...base, openings: [G({ count: 6 })] })).warnings).toEqual([{ key: 'rack.warning.fit', setting: 'group1' }])
    expect(validateRackCase(C({ ...base, openings: [G({ count: 2 })] })).warnings).toEqual([])
  })

  it('закрытая пластина (окно выключено) остаётся вариантом: нет выреза окна', async () => {
    const closed = await build(C({ ...base, window: { enabled: false, lip: 3 } })), open = await build(base)
    expect(area(closed, 1.5) - area(open, 1.5)).toBeCloseTo(94 * 34 - (4 - Math.PI) * 4, 0)
  })

  it('пластина с гнёздами: одна компонента, проёмы сквозные, обоймы за пластиной', async () => {
    const p = C({ ...base, openings: [G({ count: 2, perRow: 1 })] }), l = caseLayout(p)
    const plain = await build(base), m = await build(p)
    expect(m.decompose()).toHaveLength(1)
    // лицо на z = 0 (после зеркала): вырез в плоскости пластины ≈ два проёма, лицо без выступов
    const cutFace = area(plain, 0.1) - area(m, 0.1)
    expect(cutFace).toBeGreaterThan(2 * (KEYSTONE.openingW * KEYSTONE.openingH) * 0.95)
    expect(cutFace).toBeLessThan(2 * (KEYSTONE.openingW + 0.2) * (KEYSTONE.openingH + 0.2) + 1)
    // обойма даёт материал за пластиной: на глубине 6 мм от лица сечение больше, чем у модели без гнёзд
    expect(area(m, 6)).toBeGreaterThan(area(plain, 6) + 100)
    const bb = m.boundingBox(); expect(bb.min[2]).toBeCloseTo(0, 6)
    void l
  })

  it('объём: пластина плюс обоймы (без захода в пластину) минус проёмы в пластине и в обоймах (±1 %)', async () => {
    const p = C({ ...base, openings: [G({ count: 2, perRow: 1 })] })
    const plain = await build(base), m = await build(p), w = await getWasm()
    const { keystoneSocket } = await import('./keystone')
    const s = keystoneSocket(w, 3)
    const slab = w.Manifold.cube([40, 40, 3], false).translate([-20, -20, 0])
    const inPlate = slab.intersect(s.pocket), inCollar = s.collar!.subtract(s.pocket)
    // обойма заходит на 0.5 мм в пластину: этот слой уже есть в пластине, а проём в нём вычтен как часть проёма в пластине
    const overlap = s.collar!.intersect(slab), overlapNet = overlap.subtract(s.pocket)
    const added = inCollar.volume() - overlapNet.volume(), removed = inPlate.volume()
    const expected = plain.volume() + 2 * (added - removed)
    expect(Math.abs(m.volume() - expected) / expected).toBeLessThan(0.01)
    for (const x of [slab, inPlate, inCollar, overlap, overlapNet, s.collar!, s.pocket]) x.delete()
  })

  it('отверстия режутся как раньше: круг 8 мм, одна компонента', async () => {
    const p = C({ ...base, openings: [G({ kind: 'hole', zone: 'left', count: 1, diameter: 8 })] })
    const plain = await build(base), m = await build(p)
    expect(area(plain, 1.5) - area(m, 1.5)).toBeCloseTo(Math.PI * 16, 0)
    expect(m.decompose()).toHaveLength(1)
  })

  it('сочетание, которое не помещается, не вырезается: модель как без проёмов', async () => {
    const p = C({ ...base, device: dev(200, 80, 40), openings: [G()] })
    const plain = await build(C({ ...p, openings: [] })), m = await build(p)
    expect(m.volume()).toBeCloseTo(plain.volume(), 6)
  })
})

import { ventCutters } from './case'
import { getWasm } from '../wasm'

describe('корпус: соты', () => {
  const vp = C({ device: dev(100, 80, 40), vents: { enabled: true, width: 8, wall: 1.6, margin: 6 } })
  it('три вентиляционных выреза лежат в толще стенок и не заходят на края и пластину', async () => {
    const w = await getWasm(), l = caseLayout(vp), cs = ventCutters(w, vp, l)
    expect(cs).toHaveLength(3)
    const top = l.centreY + l.outerH / 2
    const [t, r, lf] = cs.map((c) => c.boundingBox())
    // верх: по Y от внутренней грани стенки наружу, по X и Z внутри отступа
    expect(t.min[1]).toBeCloseTo(top - 2 + 0, 6); expect(t.max[1]).toBeCloseTo(top + 1, 6)
    expect(t.max[0]).toBeLessThanOrEqual(l.outerW / 2 - 6 + 1e-6); expect(t.min[0]).toBeGreaterThanOrEqual(-(l.outerW / 2 - 6) - 1e-6)
    for (const b of [t, r, lf]) { expect(b.max[2]).toBeLessThanOrEqual(-6 + 1e-6); expect(b.min[2]).toBeGreaterThanOrEqual(-l.shellLen + 6 - 1e-6) }
    // бока: по X от внутренней грани наружу, по Y внутри отступа
    expect(r.min[0]).toBeCloseTo(l.outerW / 2 - 2, 6); expect(r.max[0]).toBeCloseTo(l.outerW / 2 + 1, 6)
    expect(lf.max[0]).toBeCloseTo(-(l.outerW / 2 - 2), 6); expect(lf.min[0]).toBeCloseTo(-(l.outerW / 2 + 1), 6)
    for (const b of [r, lf]) { expect(b.max[1]).toBeLessThanOrEqual(l.centreY + l.outerH / 2 - 6 + 1e-6); expect(b.min[1]).toBeGreaterThanOrEqual(l.centreY - l.outerH / 2 + 6 - 1e-6) }
    cs.forEach((c) => c.delete())
  })
  it('в модели убран ровно объём сот в стенках; полость и пластина не тронуты', async () => {
    const off = await build(C({ ...vp, vents: { ...vp.vents, enabled: false } })), on = await build(vp)
    const w = await getWasm(), l = caseLayout(vp)
    const cs = ventCutters(w, vp, l)
    const inWall = cs.reduce((a, c) => a + (c.volume() * 2) / 3, 0) // толщина выреза 3 мм, из них 2 мм стенка и 1 мм воздух
    expect(off.volume() - on.volume()).toBeGreaterThan(50)
    expect(Math.abs(off.volume() - on.volume() - inWall) / inWall).toBeLessThan(0.01)
    expect(area(on, 1.5)).toBeCloseTo(area(off, 1.5), 6) // пластина та же
    expect(on.decompose()).toHaveLength(1)
    // внутренняя полость не изменилась: на глубине, где вент нет (за отступом от пластины), сечение внутри стенок то же
    const s = on.slice(6), polys = s.toPolygons(); s.delete()
    const inner = polys.map((q) => ({ w: Math.max(...q.map((v) => v[0])) - Math.min(...q.map((v) => v[0])) })).sort((a, b) => a.w - b.w)[0]
    expect(inner.w).toBeCloseTo(100.8, 3)
    cs.forEach((c) => c.delete())
  })
  it('количество сот в верхней стенке совпадает с раскладкой шестиугольников', async () => {
    const { hexCells } = await import('./patterns/hex'), w = await getWasm(), l = caseLayout(vp)
    const box = { width: l.outerW - 12, height: l.shellLen - 12 }
    const n = hexCells(box, { width: 8, wall: 1.6 }).length
    expect(n).toBeGreaterThan(20)
    const [t] = ventCutters(w, vp, l)
    const one = (Math.sqrt(3) / 2) * 64 * 3 // площадь шестиугольника 8 мм между гранями × толщина вырезa 3
    expect(Math.abs(t.volume() - n * one) / (n * one)).toBeLessThan(0.01)
    t.delete()
  })
  it('тонкая стенка сот предупреждает; слишком крупные соты для стенки просто ничего не вырезают', async () => {
    expect(validateRackCase(C({ ...vp, vents: { ...vp.vents, wall: 0.5 } })).warnings).toContainEqual({ key: 'rack.warning.thin', setting: 'ventWall' })
    expect(validateRackCase(vp).warnings).toEqual([])
    const w = await getWasm()
    expect(ventCutters(w, C({ ...vp, vents: { ...vp.vents, width: 40 } }), caseLayout(vp)).length).toBeLessThan(3)
  })
})
