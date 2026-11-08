import { describe, expect, it } from 'vitest'
import { getWasm } from '../geometry/wasm'
import { evaluateStack } from '../geometry/features/evaluate'
import { topologyOfSolid } from '../geometry/topology/solid'
import { faceRef, edgeRef } from '../geometry/topology/reference'
import { migrateScene } from './sceneStore'
import { migrateStack, normalizeOp, opSummary, updateOp, isKnownOpKind } from './stack'

describe('editor/stack.ts — операции граней и рёбер (44)', () => {
  it('нормализует ссылки на грани и рёбра', () => {
    const op = normalizeOp({
      id: 'pp-1',
      kind: 'pushPull',
      enabled: true,
      params: {
        faces: [{ kind: 'face', point: [0, 0, 10], normal: [0, 0, 1], extent: 20 }],
        distance: 3,
      },
    })
    expect(op.kind).toBe('pushPull')
    const p = (op as any).params
    expect(p.faces).toHaveLength(1)
    expect(p.faces[0].point).toEqual([0, 0, 10])
    expect(p.distance).toBe(3)

    const eb = normalizeOp({
      id: 'eb-1',
      kind: 'edgeBreak',
      enabled: true,
      params: {
        edges: [{ kind: 'edge', shape: 'line', p0: [0, 0, 0], p1: [20, 0, 0] }],
        kind: 'fillet',
        size: 2,
      },
    })
    expect(eb.kind).toBe('edgeBreak')
    const e = (eb as any).params
    expect(e.edges).toHaveLength(1)
    expect(e.edges[0].shape).toBe('line')
    expect(e.kind).toBe('fillet')
  })

  it('выбрасывает битые ссылки, но сохраняет операцию', () => {
    const op = normalizeOp({
      id: 'pp-2',
      kind: 'pushPull',
      enabled: true,
      params: { faces: [{ kind: 'face' }, null, 'x'], distance: 1 },
    })
    expect((op as any).params.faces).toEqual([])
    expect(isKnownOpKind('pushPull')).toBe(true)
    expect(isKnownOpKind('edgeBreak')).toBe(true)
  })

  it('переживает круговой рейс через migrateScene', () => {
    const raw = {
      schema: 1,
      objects: [
        {
          id: 'obj-1',
          name: 'Box',
          visible: true,
          locked: false,
          color: 0,
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [
            {
              id: 'pp-1',
              kind: 'pushPull',
              enabled: true,
              params: {
                faces: [{ kind: 'face', point: [0, 0, 10], normal: [0, 0, 1], extent: 20 }],
                distance: 5,
              },
            },
            {
              id: 'eb-1',
              kind: 'edgeBreak',
              enabled: true,
              params: {
                edges: [{ kind: 'edge', shape: 'line', p0: [0, 0, 10], p1: [20, 0, 10] }],
                kind: 'chamfer',
                size: 1,
              },
            },
          ],
        },
      ],
      sketches: [],
    }

    const migrated = migrateScene(raw)
    const stack = migrated.objects[0].stack!
    expect(stack).toHaveLength(2)
    expect(stack[0].kind).toBe('pushPull')
    expect((stack[0] as any).params.distance).toBe(5)
    expect((stack[0] as any).params.faces[0].point).toEqual([0, 0, 10])
    expect(stack[1].kind).toBe('edgeBreak')
    expect((stack[1] as any).params.edges[0].p1).toEqual([20, 0, 10])

    // Второй проход не должен ничего менять.
    const second = migrateScene(JSON.parse(JSON.stringify(migrated)))
    expect(JSON.stringify(second.objects[0].stack)).toBe(JSON.stringify(stack))
  })

  it('сохраняет ссылки при правке размера', () => {
    const stack = migrateStack([
      {
        id: 'eb-1',
        kind: 'edgeBreak',
        enabled: true,
        params: {
          edges: [{ kind: 'edge', shape: 'line', p0: [0, 0, 10], p1: [20, 0, 10] }],
          kind: 'fillet',
          size: 1,
        },
      },
    ])
    const updated = updateOp(stack, 'eb-1', { params: { size: 4 } } as any)
    expect((updated[0] as any).params.size).toBe(4)
    expect((updated[0] as any).params.edges).toHaveLength(1)
    expect((updated[0] as any).params.edges[0].p0).toEqual([0, 0, 10])
  })

  it('даёт сводку строки стека', () => {
    const sum = opSummary({
      id: 'pp-1',
      kind: 'pushPull',
      enabled: true,
      params: { faces: [], distance: 2 },
    } as any)
    expect(sum.key).toBe('stack.summary.pushPull')
    expect(sum.params?.distance).toBe('+2 mm')

    const sum2 = opSummary({
      id: 'eb-1',
      kind: 'edgeBreak',
      enabled: true,
      params: { edges: [], kind: 'fillet', size: 3 },
    } as any)
    expect(sum2.key).toBe('stack.summary.edgeBreak.fillet')
    expect(sum2.params?.size).toBe('3 mm')
  })

  it('применяет pushPull к кубу в стеке', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const top = topo.faces.find((f) => f.kind === 'planar' && f.normal?.[2] === 1)!

    const res = await evaluateStack(
      cube,
      [
        {
          id: 'pp-1',
          kind: 'pushPull',
          enabled: true,
          params: { faces: [faceRef(top)], distance: 10 },
        },
      ],
      null,
      { w }
    )
    expect(res.failedReason).toBeUndefined()
    expect(res.solid!.volume()).toBeCloseTo(12000, 0)
  })

  it('останавливает стек на битой ссылке и помечает следующие операции', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)

    const res = await evaluateStack(
      cube,
      [
        {
          id: 'pp-1',
          kind: 'pushPull',
          enabled: true,
          params: {
            faces: [{ kind: 'face', point: [999, 999, 999], normal: [0, 0, 1], extent: 20 }],
            distance: 5,
          },
        },
        {
          id: 'pp-2',
          kind: 'pushPull',
          enabled: true,
          params: { faces: [], distance: 5 },
        },
      ],
      null,
      { w }
    )
    expect(res.failedIndex).toBe(0)
    expect(res.failedOpId).toBe('pp-1')
    expect(res.failedReason).toBe('face.error.missing')
  })

  it('останавливает стек на рёбрах и применяет фаску', async () => {
    const w = await getWasm()
    const cube = w.Manifold.cube([20, 20, 20], true)
    const topo = topologyOfSolid(cube)
    const edge = topo.edges.find(
      (e) => e.kind === 'line' && e.points[0][2] === 10 && e.points[1][2] === 10
    )!

    const res = await evaluateStack(
      cube,
      [
        {
          id: 'eb-1',
          kind: 'edgeBreak',
          enabled: true,
          params: { edges: [edgeRef(edge)], kind: 'chamfer', size: 2 },
        },
      ],
      null,
      { w }
    )
    expect(res.failedReason).toBeUndefined()
    // Фаска 2 мм на ребре длиной 20: 8000 − 2·2/2·20 = 7960.
    expect(res.solid!.volume()).toBeCloseTo(7960, 0)

    const bad = await evaluateStack(
      cube,
      [
        {
          id: 'eb-2',
          kind: 'edgeBreak',
          enabled: true,
          params: {
            edges: [{ kind: 'edge', shape: 'line', p0: [999, 999, 999], p1: [998, 999, 999] }],
            kind: 'chamfer',
            size: 2,
          },
        },
      ],
      null,
      { w }
    )
    expect(bad.failedReason).toBe('edge.error.missing')
  })
})
