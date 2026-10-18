import { describe, expect, it } from 'vitest'
import { caseLayout, defaultRackCase, type RackCaseParams } from './case'
import { layoutOpenings, MAX_GROUPS, validGroup, type OpeningGroup, type PlateFrame } from './openings'
import { KEYSTONE, RACK_WINDOW } from './spec'

const dev = (width: number, depth: number, height: number) => ({ width, depth, height })
const C = (o: Partial<RackCaseParams> = {}): RackCaseParams => ({ ...defaultRackCase, device: dev(100, 80, 40), ...o })
const frame = (p: RackCaseParams = C()): PlateFrame => caseLayout(p)
const G = (o: Partial<OpeningGroup> = {}): OpeningGroup => ({ kind: 'keystone', count: 1, perRow: 1, zone: 'right', diameter: 8, ...o })

const f = frame()
const sideX0 = f.outerW / 2 + 3, rail = RACK_WINDOW / 2 - 3
const PX = KEYSTONE.collarW + KEYSTONE.gap, PY = KEYSTONE.collarH + KEYSTONE.gap

describe('проёмы: раскладка групп', () => {
  it('столбец: один в ряд — друг над другом с шагом высоты обоймы, по центру высоты пластины, вплотную к оболочке', () => {
    const { items, warnings } = layoutOpenings([G({ count: 2, perRow: 1 })], f)
    expect(warnings).toEqual([]); expect(items).toHaveLength(2)
    expect(items[0].y - items[1].y).toBeCloseTo(PY, 9)
    expect((items[0].y + items[1].y) / 2).toBeCloseTo(f.centreY, 9)
    items.forEach((o) => expect(o.x).toBeCloseTo(sideX0 + KEYSTONE.collarW / 2, 9))
  })

  it('ряд: все в одном ряду с шагом ширины обоймы, ряд по центру высоты', () => {
    const { items, warnings } = layoutOpenings([G({ count: 2, perRow: 2 })], f)
    expect(warnings).toEqual([])
    expect(items[1].x - items[0].x).toBeCloseTo(PX, 9)
    items.forEach((o) => expect(o.y).toBeCloseTo(f.centreY, 9))
    expect(items[0].x - KEYSTONE.collarW / 2).toBeCloseTo(sideX0, 9)
  })

  it('сетка: шесть по три — две строки по три, строки сверху вниз, блок по центру высоты', () => {
    const wide = frame(C({ device: dev(60, 80, 40) })) // зона шире
    const { items, warnings } = layoutOpenings([G({ count: 6, perRow: 3 })], { ...wide, plateH: 177.35, centreY: 88.675 })
    expect(warnings).toEqual([]); expect(items).toHaveLength(6)
    const ys = [...new Set(items.map((o) => o.y.toFixed(6)))].map(Number).sort((a, b) => b - a)
    expect(ys).toHaveLength(2); expect(ys[0] - ys[1]).toBeCloseTo(PY, 6); expect((ys[0] + ys[1]) / 2).toBeCloseTo(88.675, 6)
    expect(items.slice(0, 3).map((o) => o.y)).toEqual([ys[0], ys[0], ys[0]])
  })

  it('неполная последняя строка центрируется под полными', () => {
    const wide = frame(C({ device: dev(60, 80, 40) }))
    const { items } = layoutOpenings([G({ count: 5, perRow: 3 })], { ...wide, plateH: 177.35, centreY: 88.675 })
    const last = items.slice(3)
    expect(last).toHaveLength(2)
    expect((last[0].x + last[1].x) / 2).toBeCloseTo(items[1].x, 6)
  })

  it('две группы в одной зоне идут одна за другой от оболочки наружу и не пересекаются', () => {
    const { items, warnings } = layoutOpenings([G({ count: 1 }), G({ count: 1 })], f)
    expect(warnings).toEqual([])
    expect(items[0].x).toBeCloseTo(sideX0 + KEYSTONE.collarW / 2, 9)
    expect(items[1].x - items[0].x).toBeCloseTo(PX, 9)
  })

  it('левая зона зеркальна правой', () => {
    const a = layoutOpenings([G({ zone: 'right', count: 2, perRow: 1 })], f).items, b = layoutOpenings([G({ zone: 'left', count: 2, perRow: 1 })], f).items
    a.forEach((o, i) => { expect(b[i].x).toBeCloseTo(-o.x, 9); expect(b[i].y).toBeCloseTo(o.y, 9) })
  })

  it('отверстия: круги с шагом диаметр + зазор, внутри зоны', () => {
    const { items, warnings } = layoutOpenings([G({ kind: 'hole', zone: 'left', count: 2, perRow: 2, diameter: 8 })], f)
    expect(warnings).toEqual([]); expect(items.every((o) => o.kind === 'hole' && o.diameter === 8)).toBe(true)
    expect(items[1].x - items[0].x).toBeCloseTo(10, 9)
    items.forEach((o) => { expect(o.x - 4).toBeGreaterThanOrEqual(-rail - 1e-9); expect(o.x + 4).toBeLessThanOrEqual(-sideX0 + 1e-9) })
  })

  it('группа, которая не помещается, не режется и названа по номеру; следующая группа всё равно ставится', () => {
    const { items, warnings } = layoutOpenings([G({ count: 6, perRow: 1 }), G({ kind: 'hole', count: 1, zone: 'left' })], f)
    expect(warnings).toEqual([{ key: 'rack.warning.fit', setting: 'group1' }])
    expect(items).toHaveLength(1); expect(items[0].group).toBe(1)
  })

  it('слишком узкая зона: широкое устройство не оставляет места', () => {
    const narrow = frame(C({ device: dev(200, 80, 40) }))
    expect(layoutOpenings([G()], narrow).warnings).toEqual([{ key: 'rack.warning.fit', setting: 'group1' }])
  })

  it('зоны сверху и снизу есть, только если пластина выше оболочки', () => {
    expect(layoutOpenings([G({ zone: 'above' })], f).warnings).toEqual([{ key: 'rack.warning.fit', setting: 'group1' }])
    expect(layoutOpenings([G({ zone: 'below' })], f).warnings).toEqual([{ key: 'rack.warning.fit', setting: 'group1' }])
    const tall = frame(C({ units: { auto: false, value: 4 } }))
    const up = layoutOpenings([G({ zone: 'above', count: 3, perRow: 3 })], tall), down = layoutOpenings([G({ zone: 'below', count: 3, perRow: 3 })], tall)
    expect(up.warnings).toEqual([]); expect(down.warnings).toEqual([])
    up.items.forEach((o) => { expect(o.y - KEYSTONE.collarH / 2).toBeGreaterThanOrEqual(tall.centreY + tall.outerH / 2 + 3 - 1e-9); expect(o.y + KEYSTONE.collarH / 2).toBeLessThanOrEqual(tall.plateH - 3 + 1e-9) })
    down.items.forEach((o) => { expect(o.y + KEYSTONE.collarH / 2).toBeLessThanOrEqual(tall.centreY - tall.outerH / 2 - 3 + 1e-9); expect(o.y - KEYSTONE.collarH / 2).toBeGreaterThanOrEqual(3 - 1e-9) })
    expect(up.items.map((o) => o.x)).toEqual([-PX, 0, PX])
  })

  it('группа сверху, задевающая уже размещённую сбоку, не режется', () => {
    const tall = frame(C({ units: { auto: false, value: 4 } }))
    const { items, warnings } = layoutOpenings([G({ count: 3, perRow: 1 }), G({ zone: 'above', count: 7, perRow: 7 })], tall)
    expect(items).toHaveLength(3); expect(warnings).toEqual([{ key: 'rack.warning.fit', setting: 'group2' }])
  })

  it('все проёмы лежат внутри пластины, в пределах реек и вне оболочки', () => {
    const tall = frame(C({ units: { auto: false, value: 5 } }))
    const groups = [G({ count: 4, perRow: 2 }), G({ zone: 'left', count: 3 }), G({ kind: 'hole', zone: 'above', count: 4, perRow: 4 }), G({ zone: 'below', count: 2, perRow: 2 })]
    const { items } = layoutOpenings(groups, tall)
    expect(items.length).toBeGreaterThan(0)
    for (const o of items) {
      const hw = o.kind === 'keystone' ? KEYSTONE.collarW / 2 : o.diameter / 2, hh = o.kind === 'keystone' ? KEYSTONE.collarH / 2 : o.diameter / 2
      expect(Math.abs(o.x) + hw).toBeLessThanOrEqual(rail + 1e-9)
      expect(o.y - hh).toBeGreaterThanOrEqual(3 - 1e-9); expect(o.y + hh).toBeLessThanOrEqual(tall.plateH - 3 + 1e-9)
      const inShell = Math.abs(o.x) - hw < tall.outerW / 2 + 3 - 1e-9 && Math.abs(o.y - tall.centreY) - hh < tall.outerH / 2 + 3 - 1e-9
      expect(inShell).toBe(false)
    }
  })

  it('допустимость группы: целые числа в пределах, диаметр отверстия 2–30; групп не больше шести', () => {
    expect(validGroup(G())).toBe(true); expect(validGroup(G({ count: 0 }))).toBe(false); expect(validGroup(G({ perRow: 1.5 }))).toBe(false)
    expect(validGroup(G({ kind: 'hole', diameter: 1 }))).toBe(false); expect(validGroup(G({ kind: 'hole', diameter: 30 }))).toBe(true)
    expect(validGroup(G({ zone: 'x' as never }))).toBe(false)
    expect(MAX_GROUPS).toBe(6)
  })
})
