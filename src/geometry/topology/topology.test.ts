import { describe, expect, it } from 'vitest'
import { getWasm } from '../wasm'
import { computeTopology } from './index'
import { resolveEdge, resolveFace, faceRef, edgeRef } from './reference'
import type { IndexedMesh } from '../stl-import'

function meshOf(m: any): IndexedMesh {
  const g = m.getMesh()
  return { vertProperties: g.vertProperties as Float32Array, triVerts: g.triVerts as Uint32Array }
}

describe('geometry/topology (44)', () => {
  it('segments a box into 6 planar faces and 12 straight edges', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = computeTopology(meshOf(cube))

    expect(topo.faces).toHaveLength(6)
    for (const f of topo.faces) {
      expect(f.kind).toBe('planar')
      expect(f.residual).toBeLessThan(0.001)
      expect(f.area).toBeCloseTo(400, 1)
    }
    expect(topo.edges).toHaveLength(12)
    for (const e of topo.edges) {
      expect(e.kind).toBe('line')
      expect(e.convex).toBe(true)
      expect(e.length).toBeCloseTo(20, 3)
    }
  })

  it('segments a cylinder into 2 planar caps and 1 cylindrical side', async () => {
    const w = await getWasm()
    const cyl = w.Manifold.cylinder(20, 10, 10, 64, true)
    const topo = computeTopology(meshOf(cyl))

    expect(topo.faces).toHaveLength(3)
    const planar = topo.faces.filter((f) => f.kind === 'planar')
    const cylindrical = topo.faces.filter((f) => f.kind === 'cylinder')
    expect(planar).toHaveLength(2)
    expect(cylindrical).toHaveLength(1)
    expect(cylindrical[0].radius).toBeCloseTo(10, 1)
    // Гранцированный цилиндр: площадь боковой поверхности чуть меньше точной.
    expect(cylindrical[0].area).toBeCloseTo(2 * Math.PI * 10 * 20, -1)

    const circles = topo.edges.filter((e) => e.kind === 'circle')
    expect(circles).toHaveLength(2)
    for (const c of circles) {
      expect(c.radius).toBeCloseTo(10, 1)
      expect(c.convex).toBe(true)
    }
  })

  it('segments a sphere into a single smooth region', async () => {
    const w = await getWasm()
    const sphere = w.Manifold.sphere(10, 32)
    const topo = computeTopology(meshOf(sphere))

    expect(topo.faces).toHaveLength(1)
    expect(topo.faces[0].kind).toBe('sphere')
    expect(topo.faces[0].radius).toBeCloseTo(10, 1)
    expect(topo.edges).toHaveLength(0)
  })

  it('finds a concave edge on an L bracket', async () => {
    const w = await getWasm()
    const a = w.Manifold.cube([10, 20, 10], true).translate([-5, 0, 0])
    const b = w.Manifold.cube([10, 10, 10], true).translate([5, 5, 0])
    const l = a.add(b)
    const topo = computeTopology(meshOf(l))

    expect(topo.faces.every((f) => f.kind === 'planar')).toBe(true)
    const concave = topo.edges.filter((e) => !e.convex)
    expect(concave.length).toBe(1)
    expect(concave[0].length).toBeCloseTo(10, 3)
  })

  it('classifies a rounded rectangle outline into lines and arcs', async () => {
    const w = await getWasm()
    const R = 4
    const halfW = 15
    const halfH = 10
    const pts: [number, number][] = []
    const corners: [number, number, number][] = [
      [halfW - R, halfH - R, 0],
      [-(halfW - R), halfH - R, Math.PI / 2],
      [-(halfW - R), -(halfH - R), Math.PI],
      [halfW - R, -(halfH - R), (3 * Math.PI) / 2],
    ]
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 8; i++) {
        const a = a0 + (Math.PI / 2) * (i / 8)
        pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)])
      }
    }
    const solid = w.CrossSection.ofPolygons([pts]).extrude(20).translate([0, 0, -10])
    const topo = computeTopology(meshOf(solid))

    const lines = topo.edges.filter((e) => e.kind === 'line')
    const circles = topo.edges.filter((e) => e.kind === 'circle')
    // По контуру сверху и снизу: по 4 прямых и 4 дуги, плюс 4 вертикальных ребра.
    expect(lines.length).toBe(8)
    expect(circles.length).toBeGreaterThanOrEqual(8)
    for (const c of circles) expect(c.radius).toBeCloseTo(R, 1)
  })

  it('does not classify a noisy edge as a circle', async () => {
    const w = await getWasm()
    // Половина цилиндра с «шумом» на радиусе.
    const seg = 32
    const pts: [number, number][] = []
    for (let i = 0; i <= seg; i++) {
      const a = (Math.PI * i) / seg
      const r = 10 + (i % 2 === 0 ? 0.35 : -0.35)
      pts.push([r * Math.cos(a), r * Math.sin(a)])
    }
    pts.push([0, 0])
    const solid = w.CrossSection.ofPolygons([pts]).extrude(10).translate([0, 0, -5])
    const topo = computeTopology(meshOf(solid))
    const circles = topo.edges.filter((e) => e.kind === 'circle')
    expect(circles).toHaveLength(0)
  })

  it('resolves a face reference after a small scale change', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = computeTopology(meshOf(cube))
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!
    const ref = faceRef(top)

    const scaled = cube.scale([1.02, 1.02, 1.02])
    const topo2 = computeTopology(meshOf(scaled))
    const res = resolveFace(topo2.faces, ref, topo2.diagonal)
    expect(res.status).toBe('ok')
  })

  it('reports a missing face and an ambiguous face', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = computeTopology(meshOf(cube))
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    // Грань убрана — ссылка не разрешается.
    const removed = topo.faces.filter((f) => f.id !== top.id)
    expect(resolveFace(removed, faceRef(top), topo.diagonal).status).toBe('missing')

    // Два куба с зазором: верхние грани лежат в одной плоскости, точка между
    // ними не принадлежит ни одной — неоднозначность.
    const a = w.Manifold.cube([20, 20, 20], true).translate([-15, 0, 0])
    const b = w.Manifold.cube([20, 20, 20], true).translate([15, 0, 0])
    const pair = a.add(b)
    const topo2 = computeTopology(meshOf(pair))
    const tops = topo2.faces.filter((f) => f.kind === 'planar' && f.normal?.[2] === 1)
    expect(tops.length).toBeGreaterThanOrEqual(2)
    const gapRef = {
      kind: 'face' as const,
      point: [0, 0, 10] as [number, number, number],
      normal: [0, 0, 1] as [number, number, number],
      extent: 20,
    }
    const res = resolveFace(tops, gapRef, topo2.diagonal)
    expect(res.status).toBe('ambiguous')
  })

  it('resolves an edge reference and reports a missing edge', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = computeTopology(meshOf(cube))
    const edge = topo.edges[0]
    const ref = edgeRef(edge)

    const res = resolveEdge(topo.edges, ref, topo.diagonal)
    expect(res.status).toBe('ok')

    const others = topo.edges.filter((e) => e.id !== edge.id)
    expect(resolveEdge(others, ref, topo.diagonal).status).toBe('missing')
  })
})
