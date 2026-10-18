import { describe, expect, it } from 'vitest'
import { getWasm } from '../wasm'
import { expectValidSolid } from '../testing'
import { keystoneSocket } from './keystone'
import { KEYSTONE } from './spec'

const T = 3 // толщина пластины
const sliceAt = (m: { slice(z: number): { bounds(): { min: number[]; max: number[] }; isEmpty(): boolean } }, depth: number) => m.slice(T - depth)

describe('keystone: размеры гнезда (сняты с образца владельца)', () => {
  it('константы закреплены: проём 14.8 × 16.6, обойма 19.8 × 27.85, глубина 10.4, рампа 5.3, выемка 1.6', () => {
    expect(KEYSTONE).toMatchObject({
      openingW: 14.8, openingH: 16.6, collarW: 19.8, collarH: 27.85, depth: 10.4, rampRise: 5.3, rampTail: 3.3, notchDepth: 1.6, notchFrom: 5.85, notchTo: 8.45,
    })
    expect(KEYSTONE.rampStart).toBeLessThan(KEYSTONE.rampEnd); expect(KEYSTONE.rampEnd).toBeLessThan(KEYSTONE.rampHold)
    // тело модуля по чертежу 14.25 × 16 с защёлкой до 17.3 влезает в проём
    expect(KEYSTONE.openingW).toBeGreaterThan(14.25); expect(KEYSTONE.openingH).toBeGreaterThan(16)
  })
})

describe('keystone: гнездо', () => {
  it('обойма: габарит равен константам, от лица назад на глубину гнезда', async () => {
    const w = await getWasm(); const { collar, pocket } = keystoneSocket(w, T)
    expectValidSolid(collar!, { size: [KEYSTONE.collarW, KEYSTONE.collarH, KEYSTONE.depth - T + 0.5] })
    const bb = collar!.boundingBox()
    expect(bb.min[2]).toBeCloseTo(T - KEYSTONE.depth, 6); expect(bb.min[0]).toBeCloseTo(-KEYSTONE.collarW / 2, 6); expect(bb.min[1]).toBeCloseTo(-KEYSTONE.collarH / 2, 6)
    collar!.delete(); pocket.delete()
  })

  it('проём на лице имеет измеренные ширину и высоту (без зазора) и сдвинут вниз относительно центра обоймы', async () => {
    const w = await getWasm(); const { collar, pocket } = keystoneSocket(w, T, 0)
    const b = sliceAt(pocket, 0.2).bounds()
    expect(b.max[0] - b.min[0]).toBeCloseTo(KEYSTONE.openingW, 4)
    expect(b.max[1] - b.min[1]).toBeCloseTo(KEYSTONE.openingH, 4)
    expect((b.max[1] + b.min[1]) / 2).toBeCloseTo(-KEYSTONE.collarOffsetY, 4)
    collar!.delete(); pocket.delete()
  })

  it('зазор расширяет проём на заданную величину по ширине и высоте', async () => {
    const w = await getWasm(); const { collar, pocket } = keystoneSocket(w, T, 0.4)
    const b = sliceAt(pocket, 0.2).bounds()
    expect(b.max[0] - b.min[0]).toBeCloseTo(KEYSTONE.openingW + 0.4, 4); expect(b.max[1] - b.min[1]).toBeCloseTo(KEYSTONE.openingH + 0.4, 4)
    collar!.delete(); pocket.delete()
  })

  it('рампа растёт на верхней кромке до 5.3 мм и отходит до уступа 3.3; выемка 1.6 мм снизу только в своём диапазоне', async () => {
    const w = await getWasm(); const { collar, pocket } = keystoneSocket(w, T, 0)
    const top0 = -KEYSTONE.collarOffsetY + KEYSTONE.openingH / 2, bot0 = -KEYSTONE.collarOffsetY - KEYSTONE.openingH / 2
    const at = (d: number) => sliceAt(pocket, d).bounds()
    expect(at(0.3).max[1]).toBeCloseTo(top0, 4) // до начала рампы
    expect(at(KEYSTONE.rampEnd + 0.1).max[1]).toBeCloseTo(top0 + KEYSTONE.rampRise, 4)
    expect(at(4).max[1]).toBeGreaterThan(top0 + 2); expect(at(4).max[1]).toBeLessThan(top0 + KEYSTONE.rampRise)
    expect(at(9).max[1]).toBeCloseTo(top0 + KEYSTONE.rampTail, 4)
    expect(at(4).min[1]).toBeCloseTo(bot0, 4) // выемки ещё нет
    expect(at(7).min[1]).toBeCloseTo(bot0 - KEYSTONE.notchDepth, 4)
    expect(at(9).min[1]).toBeCloseTo(bot0, 4) // выемка кончилась
    collar!.delete(); pocket.delete()
  })

  it('вырез сквозной: на самом дне обоймы проём ещё есть, вокруг остаётся замкнутая стенка не тоньше 1.8 мм', async () => {
    const w = await getWasm(); const { collar, pocket } = keystoneSocket(w, T)
    expect(sliceAt(pocket, KEYSTONE.depth - 0.05).isEmpty()).toBe(false)
    const wall = collar!.subtract(pocket)
    expectValidSolid(wall); expect(wall.decompose()).toHaveLength(1)
    expect(wall.genus()).toBe(1) // кольцо вокруг проёма
    const c = collar!.boundingBox(), pk = pocket.boundingBox()
    const min = Math.min(pk.min[0] - c.min[0], c.max[0] - pk.max[0], pk.min[1] - c.min[1], c.max[1] - pk.max[1])
    expect(min).toBeGreaterThanOrEqual(1.8 - 1e-6)
    wall.delete(); collar!.delete(); pocket.delete()
  })

  it('обойма с пластиной и вырезом — одно тело', async () => {
    const w = await getWasm(); const { Manifold, CrossSection } = w
    const { collar, pocket } = keystoneSocket(w, T)
    const plate = Manifold.extrude(CrossSection.square([40, 40], true), T)
    const solid = plate.add(collar!).subtract(pocket)
    expectValidSolid(solid); expect(solid.decompose()).toHaveLength(1)
    // сквозное отверстие через пластину: на лицевой плоскости пластины сечение с дыркой
    expect(solid.slice(T - 0.2).toPolygons().length).toBeGreaterThanOrEqual(2)
    for (const m of [plate, solid, collar!, pocket]) m.delete()
  })

  it('пластина толще глубины гнезда: обоймы нет, проём всё равно режется', async () => {
    const w = await getWasm(); const { collar, pocket } = keystoneSocket(w, KEYSTONE.depth + 1)
    expect(collar).toBeNull(); expect(pocket.isEmpty()).toBe(false); pocket.delete()
  })
})
