// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadPersisted } from '../../app/usePersistedState'
import { defaultRackShelf, type RackShelfParams } from '../../geometry/rack/shelf'
import { generate } from '../../geometry/model'
import { migrateRackShelf } from './migrateShelf'

const load = () => loadPersisted('rack.shelf', defaultRackShelf, migrateRackShelf)

describe('rack.shelf: сохранение', () => {
  beforeEach(() => localStorage.clear())
  it('круг «сохранить — загрузить» возвращает те же параметры', () => {
    const p: RackShelfParams = { ...defaultRackShelf, units: 3, thickness: 4, shelf: { depth: 150, thickness: 4, clearance: 0.5 }, lips: { height: 8, wall: 2.4 }, ears: { positions: 'outer', shape: 'round', size: 7, slotLength: 10 } }
    localStorage.setItem('rack.shelf', JSON.stringify(p))
    expect(load()).toEqual(p)
  })
  it('пустое хранилище и битый JSON дают умолчания', () => {
    expect(load()).toEqual(defaultRackShelf)
    localStorage.setItem('rack.shelf', '{bad')
    expect(load()).toEqual(defaultRackShelf)
  })
  it('частичные и испорченные данные нормализуются', () => {
    localStorage.setItem('rack.shelf', JSON.stringify({ units: 3.4, shelf: { depth: 'x', clearance: 0.5 }, ears: { positions: 'none' }, lips: null }))
    const p = load()
    expect(p.units).toBe(3); expect(p.shelf).toEqual({ ...defaultRackShelf.shelf, clearance: 0.5 }); expect(p.lips).toEqual(defaultRackShelf.lips); expect(p.ears.positions).toBe('edges')
  })
})

describe('generate("rackShelf")', () => {
  it('одна часть shelf в положении печати: габарит и ошибок нет', async () => {
    const r = await generate('rackShelf', defaultRackShelf)
    expect(r.parts.map((q) => q.label)).toEqual(['shelf'])
    const m = r.parts[0].mesh
    expect(m.min[2]).toBeCloseTo(0, 6); expect(m.max[1]).toBeCloseTo(103, 6); expect(m.max[0]).toBeCloseTo(127, 6); expect(m.max[2]).toBeCloseTo(88.45, 6)
    expect(r.rack).toEqual({ warnings: [] })
  })
  it('недопустимое состояние: частей нет, ключ ошибки', async () => {
    const r = await generate('rackShelf', { ...defaultRackShelf, units: 1, lips: { height: 60, wall: 2 } })
    expect(r.parts).toEqual([]); expect(r.rack?.error).toBe('rack.error.lipHeight')
  })
})
