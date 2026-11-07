import { describe, it, expect, vi } from 'vitest'
import { MeshClient, MeshSupersededError } from './meshClient'
import { boxSoup } from '../stl-fixtures'

describe('4.1 MeshClient', () => {
  it('runs analyze, weld, and autoRepair via inline fallback', async () => {
    const client = new MeshClient()
    const cube = boxSoup(10, 10, 10)

    const analysis = await client.analyze(cube)
    expect(analysis.triangles).toBe(12)
    expect(analysis.isSolid).toBe(true)

    const welded = await client.weld(cube)
    expect(welded.report.finalVertices).toBe(8)

    const repaired = await client.autoRepair(cube)
    expect(repaired.isSolid).toBe(true)
  })

  it('latest request wins per lane and supersedes older requests', async () => {
    const client = new MeshClient()
    const cube1 = boxSoup(10, 10, 10)
    const cube2 = boxSoup(20, 20, 20)

    // Fire two requests in the same lane 'analyze' rapidly
    const p1 = client.analyze(cube1)
    const p2 = client.analyze(cube2)

    await expect(p1).rejects.toThrow(MeshSupersededError)
    const res2 = await p2
    expect(res2.volume).toBeCloseTo(8000, 1)
  })

  it('independent lanes run concurrently without superseding each other', async () => {
    const client = new MeshClient()
    const cube = boxSoup(10, 10, 10)

    // One in 'analyze' lane, one in 'repair' lane
    const [analysis, welded] = await Promise.all([
      client.analyze(cube),
      client.weld(cube),
    ])

    expect(analysis.triangles).toBe(12)
    expect(welded.report.finalVertices).toBe(8)
  })

  it('cancel rejects pending jobs in the specified lane', async () => {
    const client = new MeshClient()
    const cube = boxSoup(10, 10, 10)

    const p = client.analyze(cube)
    client.cancel('analyze')

    await expect(p).rejects.toThrow(MeshSupersededError)
  })

  it('receives progress callback during intersection checking', async () => {
    const client = new MeshClient()
    const cube = boxSoup(10, 10, 10)

    let progressCalls = 0
    await client.findIntersections(cube, {
      onProgress: (p) => {
        progressCalls++
      },
    })

    expect(progressCalls).toBeGreaterThan(0)
  })
})
