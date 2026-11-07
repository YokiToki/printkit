import { describe, expect, it } from 'vitest'
import { getWasm } from '../wasm'
import { cutSolid } from './plane'
import { getCutSection } from './section'
import { applyCutConnectors, measureMaterialDepth } from './connectors'

describe('geometry/cut/connectors.ts (Task 2.5)', () => {
  it('applies pegs to part A and sockets to part B', async () => {
    const w = await getWasm()
    // 60 x 30 x 30 block cut in the middle along X (at x = 0)
    const block = w.Manifold.cube([60, 30, 30], true)
    const [partA, partB] = cutSolid(block, { kind: 'axis', axis: 'x', position: 0 }, 'both')
    const cut = getCutSection(block, { kind: 'axis', axis: 'x', position: 0 })

    const res = await applyCutConnectors(
      partA.manifold,
      partB.manifold,
      cut.frame,
      cut.polygons,
      {
        kind: 'pegs',
        diameter: 4,
        depth: 6,
        positions: [
          [0, -5],
          [0, 5],
        ],
      }
    )

    expect(res.reports.length).toBe(2)
    expect(res.reports.every((r) => r.valid)).toBe(true)

    // Part A grew by 2 pegs (volume increases)
    expect(res.partA.volume()).toBeGreaterThan(partA.manifold.volume())
    // Part B lost 2 sockets (volume decreases)
    expect(res.partB.volume()).toBeLessThan(partB.manifold.volume())

    // Both parts are valid solids
    expect(res.partA.status()).toBe('NoError')
    expect(res.partB.status()).toBe('NoError')
  })

  it('limits depth when material behind the cut is thin', async () => {
    const w = await getWasm()
    // Thin block: 6 x 30 x 30 cut at x = 0 (each half is only 3 mm thick!)
    const thinBlock = w.Manifold.cube([6, 30, 30], true)
    const [partA, partB] = cutSolid(thinBlock, { kind: 'axis', axis: 'x', position: 0 }, 'both')
    const cut = getCutSection(thinBlock, { kind: 'axis', axis: 'x', position: 0 })

    const res = await applyCutConnectors(
      partA.manifold,
      partB.manifold,
      cut.frame,
      cut.polygons,
      {
        kind: 'pegs',
        diameter: 2,
        depth: 10, // requested depth 10 mm on a 3 mm half!
        positions: [[0, 0]],
      }
    )

    expect(res.reports.length).toBe(1)
    // Thickness is 3 mm -> effective depth clamped to 3 - 1.5 = 1.5 mm
    expect(res.reports[0].clampedDepth).toBeLessThanOrEqual(2.0)
  })

  it('detects positions outside section as invalid', async () => {
    const w = await getWasm()
    const block = w.Manifold.cube([40, 20, 20], true)
    const [partA, partB] = cutSolid(block, { kind: 'axis', axis: 'x', position: 0 }, 'both')
    const cut = getCutSection(block, { kind: 'axis', axis: 'x', position: 0 })

    const res = await applyCutConnectors(
      partA.manifold,
      partB.manifold,
      cut.frame,
      cut.polygons,
      {
        kind: 'pins',
        diameter: 3,
        positions: [
          [0, 0], // inside
          [50, 50], // way outside the 20x20 face
        ],
      }
    )

    expect(res.reports.length).toBe(2)
    expect(res.reports[0].valid).toBe(true)
    expect(res.reports[1].valid).toBe(false)
    expect(res.reports[1].issue).toBe('outside')
  })

  it('creates dovetail join with key on A fitting socket on B with clearance', async () => {
    const w = await getWasm()
    // 40 x 40 x 40 block cut at x = 0
    const block = w.Manifold.cube([40, 40, 40], true)
    const [partA, partB] = cutSolid(block, { kind: 'axis', axis: 'x', position: 0 }, 'both')
    const cut = getCutSection(block, { kind: 'axis', axis: 'x', position: 0 })

    const res = await applyCutConnectors(
      partA.manifold,
      partB.manifold,
      cut.frame,
      cut.polygons,
      {
        kind: 'dovetail',
        neck: 6,
        tip: 10,
        dovetailDepth: 3,
        dovetailHeight: 20,
        clearance: 0.2,
        positions: [[0, 0]],
      }
    )

    expect(res.reports[0].valid).toBe(true)
    expect(res.partA.status()).toBe('NoError')
    expect(res.partB.status()).toBe('NoError')

    // Key on Part A added volume
    expect(res.partA.volume()).toBeGreaterThan(partA.manifold.volume())
    // Socket on Part B removed volume
    expect(res.partB.volume()).toBeLessThan(partB.manifold.volume())

    // Intersection of Part A and Part B after joining:
    // Because socket in B is larger than key in A by clearance, there should be NO solid overlap between them!
    const overlap = w.Manifold.intersection(res.partA, res.partB)
    expect(overlap.volume()).toBeLessThan(1e-3)
  })
})
