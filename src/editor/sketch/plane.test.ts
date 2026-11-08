import { describe, expect, it } from 'vitest'
import { getWasm } from '../../geometry/wasm'
import { topologyOfSolid } from '../../geometry/topology/solid'
import { faceRef } from '../../geometry/topology/reference'
import {
  facePlaneFrame,
  frameForFace,
  isFacePlane,
  planeFrame,
  projectChains,
  resolveFacePlane,
  type FacePlaneDefinition,
} from './plane'

describe('editor/sketch/plane.ts — эскиз по грани (44)', () => {
  it('строит кадр для грани куба: нормаль грани и её самая длинная прямая', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const frame = frameForFace(top, topo)
    expect(frame).not.toBeNull()
    expect(frame!.normal[2]).toBeCloseTo(1, 6)
    // Начало — в центре грани.
    expect(frame!.origin[0]).toBeCloseTo(0, 6)
    expect(frame!.origin[1]).toBeCloseTo(0, 6)
    expect(frame!.origin[2]).toBeCloseTo(10, 6)
    // Ось X лежит в плоскости грани и единичная.
    expect(frame!.xDir[2]).toBeCloseTo(0, 6)
    expect(Math.hypot(...frame!.xDir)).toBeCloseTo(1, 6)
    // Ось X совпадает с направлением одного из рёбер верхней грани.
    const topEdges = topo.edges.filter(
      (e) => e.faces[0] === top.id || e.faces[1] === top.id
    )
    expect(topEdges.length).toBe(4)
    const dirs = topEdges.map((e) => e.direction!)
    const match = dirs.some(
      (d) => Math.abs(d[0] * frame!.xDir[0] + d[1] * frame!.xDir[1] + d[2] * frame!.xDir[2]) > 0.999
    )
    expect(match).toBe(true)
  })

  it('проецирует точку выбора на плоскость грани', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const frame = frameForFace(top, topo, [3, -4, 25])!
    expect(frame.origin[0]).toBeCloseTo(3, 6)
    expect(frame.origin[1]).toBeCloseTo(-4, 6)
    // Точка выбора лежит выше грани — проекция опускает её на плоскость.
    expect(frame.origin[2]).toBeCloseTo(10, 6)
  })

  it('не строит кадр для криволинейной грани', async () => {
    const w = await getWasm()
    const sphere = w.Manifold.sphere(10, 32)
    const topo = topologyOfSolid(sphere)
    expect(frameForFace(topo.faces[0], topo)).toBeNull()
  })

  it('пере-разрешает привязку и помечает эскиз отсоединённым, если грани больше нет', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const frame = frameForFace(top, topo)!
    const def: FacePlaneDefinition = { face: faceRef(top), frame }

    const ok = resolveFacePlane(def, topo)
    expect(ok.detached).toBe(false)
    expect(ok.definition.frame.origin[2]).toBeCloseTo(10, 6)

    // Ссылка на несуществующую грань: эскиз остаётся на месте, но отсоединён.
    const broken: FacePlaneDefinition = {
      face: { kind: 'face', point: [500, 500, 500], normal: [0, 0, 1], extent: 20 },
      frame,
    }
    const res = resolveFacePlane(broken, topo)
    expect(res.detached).toBe(true)
    expect(res.definition.frame).toBe(frame)
  })

  it('пересчитывает кадр, если плоскость грани уехала', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    const frame = frameForFace(top, topo)!

    // Кадр от грани, поднятой на 10 мм: нормаль та же, но плоскость смещена.
    const shifted = topologyOfSolid(cube.translate([0, 0, 10]))
    const shiftedTop = shifted.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    const def: FacePlaneDefinition = { face: faceRef(shiftedTop), frame }
    const res = resolveFacePlane(def, shifted)
    expect(res.detached).toBe(false)
    expect(res.definition.frame.origin[2]).toBeCloseTo(20, 6)
  })

  it('проецирует рёбра грани в эскиз: отрезки с совпадающими концами', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    const frame = facePlaneFrame(frameForFace(top, topo)!)
    const boundary = topo.edges.filter((e) => e.faces[0] === top.id || e.faces[1] === top.id)

    const projected = projectChains(boundary, frame)
    expect(projected.curves).toHaveLength(4)
    expect(projected.curves.every((c) => c.kind === 'line')).toBe(true)
    // Четыре угловые точки, концы отрезков совпадают.
    expect(projected.points).toHaveLength(4)
    const used = new Set<number>()
    for (const c of projected.curves) {
      if (c.kind !== 'line') continue
      expect(c.a).not.toBe(c.b)
      used.add(c.a)
      used.add(c.b)
    }
    expect(used.size).toBe(4)
  })

  it('проецирует окружность в окружность', async () => {
    const w = await getWasm()
    const cyl = w.Manifold.cylinder(20, 10, 10, 64, true)
    const topo = topologyOfSolid(cyl)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    const frame = facePlaneFrame(frameForFace(top, topo)!)
    const rim = topo.edges.find((e) => e.kind === 'circle')!

    const projected = projectChains([rim], frame)
    const circles = projected.curves.filter((c) => c.kind === 'circle')
    expect(circles).toHaveLength(1)
    expect((circles[0] as { r: number }).r).toBeCloseTo(10, 3)
  })

  it('склеивает совпадающие концы разных цепочек', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    const frame = facePlaneFrame(frameForFace(top, topo)!)
    const boundary = topo.edges.filter((e) => e.faces[0] === top.id || e.faces[1] === top.id)

    // Две цепочки с общим концом дают одну общую точку.
    const pair = boundary.slice(0, 2)
    const projected = projectChains(pair, frame)
    expect(projected.points).toHaveLength(3)
    const ids = projected.curves.flatMap((c) => (c.kind === 'line' ? [c.a, c.b] : []))
    expect(new Set(ids).size).toBe(3)
  })

  it('различает базовую и привязанную плоскости', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    const frame = frameForFace(top, topo)!

    expect(isFacePlane({ base: 'XY', offset: 0 })).toBe(false)
    const facePlane = { face: faceRef(top), frame }
    expect(isFacePlane(facePlane)).toBe(true)

    const f = planeFrame(facePlane)
    expect(f.normal[2]).toBeCloseTo(1, 6)
    const base = planeFrame({ base: 'XY', offset: 5 })
    expect(base.origin[2]).toBe(5)
    expect(base.normal[2]).toBe(1)
  })
})
