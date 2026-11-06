import { describe, it, expect } from 'vitest'
import { getWasm } from '../../wasm'
import { expectValidSolid } from '../../testing'
import { applyBoolean, combineObjects, releaseTool } from './boolean'
import { matrixOf, type SceneDoc } from '../../../editor/scene'
import { identityMat4, relativeMatrix } from '../../matrix'

describe('boolean.ts (Task 3.1)', () => {
  it('computes volume of box − cylinder and intersect', async () => {
    const w = await getWasm()

    // Target: Box 20x20x20 centered, volume = 8000
    const box = w.Manifold.cube([20, 20, 20], true)
    expect(box.volume()).toBeCloseTo(8000, 1)

    // Tool: Cylinder r=5 (dia=10), height=30 centered, volume = pi * 25 * 30 ≈ 2356.19
    // Overlap inside box has height 20: pi * 25 * 20 ≈ 1570.80
    const cyl = w.Manifold.cylinder(30, 5, 5, 64).translate([0, 0, -15])

    const overlapVol = cyl.volume() * (20 / 30)

    // Subtract
    const subRes = applyBoolean(box, { mode: 'subtract', tools: ['cyl'] }, [
      { id: 'cyl', name: 'Cylinder', solid: cyl, relativeMatrix: identityMat4() },
    ])
    expect(subRes.error).toBeUndefined()
    expect(subRes.solid).toBeDefined()
    expectValidSolid(subRes.solid!)

    const expectedSubVol = 8000 - overlapVol
    expect(subRes.solid!.volume()).toBeCloseTo(expectedSubVol, 1)
    subRes.solid!.delete()

    // Intersect
    const intRes = applyBoolean(box, { mode: 'intersect', tools: ['cyl'] }, [
      { id: 'cyl', name: 'Cylinder', solid: cyl, relativeMatrix: identityMat4() },
    ])
    expect(intRes.error).toBeUndefined()
    expect(intRes.solid).toBeDefined()
    expectValidSolid(intRes.solid!)

    expect(intRes.solid!.volume()).toBeCloseTo(overlapVol, 1)
    intRes.solid!.delete()

    cyl.delete()
    box.delete()
  })

  it('correctly handles transformed target and tool via relative matrix', async () => {
    const w = await getWasm()

    // Target box rotated 45 deg around Z
    const targetMat = matrixOf({
      position: [0, 0, 0],
      rotation: [0, 0, 45],
      scale: [1, 1, 1],
    })

    // Tool cylinder at world position [0, 0, 0], no rotation
    const toolMat = matrixOf({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })

    const box = w.Manifold.cube([20, 20, 20], true)
    const cyl = w.Manifold.cylinder(30, 5, 5, 64).translate([0, 0, -15])

    const relMat = relativeMatrix(targetMat, toolMat)

    const subRes = applyBoolean(box, { mode: 'subtract', tools: ['cyl'] }, [
      { id: 'cyl', name: 'Cylinder', solid: cyl, relativeMatrix: relMat },
    ])

    expect(subRes.error).toBeUndefined()
    expectValidSolid(subRes.solid!)
    // Overlap volume is still identical because cylinder is at origin
    const overlapVol = cyl.volume() * (20 / 30)
    expect(subRes.solid!.volume()).toBeCloseTo(8000 - overlapVol, 1)

    subRes.solid!.delete()
    cyl.delete()
    box.delete()
  })

  it('refuses open tool mesh with health info counts', async () => {
    const w = await getWasm()
    const box = w.Manifold.cube([20, 20, 20], true)
    const dummySolid = w.Manifold.cube([5, 5, 5], true)

    const res = applyBoolean(box, { mode: 'subtract', tools: ['open-part'] }, [
      {
        id: 'open-part',
        name: 'FaultyMesh',
        solid: dummySolid,
        relativeMatrix: identityMat4(),
        health: {
          triangles: 100,
          openEdges: 6,
          nonManifoldEdges: 0,
          degenerate: 0,
          volume: 0,
          closed: false,
        },
      },
    ])

    expect(res.solid).toBeUndefined()
    expect(res.error).toBe('stack.error.notSolid')
    expect(res.errorParams).toEqual({
      name: 'FaultyMesh',
      openEdges: 6,
    })

    dummySolid.delete()
    box.delete()
  })

  it('combineObjects and releaseTool manage scene state and visibility', () => {
    const doc: SceneDoc = {
      schema: 1,
      objects: [
        {
          id: 'target',
          name: 'Target Box',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'primitive', shape: 'box', params: { width: 20, depth: 20, height: 20 } },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        {
          id: 'tool-1',
          name: 'Tool Cylinder',
          visible: true,
          locked: false,
          color: 1,
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 10, height: 20 } },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
    }

    // Combine
    const combined = combineObjects(doc, 'target', ['tool-1'], 'subtract')
    const targetObj = combined.objects.find((o) => o.id === 'target')!
    const toolObj = combined.objects.find((o) => o.id === 'tool-1')!

    expect(targetObj.stack).toHaveLength(1)
    expect(targetObj.stack![0].kind).toBe('boolean')
    expect(targetObj.stack![0].params).toEqual({ mode: 'subtract', tools: ['tool-1'] })
    // Tool is hidden
    expect(toolObj.visible).toBe(false)

    // Release tool
    const opId = targetObj.stack![0].id
    const released = releaseTool(combined, 'target', opId)
    const releasedTarget = released.objects.find((o) => o.id === 'target')!
    const releasedTool = released.objects.find((o) => o.id === 'tool-1')!

    expect(releasedTarget.stack).toHaveLength(0)
    expect(releasedTool.visible).toBe(true)
  })

  it('combines with target that has an extrude in stack without losing it', () => {
    const doc: SceneDoc = {
      schema: 1,
      objects: [
        {
          id: 'target-extrude',
          name: 'Extrude Body',
          visible: true,
          locked: false,
          color: 0,
          source: { kind: 'empty' },
          stack: [
            {
              id: 'ext-1',
              kind: 'extrude',
              enabled: true,
              params: { sketchId: 's1', side: 'one', d1: 10, op: 'new' },
            },
          ],
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        {
          id: 'tool-cyl',
          name: 'Tool Cylinder',
          visible: true,
          locked: false,
          color: 1,
          source: { kind: 'primitive', shape: 'cylinder', params: { diameter: 10, height: 20 } },
          transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      ],
    }

    const combined = combineObjects(doc, 'target-extrude', ['tool-cyl'], 'subtract')
    const target = combined.objects.find((o) => o.id === 'target-extrude')!

    expect(target.stack).toHaveLength(2)
    expect(target.stack![0].kind).toBe('extrude')
    expect(target.stack![1].kind).toBe('boolean')
  })
})
