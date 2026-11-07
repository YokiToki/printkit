import { describe, it, expect } from 'vitest'
import { weld } from './weld'
import { removeDegenerate } from './removeDegenerate'
import { fixOrientation } from './orient'
import { removeShells } from './shells'
import { boxSoup } from '../stl-fixtures'
import { analyze } from './analyze'
import type { TriSoup } from '../stl-import'

describe('3.1 Individual repairs: weld, removeDegenerate, orient, shells', () => {
  it('weld merges duplicated vertices and honors tolerance', () => {
    // Unindexed box soup has 12 * 3 = 36 vertices, but only 8 unique coordinates
    const soup = boxSoup(10, 10, 10)
    expect(soup.positions.length / 3).toBe(36)

    const { mesh, report } = weld(soup, 0.01)
    expect(report.originalVertices).toBe(36)
    expect(report.finalVertices).toBe(8)
    expect(report.mergedVertices).toBe(28)
    expect(mesh.triVerts.length / 3).toBe(12)

    // With very tiny tolerance, vertices that are identical still merge
    const tinyWeld = weld(soup, 1e-6)
    expect(tinyWeld.report.finalVertices).toBe(8)
  })

  it('removeDegenerate removes zero-area and duplicate triangles', () => {
    // 1 valid triangle + 1 zero-area triangle + 1 duplicate triangle
    const soup: TriSoup = {
      positions: new Float32Array([
        // Valid
        0, 0, 0,  10, 0, 0,  0, 10, 0,
        // Degenerate (collinear / zero-area)
        0, 0, 0,  5, 0, 0,   10, 0, 0,
        // Duplicate of valid
        0, 0, 0,  10, 0, 0,  0, 10, 0,
      ]),
    }
    const { mesh, report } = removeDegenerate(soup)

    expect(report.initialTriangles).toBe(3)
    expect(report.removedDegenerate).toBe(1)
    expect(report.removedDuplicates).toBe(1)
    expect(report.finalTriangles).toBe(1)
    expect(mesh.triVerts.length / 3).toBe(1)
  })

  it('orient fixes flipped triangles and inverts negative volume shells', () => {
    const soup = boxSoup(10, 10, 10)
    // Flip all triangles
    const flipped = new Float32Array(soup.positions.length)
    for (let t = 0; t < soup.positions.length / 9; t++) {
      const idx = t * 9
      flipped[idx] = soup.positions[idx]
      flipped[idx + 1] = soup.positions[idx + 1]
      flipped[idx + 2] = soup.positions[idx + 2]
      flipped[idx + 3] = soup.positions[idx + 6]
      flipped[idx + 4] = soup.positions[idx + 7]
      flipped[idx + 5] = soup.positions[idx + 8]
      flipped[idx + 6] = soup.positions[idx + 3]
      flipped[idx + 7] = soup.positions[idx + 4]
      flipped[idx + 8] = soup.positions[idx + 5]
    }

    const { mesh, report } = fixOrientation({ positions: flipped })
    expect(report.invertedShells).toBe(1)

    // Verify resulting mesh has positive volume
    const analysis = analyze(mesh)
    expect(analysis.isNegativeVolume).toBe(false)
    expect(analysis.volume).toBeCloseTo(1000, 1)
    expect(analysis.isSolid).toBe(true)
  })

  it('shells keeps/removes shells by triangle threshold, volume threshold, or keepLargest', () => {
    const bigCube = boxSoup(20, 20, 20) // vol = 8000, 12 tris
    const smallCube = boxSoup(2, 2, 2)   // vol = 8, 12 tris
    // Translate small cube by 100 in X
    const smallPos = new Float32Array(smallCube.positions.length)
    for (let i = 0; i < smallCube.positions.length; i += 3) {
      smallPos[i] = smallCube.positions[i] + 100
      smallPos[i + 1] = smallCube.positions[i + 1]
      smallPos[i + 2] = smallCube.positions[i + 2]
    }
    const twoCubes: TriSoup = {
      positions: new Float32Array([...bigCube.positions, ...smallPos]),
    }

    // 1. keepLargest keeps only bigCube
    const largest = removeShells(twoCubes, { keepLargest: true })
    expect(largest.report.initialShells).toBe(2)
    expect(largest.report.keptShells).toBe(1)
    expect(largest.report.removedShells).toBe(1)
    expect(analyze(largest.mesh).volume).toBeCloseTo(8000, 1)

    // 2. Remove by volume threshold <= 10
    const byVol = removeShells(twoCubes, { maxVolume: 10 })
    expect(byVol.report.removedShells).toBe(1)
    expect(analyze(byVol.mesh).volume).toBeCloseTo(8000, 1)

    // 3. Keep all if threshold is smaller than smallCube
    const keepAll = removeShells(twoCubes, { maxVolume: 1 })
    expect(keepAll.report.removedShells).toBe(0)
    expect(keepAll.report.keptShells).toBe(2)
  })
})

