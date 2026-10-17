// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { loadPersisted } from '../../app/usePersistedState'
import { defaultRackShelf, type RackShelfParams } from '../../geometry/rack/shelf'
import { generate } from '../../geometry/model'
import { migrateRackShelf } from './migrateShelf'
import { layout } from '../../export/build'
import { defaultExportSettings } from '../../export/settings'

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
  it('экспорт без переворота: габарит 254 × 103 × 88.45 (с поворотом на столе допустим), нижняя точка z = 0', async () => {
    const r = await generate('rackShelf', defaultRackShelf)
    const { placed } = layout(r.parts, { ...defaultExportSettings, printerId: 'x1c', margin: 5, gap: 6 })
    const sz = [...placed[0].mesh.size]
    expect(sz[2]).toBeCloseTo(88.45, 3); expect(Math.max(sz[0], sz[1])).toBeCloseTo(254, 3); expect(Math.min(sz[0], sz[1])).toBeCloseTo(103, 3)
    let mn = Infinity; for (let i = 2; i < placed[0].mesh.positions.length; i += 3) mn = Math.min(mn, placed[0].mesh.positions[i])
    expect(mn).toBeCloseTo(0, 6)
  })
})
