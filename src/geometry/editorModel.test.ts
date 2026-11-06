import { describe, it, expect } from 'vitest'
import { generate } from './model'
import type { EditorModelParams } from './model'

describe('generate("editor") (Task 3.5)', () => {
  it('evaluates visible objects and tools, returns meshes and statuses', async () => {
    // Scene:
    // target-box: Box 20x20x20 at origin
    // tool-cyl: Cylinder r=5, h=30 at origin, hidden tool
    // target-box has boolean subtract of tool-cyl
    const params: EditorModelParams = {
      objects: [
        {
          id: 'target-box',
          name: 'Target Box',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [
            {
              id: 'sub-op',
              kind: 'boolean',
              enabled: true,
              params: { mode: 'subtract', tools: ['tool-cyl'] },
            },
          ],
        },
        {
          id: 'tool-cyl',
          name: 'Tool Cylinder',
          visible: false, // hidden tool
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 10, height: 30 } },
        },
      ],
    }

    const res = await generate('editor', params)

    expect(res.parts).toHaveLength(1)
    expect(res.parts[0].label).toBe('target-box')
    // tool-cyl is hidden, so not returned in parts and not in tools
    expect(res.tools).toBeUndefined()

    // Statuses
    expect(res.editor?.statuses['target-box']).toBeDefined()
    expect(res.editor?.statuses['target-box'].ops[0]).toEqual({
      opId: 'sub-op',
      status: 'ok',
    })
  })

  it('returns visible tool in tools array, not in parts', async () => {
    const params: EditorModelParams = {
      objects: [
        {
          id: 'target-box',
          name: 'Target Box',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [
            {
              id: 'sub-op',
              kind: 'boolean',
              enabled: true,
              params: { mode: 'subtract', tools: ['tool-cyl'] },
            },
          ],
        },
        {
          id: 'tool-cyl',
          name: 'Tool Cylinder',
          visible: true, // visible tool ghost!
          color: 2,
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 10, height: 30 } },
        },
      ],
    }

    const res = await generate('editor', params)

    // parts only contains target-box
    expect(res.parts).toHaveLength(1)
    expect(res.parts[0].label).toBe('target-box')

    // tools array contains tool-cyl
    expect(res.tools).toHaveLength(1)
    expect(res.tools![0].id).toBe('tool-cyl')
    expect(res.tools![0].color).toBe(2)
  })

  it('updates result and invalidates stale cache after an op edit', async () => {
    // 1st run: offset +1 mm
    const params1: EditorModelParams = {
      objects: [
        {
          id: 'box',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [
            {
              id: 'off-1',
              kind: 'offset',
              enabled: true,
              params: { distance: 1 },
            },
          ],
        },
      ],
    }

    const res1 = await generate('editor', params1)
    const vol1 = res1.parts[0].mesh.volume

    // 2nd run: change offset distance to +2 mm
    const params2: EditorModelParams = {
      objects: [
        {
          id: 'box',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [
            {
              id: 'off-1',
              kind: 'offset',
              enabled: true,
              params: { distance: 2 },
            },
          ],
        },
      ],
    }

    const res2 = await generate('editor', params2)
    const vol2 = res2.parts[0].mesh.volume

    expect(vol2).toBeGreaterThan(vol1)
  })

  it('updates result when primitive source params change', async () => {
    const params1: EditorModelParams = {
      objects: [
        {
          id: 'box-param-test',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 10, depth: 10, height: 10 } },
        },
      ],
    }
    const res1 = await generate('editor', params1)
    expect(res1.parts[0].mesh.volume).toBeCloseTo(1000, 0)

    const params2: EditorModelParams = {
      objects: [
        {
          id: 'box-param-test',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 10, height: 10 } },
        },
      ],
    }
    const res2 = await generate('editor', params2)
    expect(res2.parts[0].mesh.volume).toBeCloseTo(2000, 0)
  })

  it('updates result when tool primitive params change', async () => {
    const params1: EditorModelParams = {
      objects: [
        {
          id: 'target-box-sub',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [
            {
              id: 'sub-op',
              kind: 'boolean',
              enabled: true,
              params: { mode: 'subtract', tools: ['tool-cyl-sub'] },
            },
          ],
        },
        {
          id: 'tool-cyl-sub',
          visible: false,
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 10, height: 30 } },
        },
      ],
    }
    const res1 = await generate('editor', params1)
    const vol1 = res1.parts[0].mesh.volume

    const params2: EditorModelParams = {
      objects: [
        {
          id: 'target-box-sub',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [
            {
              id: 'sub-op',
              kind: 'boolean',
              enabled: true,
              params: { mode: 'subtract', tools: ['tool-cyl-sub'] },
            },
          ],
        },
        {
          id: 'tool-cyl-sub',
          visible: false,
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 15, height: 30 } },
        },
      ],
    }
    const res2 = await generate('editor', params2)
    const vol2 = res2.parts[0].mesh.volume
    expect(vol2).toBeLessThan(vol1)
  })

  it('updates result when target object moves relative to tool', async () => {
    const params1: EditorModelParams = {
      objects: [
        {
          id: 'target-box-move',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          stack: [
            {
              id: 'sub-op',
              kind: 'boolean',
              enabled: true,
              params: { mode: 'subtract', tools: ['tool-cyl-move'] },
            },
          ],
        },
        {
          id: 'tool-cyl-move',
          visible: false,
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 10, height: 30 } },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
    }
    const res1 = await generate('editor', params1)
    const vol1 = res1.parts[0].mesh.volume

    // Move target box so tool cylinder only partially intersects / misses
    const params2: EditorModelParams = {
      objects: [
        {
          id: 'target-box-move',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          transform: { position: [15, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          stack: [
            {
              id: 'sub-op',
              kind: 'boolean',
              enabled: true,
              params: { mode: 'subtract', tools: ['tool-cyl-move'] },
            },
          ],
        },
        {
          id: 'tool-cyl-move',
          visible: false,
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 10, height: 30 } },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
    }
    const res2 = await generate('editor', params2)
    const vol2 = res2.parts[0].mesh.volume
    expect(vol2).toBeGreaterThan(vol1)
  })

  it('reports cycle status', async () => {
    const params: EditorModelParams = {
      objects: [
        {
          id: 'a',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [{ id: 'op-a', kind: 'boolean', enabled: true, params: { mode: 'subtract', tools: ['b'] } }],
        },
        {
          id: 'b',
          visible: true,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          stack: [{ id: 'op-b', kind: 'boolean', enabled: true, params: { mode: 'subtract', tools: ['a'] } }],
        },
      ],
    }

    const res = await generate('editor', params)
    expect(res.editor?.statuses['a']?.error).toBe('stack.error.cycle')
    expect(res.editor?.statuses['b']?.error).toBe('stack.error.cycle')
  })

  it('evaluates boolean operation on an extrude body without disappearing', async () => {
    const sketch = {
      id: 'sk-rect',
      name: 'Rect',
      plane: { base: 'XY' as const, offset: 0 },
      visible: true,
      points: {
        p1: { x: -10, y: -10 },
        p2: { x: 10, y: -10 },
        p3: { x: 10, y: 10 },
        p4: { x: -10, y: 10 },
      },
      curves: {
        l1: { id: 'l1', kind: 'line' as const, a: 'p1', b: 'p2', construction: false },
        l2: { id: 'l2', kind: 'line' as const, a: 'p2', b: 'p3', construction: false },
        l3: { id: 'l3', kind: 'line' as const, a: 'p3', b: 'p4', construction: false },
        l4: { id: 'l4', kind: 'line' as const, a: 'p4', b: 'p1', construction: false },
      },
      constraints: [],
    }

    const params: EditorModelParams = {
      objects: [
        {
          id: 'extrude-target',
          visible: true,
          source: { kind: 'empty' },
          stack: [
            {
              id: 'extrude-op-1',
              kind: 'extrude',
              enabled: true,
              params: {
                sketchId: 'sk-rect',
                side: 'one',
                d1: 10,
                op: 'new',
              },
            },
            {
              id: 'sub-op',
              kind: 'boolean',
              enabled: true,
              params: {
                mode: 'subtract',
                tools: ['tool-cyl'],
              },
            },
          ],
        },
        {
          id: 'tool-cyl',
          visible: false,
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 10, height: 20 } },
        },
      ],
      sketches: [sketch],
    }

    const res = await generate('editor', params)
    expect(res.parts).toHaveLength(1)
    expect(res.parts[0].label).toBe('extrude-target')
    // 20x20x10 block volume is 4000 minus cylinder volume (~785)
    expect(res.parts[0].mesh.volume).toBeGreaterThan(3100)
    expect(res.parts[0].mesh.volume).toBeLessThan(3300)
    expect(res.editor?.statuses['extrude-target'].ops[1].status).toBe('ok')
  })
})
