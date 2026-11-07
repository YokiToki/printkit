import { describe, it, expect, vi } from 'vitest'
import { analyze } from './analyze'
import { findIntersections } from './intersections'
import { planarRegion } from './planarRegion'
import { boxSoup } from '../stl-fixtures'
import type { IndexedMesh, TriSoup } from '../stl-import'
import { getWasm } from '../wasm'

describe('2.1 analyze.ts', () => {
  it('analyzes closed cube: 12 triangles, 0 open edges, 1 shell, positive volume, isSolid', () => {
    const cube = boxSoup(10, 10, 10)
    const report = analyze(cube)

    expect(report.triangles).toBe(12)
    expect(report.openEdges).toBe(0)
    expect(report.boundaryLoops).toHaveLength(0)
    expect(report.nonManifoldEdges).toBe(0)
    expect(report.nonManifoldVertices).toBe(0)
    expect(report.degenerateTriangles).toBe(0)
    expect(report.duplicateTriangles).toBe(0)
    expect(report.inconsistentTriangles).toBe(0)
    expect(report.isNegativeVolume).toBe(false)
    expect(report.volume).toBeCloseTo(1000, 1)
    expect(report.surfaceArea).toBeCloseTo(600, 1)
    expect(report.shells).toHaveLength(1)
    expect(report.shells[0].isClosed).toBe(true)
    expect(report.isSolid).toBe(true)
  })

  it('analyzes cube minus one triangle: 1 boundary loop of 3 edges, open, not solid', () => {
    const cube = boxSoup(10, 10, 10)
    // Remove 1 triangle (first 9 floats)
    const incomplete: TriSoup = {
      positions: cube.positions.slice(9),
    }
    const report = analyze(incomplete)

    expect(report.triangles).toBe(11)
    expect(report.openEdges).toBe(3)
    expect(report.boundaryLoops).toHaveLength(1)
    expect(report.boundaryLoops[0].points).toHaveLength(3)
    expect(report.boundaryLoops[0].perimeter).toBeGreaterThan(0)
    expect(report.isSolid).toBe(false)
  })

  it('analyzes two separated cubes: 2 shells with individual volumes', () => {
    const cube1 = boxSoup(10, 10, 10)
    // Cube 2 translated by 50 in X
    const pos2 = new Float32Array(cube1.positions.length)
    for (let i = 0; i < cube1.positions.length; i += 3) {
      pos2[i] = cube1.positions[i] + 50
      pos2[i + 1] = cube1.positions[i + 1]
      pos2[i + 2] = cube1.positions[i + 2]
    }
    const twoCubes: TriSoup = {
      positions: new Float32Array([...cube1.positions, ...pos2]),
    }
    const report = analyze(twoCubes)

    expect(report.triangles).toBe(24)
    expect(report.openEdges).toBe(0)
    expect(report.shells).toHaveLength(2)
    expect(report.shells[0].isClosed).toBe(true)
    expect(report.shells[1].isClosed).toBe(true)
    expect(report.shells[0].volume).toBeCloseTo(1000, 1)
    expect(report.shells[1].volume).toBeCloseTo(1000, 1)
    expect(report.volume).toBeCloseTo(2000, 1)
  })

  it('analyzes flipped cube: negative volume and flipped triangles detected', () => {
    const cube = boxSoup(10, 10, 10)
    const flipped = new Float32Array(cube.positions.length)
    // Swap vertex 1 and 2 of each triangle
    for (let t = 0; t < cube.positions.length / 9; t++) {
      const idx = t * 9
      // v0 stays
      flipped[idx] = cube.positions[idx]
      flipped[idx + 1] = cube.positions[idx + 1]
      flipped[idx + 2] = cube.positions[idx + 2]
      // v1 becomes v2
      flipped[idx + 3] = cube.positions[idx + 6]
      flipped[idx + 4] = cube.positions[idx + 7]
      flipped[idx + 5] = cube.positions[idx + 8]
      // v2 becomes v1
      flipped[idx + 6] = cube.positions[idx + 3]
      flipped[idx + 7] = cube.positions[idx + 4]
      flipped[idx + 8] = cube.positions[idx + 5]
    }
    const report = analyze({ positions: flipped })

    expect(report.isNegativeVolume).toBe(true)
    expect(report.volume).toBeCloseTo(-1000, 1)
    expect(report.flippedTriIndices.length).toBeGreaterThan(0)
    expect(report.isSolid).toBe(false)
  })

  it('analyzes duplicated vertices and degenerate triangles', () => {
    // 1 valid triangle + 1 degenerate triangle with identical vertices + 1 duplicate triangle
    const positions = new Float32Array([
      // Tri 0: normal
      0, 0, 0,  10, 0, 0,  0, 10, 0,
      // Tri 1: degenerate (v0 == v1)
      5, 5, 5,  5, 5, 5,   6, 6, 6,
      // Tri 2: duplicate of Tri 0
      0, 0, 0,  10, 0, 0,  0, 10, 0,
    ])
    const report = analyze({ positions })

    expect(report.triangles).toBe(3)
    expect(report.degenerateTriangles).toBe(1)
    expect(report.duplicateTriangles).toBe(1)
  })

  it('analyzes non-manifold edge (3 triangles sharing one edge)', () => {
    // Edge between (0,0,0) and (10,0,0) shared by 3 triangles
    const positions = new Float32Array([
      0, 0, 0,  10, 0, 0,  0, 10, 0,
      0, 0, 0,  10, 0, 0,  0, 0, 10,
      0, 0, 0,  10, 0, 0,  0, -10, 0,
    ])
    const report = analyze({ positions })

    expect(report.nonManifoldEdges).toBe(1)
    expect(report.nonManifoldEdgeLines.length).toBe(6) // 1 segment = 6 floats
  })
})