import { fillHoles } from './fillHoles'
import { makeSolid, MakeSolidBudgetError } from './makeSolid'
import { autoRepair } from './autoRepair'
import { decimate, DecimateNonManifoldError } from './decimate'
import { smooth } from './smooth'
import { layOnFace, bestOrientations } from './orientation'
import { getWasm } from '../wasm'

describe('3.2 fillHoles', () => {
  it('fills triangle hole and square hole, closing the mesh', () => {
    const cube = boxSoup(10, 10, 10)
    // 1. Remove 1 triangle (triangle hole)
    const triHole: TriSoup = { positions: cube.positions.slice(9) }
    const filledTri = fillHoles(triHole)
    expect(filledTri.report.filledLoops).toBe(1)
    expect(filledTri.report.addedTriangles).toBe(1)
    expect(analyze(filledTri.mesh).isSolid).toBe(true)

    // 2. Remove 2 triangles forming a square face
    const squareHole: TriSoup = { positions: cube.positions.slice(18) }
    const filledSquare = fillHoles(squareHole, { mode: 'flat' })
    expect(filledSquare.report.filledLoops).toBe(1)
    expect(filledSquare.report.addedTriangles).toBe(2)
    expect(analyze(filledSquare.mesh).isSolid).toBe(true)
    expect(analyze(filledSquare.mesh).volume).toBeCloseTo(1000, 1)
  })

  it('closes ring-shaped open cylinder and respects maxPerimeter skipped limit', async () => {
    const w = await getWasm()
    // Open cylinder: subtract cylinder caps or create open tube
    const c = w.Manifold.cylinder(20, 10, 10, 16)
    const m = c.getMesh()
    // Remove bottom cap triangles (all triangles with normal pointing in -Z)
    const keptTris: number[] = []
    for (let t = 0; t < m.triVerts.length; t += 3) {
      const z0 = m.vertProperties[m.triVerts[t] * 3 + 2]
      const z1 = m.vertProperties[m.triVerts[t + 1] * 3 + 2]
      const z2 = m.vertProperties[m.triVerts[t + 2] * 3 + 2]
      if (z0 === 0 && z1 === 0 && z2 === 0) {
        // Bottom cap triangle -> drop
        continue
      }
      keptTris.push(m.triVerts[t], m.triVerts[t + 1], m.triVerts[t + 2])
    }
    const openCyl = { vertProperties: m.vertProperties, triVerts: new Uint32Array(keptTris) }

    // With tiny perimeter limit -> skipped
    const skipped = fillHoles(openCyl, { maxPerimeter: 5.0 })
    expect(skipped.report.skippedLoops.length).toBeGreaterThan(0)
    expect(skipped.report.filledLoops).toBe(0)

    // With normal limit -> filled
    const filled = fillHoles(openCyl, { maxPerimeter: 100.0 })
    expect(filled.report.filledLoops).toBe(1)
    expect(analyze(filled.mesh).openEdges).toBe(0)
  })
})

describe('3.3 makeSolid', () => {
  it('converts broken fixture into valid manifold solid with accurate volume', async () => {
    const w = await getWasm()
    const cube = boxSoup(20, 20, 20)
    // Remove 2 triangles and flip another
    const brokenPositions = Array.from(cube.positions.slice(18))
    for (let k = 0; k < 3; k++) {
      const t = brokenPositions[k]
      brokenPositions[k] = brokenPositions[k + 3]
      brokenPositions[k + 3] = t
    }

    const { mesh, manifold, report } = makeSolid(w, { positions: Float32Array.from(brokenPositions) }, { resolution: 1.0 })
    expect(manifold.status()).toBe('NoError')
    expect(manifold.numTri()).toBeGreaterThan(0)
    expect(report.volume).toBeGreaterThan(6000)
    // Manifold produces valid solid
    expect(manifold.status()).toBe('NoError')
    expect(report.triangles).toBeGreaterThan(0)
  })

  it('refuses when resolution exceeds grid budget', async () => {
    const w = await getWasm()
    const cube = boxSoup(100, 100, 100)
    // Asking for 0.05 mm on 100 mm box would exceed 100M cells
    expect(() => {
      makeSolid(w, cube, { resolution: 0.05, maxCells: 10_000 })
    }).toThrow(MakeSolidBudgetError)
  })
})

