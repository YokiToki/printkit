import { describe, expect, it } from 'vitest'
import { getWasm } from '../../wasm'
import { expectValidSolid } from '../../testing'
import { topologyOfSolid } from '../../topology/solid'
import { faceRef, edgeRef } from '../../topology/reference'
import { applyPushPull } from './pushPull'

function meshOf(m: any) {
  const g = m.getMesh()
  return { vertProperties: g.vertProperties as Float32Array, triVerts: g.triVerts as Uint32Array }
}

describe('geometry/features/ops/pushPull.ts (44)', () => {
  it('pulls the top of a 20 mm cube by 10 mm', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const res = await applyPushPull(cube, { faces: [faceRef(top)], distance: 10 }, topo)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!, { size: [20, 20, 30] })
    expect(res.solid!.volume()).toBeCloseTo(12000, 0)
  })

  it('pushes the top of a 20 mm cube in by 5 mm', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const res = await applyPushPull(cube, { faces: [faceRef(top)], distance: -5 }, topo)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!, { size: [20, 20, 15] })
    expect(res.solid!.volume()).toBeCloseTo(6000, 0)
  })

  it('keeps the hole when a face with a hole is pulled', async () => {
    const w = await getWasm()
    const plate = w.Manifold.cube([20, 20, 5], true)
    const hole = w.Manifold.cylinder(6, 3, 3, 32, true).translate([0, 0, 0])
    const withHole = plate.subtract(hole)
    const topo = topologyOfSolid(withHole)
    const top = topo.faces.find(
      (f) => f.kind === 'planar' && f.normal?.[2] === 1 && f.area < 390
    )!
    // Грань с отверстием состоит из внешнего контура и отверстия.
    expect(top.loops.length).toBe(2)

    const res = await applyPushPull(withHole, { faces: [faceRef(top)], distance: 8 }, topo)
    expect(res.error).toBeUndefined()
    expectValidSolid(res.solid!, { size: [20, 20, 13] })
    // Объём: плита 2000 минус отверстие π·9·5, плюс вытянутая часть с тем же отверстием.
    const expected = 20 * 20 * 5 - Math.PI * 9 * 5 + (20 * 20 - Math.PI * 9) * 8
    // Отверстие — 32-угольник, поэтому небольшая разница с точной окружностью.
    expect(Math.abs(res.solid!.volume() - expected) / expected).toBeLessThan(0.01)
  })

  it('clamps a push deeper than the material and reports the maximum', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const res = await applyPushPull(cube, { faces: [faceRef(top)], distance: -50 }, topo)
    expect(res.error).toBeUndefined()
    expect(res.warning).toBe('face.warning.clamped')
    expect(res.warningParams?.max).toBeGreaterThan(15)
    expect(res.warningParams?.max).toBeLessThanOrEqual(20)
    expectValidSolid(res.solid!)
  })

  it('refuses a non-planar face', async () => {
    const w = await getWasm()
    const cyl = w.Manifold.cylinder(20, 10, 10, 64, true)
    const topo = topologyOfSolid(cyl)
    const side = topo.faces.find((f) => f.kind === 'cylinder')!

    const res = await applyPushPull(cyl, { faces: [faceRef(side)], distance: 5 }, topo)
    expect(res.error).toBe('face.error.notPlanar')
  })

  it('reports a missing face reference', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    const ref = { ...faceRef(top), point: [999, 999, 999] as [number, number, number] }

    const res = await applyPushPull(cube, { faces: [ref], distance: 5 }, topo)
    expect(res.error).toBe('face.error.missing')
  })

  it('processes several coplanar faces together', async () => {
    const w = await getWasm()
    // Две отдельные верхние грани в одной плоскости (два куба с зазором).
    const a = w.Manifold.cube([20, 20, 20], true).translate([-15, 0, 0])
    const b = w.Manifold.cube([20, 20, 20], true).translate([15, 0, 0])
    const pair = a.add(b)
    const topo = topologyOfSolid(pair)
    const tops = topo.faces.filter((f) => f.kind === 'planar' && f.normal?.[2] === 1)
    expect(tops.length).toBeGreaterThanOrEqual(2)

    const res = await applyPushPull(
      pair,
      { faces: tops.map(faceRef), distance: 5 },
      topo
    )
    expect(res.error).toBeUndefined()
    // Два отдельных тела — genus отрицателен, проверяем статус и объём.
    expect(res.solid!.status()).toBe('NoError')
    expect(res.solid!.volume()).toBeGreaterThan(pair.volume())
  })
})
