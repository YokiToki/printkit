import { describe, expect, it } from 'vitest'
import { getWasm } from '../../geometry/wasm'
import { topologyOfSolid } from '../../geometry/topology/solid'
import {
  chainSegments,
  distanceToSegment,
  faceByTriangle,
  faceOverlayColors,
  faceOverlayVertexColors,
  pickEdgeByScreenDistance,
  projectChain,
  stateOf,
  topologyClickTarget,
  EDGE_COLORS,
  FACE_COLORS,
  FACE_OPACITY,
} from './topologyView'

describe('features/viewport/topologyView.ts (44)', () => {
  it('различает состояния подсветки', () => {
    expect(stateOf(3, null, [])).toBe('normal')
    expect(stateOf(3, 3, [])).toBe('hover')
    expect(stateOf(3, 3, [3])).toBe('selected')
    expect(stateOf(3, null, [1, 3])).toBe('selected')
    // Выбор важнее наведения.
    expect(stateOf(3, 5, [3])).toBe('selected')
  })

  it('красит треугольники по области грани', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const colors = faceOverlayColors(topo, null, [])
    expect(colors.length).toBe(topo.triToFace.length * 4)
    // Верхняя грань — обычное состояние.
    const tri = top.tris[0]
    const hex = FACE_COLORS.normal
    expect(colors[tri * 4]).toBeCloseTo(((hex >> 16) & 0xff) / 255, 6)
    expect(colors[tri * 4 + 3]).toBeCloseTo(FACE_OPACITY.normal, 6)

    // С выбранной гранью — цвет выделения и большая непрозрачность.
    const selected = faceOverlayColors(topo, null, [top.id])
    const hexSel = FACE_COLORS.selected
    expect(selected[tri * 4]).toBeCloseTo(((hexSel >> 16) & 0xff) / 255, 6)
    expect(selected[tri * 4 + 3]).toBeCloseTo(FACE_OPACITY.selected, 6)
  })

  it('повторяет цвет треугольника на все три вершины', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const colors = faceOverlayVertexColors(topo, null, [top.id])
    // Атрибут цвета задаётся на вершину: по четыре значения на каждую.
    expect(colors.length).toBe(topo.triToFace.length * 3 * 4)

    const hex = FACE_COLORS.selected
    const tri = top.tris[0]
    for (let k = 0; k < 3; k++) {
      const o = (tri * 3 + k) * 4
      expect(colors[o]).toBeCloseTo(((hex >> 16) & 0xff) / 255, 6)
      expect(colors[o + 1]).toBeCloseTo(((hex >> 8) & 0xff) / 255, 6)
      expect(colors[o + 2]).toBeCloseTo((hex & 0xff) / 255, 6)
      expect(colors[o + 3]).toBeCloseTo(FACE_OPACITY.selected, 6)
    }
  })

  it('в режиме топологии клик по другому объекту выбирает объект', () => {
    expect(topologyClickTarget('a', 'a')).toBe('topology')
    expect(topologyClickTarget('a', null)).toBe('topology')
    expect(topologyClickTarget('a', 'b')).toBe('object')
  })

  it('находит область грани по номеру треугольника', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const id = faceByTriangle(topo, 0)
    expect(id).not.toBeNull()
    expect(topo.faces.some((f) => f.id === id)).toBe(true)
    expect(faceByTriangle(topo, -1)).toBeNull()
    expect(faceByTriangle(topo, 999999)).toBeNull()
  })

  it('измеряет расстояние до отрезка', () => {
    expect(distanceToSegment({ x: 0, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5)
    expect(distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0)
    // За концом отрезка — расстояние до конца.
    expect(distanceToSegment({ x: 12, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(2)
  })

  it('выбирает ребро по расстоянию на экране', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const chains = topo.edges

    // Проецируем цепочки в экранные координаты: X — вправо, Y — вверх.
    const screenChains = new Map<number, { x: number; y: number }[]>()
    chains.forEach((chain, i) => {
      const pts = chain.points.map((p) => ({ x: p[0], y: p[1] }))
      screenChains.set(chain.id, pts)
      void i
    })

    // Курсор рядом с верхним ребром y = 10.
    const hit = pickEdgeByScreenDistance(chains, screenChains, { x: 5, y: 12 }, 6)
    expect(hit).not.toBeNull()
    const chain = chains.find((c) => c.id === hit)!
    expect(chain.points.every((p) => Math.abs(p[1] - 10) < 1e-6)).toBe(true)

    // Далеко от всех рёбер (ближайшее ребро x = 0 в 5 px) — ничего не выбрано.
    expect(pickEdgeByScreenDistance(chains, screenChains, { x: 5, y: 5 }, 3)).toBeNull()
  })

  it('проецирует цепочку и строит отрезки', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const chain = topo.edges[0]

    const pts = projectChain(chain, (p) => ({ x: p[0], y: p[1] }))
    expect(pts).toHaveLength(chain.points.length)
    expect(pts[0]).toEqual({ x: chain.points[0][0], y: chain.points[0][1] })

    const segs = chainSegments(chain)
    expect(segs.length).toBe((chain.points.length - 1) * 6)
    expect(EDGE_COLORS.selected).toBeDefined()
  })
})
