// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadPersisted } from '../../app/usePersistedState'
import { defaultRackCase, type RackCaseParams } from '../../geometry/rack/case'
import { generate } from '../../geometry/model'
import { migrateRackCase } from './migrateCase'

const load = () => loadPersisted('rack.case', defaultRackCase, migrateRackCase)

describe('rack.case: сохранение', () => {
  beforeEach(() => localStorage.clear())
  it('круг «сохранить — загрузить» возвращает те же параметры', () => {
    const p: RackCaseParams = { ...defaultRackCase, device: { width: 90, depth: 120, height: 60 }, units: { auto: false, value: 4 }, openings: [{ kind: 'keystone', count: 3, perRow: 3, zone: 'above', diameter: 8 }, { kind: 'hole', count: 2, perRow: 1, zone: 'left', diameter: 6 }], vents: { enabled: true, width: 10, wall: 2, margin: 8 }, window: { enabled: false, lip: 5 } }
    localStorage.setItem('rack.case', JSON.stringify(p))
    expect(load()).toEqual(p)
  })
  it('пустое хранилище и битый JSON дают умолчания', () => {
    expect(load()).toEqual(defaultRackCase)
    localStorage.setItem('rack.case', '{bad')
    expect(load()).toEqual(defaultRackCase)
  })
  it('частичные и испорченные данные нормализуются', () => {
    localStorage.setItem('rack.case', JSON.stringify({ device: { width: 'x', depth: 100 }, openings: [{ kind: 'zzz', count: 2.4, zone: 'nowhere' }, 5, null], ears: { positions: 'none' }, vents: null, units: [] }))
    const p = load()
    expect(p.device).toEqual({ ...defaultRackCase.device, depth: 100 }); expect(p.openings).toEqual([{ kind: 'keystone', count: 2, perRow: 1, zone: 'right', diameter: 8 }, { kind: 'keystone', count: 1, perRow: 1, zone: 'right', diameter: 8 }, { kind: 'keystone', count: 1, perRow: 1, zone: 'right', diameter: 8 }])
    expect(p.ears.positions).toBe('edges'); expect(p.vents).toEqual(defaultRackCase.vents); expect(p.units).toEqual(defaultRackCase.units)
  })
})

describe('rack.case: старые настройки keystones и cable', () => {
  beforeEach(() => localStorage.clear())
  const old = (o: Record<string, unknown>) => { localStorage.setItem('rack.case', JSON.stringify(o)); return load() }
  const k = (count: number, perRow: number, zone: string) => ({ kind: 'keystone', count, perRow, zone, diameter: 8 })
  const h = (zone: string, diameter = 8) => ({ kind: 'hole', count: 1, perRow: 1, zone, diameter })
  it('keystone сбоку — столбец, снизу — ряд; нулевое число — нет группы', () => {
    expect(old({ keystones: { count: 3, side: 'left' } }).openings).toEqual([k(3, 1, 'left')])
    expect(old({ keystones: { count: 3, side: 'below' } }).openings).toEqual([k(3, 3, 'below')])
    expect(old({ keystones: { count: 0, side: 'right' }, cable: { count: 0, diameter: 8 } }).openings).toEqual([])
  })
  it('кабельные отверстия — по одному на свободную сторону, сначала правая; занятая keystone сторона пропускается', () => {
    expect(old({ cable: { count: 1, diameter: 6 } }).openings).toEqual([h('right', 6)])
    expect(old({ cable: { count: 2, diameter: 6 } }).openings).toEqual([h('right', 6), h('left', 6)])
    expect(old({ keystones: { count: 1, side: 'right' }, cable: { count: 1, diameter: 6 } }).openings).toEqual([k(1, 1, 'right'), h('left', 6)])
  })
  it('новая запись openings главнее старых полей; групп не больше шести', () => {
    const g = k(2, 2, 'right')
    expect(old({ openings: [g], keystones: { count: 5, side: 'left' } }).openings).toEqual([g])
    expect(old({ openings: Array.from({ length: 9 }, () => g) }).openings).toHaveLength(6)
  })
  it('старые поля не остаются в записи', () => {
    const p = old({ keystones: { count: 2, side: 'left' }, cable: { count: 1, diameter: 6 } }) as unknown as Record<string, unknown>
    expect('keystones' in p).toBe(false); expect('cable' in p).toBe(false)
  })
})

describe('generate("rackCase")', () => {
  it('одна часть case: габарит по пластине и оболочке', async () => {
    const r = await generate('rackCase', defaultRackCase)
    expect(r.parts.map((p) => p.label)).toEqual(['case'])
    const m = r.parts[0].mesh
    expect(m.min[2]).toBeCloseTo(0, 6); expect(m.max[2]).toBeCloseTo(163.4, 6); expect(r.rack).toEqual({ warnings: [] })
  })
  it('слишком широкое: частей нет, ошибка и превышение', async () => {
    const r = await generate('rackCase', { ...defaultRackCase, device: { ...defaultRackCase.device, width: 230 } })
    expect(r.parts).toEqual([]); expect(r.rack?.error).toBe('rack.error.tooWide'); expect(r.rack?.excess).toBeCloseTo(12.55, 6)
  })
  it('предупреждение о тесноте проходит в rack.warnings', async () => {
    const r = await generate('rackCase', { ...defaultRackCase, openings: [{ kind: 'keystone', count: 6, perRow: 1, zone: 'right', diameter: 8 }] })
    expect(r.rack?.warnings).toEqual([{ key: 'rack.warning.fit', setting: 'group1' }])
  })
})
