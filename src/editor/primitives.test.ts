import { describe, expect, it } from 'vitest'
import { generate, registerMesh } from '../geometry/model'
import { expectValidSolid } from '../geometry/testing'
import { getWasm } from '../geometry/wasm'
import { buildPrimitiveManifold } from './primitives'

describe('editor/primitives', () => {
  it('builds valid solid for each primitive with accurate bbox and formula volume', async () => {
    const w = await getWasm()

    // 1. Box: 20 x 30 x 40
    {
      const m = buildPrimitiveManifold(w, 'box', { width: 20, depth: 30, height: 40 })
      try {
        expectValidSolid(m, {
          min: [-10, -15, 0],
          max: [10, 15, 40],
          size: [20, 30, 40],
        })
        expect(m.volume()).toBeCloseTo(20 * 30 * 40, 1) // 24000
      } finally {
        m.delete()
      }
    }

    // 2. Cylinder: diameter 20 (r=10), height 30
    {
      const m = buildPrimitiveManifold(w, 'cylinder', { diameter: 20, height: 30 })
      try {
        expectValidSolid(m, {
          min: [-10, -10, 0],
          max: [10, 10, 30],
        })
        // pi * r^2 * h ~= 9424.77
        expect(m.volume()).toBeGreaterThan(9400)
        expect(m.volume()).toBeLessThan(9430)
      } finally {
        m.delete()
      }
    }

    // 3. Sphere: diameter 20 (r=10)
    {
      const m = buildPrimitiveManifold(w, 'sphere', { diameter: 20 })
      try {
        expectValidSolid(m, {
          min: [-10, -10, 0],
          max: [10, 10, 20],
        })
        // 4/3 * pi * r^3 ~= 4188.79
        expect(m.volume()).toBeGreaterThan(4170)
        expect(m.volume()).toBeLessThan(4190)
      } finally {
        m.delete()
      }
    }

    // 4. Cone: bottomDiameter 20 (r=10), height 30
    {
      const m = buildPrimitiveManifold(w, 'cone', { bottomDiameter: 20, height: 30 })
      try {
        expectValidSolid(m, {
          min: [-10, -10, 0],
          max: [10, 10, 30],
        })
        // 1/3 * pi * r^2 * h ~= 3141.59
        expect(m.volume()).toBeGreaterThan(3130)
        expect(m.volume()).toBeLessThan(3145)
      } finally {
        m.delete()
      }
    }

    // 5. Torus: diameter 30 (R=15), tubeDiameter 6 (r=3)
    {
      const m = buildPrimitiveManifold(w, 'torus', { diameter: 30, tubeDiameter: 6 })
      try {
        expectValidSolid(m, {
          min: [-18, -18, 0],
          max: [18, 18, 6],
        })
        // 2 * pi^2 * R * r^2 = 2 * pi^2 * 15 * 9 ~= 2664.79
        expect(m.volume()).toBeGreaterThan(2650)
        expect(m.volume()).toBeLessThan(2670)
      } finally {
        m.delete()
      }
    }

    // 6. Wedge: width 20, depth 30, height 10
    {
      const m = buildPrimitiveManifold(w, 'wedge', { width: 20, depth: 30, height: 10 })
      try {
        expectValidSolid(m, {
          min: [-10, -15, 0],
          max: [10, 15, 10],
          size: [20, 30, 10],
        })
        // 0.5 * w * d * h = 0.5 * 20 * 30 * 10 = 3000
        expect(m.volume()).toBeCloseTo(3000, 1)
      } finally {
        m.delete()
      }
    }
  })

  it('generates editor model with primitives (cached) and pass-through of open mesh', async () => {
    // Register an open (non-solid) mesh in meshRegistry
    // e.g. a single open triangle: (0,0,0), (10,0,0), (0,10,0)
    registerMesh('open-mesh-1', {
      vertProperties: Float32Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0]),
      triVerts: Uint32Array.from([0, 1, 2]),
    })

    const res = await generate('editor', {
      objects: [
        {
          id: 'box-obj',
          source: {
            kind: 'primitive',
            shape: 'box',
            params: { width: 10, depth: 10, height: 10 },
          },
        },
        {
          id: 'mesh-obj',
          source: {
            kind: 'mesh',
            meshId: 'open-mesh-1',
            unit: 'mm',
          },
        },
      ],
    })

    expect(res.parts).toHaveLength(2)

    // Box part
    const boxPart = res.parts.find((p) => p.label === 'box-obj')
    expect(boxPart).toBeDefined()
    expect(boxPart!.mesh.volume).toBeCloseTo(1000)

    // Open mesh part was passed through without throwing
    const meshPart = res.parts.find((p) => p.label === 'mesh-obj')
    expect(meshPart).toBeDefined()

    // Subsequent generate calls reuse cached primitive and registered mesh without detachment
    const res2 = await generate('editor', {
      objects: [
        {
          id: 'box-obj-2',
          source: {
            kind: 'primitive',
            shape: 'box',
            params: { width: 10, depth: 10, height: 10 },
          },
        },
        {
          id: 'mesh-obj-2',
          source: {
            kind: 'mesh',
            meshId: 'open-mesh-1',
            unit: 'mm',
          },
        },
      ],
    })
    expect(res2.parts).toHaveLength(2)
    expect(res2.parts[0].mesh.vertProperties.byteLength).toBeGreaterThan(0)
    expect(res2.parts[1].mesh.vertProperties.byteLength).toBeGreaterThan(0)
    expect(meshPart!.mesh.triVerts).toHaveLength(3)
    expect(meshPart!.mesh.min).toEqual([0, 0, 0])
    expect(meshPart!.mesh.max).toEqual([10, 10, 0])
  })
})
