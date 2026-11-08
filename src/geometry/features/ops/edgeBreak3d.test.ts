import { describe, expect, it } from 'vitest'
import { getWasm } from '../../wasm'
import { expectValidSolid } from '../../testing'
import { topologyOfSolid } from '../../topology/solid'
import { edgeRef } from '../../topology/reference'
import type { EdgeChain } from '../../topology'
import { applyEdgeBreak } from './edgeBreak3d'

function topEdgeX(chains: EdgeChain[]): EdgeChain {
  const found = chains.find(
    (c) =>
      c.kind === 'line' &&
      Math.abs(c.points[0][2] - 10) < 0.01 &&
      Math.abs(c.points[c.points.length - 1][2] - 10) < 0.01 &&
      Math.abs(c.points[0][1] - 10) < 0.01
  )
  if (!found) throw new Error('top edge not found')
  return found
}

describe('geometry/features/ops/edgeBreak3d.ts (44)', () => {
  it('chamfers one top edge of a 20 mm cube by 2 mm', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const edge = topEdgeX(topo.edges)

    const res = await applyEdgeBreak(cube, { edges: [edgeRef(edge)], kind: 'chamfer', size: 2 }, topo)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!)
    // Треугольный призма 2×2/2 = 2 мм² на длине 20 мм.
    expect(res.solid!.volume()).toBeCloseTo(8000 - 40, 1)
  })

  it('fillets one top edge of a 20 mm cube with radius 3 mm', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const edge = topEdgeX(topo.edges)

    const res = await applyEdgeBreak(cube, { edges: [edgeRef(edge)], kind: 'fillet', size: 3 }, topo)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!)
    const expected = 8000 - (1 - Math.PI / 4) * 9 * 20
    expect(res.solid!.volume()).toBeCloseTo(expected, 0)
  })

  it('chamfers the top rim of a 20 mm cylinder by 1 mm', async () => {
    const w = await getWasm()
    const cyl = w.Manifold.cylinder(20, 10, 10, 64, true)
    const topo = topologyOfSolid(cyl)
    const rim = topo.edges.find((e) => e.kind === 'circle' && (e.centre?.[2] ?? 0) > 0)!

    const res = await applyEdgeBreak(cyl, { edges: [edgeRef(rim)], kind: 'chamfer', size: 1 }, topo)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!)
    // Верхняя грань становится Ø18.
    const top = res.solid!.slice(9.999)
    expect(top.area()).toBeCloseTo(Math.PI * 81, 0)
  })

  it('fillets the rim of a through hole', async () => {
    const w = await getWasm()
    const block = w.Manifold.cube([30, 30, 20], true)
    const hole = w.Manifold.cylinder(30, 5, 5, 48, true)
    const drilled = block.subtract(hole)
    const topo = topologyOfSolid(drilled)
    const rim = topo.edges.find(
      (e) => e.kind === 'circle' && (e.radius ?? 0) < 8 && (e.centre?.[2] ?? 0) > 0
    )!
    expect(rim).toBeDefined()
    // Устье отверстия — выпуклый угол материала (как внешний угол угла блока).
    expect(rim.convex).toBe(true)

    const res = await applyEdgeBreak(drilled, { edges: [edgeRef(rim)], kind: 'fillet', size: 2 }, topo)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!)
    // Скругление срезает кромку: материала становится меньше, отверстие шире.
    expect(res.solid!.volume()).toBeLessThan(drilled.volume())
  })

  it('chamfers a concave edge and adds material', async () => {
    const w = await getWasm()
    const a = w.Manifold.cube([10, 20, 10], true).translate([-5, 0, 0])
    const b = w.Manifold.cube([10, 10, 10], true).translate([5, 5, 0])
    const l = a.add(b)
    const topo = topologyOfSolid(l)
    const concave = topo.edges.find((e) => !e.convex)!
    expect(concave).toBeDefined()

    const res = await applyEdgeBreak(l, { edges: [edgeRef(concave)], kind: 'chamfer', size: 2 }, topo)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!)
    expect(res.solid!.volume()).toBeCloseTo(3000 + 20, 1)
  })

  it('fillets the four top edges of a cube into a valid closed solid', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const topEdges = topo.edges.filter(
      (e) =>
        e.kind === 'line' &&
        e.points.every((p) => Math.abs(p[2] - 10) < 0.01) &&
        e.points.some((p) => Math.abs(p[1] - 10) < 0.01 || Math.abs(p[1] + 10) < 0.01)
    )
    expect(topEdges.length).toBe(4)

    const res = await applyEdgeBreak(
      cube,
      { edges: topEdges.map(edgeRef), kind: 'fillet', size: 3 },
      topo
    )
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!)
    expect(res.solid!.volume()).toBeLessThan(8000)
  })

  it('refuses a radius larger than half the adjacent face', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const edge = topEdgeX(topo.edges)

    const res = await applyEdgeBreak(cube, { edges: [edgeRef(edge)], kind: 'fillet', size: 30 }, topo)
    expect(res.error).toBe('edge.error.tooLarge')
    expect(res.errorParams?.max).toBeGreaterThan(0)
    expect(res.errorParams?.max).toBeLessThanOrEqual(20)
  })

  it('refuses a free-form edge', async () => {
    const w = await getWasm()
    // Прямоугольник с «волнистым» верхним ребром: ни прямая, ни окружность.
    // Верхняя сторона слегка волнистая: повороты меньше 30°, поэтому вертикальные
    // рёбра не считаются острыми и волнистый контур остаётся одной цепочкой.
    const pts: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 10],
      [15, 9.7],
      [10, 10.2],
      [5, 9.5],
      [0, 10],
    ]
    const solid = w.CrossSection.ofPolygons([pts]).extrude(10).translate([0, 0, -5])
    const topo = topologyOfSolid(solid)
    const free = topo.edges.find((e) => e.kind === 'free')
    expect(free).toBeDefined()

    const res = await applyEdgeBreak(solid, { edges: [edgeRef(free!)], kind: 'chamfer', size: 1 }, topo)
    expect(res.error).toBe('edge.error.notLineOrCircle')
  })

  it('reports a missing edge reference', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const edge = topEdgeX(topo.edges)
    const ref = { ...edgeRef(edge), p0: [999, 999, 999] as [number, number, number] }

    const res = await applyEdgeBreak(cube, { edges: [ref], kind: 'chamfer', size: 1 }, topo)
    expect(res.error).toBe('edge.error.missing')
  })
})
