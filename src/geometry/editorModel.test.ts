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
})
