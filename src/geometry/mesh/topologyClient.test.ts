import { describe, expect, it } from 'vitest'
import { getWasm } from '../wasm'
import {
  MAX_TOPOLOGY_TRIANGLES,
  MeshClient,
  TopologyLimitError,
} from './meshClient'
import type { IndexedMesh } from '../stl-import'

function meshOfSolid(m: any): IndexedMesh {
  const g = m.getMesh()
  return {
    vertProperties: g.vertProperties as Float32Array,
    triVerts: g.triVerts as Uint32Array,
  }
}

describe('geometry/mesh — задание topology (44)', () => {
  it('считает грани и рёбра куба', async () => {
    const w = await getWasm()
    const client = new MeshClient(() => null)
    const topo = await client.topologyOf(meshOfSolid(w.Manifold.cube([20, 20, 20], true)))

    expect(topo.faces).toHaveLength(6)
    expect(topo.faces.every((f) => f.kind === 'planar')).toBe(true)
    expect(topo.edges).toHaveLength(12)
    expect(topo.edges.every((e) => e.kind === 'line')).toBe(true)
    expect(topo.diagonal).toBeCloseTo(Math.hypot(20, 20, 20), 3)
  })

  it('кэширует топологию по хэшу сетки', async () => {
    const w = await getWasm()
    const client = new MeshClient(() => null)
    const mesh = meshOfSolid(w.Manifold.cube([20, 20, 20], true))

    const first = await client.topologyOf(mesh)
    const second = await client.topologyOf(mesh)
    // Второй запрос отдаёт тот же объект — пересчёта не было.
    expect(second).toBe(first)

    // Другая форма — другой хэш, пересчёт происходит.
    const other = await client.topologyOf(meshOfSolid(w.Manifold.cube([30, 30, 30], true)))
    expect(other).not.toBe(first)
    expect(other.faces).toHaveLength(6)
  })

  it('не портит сетку вызывающего кода', async () => {
    const w = await getWasm()
    const client = new MeshClient(() => null)
    const mesh = meshOfSolid(w.Manifold.cube([20, 20, 20], true))
    const before = mesh.vertProperties.slice()

    await client.topologyOf(mesh)
    expect(mesh.vertProperties.length).toBe(before.length)
    expect(Array.from(mesh.vertProperties)).toEqual(Array.from(before))
  })

  it('сообщает о прогрессе', async () => {
    const w = await getWasm()
    const client = new MeshClient(() => null)
    const seen: number[] = []
    await client.topologyOf(meshOfSolid(w.Manifold.cube([20, 20, 20], true)), undefined, (f) =>
      seen.push(f)
    )
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]).toBe(1)
    // Доли идут по возрастанию.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1])
    }
  })

  it('отказывается от слишком большой сетки с понятным сообщением', async () => {
    const client = new MeshClient(() => null)
    const tris = MAX_TOPOLOGY_TRIANGLES + 1
    const mesh: IndexedMesh = {
      vertProperties: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      triVerts: new Uint32Array(tris * 3),
    }
    for (let i = 0; i < tris * 3; i++) mesh.triVerts[i] = i % 3

    await expect(client.topologyOf(mesh)).rejects.toBeInstanceOf(TopologyLimitError)
    try {
      await client.topologyOf(mesh)
    } catch (e) {
      const err = e as TopologyLimitError
      expect(err.message).toBe('topology.error.tooManyTriangles')
      expect(err.count).toBe(tris)
      expect(err.limit).toBe(MAX_TOPOLOGY_TRIANGLES)
    }
  })

  it('уважает порог резкости ребра', async () => {
    const w = await getWasm()
    const client = new MeshClient(() => null)
    const mesh = meshOfSolid(w.Manifold.cube([20, 20, 20], true))

    const normal = await client.topologyOf(mesh, { edgeAngleDeg: 30 })
    expect(normal.edges).toHaveLength(12)
    // Порог выше двугранного угла куба: рёбер не остаётся.
    const blunt = await client.topologyOf(mesh, { edgeAngleDeg: 120 })
    expect(blunt.edges).toHaveLength(0)
  })
})