describe('3.4 autoRepair', () => {
  it('runs end-to-end auto repair on typical broken fixture', async () => {
    const w = await getWasm()
    const cube = boxSoup(10, 10, 10)
    // Missing 1 triangle creates a hole (perimeter ~34mm on a 10mm cube)
    const arr = Array.from(cube.positions.slice(9))
    // Properly flip another triangle by swapping vertex 0 and vertex 1 (all 3 coordinates)
    for (let k = 0; k < 3; k++) {
      const t = arr[k]
      arr[k] = arr[k + 3]
      arr[k + 3] = t
    }

    const res = autoRepair({ positions: Float32Array.from(arr) }, { w, maxHolePerimeter: 50, allowMakeSolid: true })
    expect(res.beforeAnalysis.isSolid).toBe(false)
    expect(res.isSolid).toBe(true)
    expect(res.afterAnalysis.isSolid).toBe(true)
    expect(res.steps.filledLoops).toBeGreaterThan(0)
  })

  it('lists leftover issues for unrepairable mesh when makeSolid is disabled', () => {
    // Non-manifold pinched edge
    const positions = new Float32Array([
      0, 0, 0,  10, 0, 0,  0, 10, 0,
      0, 0, 0,  10, 0, 0,  0, 0, 10,
      0, 0, 0,  10, 0, 0,  0, -10, 0,
    ])
    const res = autoRepair({ positions }, { allowMakeSolid: false })
    expect(res.isSolid).toBe(false)
    expect(res.afterAnalysis.nonManifoldEdges).toBeGreaterThan(0)
  })
})

describe('3.5 decimate and smooth', () => {
  it('decimate simplifies solid mesh to target and bounds deviation', async () => {
    const w = await getWasm()
    const sp = w.Manifold.sphere(10, 64)
    const m = sp.getMesh()
    const origTriangles = m.numTri

    const { mesh, report } = decimate(w, { vertProperties: m.vertProperties, triVerts: m.triVerts }, { targetRatio: 0.25 })
    expect(report.finalTriangles).toBeLessThan(origTriangles)
    expect(report.bisectionCount).toBeLessThanOrEqual(8)
    expect(report.tolerance).toBeGreaterThan(0)
    expect(analyze(mesh).isSolid).toBe(true)
  })

  it('decimate refuses open mesh', async () => {
    const w = await getWasm()
    const cube = boxSoup(10, 10, 10)
    const openCube = { positions: cube.positions.slice(9) }
    expect(() => {
      decimate(w, openCube)
    }).toThrow(DecimateNonManifoldError)
  })

  it('smooth preserves sharp edges and keeps volume change under 1%', () => {
    const cube = boxSoup(20, 20, 20)
    const origVol = 8000

    const { mesh, report } = smooth(cube, { strength: 0.5, iterations: 10, sharpAngleDeg: 35 })
    expect(report.pinnedVertices).toBe(8) // All 8 corner vertices are on 90 deg sharp edges
    expect(report.volumeChangePercent).toBeLessThan(1.0)
    expect(analyze(mesh).volume).toBeCloseTo(origVol, 0)
  })
})

describe('3.6 orientation', () => {
  it('layOnFace rotates flat side of tilted block to -Z', () => {
    const cube = boxSoup(20, 20, 20)
    // Triangle 0 is on the -Z face (normal [0, 0, -1])
    const res = layOnFace(cube, 0)
    expect(res.regionArea).toBeCloseTo(400, 1)
    expect(res.rotation[0]).toBe(0)
    expect(res.rotation[1]).toBe(0)
  })

  it('bestOrientations evaluates and scores orientations of L-shaped part', () => {
    // L-shaped part: base 40x20x10, upright 20x20x30
    const soup = boxSoup(40, 20, 10)
    const suggestions = bestOrientations(soup)

    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.length).toBeLessThanOrEqual(3)
    // Results sorted by score ascending
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].score).toBeGreaterThanOrEqual(suggestions[i - 1].score)
    }
  })
})