describe('2.2 intersections.ts', () => {
  it('detects intersection on two interpenetrating cubes', () => {
    const cube1 = boxSoup(10, 10, 10)
    // Cube 2 shifted by [5, 5, 5] so they penetrate
    const pos2 = new Float32Array(cube1.positions.length)
    for (let i = 0; i < cube1.positions.length; i += 3) {
      pos2[i] = cube1.positions[i] + 5
      pos2[i + 1] = cube1.positions[i + 1] + 5
      pos2[i + 2] = cube1.positions[i + 2] + 5
    }
    const combined: TriSoup = {
      positions: new Float32Array([...cube1.positions, ...pos2]),
    }
    const res = findIntersections(combined)

    expect(res.count).toBeGreaterThan(0)
    expect(res.pairs.length).toBeGreaterThan(0)
    expect(res.capped).toBe(false)
    expect(res.aborted).toBe(false)
  })

  it('reports NO intersection on touching cubes', () => {
    const cube1 = boxSoup(10, 10, 10)
    // Cube 2 touches cube 1 at face X = 10 (shifted by 10 in X)
    const pos2 = new Float32Array(cube1.positions.length)
    for (let i = 0; i < cube1.positions.length; i += 3) {
      pos2[i] = cube1.positions[i] + 10
      pos2[i + 1] = cube1.positions[i + 1]
      pos2[i + 2] = cube1.positions[i + 2]
    }
    const touching: TriSoup = {
      positions: new Float32Array([...cube1.positions, ...pos2]),
    }
    const res = findIntersections(touching)

    expect(res.count).toBe(0)
    expect(res.pairs).toHaveLength(0)
  })

  it('caps candidates and reports capped when pairCap is exceeded', () => {
    const cube = boxSoup(10, 10, 10)
    const res = findIntersections(cube, { pairCap: 2 })

    expect(res.capped).toBe(true)
  })

  it('aborts when isAborted returns true', () => {
    const cube = boxSoup(10, 10, 10)
    let checks = 0
    const res = findIntersections(cube, {
      isAborted: () => {
        checks++
        return true
      },
    })

    expect(res.aborted).toBe(true)
  })
})

describe('2.3 planarRegion.ts', () => {
  it('collects connected flat face on box', () => {
    const cube = boxSoup(20, 20, 20)
    // Seed at triangle 0 (part of a face)
    const region = planarRegion(cube, 0)

    // A box face has 2 triangles
    expect(region.triangleIndices).toHaveLength(2)
    expect(region.area).toBeCloseTo(400, 1)
  })

  it('verifies cylinder side is not flat', async () => {
    const w = await getWasm()
    const cyl = w.Manifold.cylinder(20, 10, 10, 32)
    const mesh = cyl.getMesh()
    const indexed: IndexedMesh = {
      vertProperties: mesh.vertProperties,
      triVerts: mesh.triVerts,
    }

    // Pick a side facet triangle
    // Find a triangle whose normal is horizontal (nz ~ 0)
    const numTris = indexed.triVerts.length / 3
    let sideTri = -1
    for (let t = 0; t < numTris; t++) {
      const reg = planarRegion(indexed, t, { angleToleranceDeg: 1.0 })
      if (Math.abs(reg.normal[2]) < 0.1) {
        sideTri = t
        // Side region should only contain 1 or 2 triangles (the single facet), not the whole curved wall!
        expect(reg.triangleIndices.length).toBeLessThanOrEqual(2)
        break
      }
    }
    expect(sideTri).toBeGreaterThanOrEqual(0)
  })

  it('respects tolerance parameter', async () => {
    const w = await getWasm()
    const cyl = w.Manifold.cylinder(20, 10, 10, 32)
    const mesh = cyl.getMesh()
    const indexed: IndexedMesh = {
      vertProperties: mesh.vertProperties,
      triVerts: mesh.triVerts,
    }

    // Find horizontal facet
    let sideTri = -1
    for (let t = 0; t < indexed.triVerts.length / 3; t++) {
      const reg = planarRegion(indexed, t, { angleToleranceDeg: 1.0 })
      if (Math.abs(reg.normal[2]) < 0.1) {
        sideTri = t
        break
      }
    }

    // With 1 degree tolerance -> 1 or 2 triangles
    const narrow = planarRegion(indexed, sideTri, { angleToleranceDeg: 1.0 })
    // With 45 degrees tolerance -> collects adjacent faceted facets
    const wide = planarRegion(indexed, sideTri, { angleToleranceDeg: 45.0, distanceTolerance: 5.0 })

    expect(wide.triangleIndices.length).toBeGreaterThan(narrow.triangleIndices.length)
  })
})
